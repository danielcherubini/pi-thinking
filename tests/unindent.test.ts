import { describe, expect, test } from "bun:test";
import { unindentCodeBlocks } from "../src/unindent";

describe("unindentCodeBlocks", () => {
	test("strips 2-space common indent", () => {
		const input = [
			"```ts",
			"  const x = 1;",
			"  const y = 2;",
			"```",
		].join("\n");
		const expected = [
			"```ts",
			"const x = 1;",
			"const y = 2;",
			"```",
		].join("\n");
		expect(unindentCodeBlocks(input)).toBe(expected);
	});

	test("preserves relative indentation", () => {
		const input = [
			"```ts",
			"  if (true) {",
			"    console.log('hi');",
			"  }",
			"```",
		].join("\n");
		const expected = [
			"```ts",
			"if (true) {",
			"  console.log('hi');",
			"}",
			"```",
		].join("\n");
		expect(unindentCodeBlocks(input)).toBe(expected);
	});

	test("strips trailing blank lines", () => {
		const input = [
			"```ts",
			"const x = 1;",
			"",
			"",
			"```",
		].join("\n");
		const expected = [
			"```ts",
			"const x = 1;",
			"```",
		].join("\n");
		expect(unindentCodeBlocks(input)).toBe(expected);
	});

	test("leaves 0-indent blocks untouched (but strips trailing blanks)", () => {
		const input = [
			"```ts",
			"const x = 1;",
			"const y = 2;",
			"",
			"```",
		].join("\n");
		const expected = [
			"```ts",
			"const x = 1;",
			"const y = 2;",
			"```",
		].join("\n");
		expect(unindentCodeBlocks(input)).toBe(expected);
	});

	test("handles multiple blocks", () => {
		const input = [
			"```ts",
			"  const a = 1;",
			"",
			"```",
			"",
			"```js",
			"  const b = 2;",
			"",
			"```",
		].join("\n");
		const expected = [
			"```ts",
			"const a = 1;",
			"```",
			"",
			"```js",
			"const b = 2;",
			"```",
		].join("\n");
		expect(unindentCodeBlocks(input)).toBe(expected);
	});

	test("handles no-language blocks", () => {
		const input = [
			"```",
			"  hello world",
			"",
			"```",
		].join("\n");
		const expected = [
			"```",
			"hello world",
			"```",
		].join("\n");
		expect(unindentCodeBlocks(input)).toBe(expected);
	});

	test("handles empty/whitespace-only blocks", () => {
		const input = [
			"```ts",
			"   ",
			"",
			"```",
		].join("\n");
		const expected = [
			"```ts",
			"   ",
			"",
			"```",
		].join("\n");
		expect(unindentCodeBlocks(input)).toBe(expected);
	});

	test("no-op on text with no code blocks", () => {
		const input =
			"This is just plain text.\nNo code blocks here.\nJust regular prose.";
		expect(unindentCodeBlocks(input)).toBe(input);
	});

	test("preserves text outside code blocks", () => {
		const input = [
			"Here is some prose before.",
			"",
			"```ts",
			"  const x = 1;",
			"```",
			"",
			"Here is some prose after.",
		].join("\n");
		const expected = [
			"Here is some prose before.",
			"",
			"```ts",
			"const x = 1;",
			"```",
			"",
			"Here is some prose after.",
		].join("\n");
		expect(unindentCodeBlocks(input)).toBe(expected);
	});

	test("mixed 0/N indent: no leading ws stripped, trailing blanks removed", () => {
		const input = [
			"```ts",
			"const x = 1;",
			"  const y = 2;",
			"",
			"```",
		].join("\n");
		const expected = [
			"```ts",
			"const x = 1;",
			"  const y = 2;",
			"```",
		].join("\n");
		expect(unindentCodeBlocks(input)).toBe(expected);
	});

	test("language tag with special chars", () => {
		const input = [
			"```c++",
			"  #include <iostream>",
			"",
			"```",
		].join("\n");
		const expected = [
			"```c++",
			"#include <iostream>",
			"```",
		].join("\n");
		expect(unindentCodeBlocks(input)).toBe(expected);
	});

	test("inline backticks don't trigger", () => {
		const input =
			"Use ``` in your markdown for code blocks. This should not be parsed.";
		expect(unindentCodeBlocks(input)).toBe(input);
	});

	test("normalizes CRLF line endings", () => {
		const input = "```ts\r\n  const x = 1;\r\n  const y = 2;\r\n```";
		const expected = ["```ts", "const x = 1;", "const y = 2;", "```"].join("\n");
		expect(unindentCodeBlocks(input)).toBe(expected);
	});

	test("tab-indented code block passes through unchanged", () => {
		const input = [
			"```ts",
			"\tconst x = 1;",
			"\tconst y = 2;",
			"```",
		].join("\n");
		// Tabs are not stripped (documented limitation)
		const expected = [
			"```ts",
			"\tconst x = 1;",
			"\tconst y = 2;",
			"```",
		].join("\n");
		expect(unindentCodeBlocks(input)).toBe(expected);
	});
});
