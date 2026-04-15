import type { Theme } from "@mariozechner/pi-coding-agent";
import { highlightCode as piHighlightCode } from "@mariozechner/pi-coding-agent";
import type { MarkdownTheme } from "@mariozechner/pi-tui";
import {
	deriveDimColor,
	parseAnsiFgToRgb,
	rgbToHsl,
	rgbToTruecolorFg,
	hexToRgb,
} from "./hsl.js";

export interface MutedThemeOptions {
	saturationFactor?: number; // default 0.5
}

const DEFAULT_ANCHOR_L = 0.4;

// Matches any foreground-color SGR escape: truecolor (38;2;r;g;b) or 256-palette (38;5;n).
// We intentionally only target fg color escapes; bg (48;...) and style escapes
// (bold/italic/reset/etc.) are left untouched.
const FG_COLOR_ESCAPE_RE = /\x1b\[38;(?:2;\d{1,3};\d{1,3};\d{1,3}|5;\d{1,3})m/g;

/**
 * Rewrite every foreground-color SGR escape in `line` to its dimmed truecolor
 * variant, preserving all other content (text, non-color escapes, resets).
 *
 * The cache memoizes raw→dim escape strings; callers should share a single
 * cache across all lines in one theme-build invocation — highlightCode runs
 * on every streaming chunk so the rewrite must be cheap.
 */
export function dimAnsiLine(
	line: string,
	anchorL: number,
	saturationFactor: number,
	cache: Map<string, string>,
): string {
	return line.replace(FG_COLOR_ESCAPE_RE, (match) => {
		const cached = cache.get(match);
		if (cached !== undefined) return cached;
		const rgb = parseAnsiFgToRgb(match);
		if (!rgb) {
			cache.set(match, match);
			return match;
		}
		// deriveDimColor takes hex; we already have rgb, so build a hex string.
		const hex =
			"#" +
			[rgb.r, rgb.g, rgb.b]
				.map((v) => v.toString(16).padStart(2, "0"))
				.join("");
		const dimHex = deriveDimColor(hex, anchorL, saturationFactor);
		const dimmed = rgbToTruecolorFg(hexToRgb(dimHex));
		cache.set(match, dimmed);
		return dimmed;
	});
}

export function buildMutedMarkdownTheme(
	piTheme: Theme,
	opts: MutedThemeOptions = {},
): MarkdownTheme {
	const saturationFactor = opts.saturationFactor ?? 0.5;

	// Anchor lightness: derived from the theme's thinkingText foreground color.
	const thinkingAnsi = piTheme.getFgAnsi("thinkingText");
	const anchorRgb = parseAnsiFgToRgb(thinkingAnsi);
	const anchorL = anchorRgb ? rgbToHsl(anchorRgb).l : DEFAULT_ANCHOR_L;

	// Shared memoization cache for the entire theme lifetime.
	const dimCache = new Map<string, string>();

	const fg = (token: string, text: string) =>
		piTheme.fg(token as Parameters<Theme["fg"]>[0], text);

	return {
		heading: (text) => `\x1b[1m${fg("thinkingText", text)}\x1b[22m`,
		link: (text) => `\x1b[4m${fg("thinkingText", text)}\x1b[24m`,
		linkUrl: (text) => fg("dim", text),
		code: (text) => fg("dim", text),
		codeBlock: (text) => fg("thinkingText", text),
		codeBlockBorder: (text) => fg("dim", text),
		quote: (text) => fg("thinkingText", text),
		quoteBorder: (text) => fg("dim", text),
		hr: (text) => fg("dim", text),
		listBullet: (text) => fg("dim", text),
		bold: (text) => `\x1b[1m${fg("thinkingText", text)}\x1b[22m`,
		italic: (text) => text,
		strikethrough: (text) => `\x1b[9m${fg("dim", text)}\x1b[29m`,
		underline: (text) => `\x1b[4m${fg("thinkingText", text)}\x1b[24m`,
		highlightCode: (code, lang) => {
			const lines = piHighlightCode(code, lang);
			return lines.map((l) => dimAnsiLine(l, anchorL, saturationFactor, dimCache));
		},
	};
}
