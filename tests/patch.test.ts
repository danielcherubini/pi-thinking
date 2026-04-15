import { describe, expect, test } from "bun:test";
import { patchTarget, PATCH_GUARD } from "../src/patch";

// ---------------------------------------------------------------------------
// Stubs: mirror the pi-mono AssistantMessageComponent enough for patchTarget
// to exercise the thinking/text branches without importing the real class.
// The patched method constructs real pi-tui `Markdown` / `Text` / `Spacer`
// instances, so we introspect via `constructor.name` and instance fields.
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
	// Factory so each test gets a fresh class (so PATCH_GUARD doesn't bleed).
	return class StubAssistant {
		markdownTheme: any = ORIGINAL_THEME;
		hideThinkingBlock = false;
		hiddenThinkingLabel = "Thinking...";
		lastMessage: any = undefined;
		contentContainer = new StubContentContainer();
		updateContent(message: any) {
			// Minimal mirror of the real logic for the two branches we need.
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
		italic: (text: string) => `<i>${text}</i>`,
		getFgAnsi: (_token: string) => "\x1b[38;2;136;136;136m",
	} as any;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("patchTarget: thinking branch", () => {
	test("Test 1: thinking branch prepends a label and uses a NON-original markdown theme", () => {
		const Stub = makeStubAssistant();
		patchTarget(Stub, makeStubTheme, { skipShapeCheck: true });
		const inst = new Stub();
		inst.updateContent({ content: [{ type: "thinking", thinking: "hello" }] });

		const children = inst.contentContainer.children;
		// There should be a label child whose text mentions "Thinking".
		const labelIdx = children.findIndex(
			(c: any) => isText(c) && typeof c.text === "string" && c.text.includes("Thinking"),
		);
		expect(labelIdx).toBeGreaterThanOrEqual(0);

		// There should be a Markdown child whose theme is NOT the original.
		const md = children.find((c: any) => isMarkdown(c) && c.text === "hello");
		expect(md).toBeDefined();
		expect(md.theme).not.toBe(ORIGINAL_THEME);
		// Label must come BEFORE the body markdown.
		expect(labelIdx).toBeLessThan(children.indexOf(md));
	});

	test("Test 2: text branch still uses the ORIGINAL markdownTheme", () => {
		const Stub = makeStubAssistant();
		patchTarget(Stub, makeStubTheme, { skipShapeCheck: true });
		const inst = new Stub();
		inst.updateContent({ content: [{ type: "text", text: "hi" }] });

		const md = inst.contentContainer.children.find((c: any) => isMarkdown(c));
		expect(md).toBeDefined();
		expect(md.theme).toBe(ORIGINAL_THEME);
	});

	test("Test 3: patchTarget is idempotent — second call is a no-op", () => {
		const Stub = makeStubAssistant();
		patchTarget(Stub, makeStubTheme, { skipShapeCheck: true });
		const firstFn = Stub.prototype.updateContent;
		patchTarget(Stub, makeStubTheme, { skipShapeCheck: true });
		const secondFn = Stub.prototype.updateContent;
		expect(secondFn).toBe(firstFn);
		expect((Stub as any)[PATCH_GUARD]).toBe(true);
	});

	test("Test 4: empty thinking content adds no children", () => {
		const Stub = makeStubAssistant();
		patchTarget(Stub, makeStubTheme, { skipShapeCheck: true });
		const inst = new Stub();
		inst.updateContent({ content: [{ type: "thinking", thinking: "   " }] });
		expect(inst.contentContainer.children.length).toBe(0);
	});

	test("Test 5: hidden thinking adds exactly one child (the hidden label)", () => {
		const Stub = makeStubAssistant();
		patchTarget(Stub, makeStubTheme, { skipShapeCheck: true });
		const inst = new Stub();
		inst.hideThinkingBlock = true;
		inst.updateContent({ content: [{ type: "thinking", thinking: "hi" }] });

		const children = inst.contentContainer.children;
		// Filter out the leading Spacer(1) — that's always emitted when there's
		// visible content, and it's not part of the rendered "thinking" payload.
		const rendered = children.filter((c: any) => !isSpacer(c));
		expect(rendered.length).toBe(1);
		expect(isText(rendered[0])).toBe(true);
		// Hidden branch must NOT produce a body Markdown.
		const markdowns = children.filter((c: any) => isMarkdown(c));
		expect(markdowns.length).toBe(0);
	});

	test("Test 6: without skipShapeCheck, malformed stub is NOT patched", () => {
		const Stub = makeStubAssistant();
		const before = Stub.prototype.updateContent;
		// Silence console.warn for this test.
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
