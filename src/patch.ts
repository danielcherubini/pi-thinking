import {
	AssistantMessageComponent,
	type Theme,
} from "@mariozechner/pi-coding-agent";
import { Markdown, type MarkdownTheme, Spacer, Text } from "@mariozechner/pi-tui";
import { buildMutedMarkdownTheme } from "./theme.js";

export const PATCH_GUARD = Symbol.for("pi-thinking:assistantMsgPatched");

interface PatchOptions {
	skipShapeCheck?: boolean;
}

/**
 * Public patch entry point. Idempotently rewrites
 * `AssistantMessageComponent.prototype.updateContent` so that thinking blocks
 * render with a muted `MarkdownTheme` and a prepended "Thinking" label line.
 */
export function patchThinkingRenderer(getTheme: () => Theme): void {
	patchTarget(AssistantMessageComponent, getTheme);
}

/**
 * Shape check + patch implementation.
 *
 * @internal exposed for unit tests that stub the target class. Prefer
 *   {@link patchThinkingRenderer} in production code.
 */
export function patchTarget(
	targetClass: any,
	getTheme: () => Theme,
	options: PatchOptions = {},
): void {
	if (!targetClass) return;
	if (targetClass[PATCH_GUARD]) return;

	if (!options.skipShapeCheck) {
		const proto = targetClass.prototype;
		if (
			!proto ||
			typeof proto.updateContent !== "function" ||
			targetClass.name !== "AssistantMessageComponent"
		) {
			console.warn(
				"[pi-thinking] AssistantMessageComponent shape check failed; skipping patch.",
			);
			return;
		}
		const src = proto.updateContent.toString();
		if (
			!src.includes('content.type === "thinking"') ||
			!src.includes("this.markdownTheme")
		) {
			console.warn(
				"[pi-thinking] AssistantMessageComponent.updateContent body no longer matches expected shape; skipping patch.",
			);
			return;
		}
	}

	targetClass[PATCH_GUARD] = true;

	targetClass.prototype.updateContent = function (message: any): void {
		this.lastMessage = message;

		// Clear content container. Real pi-mono calls `.clear()`; the stub uses
		// the same method name so we can call it either way.
		this.contentContainer.clear();

		const hasVisibleContent = message.content.some(
			(c: any) =>
				(c.type === "text" && c.text.trim()) ||
				(c.type === "thinking" && c.thinking.trim()),
		);

		if (hasVisibleContent) {
			this.contentContainer.addChild(new Spacer(1));
		}

		// Lazy per-invocation muted theme: built once when the first thinking
		// block is seen, reused for every subsequent thinking block within this
		// updateContent call.
		let mutedTheme: MarkdownTheme | undefined;
		let theme: Theme | undefined;
		const ensureTheme = (): Theme => {
			if (!theme) theme = getTheme();
			return theme;
		};
		const ensureMuted = (): MarkdownTheme => {
			if (!mutedTheme) mutedTheme = buildMutedMarkdownTheme(ensureTheme());
			return mutedTheme;
		};

		// Render content in order.
		for (let i = 0; i < message.content.length; i++) {
			const content = message.content[i];
			if (content.type === "text" && content.text.trim()) {
				// Regular assistant text — preserve original (unmuted) theme.
				this.contentContainer.addChild(
					new Markdown(content.text.trim(), 1, 0, this.markdownTheme),
				);
			} else if (content.type === "thinking" && content.thinking.trim()) {
				const hasVisibleContentAfter = message.content
					.slice(i + 1)
					.some(
						(c: any) =>
							(c.type === "text" && c.text.trim()) ||
							(c.type === "thinking" && c.thinking.trim()),
					);

				if (this.hideThinkingBlock) {
					// Hidden branch — exactly as original: static label only, no body.
					const t = ensureTheme();
					this.contentContainer.addChild(
						new Text(t.italic(t.fg("thinkingText", this.hiddenThinkingLabel)), 1, 0),
					);
					if (hasVisibleContentAfter) {
						this.contentContainer.addChild(new Spacer(1));
					}
				} else {
					// Visible thinking branch — prepend a "Thinking" label line and
					// use a MUTED MarkdownTheme for the body Markdown child.
					const t = ensureTheme();
					this.contentContainer.addChild(
						new Text(t.italic(t.fg("accent", "Thinking")), 1, 0),
					);
					this.contentContainer.addChild(
						new Markdown(content.thinking.trim(), 1, 0, ensureMuted(), {
							color: (text: string) => t.fg("thinkingText", text),
							italic: true,
						}),
					);
					if (hasVisibleContentAfter) {
						this.contentContainer.addChild(new Spacer(1));
					}
				}
			}
		}

		// Preserve original aborted/error rendering.
		const hasToolCalls = message.content.some((c: any) => c.type === "toolCall");
		if (!hasToolCalls) {
			if (message.stopReason === "aborted") {
				const abortMessage =
					message.errorMessage && message.errorMessage !== "Request was aborted"
						? message.errorMessage
						: "Operation aborted";
				this.contentContainer.addChild(new Spacer(1));
				const t = ensureTheme();
				this.contentContainer.addChild(new Text(t.fg("error", abortMessage), 1, 0));
			} else if (message.stopReason === "error") {
				const errorMsg = message.errorMessage || "Unknown error";
				this.contentContainer.addChild(new Spacer(1));
				const t = ensureTheme();
				this.contentContainer.addChild(
					new Text(t.fg("error", `Error: ${errorMsg}`), 1, 0),
				);
			}
		}
	};
}
