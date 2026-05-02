import { describe, expect, test } from "bun:test";
import { patchTarget, PATCH_GUARD } from "../src/patch";
import { buildMutedMarkdownTheme } from "../src/theme";

// ---------------------------------------------------------------------------
// Stubs: mirror the pi-mono AssistantMessageComponent enough for patchTarget
// to exercise the thinking/text branches without importing the real class.
// ---------------------------------------------------------------------------

const ORIGINAL_THEME = { __original: true };

const isMarkdown = (c: any) => c && c.constructor && c.constructor.name === "Markdown";
const isText = (c: any) => c && c.constructor && c.constructor.name === "Text";
const isSpacer = (c: any) => c && c.constructor && c.constructor.name === "Spacer";

class StubContentContainer {
	children: any[] = [];
	addChild(c: any) {
		this.children.push(c);
	}
	clear() {
		this.children = [];
	}
}

function makeStubAssistant() {
	return class StubAssistant {
		markdownTheme: any = ORIGINAL_THEME;
		hideThinkingBlock = false;
		hiddenThinkingLabel = "Thinking...";
		lastMessage: any = undefined;
		contentContainer = new StubContentContainer();
		updateContent(message: any) {
			this.lastMessage = message;
			this.contentContainer.clear();
			const hasVisibleContent = message.content.some(
				(c: any) =>
					(c.type === "text" && c.text.trim()) ||
					(c.type === "thinking" && c.thinking.trim()),
			);
			if (hasVisibleContent) {
				this.contentContainer.addChild({ __type: "Spacer" });
			}
			for (let i = 0; i < message.content.length; i++) {
				const content = message.content[i];
				if (content.type === "text" && content.text.trim()) {
					this.contentContainer.addChild({
						__type: "Markdown",
						text: content.text.trim(),
						theme: this.markdownTheme,
					});
				} else if (content.type === "thinking" && content.thinking.trim()) {
					const hasVisibleAfter = message.content
						.slice(i + 1)
						.some(
							(c: any) =>
								(c.type === "text" && c.text.trim()) ||
								(c.type === "thinking" && c.thinking.trim()),
						);
					if (this.hideThinkingBlock) {
						this.contentContainer.addChild({
							__type: "Text",
							text: this.hiddenThinkingLabel,
						});
						if (hasVisibleAfter) this.contentContainer.addChild({ __type: "Spacer" });
					} else {
						this.contentContainer.addChild({
							__type: "Markdown",
							text: content.thinking.trim(),
							theme: this.markdownTheme,
						});
						if (hasVisibleAfter) this.contentContainer.addChild({ __type: "Spacer" });
					}
				}
			}
		}
	};
}

function makeStubTheme() {
	return {
		fg: (token: string, text: string) => `[${token}]${text}[/]`,
		bold: (text: string) => `<b>${text}</b>`,
		italic: (text: string) => `<i>${text}</i>`,
		getFgAnsi: (token: string) =>
			token === "thinkingText"
				? "\x1b[38;2;136;136;136m"
				: "\x1b[38;2;200;200;200m",
	} as any;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("patchTarget: thinking branch", () => {
	test("thinking branch uses MUTED theme (label comes from message_end transform)", () => {
		const Stub = makeStubAssistant();
		patchTarget(Stub, makeStubTheme, { skipShapeCheck: true });
		const inst = new Stub();
		inst.updateContent({ content: [{ type: "thinking", thinking: "hello" }] });

		const children = inst.contentContainer.children.filter((c: any) => !isSpacer(c));
		const md = children.find((c: any) => isMarkdown(c));
		expect(md).toBeDefined();
		// Theme should be a muted theme (built by buildMutedMarkdownTheme), NOT the original
		expect(md.theme).not.toBe(ORIGINAL_THEME);
		expect(typeof md.theme.highlightCode).toBe("function");
	});

	test("text branch still uses the ORIGINAL markdownTheme", () => {
		const Stub = makeStubAssistant();
		patchTarget(Stub, makeStubTheme, { skipShapeCheck: true });
		const inst = new Stub();
		inst.updateContent({ content: [{ type: "text", text: "hi" }] });

		const md = inst.contentContainer.children.find((c: any) => isMarkdown(c));
		expect(md).toBeDefined();
		expect(md.theme).toBe(ORIGINAL_THEME);
	});

	test("patchTarget is idempotent — second call is a no-op", () => {
		const Stub = makeStubAssistant();
		patchTarget(Stub, makeStubTheme, { skipShapeCheck: true });
		const firstFn = Stub.prototype.updateContent;
		patchTarget(Stub, makeStubTheme, { skipShapeCheck: true });
		const secondFn = Stub.prototype.updateContent;
		expect(secondFn).toBe(firstFn);
		expect((Stub as any)[PATCH_GUARD]).toBe(true);
	});

	test("empty thinking content adds no children", () => {
		const Stub = makeStubAssistant();
		patchTarget(Stub, makeStubTheme, { skipShapeCheck: true });
		const inst = new Stub();
		inst.updateContent({ content: [{ type: "thinking", thinking: "   " }] });
		expect(inst.contentContainer.children.length).toBe(0);
	});

	test("hidden thinking adds exactly one child (the hidden label)", () => {
		const Stub = makeStubAssistant();
		patchTarget(Stub, makeStubTheme, { skipShapeCheck: true });
		const inst = new Stub();
		inst.hideThinkingBlock = true;
		inst.updateContent({ content: [{ type: "thinking", thinking: "hi" }] });

		const children = inst.contentContainer.children;
		const rendered = children.filter((c: any) => !isSpacer(c));
		expect(rendered.length).toBe(1);
		expect(isText(rendered[0])).toBe(true);
		const markdowns = children.filter((c: any) => isMarkdown(c));
		expect(markdowns.length).toBe(0);
	});

	test("without skipShapeCheck, malformed stub is NOT patched", () => {
		const Stub = makeStubAssistant();
		const before = Stub.prototype.updateContent;
		const origWarn = console.warn;
		console.warn = () => {};
		try {
			patchTarget(Stub, makeStubTheme);
		} finally {
			console.warn = origWarn;
		}
		const after = Stub.prototype.updateContent;
		expect(after).toBe(before);
		expect((Stub as any)[PATCH_GUARD]).toBeFalsy();
	});
});
