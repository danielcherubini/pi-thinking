import type { Theme } from "@mariozechner/pi-coding-agent";
import { highlightCode as piHighlightCode } from "@mariozechner/pi-coding-agent";
import type { MarkdownTheme } from "@mariozechner/pi-tui";
import { visibleWidth } from "@mariozechner/pi-tui";
import {
	deriveBgColor,
	deriveDimColor,
	hexToRgb,
	parseAnsiFgToRgb,
	rgbToHsl,
	rgbToTruecolorBg,
	rgbToTruecolorFg,
} from "./hsl.js";

export interface MutedThemeOptions {
	saturationFactor?: number; // default 0.5
	codeBlockBg?: boolean; // default true
	codeBlockBgLightness?: number; // default 0.10
	codeBlockBgSaturationFactor?: number; // default 0.3
}

const DEFAULT_ANCHOR_L = 0.4;
const DEFAULT_CODE_BG_L = 0.10;
const DEFAULT_CODE_BG_SAT_FACTOR = 0.3;
const BG_CLOSE = "\x1b[49m";

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
	const codeBlockBg = opts.codeBlockBg ?? true;
	const bgL = opts.codeBlockBgLightness ?? DEFAULT_CODE_BG_L;
	const bgSatFactor = opts.codeBlockBgSaturationFactor ?? DEFAULT_CODE_BG_SAT_FACTOR;

	// Anchor lightness: derived from the theme's thinkingText foreground color.
	const thinkingAnsi = piTheme.getFgAnsi("thinkingText");
	const anchorRgb = parseAnsiFgToRgb(thinkingAnsi);
	const anchorL = anchorRgb ? rgbToHsl(anchorRgb).l : DEFAULT_ANCHOR_L;

	// Code-block bg: derived from thinkingText (same hue) pushed to a very low
	// lightness with reduced saturation. When we can't parse thinkingText (empty
	// stub, unknown format) fall back to no bg — a ragged rectangle with a
	// random color is worse than no card at all.
	const bgAnsi =
		codeBlockBg && anchorRgb
			? rgbToTruecolorBg(
					hexToRgb(
						deriveBgColor(
							"#" +
								[anchorRgb.r, anchorRgb.g, anchorRgb.b]
									.map((v) => v.toString(16).padStart(2, "0"))
									.join(""),
							bgL,
							bgSatFactor,
						),
					),
				)
			: null;

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
			const dimmed = lines.map((l) =>
				dimAnsiLine(l, anchorL, saturationFactor, dimCache),
			);
			if (!bgAnsi) return dimmed;
			// Card rectangle: pad every line to the block's longest line width,
			// then wrap in the bg color. Ragged right intentionally sits just past
			// the longest code line. Borders (fence delimiters) are emitted by
			// pi-tui via codeBlockBorder() before/after highlightCode and are
			// stateless, so they remain un-backgrounded on purpose.
			const maxW = dimmed.reduce((m, l) => Math.max(m, visibleWidth(l)), 0);
			return dimmed.map((l) => {
				const pad = " ".repeat(Math.max(0, maxW - visibleWidth(l)));
				return `${bgAnsi}${l}${pad}${BG_CLOSE}`;
			});
		},
	};
}
