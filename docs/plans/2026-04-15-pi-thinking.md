# pi-thinking Plan

**Goal:** Build a pi extension that renders thinking blocks with muted colors, a themed `"Thinking:"` label, and a derived dim syntax palette for fenced code — leaving assistant message rendering untouched.

**Architecture:** Monkey-patch pi-mono's thinking block renderer class on `session_start` (the same pattern pi-pane uses for `UserMessageComponent`). The patched `render()` constructs a pi-tui `Markdown` instance with a custom muted `MarkdownTheme` built from the active pi `Theme`, and prepends a themed `"Thinking:"` label. Canonical `block.thinking` is never mutated, so no `context` sanitization is needed and session reloads render correctly on every pass.

**Tech Stack:** TypeScript, Bun (runtime + test runner), `@mariozechner/pi-coding-agent`, `@mariozechner/pi-tui`.

**Reference design spec:** in-conversation, approved 2026-04-15. Palette B + derived dim syntax palette (HSL-anchored to `thinkingText` lightness, 0.5 saturation factor, hue preserved).

---

### Task 1: Research pi-mono's thinking renderer

**Context:**
Before we can patch the thinking renderer, we need to identify the exact class/function/module that renders thinking blocks in pi-mono, confirm it's importable from `@mariozechner/pi-coding-agent`, and understand its render signature. The pi-mono source is cloned locally at `/home/daniel/Coding/Javascript/pi-mono/`. This task produces a research document that subsequent tasks depend on — Task 5 in particular cannot start until we know what to patch.

This task is investigation, not TDD. Its deliverable is a markdown document capturing concrete facts.

**Files:**
- Create: `docs/research/thinking-renderer.md`

**What to implement:**
A markdown document with these sections filled in with specific facts from the pi-mono source:

- **Thinking block renderer — source location**: exact file path in pi-mono (e.g., `packages/coding-agent/src/ui/components/thinking-block.ts`)
- **Symbol name**: exact class or function name
- **Public export path**: how the symbol is re-exported from the `@mariozechner/pi-coding-agent` public entrypoint. If not re-exported, note that Approach B requires deep imports — flag the risk.
- **Render signature**: the exact TypeScript signature being patched (e.g., `render(width: number): string[]`)
- **Current rendering flow**: how the renderer produces colored markdown today — does it instantiate pi-tui's `Markdown` directly? Does it call `getMarkdownTheme()` from coding-agent? Where does the italic-dim thinking-body styling come from?
- **Patch point**: which method to override, and what `this` state is available at that call site (e.g., is there a `.block` or `.content` field we can read?)
- **pi-tui `MarkdownTheme` interface shape**: exact field names (`heading`, `code`, `codeBlock`, `codeBlockBorder`, `quote`, `quoteBorder`, `hr`, `listBullet`, `link`, `linkUrl`, `emphasis`, syntax token fields, body-text handler, etc.) — grab this from `/home/daniel/Coding/Javascript/pi-mono/packages/tui/src/components/markdown.ts` around the `MarkdownTheme` interface definition (line ~35 per prior research)
- **pi `Theme` color resolution API**: how to read the active theme's color for a given token key (e.g., `theme.getColorValue("syntaxKeyword")`? direct property access?). We need this for the derived dim palette.
- **Patch strategy verdict**: exactly one of these four cases, with explicit justification:
  - *B1 — Class with prototype method, publicly re-exported* → patch `Class.prototype.render` directly (ideal path)
  - *B2 — Class with prototype method, but only accessible via a deep import path (e.g., `@mariozechner/pi-coding-agent/dist/internal/...`)* → document the deep import; still patchable via prototype, but flag the fragility
  - *B3 — Exported function (not a class)* → note that `prototype.render` patching does not apply; record whether the module's function export can be replaced by mutating the live module namespace object, and whether pi's loader treats the import as a live binding or a snapshot
  - *B4 — Renderer not exported at all* → Approach B is infeasible. Fall back to Approach A: string mutation via `message_update`/`message_end` + `WeakMap` stash + `context` sanitization. The research doc must then sketch the fallback hook shape.
- **Thinking-block label placement**: how the current renderer lays out its output — is the first line a label/header line, or does body text begin on line 1? This determines whether Task 5 prepends a standalone label line vs. merges the label into the first body line.

**Steps:**
- [ ] Grep `/home/daniel/Coding/Javascript/pi-mono/packages/coding-agent/src/` for the string `thinking` (case-insensitive) to find the renderer file
- [ ] Read the renderer file end-to-end; identify the class/function and its render method
- [ ] Check `/home/daniel/Coding/Javascript/pi-mono/packages/coding-agent/src/index.ts` (or whatever the package's public entry point is — look at `package.json` `"main"`/`"exports"`) to confirm the renderer is re-exported
- [ ] Read `/home/daniel/Coding/Javascript/pi-mono/packages/tui/src/components/markdown.ts` to capture the full `MarkdownTheme` interface
- [ ] Find how the `Theme` type exposes color values for tokens like `thinkingText`, `dim`, `syntaxKeyword` — look in `/home/daniel/Coding/Javascript/pi-mono/packages/coding-agent/src/` or `packages/tui/src/` for `Theme` class/type definition
- [ ] Write `docs/research/thinking-renderer.md` with all sections populated with specific `file:line` refs and code excerpts
- [ ] Commit with message: `docs: investigate pi-mono thinking renderer patch target`

**Acceptance criteria:**
- [ ] `docs/research/thinking-renderer.md` classifies the renderer as exactly one of B1/B2/B3/B4 with evidence
- [ ] `MarkdownTheme` interface fields are documented verbatim (not paraphrased), with `file:line` references
- [ ] The list of syntax token field names on `MarkdownTheme` (e.g., `syntaxKeyword`, or whatever the actual names are) is captured verbatim — Tasks 4 and 5 must adopt these exact names, not paraphrases
- [ ] `Theme` color-resolution API is documented with a concrete example call
- [ ] Label placement decision recorded (standalone line vs. merged into first body line), with a screenshot or code excerpt of the current layout

---

### Task 2: Project scaffold

**Context:**
Set up the pi-thinking extension package at `/home/daniel/Coding/Javascript/pi-thinking/` with Bun, TypeScript, and a test runner. pi extensions are loaded as TypeScript directly (no build step), so there's no bundler config — but we need `bun test` for unit testing the HSL math (Task 3) and theme builder (Task 4). Mirror pi-pane's package.json structure (also a Bun project) where reasonable.

This task has no automated tests; its acceptance is that `bun install` and `bun run typecheck` both succeed.

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `README.md`
- Create: `.gitignore`
- Create: `src/index.ts` (stub — real wiring in Task 6)

**What to implement:**

`package.json`:
```json
{
  "name": "pi-thinking",
  "version": "0.1.0",
  "description": "Muted, themed rendering for thinking blocks in pi.",
  "type": "module",
  "license": "MIT",
  "keywords": ["pi", "pi-extension", "pi-package", "thinking", "tui"],
  "pi": { "extensions": ["./src/index.ts"] },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "bun test"
  },
  "devDependencies": {
    "@mariozechner/pi-coding-agent": "*",
    "@mariozechner/pi-tui": "*",
    "@types/bun": "latest",
    "@types/node": "^24.5.2",
    "typescript": "^6.0.2"
  }
}
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["bun-types"],
    "noEmit": true
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

`README.md`:
```
# pi-thinking

Muted, themed rendering for thinking blocks in pi — calmer colors, dim syntax highlighting in fenced code, and a themed "Thinking:" label.

Installation and usage documented after Task 6.
```

`.gitignore`:
```
node_modules/
bun.lock
*.log
.DS_Store
```

`src/index.ts`:
```ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function piThinkingExtension(_pi: ExtensionAPI): void {
  // Real wiring added in Task 6
}
```

**Steps:**
- [ ] Create all five files above at the paths listed
- [ ] Run `bun install` in `/home/daniel/Coding/Javascript/pi-thinking/`
  - Did it succeed? If not, fix and re-run before continuing.
- [ ] Run `bun run typecheck`
  - Did it succeed? If not, fix and re-run before continuing.
- [ ] Initialize git: `git init`
- [ ] Stage all files: `git add .`
- [ ] Commit with message: `chore: initial pi-thinking scaffold`

**Acceptance criteria:**
- [ ] `bun install` exits 0
- [ ] `bun run typecheck` exits 0
- [ ] `git log --oneline` shows the initial commit

---

### Task 3: HSL color utilities

**Context:**
The derived dim syntax palette (core to the design spec) requires converting theme colors to HSL, clamping lightness to the `thinkingText` lightness, halving saturation, and converting back to a hex color usable as ANSI truecolor. This is pure math. Keeping it in its own module lets Task 4 (theme builder) compose it cleanly, and lets us TDD the edge cases without touching the theme API.

Input colors can come as hex strings (`#rrggbb`, `#rgb`, with or without `#`) or ANSI 256 palette indices (0–255). Both must be supported.

**Files:**
- Create: `src/hsl.ts`
- Create: `tests/hsl.test.ts`

**What to implement:**

`src/hsl.ts` exports:
```ts
export interface RGB { r: number; g: number; b: number }  // each 0..255 integer
export interface HSL { h: number; s: number; l: number }  // h: 0..360, s/l: 0..1

export function hexToRgb(hex: string): RGB
export function rgbToHex(rgb: RGB): string  // returns "#rrggbb"
export function rgbToHsl(rgb: RGB): HSL
export function hslToRgb(hsl: HSL): RGB
export function ansi256ToRgb(code: number): RGB  // handles 0-15, 16-231 (6x6x6 cube), 232-255 (greyscale ramp)
export function deriveDimColor(
  input: string | number,
  anchorLightness: number,
  saturationFactor?: number
): string  // returns "#rrggbb"
```

`deriveDimColor` algorithm:
1. If `input` is a number, treat as ANSI 256 code → `ansi256ToRgb`
2. If `input` is a string, parse as hex → `hexToRgb`
3. Convert RGB → HSL
4. Compute target lightness = `Math.min(orig.l, anchorLightness)`
5. Compute target saturation = `orig.s * (saturationFactor ?? 0.5)`
6. Preserve hue unchanged
7. Convert HSL → RGB → hex

Edge cases:
- Hex input may be `#rgb`, `#rrggbb`, `rgb`, or `rrggbb` (four variants). Normalize.
- Achromatic (s≈0) inputs: preserve grayscale feel — saturation stays near 0 after scaling
- ANSI codes 0–15: use the xterm standard 16-color palette (document this choice in a code comment). Values:
  ```
  0:  #000000    8:  #808080
  1:  #800000    9:  #ff0000
  2:  #008000   10:  #00ff00
  3:  #808000   11:  #ffff00
  4:  #000080   12:  #0000ff
  5:  #800080   13:  #ff00ff
  6:  #008080   14:  #00ffff
  7:  #c0c0c0   15:  #ffffff
  ```
- ANSI codes 16–231: 6×6×6 cube, where levels map to [0, 95, 135, 175, 215, 255]
- ANSI codes 232–255: grayscale ramp, 8 + (code-232)*10 for each channel

**Do NOT:**
- Do NOT import any pi APIs here. This module must be pure.
- Do NOT add memoization or caches. Irrelevant at this stage.

**Steps:**
- [ ] Create `tests/hsl.test.ts` with failing tests covering:
  - `hexToRgb("#ff0000")` equals `{r:255,g:0,b:0}`
  - `hexToRgb("f00")` equals `{r:255,g:0,b:0}`
  - `rgbToHex({r:255,g:0,b:0})` equals `"#ff0000"`
  - `rgbToHsl({r:255,g:0,b:0})` approximately equals `{h:0,s:1,l:0.5}` (tolerance 0.01)
  - `hslToRgb({h:0,s:1,l:0.5})` equals `{r:255,g:0,b:0}`
  - `ansi256ToRgb(16)` equals `{r:0,g:0,b:0}`
  - `ansi256ToRgb(196)` (a red cube code) approximately equals `{r:255,g:0,b:0}`
  - `ansi256ToRgb(232)` equals `{r:8,g:8,b:8}`
  - `ansi256ToRgb(255)` equals `{r:238,g:238,b:238}`
  - `deriveDimColor("#ff0000", 0.3)` produces a hex whose HSL has `l ≤ 0.3` and `s = 0.5` (within epsilon)
  - `deriveDimColor("#888888", 0.5)` preserves low saturation (returns near-grey)
  - `deriveDimColor(196, 0.25)` accepts numeric ANSI input and produces `l ≤ 0.25`
- [ ] Run `bun test tests/hsl.test.ts`
  - Did it fail with "module not found" or all tests failing? If any pass, stop and investigate why.
- [ ] Implement `src/hsl.ts` with all exported functions
- [ ] Run `bun test tests/hsl.test.ts`
  - Did all tests pass? If not, fix and re-run before continuing.
- [ ] Run `bun run typecheck`
  - Did it succeed? If not, fix and re-run before continuing.
- [ ] Commit with message: `feat: HSL color utilities for derived dim palette`

**Acceptance criteria:**
- [ ] All listed functions exported with documented signatures
- [ ] All tests pass
- [ ] Typecheck passes
- [ ] Zero runtime dependencies imported in `src/hsl.ts`

---

### Task 4: Muted markdown theme builder

**Context:**
pi-tui's `Markdown` component accepts a `MarkdownTheme` at construction. For thinking blocks we build a muted `MarkdownTheme` from the active pi `Theme`: structural markdown tokens map to `thinkingText` and `dim`, and fenced-code syntax tokens use the derived dim palette from Task 3. This module consumes `Theme` and `hsl.ts`; it produces a ready-to-use `MarkdownTheme`.

The exact `MarkdownTheme` interface shape, the `Theme` color-resolution API, and the authoritative list of syntax token field names are captured in `docs/research/thinking-renderer.md` (Task 1). **Read it before implementing** — every field name and import path used in this task must cite Task 1's research, not the placeholder list below.

**Files:**
- Create: `src/theme.ts`
- Create: `tests/theme.test.ts`

**What to implement:**

`src/theme.ts` exports:
```ts
import type { Theme } from "@mariozechner/pi-coding-agent";
// Import MarkdownTheme from the path identified in Task 1's research doc

export interface MutedThemeOptions {
  saturationFactor?: number;  // default 0.5
  anchorToken?: string;       // default "thinkingText"
}

export function buildMutedMarkdownTheme(
  piTheme: Theme,
  opts?: MutedThemeOptions,
): MarkdownTheme
```

**Palette B mapping** (applied inside `buildMutedMarkdownTheme`). For each markdown token the `MarkdownTheme` interface requires, produce a function that wraps the input text in the appropriate ANSI:

| MarkdownTheme field | Color source | ANSI style additions |
|---|---|---|
| body text | `piTheme.fg("thinkingText", text)` | `\x1b[3m` (italic) prepended, `\x1b[0m` appended |
| heading | `piTheme.fg("thinkingText", text)` | italic + `\x1b[1m` (bold) |
| code (inline) | `piTheme.fg("dim", text)` | italic |
| codeBlock content | (rendered via syntax tokens; see below) | — |
| codeBlockBorder | `piTheme.fg("dim", text)` | — |
| quote | `piTheme.fg("thinkingText", text)` | italic |
| quoteBorder | `piTheme.fg("dim", text)` | — |
| hr | `piTheme.fg("dim", text)` | — |
| listBullet | `piTheme.fg("dim", text)` | — |
| link | `piTheme.fg("thinkingText", text)` | italic + `\x1b[4m` (underline) |
| linkUrl | `piTheme.fg("dim", text)` | — |
| emphasis / bold | `piTheme.fg("thinkingText", text)` | italic + bold |

**Syntax token mapping** for fenced code contents:

For each syntax token field on `MarkdownTheme` (the authoritative list is captured in Task 1's research doc — the tokens *below* are a probable-but-unverified placeholder; if Task 1 records different names, use those instead): `syntaxComment`, `syntaxKeyword`, `syntaxFunction`, `syntaxVariable`, `syntaxString`, `syntaxNumber`, `syntaxType`, `syntaxOperator`, `syntaxPunctuation`.

For each such token:

1. Resolve the theme's configured color value for that token via the `Theme` color-resolution API identified in Task 1's research
2. Resolve the theme's `thinkingText` color the same way; compute its lightness via `rgbToHsl`
3. Call `deriveDimColor(tokenColor, thinkingTextLightness, saturationFactor)` to produce the muted hex
4. Produce a function that wraps text in `\x1b[38;2;R;G;Bm<text>\x1b[0m` using that hex's RGB values

Cache the derived palette inside `buildMutedMarkdownTheme` — compute once per call, not per token invocation.

**Do NOT:**
- Do NOT hardcode color hex values. All colors derive from `piTheme`.
- Do NOT special-case light vs dark themes. The derivation is uniform.
- Do NOT implement fence delimiter collapsing. Fences stay visible (intentional pi-mono behavior).

**Steps:**
- [ ] Create `tests/theme.test.ts` with failing tests using a stub `Theme` object that returns known values:
  - Stub `piTheme.fg(token, text)` to return `[${token}]${text}[/]`, and stub color-resolution to return `#888888` for `thinkingText`, `#606060` for `dim`, `#4a90ff` for `syntaxKeyword`, `#00ff00` for `syntaxString`, `#808080` for `syntaxComment`
  - Assert `buildMutedMarkdownTheme(stub).code("hi")` contains `[dim]` and `\x1b[3m` (italic ANSI)
  - Assert `.heading("H", 1)` contains italic (`\x1b[3m`) and bold (`\x1b[1m`)
  - Assert `.codeBlockBorder("\`\`\`")` contains `[dim]`
  - Assert that applying the theme's `syntaxString` handler to text produces ANSI whose RGB has lightness ≤ the `thinkingText` lightness (0.53 for `#888888`)
  - Assert that `syntaxComment` (originally `#808080`) does NOT become brighter than its original lightness (lightness clamped, never raised)
- [ ] Run `bun test tests/theme.test.ts`
  - Did it fail? If any pass, stop and investigate.
- [ ] Implement `src/theme.ts`
- [ ] Run `bun test tests/theme.test.ts`
  - Did all tests pass? If not, fix and re-run.
- [ ] Run `bun run typecheck`
  - Did it succeed? If not, fix and re-run.
- [ ] Commit with message: `feat: muted markdown theme builder with derived dim palette`

**Acceptance criteria:**
- [ ] `buildMutedMarkdownTheme(piTheme)` returns an object conforming to pi-tui's `MarkdownTheme` interface (exact fields per Task 1 research)
- [ ] Every syntax-token color in the output has lightness ≤ `thinkingText` lightness
- [ ] All colors derive from the input theme (no hardcoded hex)
- [ ] All tests pass; typecheck passes

---

### Task 5: Patch the thinking block renderer

**Context:**
With the muted theme available, we intercept pi-mono's thinking block rendering. Per Task 1's research, we monkey-patch the identified renderer class's render method, constructing a `Markdown` component with our muted theme and prepending a themed `"Thinking:"` label. The original `block.thinking` string is never mutated — canonical state stays clean, context sanitization is unnecessary, and session reloads render correctly every pass.

**Verdict branching** — execute the branch matching Task 1's verdict. Do not implement multiple paths:
- **B1** (class, publicly re-exported): patch `ThinkingRenderer.prototype.render` via the public import. Use the static top-level import shown below.
- **B2** (class, deep import only): patch via the deep import path recorded in research. Add a one-line code comment citing the research doc so future readers know why a deep path was chosen.
- **B3** (exported function): patch by re-binding the function on the module namespace object. Confirm at runtime that the rebinding holds; if it does not (the import was a snapshot), escalate back to the user before proceeding — do not silently fall through to B4.
- **B4** (not exported): abandon this file's approach. Rewrite this task to use string mutation with a `WeakMap` stash and `context` sanitization — the research doc dictates the hook shape.

**Ordering note:** `patchThinkingRenderer` must complete before the first thinking block renders. Prefer a static top-level import of the renderer over `import(...).then(...)` so the patch is synchronous from the caller's perspective. This avoids the race that a deferred dynamic import would introduce.

**Files:**
- Create: `src/patch.ts`
- Create: `tests/patch.test.ts`

**What to implement (Approach B path):**

`src/patch.ts` exports:
```ts
import type { Theme } from "@mariozechner/pi-coding-agent";
// Static import of the thinking renderer class from the import path recorded in Task 1 research.
// Example shape (replace with the actual symbol/path from research):
//   import { ThinkingBlockRenderer } from "@mariozechner/pi-coding-agent";

export const PATCH_GUARD = Symbol.for("pi-thinking:patched");

export function patchThinkingRenderer(getTheme: () => Theme): void
```

The function:
1. Reads the thinking renderer class from the top-level static import (no `import(...).then(...)`)
2. Checks `(ThinkingRenderer as any)[PATCH_GUARD]` — if truthy, return immediately (idempotent)
3. Marks `(ThinkingRenderer as any)[PATCH_GUARD] = true`
4. Replaces `ThinkingRenderer.prototype.render` with a wrapper that:
   - Reads the thinking string from `this` (exact field name from Task 1 research)
   - If the thinking string is empty, returns `[]`
   - Builds a muted theme via `buildMutedMarkdownTheme(getTheme())`
   - Constructs a pi-tui `Markdown` instance using the constructor signature confirmed in Task 1 research (e.g., `new Markdown(thinking, 0, 0, mutedTheme)`)
   - Renders it at the given width to produce `bodyLines: string[]`
   - Emits the label as a **standalone line** — `labelLine = getTheme().fg("accent", "Thinking:")` — regardless of whether the original renderer merged labels into the first body line. Rationale: a dedicated label line is simpler to test, avoids alignment issues with body indentation, and matches the visual spec.
   - Returns `[labelLine, ...bodyLines]`

The original render is NOT stashed — the `PATCH_GUARD` symbol alone prevents double-patching, and no code path needs to call the original.

**Do NOT:**
- Do NOT mutate `block.thinking` or any stored content
- Do NOT register event hooks inside this module — that's Task 6
- Do NOT implement the Approach A fallback unless Task 1 requires it

**Steps:**
- [ ] Create `tests/patch.test.ts` with failing integration tests using a minimal stub renderer class and stub theme:
  - Define `class StubThinking { thinking = "hello"; render(w: number) { return ["original"]; } }`
  - Patch a reference to this class via a test-only helper (the patch module should expose an internal `patchTarget(targetClass, getTheme)` for testability OR the test imports and patches directly — decide during implementation)
  - After patching, `new StubThinking().render(80)` should return lines where the first line contains `"Thinking:"`
  - Calling the patch twice on the same class is a no-op (render result unchanged between first and second patch call)
  - When `thinking = ""`, render returns `[]`
- [ ] Run `bun test tests/patch.test.ts`
  - Did it fail? If any pass, stop and investigate.
- [ ] Implement `src/patch.ts` per Task 1's patch target
- [ ] Run `bun test tests/patch.test.ts`
  - Did all tests pass? If not, fix and re-run.
- [ ] Run `bun run typecheck`
  - Did it succeed? If not, fix and re-run.
- [ ] Commit with message: `feat: monkey-patch thinking renderer to route through muted theme`

**Acceptance criteria:**
- [ ] `patchThinkingRenderer` is idempotent (second call is a no-op guarded by `PATCH_GUARD`)
- [ ] Patched render produces themed label + muted markdown body
- [ ] Original `block.thinking` string is never mutated anywhere in this module
- [ ] Tests pass; typecheck passes

---

### Task 6: Extension entry point

**Context:**
Wire the patch into pi's extension lifecycle. On `session_start`, pass a theme accessor to `patchThinkingRenderer`. The patch is idempotent, so repeated session starts don't re-wrap. No other events are hooked — by design. Canonical state is never mutated, so `message_update`, `message_end`, and `context` do not need handlers.

**Files:**
- Modify: `src/index.ts`
- Modify: `README.md`

**What to implement:**

`src/index.ts` (replace entire contents):
```ts
import type { ExtensionAPI, Theme } from "@mariozechner/pi-coding-agent";
import { patchThinkingRenderer } from "./patch.js";

export default function piThinkingExtension(pi: ExtensionAPI): void {
  pi.on("session_start", (_event, ctx) => {
    if (!ctx.hasUI) return;
    const ui = ctx.ui as any;
    const getTheme = (): Theme => ui.theme as Theme;
    patchThinkingRenderer(getTheme);
  });
}
```

`README.md` — replace with:
```markdown
# pi-thinking

Muted, themed rendering for thinking blocks in [pi](https://github.com/badlogic/pi-mono) — calmer colors, dim syntax highlighting inside fenced code, and a themed `"Thinking:"` label.

## Install

### Local development

Symlink or copy this folder into pi's global extensions directory:

```bash
ln -s /home/daniel/Coding/Javascript/pi-thinking ~/.pi/agent/extensions/pi-thinking
```

Or add the entry path to `~/.pi/agent/settings.json`:

```json
{ "extensions": ["/home/daniel/Coding/Javascript/pi-thinking/src/index.ts"] }
```

### Published

```bash
pi install git:github.com/<owner>/pi-thinking
```

## Requirements

- [pi agent](https://github.com/badlogic/pi-mono)

## License

MIT
```

**Do NOT:**
- Do NOT register `message_update` / `message_end` / `context` hooks
- Do NOT add configuration options (v0.1 is zero-config)

**Steps:**
- [ ] Replace `src/index.ts` contents
- [ ] Replace `README.md` contents
- [ ] Run `bun run typecheck`
  - Did it succeed? If not, fix and re-run before continuing.
- [ ] Run `bun test`
  - Did all existing tests still pass? If not, fix and re-run before continuing.
- [ ] Commit with message: `feat: wire extension entry point — patch on session_start`

**Acceptance criteria:**
- [ ] `src/index.ts` registers only `session_start`
- [ ] `ctx.hasUI` is checked before patching
- [ ] README documents both local and published install paths
- [ ] Typecheck passes; all tests pass

---

### Task 7: Manual verification & tuning

**Context:**
Color decisions made algorithmically still need validation against a real terminal and real pi session. The HSL-derived palette may need per-token tweaks if the terminal-rendered result diverges from the design intent. This task is explicitly manual — the output is visual correctness, which only a human can confirm.

**Files:**
- Possibly modify: `src/theme.ts` (tune colors based on observation, if needed)
- Create: `docs/verification-log.md`

**What to implement:**
A verification run against live pi, observations recorded, and any color tuning applied with a justification in the commit message.

**Steps:**
- [ ] Link the extension so pi loads it:
  ```bash
  mkdir -p ~/.pi/agent/extensions
  ln -s /home/daniel/Coding/Javascript/pi-thinking ~/.pi/agent/extensions/pi-thinking
  ```
  - Confirm the symlink was created: `ls -la ~/.pi/agent/extensions/pi-thinking`
  - If pi-tool-display is currently installed and its `thinking-label.ts` would conflict, disable it temporarily (per the user's earlier decision: "i will remove pi-tool-display for now and figure that out later")
- [ ] Launch pi in a terminal (interactive session)
- [ ] Issue prompts that force varied thinking content:
  - Prose-only thinking (e.g., ask a conceptual question)
  - Thinking with a markdown heading (ask the model to reason step-by-step with sections)
  - Thinking with inline backticked code tokens
  - Thinking with a fenced `python` code block (multiple lines, realistic)
  - Thinking with a fenced `rust` code block
  - Thinking with a bulleted list
- [ ] For each, visually confirm each design-spec acceptance criterion:
  - [ ] `"Thinking:"` label appears at the start of the thinking block
  - [ ] Body prose renders as dim italic (unchanged from baseline pi)
  - [ ] Inline code renders dim — not bright green
  - [ ] Headers render dim with weight preserved — not bright orange
  - [ ] Fenced code contents render with syntax highlighting in a dim palette (keywords/strings/comments distinguishable by hue but none brighter than body prose)
  - [ ] Fence delimiters (```) visible but dim (per the intentional pi-mono behavior)
  - [ ] Assistant messages render normally — full bright, unchanged (regression check)
- [ ] If any element looks wrong, adjust the corresponding mapping in `src/theme.ts` (only the aesthetic mapping — do not change the derivation algorithm without going back through brainstorming)
- [ ] Write `docs/verification-log.md` documenting:
  - Each prompt used
  - Which acceptance criteria passed/failed on first run
  - Any tweaks applied and the reasoning
- [ ] Run `bun run typecheck` and `bun test` after any tweaks
  - Did both succeed? If not, fix and re-run before committing.
- [ ] Commit with message: `chore: verify rendering and document tuning (if any)`

**Acceptance criteria:**
- [ ] All seven visual acceptance criteria above are confirmed passing in a real pi session
- [ ] `docs/verification-log.md` exists and records observations
- [ ] Any color tuning is reflected in the commit message's justification
