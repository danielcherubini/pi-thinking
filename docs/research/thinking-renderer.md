# pi-mono Thinking Renderer — Research

Research for Task 1 of the `pi-thinking` plan. Findings below are sourced from the local pi-mono clone at `/home/daniel/Coding/Javascript/pi-mono/` (package `@mariozechner/pi-coding-agent` v0.67.2). Every decision in subsequent tasks should quote the `file:line` refs captured here.

## 1. Thinking block renderer — source location

The thinking block is **not rendered by a dedicated class**. It is rendered inline inside `AssistantMessageComponent.updateContent`, in the branch that handles content items with `type === "thinking"`.

- File: `/home/daniel/Coding/Javascript/pi-mono/packages/coding-agent/src/modes/interactive/components/assistant-message.ts`
- Thinking branch: lines 78–104
- The thinking body is rendered by creating a `Markdown` (pi-tui) child with a `DefaultTextStyle` override `{ color: theme.fg("thinkingText", …), italic: true }`.

Verbatim excerpt (assistant-message.ts:78–104):

```ts
} else if (content.type === "thinking" && content.thinking.trim()) {
    // Add spacing only when another visible assistant content block follows.
    // This avoids a superfluous blank line before separately-rendered tool execution blocks.
    const hasVisibleContentAfter = message.content
        .slice(i + 1)
        .some((c) => (c.type === "text" && c.text.trim()) || (c.type === "thinking" && c.thinking.trim()));

    if (this.hideThinkingBlock) {
        // Show static thinking label when hidden
        this.contentContainer.addChild(
            new Text(theme.italic(theme.fg("thinkingText", this.hiddenThinkingLabel)), 1, 0),
        );
        if (hasVisibleContentAfter) {
            this.contentContainer.addChild(new Spacer(1));
        }
    } else {
        // Thinking traces in thinkingText color, italic
        this.contentContainer.addChild(
            new Markdown(content.thinking.trim(), 1, 0, this.markdownTheme, {
                color: (text: string) => theme.fg("thinkingText", text),
                italic: true,
            }),
        );
        if (hasVisibleContentAfter) {
            this.contentContainer.addChild(new Spacer(1));
        }
    }
}
```

## 2. Symbol name

`AssistantMessageComponent` — a `class` that `extends Container` (from pi-tui).

- Declaration: `assistant-message.ts:8`
- Constructor signature (assistant-message.ts:15–20):
  ```ts
  constructor(
      message?: AssistantMessage,
      hideThinkingBlock = false,
      markdownTheme: MarkdownTheme = getMarkdownTheme(),
      hiddenThinkingLabel = "Thinking...",
  )
  ```

## 3. Public export path

**Publicly re-exported from `@mariozechner/pi-coding-agent`** (no deep import required).

- `package.json` `"main"`: `./dist/index.js` (and `"exports"."." -> "./dist/index.js"`), see `/home/daniel/Coding/Javascript/pi-mono/packages/coding-agent/package.json:13–19`.
- Re-exported by root barrel: `/home/daniel/Coding/Javascript/pi-mono/packages/coding-agent/src/index.ts:306` — `AssistantMessageComponent` is one of the named exports from `./modes/interactive/components/index.js`.
- Intermediate barrel: `/home/daniel/Coding/Javascript/pi-mono/packages/coding-agent/src/modes/interactive/components/index.ts:3` — `export { AssistantMessageComponent } from "./assistant-message.js";`

So pi-thinking can write:
```ts
import { AssistantMessageComponent } from "@mariozechner/pi-coding-agent";
```

## 4. Render signature (patch target)

The renderer does not override `render` — it inherits `Container.render`. The render pipeline for a thinking block is:

1. Something calls `updateContent(message: AssistantMessage)` on the instance. (Hot call site — re-runs on every streaming chunk. See `interactive-mode.ts:2393` and `:2401`.)
2. `updateContent` clears `contentContainer` and re-appends `Markdown`/`Text` children based on `message.content`.
3. At render time, the base `Container.render(width)` walks children and concatenates output.

Patch target method:

```ts
updateContent(message: AssistantMessage): void
```

The `invalidate()` override on the same class also triggers `updateContent` whenever the component is invalidated (assistant-message.ts:36–41), so patching `updateContent` covers both the initial and re-invalidation paths.

`this` state available inside `updateContent`:

- `this.hideThinkingBlock: boolean`
- `this.markdownTheme: MarkdownTheme` ← this is the object to swap for thinking content
- `this.hiddenThinkingLabel: string`
- `this.lastMessage?: AssistantMessage`
- `this.contentContainer: Container`
- (inherited) full `Container` child-management API via `super`

## 5. Current rendering flow

1. `AssistantMessageComponent` receives a `MarkdownTheme` via its constructor, defaulting to `getMarkdownTheme()` from coding-agent (`assistant-message.ts:3` imports `getMarkdownTheme, theme` from `../theme/theme.js`).
2. For every `content.type === "thinking"` item, it instantiates a pi-tui `Markdown` component (`import { Container, Markdown, type MarkdownTheme, Spacer, Text } from "@mariozechner/pi-tui";` — assistant-message.ts:2) **using the same `this.markdownTheme`** — this is the full-saturation theme shared with regular assistant text. No muted variant exists today.
3. The only thinking-specific styling is injected via `Markdown`'s `DefaultTextStyle` parameter: `{ color: (text) => theme.fg("thinkingText", text), italic: true }` (assistant-message.ts:96–99).
4. `DefaultTextStyle` is applied by pi-tui's `Markdown.applyDefaultStyle` (markdown.ts:186–213): it wraps plain text in the `thinkingText` foreground color and calls `this.theme.italic(...)`. Crucially, `applyDefaultStyle` is **only** applied to plain text tokens. Tokens rendered via `this.theme.{heading,code,codeBlock,codeBlockBorder,quote,quoteBorder,hr,link,linkUrl,listBullet,highlightCode}` use the un-muted colors from the active theme (see `markdown.ts:271–513` — e.g. `this.theme.heading(...)` at 281/283, `this.theme.code(token.text)` at 462, `this.theme.highlightCode(...)` at 314).

This is the root cause of the contrast issue the plan addresses: markdown structural tokens inside a thinking block keep their full-saturation color while body text is dimmed to `thinkingText` italic.

## 6. Patch point

Override `AssistantMessageComponent.prototype.updateContent`, **not** `render` — the rendering work for a thinking block happens at child-construction time inside `updateContent`, and that's where the `MarkdownTheme` argument to `new Markdown(...)` needs to be swapped.

Monkey-patch sketch (mirrors pi-pane's `UserMessageComponent` precedent at `/home/daniel/.pi/agent/git/github.com/visua1hue/pi-pane/src/message.ts:33–52`):

```ts
const PATCHED = Symbol.for("pi-thinking:assistantMsgPatched");
if (!(AssistantMessageComponent as any)[PATCHED]) {
    (AssistantMessageComponent as any)[PATCHED] = true;
    const orig = AssistantMessageComponent.prototype.updateContent;
    AssistantMessageComponent.prototype.updateContent = function (message) {
        // Strategy A: temporarily swap this.markdownTheme with the muted variant,
        //             call orig, then restore. This works because the thinking branch
        //             reads `this.markdownTheme` directly at line 96.
        // Strategy B: reimplement updateContent wholesale (higher maintenance cost).
        const original = this.markdownTheme;
        try {
            this.markdownTheme = mutedTheme; // built in Task 4
            // ...but also need to patch the regular `text` branch NOT to use muted.
        } finally {
            this.markdownTheme = original;
        }
        return orig.call(this, message);
    };
}
```

**Important caveat for Task 5:** Because both the thinking branch (line 96) and the regular text branch (line 77) read `this.markdownTheme`, a blanket swap would mute normal assistant text too. Task 5 must either:
- (a) reimplement `updateContent` so the muted theme is used only on the thinking branch, or
- (b) build a *proxy* `MarkdownTheme` that the outer code installs once, which switches behaviour based on a flag we toggle around the Markdown constructor call (hard, because the swap happens inside `orig.call`), or
- (c) re-render by walking `message.content` ourselves.

Option (a) is cleanest: copy the body of `updateContent` into the patch and change only the `new Markdown(...)` call inside the thinking branch to use the muted theme.

`this` state available: see section 4.

## 7. pi-tui `MarkdownTheme` interface shape

Verbatim from `/home/daniel/Coding/Javascript/pi-mono/packages/tui/src/components/markdown.ts:29–47`:

```ts
export interface MarkdownTheme {
    heading: (text: string) => string;
    link: (text: string) => string;
    linkUrl: (text: string) => string;
    code: (text: string) => string;
    codeBlock: (text: string) => string;
    codeBlockBorder: (text: string) => string;
    quote: (text: string) => string;
    quoteBorder: (text: string) => string;
    hr: (text: string) => string;
    listBullet: (text: string) => string;
    bold: (text: string) => string;
    italic: (text: string) => string;
    strikethrough: (text: string) => string;
    underline: (text: string) => string;
    highlightCode?: (code: string, lang?: string) => string[];
    /** Prefix applied to each rendered code block line (default: "  ") */
    codeBlockIndent?: string;
}
```

### Field list (verbatim names — Tasks 4 and 5 must adopt these exact names)

`heading, link, linkUrl, code, codeBlock, codeBlockBorder, quote, quoteBorder, hr, listBullet, bold, italic, strikethrough, underline, highlightCode, codeBlockIndent`

(Required: all except `highlightCode` and `codeBlockIndent`, which are optional.)

### Related — `DefaultTextStyle` (markdown.ts:10–23)

```ts
export interface DefaultTextStyle {
    color?: (text: string) => string;
    bgColor?: (text: string) => string;
    bold?: boolean;
    italic?: boolean;
    strikethrough?: boolean;
    underline?: boolean;
}
```

The current thinking renderer uses only `{ color, italic }`.

## 8. pi `Theme` color resolution API

`Theme` is a class exported from `@mariozechner/pi-coding-agent` (root barrel: `coding-agent/src/index.ts:350`, source: `coding-agent/src/modes/interactive/theme/theme.ts:342`).

Active-theme color lookup (theme.ts:370–374):

```ts
fg(color: ThemeColor, text: string): string {
    const ansi = this.fgColors.get(color);
    if (!ansi) throw new Error(`Unknown theme color: ${color}`);
    return `${ansi}${text}\x1b[39m`; // Reset only foreground color
}
```

To read the raw ANSI escape for a color without wrapping text (useful for hex extraction / palette derivation), use `getFgAnsi` (theme.ts:402–406):

```ts
getFgAnsi(color: ThemeColor): string {
    const ansi = this.fgColors.get(color);
    if (!ansi) throw new Error(`Unknown theme color: ${color}`);
    return ansi;
}
```

**For deriving a dim palette**, the raw hex/256-index input value is *not* directly exposed on `Theme` — only its compiled ANSI escape sequence. Three practical options for Task 3/4:

1. Parse the ANSI string returned by `getFgAnsi("mdHeading")` (format is `\x1b[38;2;R;G;Bm` for truecolor or `\x1b[38;5;Nm` for 256-color — see theme.ts:279–292 `fgAnsi`). Extract RGB, darken in HSL, emit a new ANSI escape.
2. Use `getResolvedThemeColors(themeName?)` (theme.ts:879) which returns `Record<string, string>` mapping every color key to a hex string (including 256-color indices converted via `ansi256ToHex`). This is simpler but depends on the theme-name lookup rather than the in-memory `theme` instance.
3. Read `theme.getColorMode()` (theme.ts:414–416) to decide truecolor vs 256-color output, combined with option 1 for extraction.

### `ThemeColor` union (theme.ts:99–144) — the set of keys `fg()` accepts

`accent, border, borderAccent, borderMuted, success, error, warning, muted, dim, text, thinkingText, userMessageText, customMessageText, customMessageLabel, toolTitle, toolOutput, mdHeading, mdLink, mdLinkUrl, mdCode, mdCodeBlock, mdCodeBlockBorder, mdQuote, mdQuoteBorder, mdHr, mdListBullet, toolDiffAdded, toolDiffRemoved, toolDiffContext, syntaxComment, syntaxKeyword, syntaxFunction, syntaxVariable, syntaxString, syntaxNumber, syntaxType, syntaxOperator, syntaxPunctuation, thinkingOff, thinkingMinimal, thinkingLow, thinkingMedium, thinkingHigh, thinkingXhigh, bashMode`

`thinkingText` is the existing "dim italic body" color — useful as a luminance anchor for the derived palette.

### Concrete example call

```ts
import { theme } from "@mariozechner/pi-coding-agent"; // Proxy to the active global Theme
// Colorize a string with the heading color:
const styledHeading = theme.fg("mdHeading", "Hello");
// Raw ANSI escape for the heading color (to decode RGB for dimming):
const rawAnsi = (theme as any).getFgAnsi("mdHeading");
// e.g. "\x1b[38;2;229;229;231m" — RGB values parseable with a simple regex.
// Or via the hex helper (by theme name, not the live instance):
import { getResolvedThemeColors } from "@mariozechner/pi-coding-agent";
// NOTE: getResolvedThemeColors is not in the root barrel (grep shows it only in theme.ts);
//       confirm in Task 3 whether to use getFgAnsi parsing or add a deep import.
```

**Confirmed root-barrel exports** (`coding-agent/src/index.ts:343–352`): `getLanguageFromPath, getMarkdownTheme, getSelectListTheme, getSettingsListTheme, highlightCode, initTheme, Theme, type ThemeColor`. `getResolvedThemeColors` is **not** re-exported — Task 3 should plan to parse `getFgAnsi()` output instead of relying on that helper.

## 9. Patch strategy verdict

### **B1 — Class with prototype method, publicly re-exported → patch `AssistantMessageComponent.prototype.updateContent`.**

Evidence:
- `AssistantMessageComponent` is a `class` (assistant-message.ts:8).
- It is re-exported from the package root entrypoint (`coding-agent/src/index.ts:306`, declared in `package.json` `"main"` / `"exports"`).
- The method to patch (`updateContent`) is a regular prototype method (assistant-message.ts:57).
- pi-pane already validated this exact pattern on `UserMessageComponent.prototype` (message.ts:37–52).

Risk notes:
- The thinking branch and the text branch share `this.markdownTheme`. Task 5 cannot simply swap the field — it must reimplement the method body so the muted theme is applied only to the thinking branch.
- Interactive mode re-constructs `AssistantMessageComponent` on every streaming turn (interactive-mode.ts:2385) and calls `updateContent` on every chunk (interactive-mode.ts:2401). The patched method is on the hot path — keep allocations low and avoid per-chunk theme rebuilds.
- Breaking-change surface: if pi-mono rewrites the thinking branch (e.g. extracts it into its own method, or replaces the `Markdown` component with a different renderer), the patch silently stops applying. Add a defensive check (e.g. compare the `toString()` of the original `updateContent` against a known snapshot, or fall back gracefully if the internal field names change) and pin the pi-coding-agent version in `package.json`.

## 10. Thinking-block label placement

**Body text begins on line 1 — there is no label/header line today.**

Reading assistant-message.ts:93–100: when `hideThinkingBlock` is `false` (the default for showing thinking), the renderer appends exactly one `Markdown` child seeded with `content.thinking.trim()` and a trailing `Spacer(1)` *only when* another visible assistant content block follows. There is no prepended `"Thinking..."` `Text` and no separator.

The "Thinking..." label only appears in the **hidden** branch (assistant-message.ts:85–92), where it replaces the body entirely.

**Implication for Task 5:** if the plan wants a visible label above the dimmed body (e.g. a dim italic "Thinking" heading to visually anchor the block), Task 5 must *prepend* a standalone `Text` line before the `Markdown` child. The existing renderer does not emit one, so there is nothing to style-override — we are adding a new child.

---

## Quick reference — verbatim field lists (for copy/paste into later tasks)

### MarkdownTheme fields

```
heading, link, linkUrl, code, codeBlock, codeBlockBorder, quote, quoteBorder, hr,
listBullet, bold, italic, strikethrough, underline, highlightCode?, codeBlockIndent?
```

### DefaultTextStyle fields

```
color?, bgColor?, bold?, italic?, strikethrough?, underline?
```

### Relevant ThemeColor keys for a muted markdown palette

```
mdHeading, mdLink, mdLinkUrl, mdCode, mdCodeBlock, mdCodeBlockBorder,
mdQuote, mdQuoteBorder, mdHr, mdListBullet, thinkingText,
syntaxComment, syntaxKeyword, syntaxFunction, syntaxVariable, syntaxString,
syntaxNumber, syntaxType, syntaxOperator, syntaxPunctuation
```

### Import shape for pi-thinking

```ts
import {
    AssistantMessageComponent,
    getMarkdownTheme,
    Theme,
    type ThemeColor,
    theme, // active global Theme via Proxy
} from "@mariozechner/pi-coding-agent";
import type { MarkdownTheme } from "@mariozechner/pi-tui";
```
