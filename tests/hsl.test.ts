import { describe, expect, test } from "bun:test";
import {
	ansi256ToRgb,
	deriveDimColor,
	hexToRgb,
	hslToRgb,
	parseAnsiFgToRgb,
	rgbToHex,
	rgbToHsl,
	rgbToTruecolorFg,
} from "../src/hsl";

const approxEqual = (a: number, b: number, eps = 0.01) => Math.abs(a - b) <= eps;

describe("hexToRgb", () => {
	test("parses #rrggbb", () => {
		expect(hexToRgb("#ff0000")).toEqual({ r: 255, g: 0, b: 0 });
	});

	test("parses rrggbb without hash", () => {
		expect(hexToRgb("00ff00")).toEqual({ r: 0, g: 255, b: 0 });
	});

	test("parses #rgb shorthand", () => {
		expect(hexToRgb("#f00")).toEqual({ r: 255, g: 0, b: 0 });
	});

	test("parses rgb shorthand without hash", () => {
		expect(hexToRgb("f00")).toEqual({ r: 255, g: 0, b: 0 });
	});
});

describe("rgbToHex", () => {
	test("returns #rrggbb", () => {
		expect(rgbToHex({ r: 255, g: 0, b: 0 })).toBe("#ff0000");
	});

	test("pads channels", () => {
		expect(rgbToHex({ r: 0, g: 0, b: 0 })).toBe("#000000");
	});
});

describe("rgbToHsl", () => {
	test("pure red => h:0, s:1, l:0.5", () => {
		const hsl = rgbToHsl({ r: 255, g: 0, b: 0 });
		expect(approxEqual(hsl.h, 0)).toBe(true);
		expect(approxEqual(hsl.s, 1)).toBe(true);
		expect(approxEqual(hsl.l, 0.5)).toBe(true);
	});

	test("achromatic grey => s:0", () => {
		const hsl = rgbToHsl({ r: 128, g: 128, b: 128 });
		expect(approxEqual(hsl.s, 0)).toBe(true);
	});
});

describe("hslToRgb", () => {
	test("h:0, s:1, l:0.5 => pure red", () => {
		expect(hslToRgb({ h: 0, s: 1, l: 0.5 })).toEqual({ r: 255, g: 0, b: 0 });
	});

	test("h:120, s:1, l:0.5 => pure green", () => {
		expect(hslToRgb({ h: 120, s: 1, l: 0.5 })).toEqual({ r: 0, g: 255, b: 0 });
	});
});

describe("ansi256ToRgb", () => {
	test("code 16 is black", () => {
		expect(ansi256ToRgb(16)).toEqual({ r: 0, g: 0, b: 0 });
	});

	test("code 196 is red cube", () => {
		const rgb = ansi256ToRgb(196);
		expect(rgb).toEqual({ r: 255, g: 0, b: 0 });
	});

	test("code 232 is near-black grey", () => {
		expect(ansi256ToRgb(232)).toEqual({ r: 8, g: 8, b: 8 });
	});

	test("code 255 is near-white grey", () => {
		expect(ansi256ToRgb(255)).toEqual({ r: 238, g: 238, b: 238 });
	});

	test("code 0 is system black", () => {
		expect(ansi256ToRgb(0)).toEqual({ r: 0, g: 0, b: 0 });
	});

	test("code 15 is system white", () => {
		expect(ansi256ToRgb(15)).toEqual({ r: 255, g: 255, b: 255 });
	});
});

describe("deriveDimColor", () => {
	test("clamps lightness and halves saturation for hex input", () => {
		const hex = deriveDimColor("#ff0000", 0.3);
		const hsl = rgbToHsl(hexToRgb(hex));
		expect(hsl.l).toBeLessThanOrEqual(0.3 + 0.001);
		expect(approxEqual(hsl.s, 0.5)).toBe(true);
	});

	test("preserves low saturation for grey input", () => {
		const hex = deriveDimColor("#888888", 0.5);
		const hsl = rgbToHsl(hexToRgb(hex));
		expect(hsl.s).toBeLessThanOrEqual(0.01);
	});

	test("accepts numeric ANSI input", () => {
		const hex = deriveDimColor(196, 0.25);
		const hsl = rgbToHsl(hexToRgb(hex));
		expect(hsl.l).toBeLessThanOrEqual(0.25 + 0.001);
	});
});

describe("parseAnsiFgToRgb", () => {
	test("parses truecolor foreground", () => {
		expect(parseAnsiFgToRgb("\x1b[38;2;229;229;231m")).toEqual({
			r: 229,
			g: 229,
			b: 231,
		});
	});

	test("parses 256-palette foreground", () => {
		expect(parseAnsiFgToRgb("\x1b[38;5;196m")).toEqual(ansi256ToRgb(196));
	});

	test("parses leading escape with trailing text", () => {
		expect(parseAnsiFgToRgb("\x1b[38;5;196mhello")).toEqual(ansi256ToRgb(196));
	});

	test("returns null for non-fg escape", () => {
		expect(parseAnsiFgToRgb("\x1b[1mhello")).toBeNull();
	});

	test("returns null for empty string", () => {
		expect(parseAnsiFgToRgb("")).toBeNull();
	});
});

describe("rgbToTruecolorFg", () => {
	test("produces SGR prefix", () => {
		expect(rgbToTruecolorFg({ r: 255, g: 0, b: 0 })).toBe("\x1b[38;2;255;0;0m");
	});
});
