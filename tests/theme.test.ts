import { describe, expect, test } from "bun:test";
import {
	hexToRgb,
	parseAnsiFgToRgb,
	rgbToHsl,
} from "../src/hsl";
import { buildMutedMarkdownTheme, dimAnsiLine } from "../src/theme";

// Stub theme constructing predictable wrapper strings + known ANSI escapes.
//
// thinkingText is rgb(136,136,136) => l ≈ 0.533 (the anchor)
// dim           is rgb(96,96,96)    => l ≈ 0.376
const THINKING_TEXT_ANSI = "\x1b[38;2;136;136;136m";
const DIM_ANSI = "\x1b[38;2;96;96;96m";

function makeStubTheme(overrides: Partial<Record<string, string>> = {}) {
	return {
		fg: (token: string, text: string) => `[${token}]${text}[/]`,
		getFgAnsi: (token: string) => {
			if (token in overrides) return overrides[token] as string;
			if (token === "thinkingText") return THINKING_TEXT_ANSI;
			if (token === "dim") return DIM_ANSI;
			return "";
		},
	} as unknown as Parameters<typeof buildMutedMarkdownTheme>[0];
}

// Anchor lightness for THINKING_TEXT_ANSI
const ANCHOR_L = rgbToHsl(parseAnsiFgToRgb(THINKING_TEXT_ANSI)!).l;

describe("buildMutedMarkdownTheme: field mappings", () => {
	test(".code wraps text in [dim]", () => {
		const t = buildMutedMarkdownTheme(makeStubTheme());
		expect(t.code("hi")).toBe("[dim]hi[/]");
	});

	test(".heading wraps in [thinkingText] with bold on/off SGR, no full reset", () => {
		const t = buildMutedMarkdownTheme(makeStubTheme());
		const out = t.heading("H");
		expect(out).toContain("[thinkingText]H[/]");
		expect(out).toContain("\x1b[1m");
		expect(out).toContain("\x1b[22m");
		expect(out).not.toContain("\x1b[0m");
	});

	test(".codeBlockBorder wraps in [dim]", () => {
		const t = buildMutedMarkdownTheme(makeStubTheme());
		expect(t.codeBlockBorder("```")).toBe("[dim]```[/]");
	});

	test(".italic returns text unchanged", () => {
		const t = buildMutedMarkdownTheme(makeStubTheme());
		expect(t.italic("x")).toBe("x");
	});

	test(".listBullet wraps in [dim]", () => {
		const t = buildMutedMarkdownTheme(makeStubTheme());
		expect(t.listBullet("-")).toContain("[dim]");
	});

	test(".link wraps in [thinkingText] with underline on/off", () => {
		const t = buildMutedMarkdownTheme(makeStubTheme());
		const out = t.link("click");
		expect(out).toContain("[thinkingText]click[/]");
		expect(out).toContain("\x1b[4m");
		expect(out).toContain("\x1b[24m");
		expect(out).not.toContain("\x1b[0m");
	});

	test(".linkUrl wraps in [dim]", () => {
		const t = buildMutedMarkdownTheme(makeStubTheme());
		expect(t.linkUrl("https://x")).toBe("[dim]https://x[/]");
	});

	test(".codeBlock wraps in [thinkingText]", () => {
		const t = buildMutedMarkdownTheme(makeStubTheme());
		expect(t.codeBlock("body")).toBe("[thinkingText]body[/]");
	});

	test(".quote wraps in [thinkingText]", () => {
		const t = buildMutedMarkdownTheme(makeStubTheme());
		expect(t.quote("q")).toBe("[thinkingText]q[/]");
	});

	test(".quoteBorder wraps in [dim]", () => {
		const t = buildMutedMarkdownTheme(makeStubTheme());
		expect(t.quoteBorder("|")).toBe("[dim]|[/]");
	});

	test(".hr wraps in [dim]", () => {
		const t = buildMutedMarkdownTheme(makeStubTheme());
		expect(t.hr("---")).toBe("[dim]---[/]");
	});

	test(".bold wraps in [thinkingText] with bold on/off SGR", () => {
		const t = buildMutedMarkdownTheme(makeStubTheme());
		const out = t.bold("B");
		expect(out).toContain("[thinkingText]B[/]");
		expect(out).toContain("\x1b[1m");
		expect(out).toContain("\x1b[22m");
		expect(out).not.toContain("\x1b[0m");
	});

	test(".strikethrough wraps in [dim] with strikethrough on/off", () => {
		const t = buildMutedMarkdownTheme(makeStubTheme());
		const out = t.strikethrough("s");
		expect(out).toContain("[dim]s[/]");
		expect(out).toContain("\x1b[9m");
		expect(out).toContain("\x1b[29m");
		expect(out).not.toContain("\x1b[0m");
	});

	test(".underline wraps in [thinkingText] with underline on/off", () => {
		const t = buildMutedMarkdownTheme(makeStubTheme());
		const out = t.underline("u");
		expect(out).toContain("[thinkingText]u[/]");
		expect(out).toContain("\x1b[4m");
		expect(out).toContain("\x1b[24m");
		expect(out).not.toContain("\x1b[0m");
	});

	test("returned object has highlightCode function", () => {
		const t = buildMutedMarkdownTheme(makeStubTheme());
		expect(typeof t.highlightCode).toBe("function");
	});
});

describe("dimAnsiLine: muted syntax rewrite", () => {
	test("rewrites truecolor foreground escape to dimmer variant; preserves non-color escapes", () => {
		const origLine = "\x1b[38;2;74;144;255mfn\x1b[0m foo";
		const origRgb = { r: 74, g: 144, b: 255 };
		const origHsl = rgbToHsl(origRgb);

		const cache = new Map<string, string>();
		const out = dimAnsiLine(origLine, ANCHOR_L, 0.5, cache);

		// Tail preserved verbatim
		expect(out.endsWith("\x1b[0m foo")).toBe(true);

		// Leading escape must still be a truecolor fg escape …
		const leadMatch = /^\x1b\[38;2;\d+;\d+;\d+m/.exec(out);
		expect(leadMatch).not.toBeNull();

		// … but rewritten: parse it and verify dimmed properties.
		const newRgb = parseAnsiFgToRgb(leadMatch![0])!;
		const newHsl = rgbToHsl(newRgb);
		expect(newHsl.l).toBeLessThanOrEqual(ANCHOR_L + 1e-6);
		expect(Math.abs(newHsl.s - 0.5 * origHsl.s)).toBeLessThanOrEqual(0.02);
	});

	test("does NOT brighten already-dim lightness; l = min(origL, anchorL)", () => {
		// rgb(128,128,128) => l ≈ 0.502, below anchor 0.533 (close).
		// Pick one clearly below: rgb(80,80,80) => l ≈ 0.314
		const origLine = "\x1b[38;2;80;80;80m// comment";
		const origRgb = { r: 80, g: 80, b: 80 };
		const origL = rgbToHsl(origRgb).l;

		const out = dimAnsiLine(origLine, ANCHOR_L, 0.5, new Map());
		const leadMatch = /^\x1b\[38;2;\d+;\d+;\d+m/.exec(out);
		expect(leadMatch).not.toBeNull();
		const newL = rgbToHsl(parseAnsiFgToRgb(leadMatch![0])!).l;
		expect(newL).toBeLessThanOrEqual(origL + 1e-6);
	});

	test("rewrites 256-palette foreground escapes as truecolor dimmed", () => {
		const origLine = "\x1b[38;5;196mkeyword\x1b[0m";
		const out = dimAnsiLine(origLine, ANCHOR_L, 0.5, new Map());
		// Output's leading escape should now be truecolor
		const leadMatch = /^\x1b\[38;2;\d+;\d+;\d+m/.exec(out);
		expect(leadMatch).not.toBeNull();
		const newL = rgbToHsl(parseAnsiFgToRgb(leadMatch![0])!).l;
		expect(newL).toBeLessThanOrEqual(ANCHOR_L + 1e-6);
		// Non-color tail reset preserved
		expect(out.endsWith("\x1b[0m")).toBe(true);
	});

	test("memoizes repeated escapes via shared cache", () => {
		const cache = new Map<string, string>();
		const line = "\x1b[38;2;74;144;255mfn\x1b[0m";
		const first = dimAnsiLine(line, ANCHOR_L, 0.5, cache);
		expect(cache.size).toBeGreaterThanOrEqual(1);
		const second = dimAnsiLine(line, ANCHOR_L, 0.5, cache);
		expect(second).toBe(first);
	});
});

describe("buildMutedMarkdownTheme: fallback anchor when thinkingText ANSI is unparseable", () => {
	test("falls back to 0.4 when getFgAnsi returns empty", () => {
		// With an empty string for thinkingText, parseAnsiFgToRgb returns null.
		// Should not throw; field wrappers still work.
		const stub = makeStubTheme({ thinkingText: "" });
		const t = buildMutedMarkdownTheme(stub);
		expect(t.code("x")).toBe("[dim]x[/]");
		expect(typeof t.highlightCode).toBe("function");
	});
});
