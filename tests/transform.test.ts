import { describe, expect, test } from "bun:test";
import { transformThinkingContent } from "../src/transform";

describe("transformThinkingContent", () => {
	test("unindents code blocks in thinking content", () => {
		const message = {
			role: "assistant" as const,
			content: [{ type: "thinking", thinking: "```js\n  const x = 1;\n```" }],
		};
		transformThinkingContent(message);
		expect(message.content[0].thinking).toContain("const x = 1;");
		expect(message.content[0].thinking).not.toContain("  const x = 1;");
	});

	test("does not mutate non-assistant messages", () => {
		const message = {
			role: "user" as const,
			content: [{ type: "thinking", thinking: "some reasoning" }],
		};
		transformThinkingContent(message);
		expect(message.content[0].thinking).toBe("some reasoning");
	});

	test("does not mutate text content", () => {
		const message = {
			role: "assistant" as const,
			content: [{ type: "text", text: "hello world" }],
		};
		transformThinkingContent(message);
		expect(message.content[0].text).toBe("hello world");
	});

	test("handles multiple content items", () => {
		const message = {
			role: "assistant" as const,
			content: [
				{ type: "text", text: "hello" },
				{ type: "thinking", thinking: "```js\n  const x = 1;\n```" },
			],
		};
		transformThinkingContent(message);
		expect(message.content[0].text).toBe("hello");
		expect(message.content[1].thinking).toContain("const x = 1;");
	});

	test("preserves prose around code blocks", () => {
		const message = {
			role: "assistant" as const,
			content: [{ type: "thinking", thinking: "Here's my reasoning:\n\n```python\n  def foo():\n    return 1\n```" }],
		};
		transformThinkingContent(message);
		const result = message.content[0].thinking!;
		expect(result).toContain("Here's my reasoning:");
		expect(result).toContain("def foo():");
		expect(result).toContain("return 1");
	});
});
