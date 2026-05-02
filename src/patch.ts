import type { Theme } from "@mariozechner/pi-coding-agent";
import {
	AssistantMessageComponent,
} from "@mariozechner/pi-coding-agent";
import { Markdown, Spacer, Text } from "@mariozechner/pi-tui";
import { buildMutedMarkdownTheme } from "./theme.js";

export const PATCH_GUARD = Symbol.for("pi-thinking:assistantMsgPatched");

// The label we prepend to visible thinking content.
// Kept here so updateContent can check idempotency.
const THINKING_LABEL = "\x1b[1m\x1b[38;2;255;215;0mThinking...\x1b[39m\x1b[22m";

interface PatchOptions {
	skipShapeCheck?: boolean;
}

/**
 * Public patch entry point. Idempotently rewrites
 * `AssistantMessageComponent.prototype.updateContent` so that thinking blocks
 * render with a muted `MarkdownTheme`.
 *
 * Content transforms (unindent, label) are handled by the `message_end` event
 * hook in the extension entry point — this module only swaps the theme.
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

		// Remove the Markdown component's default 2-space code block indent.
		// Combined with unindentCodeBlocks in message_end this gives zero-pad
		// code blocks that copy cleanly from the terminal.
		this.markdownTheme.codeBlockIndent = "";

		// Clear content container.
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
		let mutedTheme: ReturnType<typeof buildMutedMarkdownTheme> | undefined;
		let theme: Theme | undefined;
		const ensureTheme = (): Theme => {
			if (!theme) theme = getTheme();
			return theme;
		};
		const ensureMuted = () => {
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
					// Visible thinking branch — prepend "Thinking..." label if not
					// already present (idempotent: works during streaming and after
					// message_end unindent). Render with MUTED MarkdownTheme.
					let thinkingContent = content.thinking.trim();
					if (!thinkingContent.startsWith(THINKING_LABEL)) {
						thinkingContent = `${THINKING_LABEL}\n\n${thinkingContent}`;
					}
					const t = ensureTheme();
					this.contentContainer.addChild(
						new Markdown(thinkingContent, 1, 0, ensureMuted(), {
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
