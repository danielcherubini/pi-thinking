# Code Block Unindent Plan

**Goal:** Strip common leading whitespace and trailing blank lines from fenced code blocks in assistant messages, so copied code is clean.

**Architecture:** A pure `unindentCodeBlocks(text)` function transforms markdown text before it reaches the `Markdown` component. Integrated into the existing `patchTarget` so both text and thinking blocks benefit.

**Tech Stack:** TypeScript, Bun test, pi-tui Markdown component, monkey-patch pattern from pi-thinking.

---

### Task 1: Implement `unindentCodeBlocks` with tests

**Context:**
The core transform — a pure function that takes markdown text containing fenced code blocks and strips common leading whitespace + trailing blank lines from each block. This is the only new logic; everything else is integration.

**Files:**
- Create: `src/unindent.ts`
- Create: `tests/unindent.test.ts`

**What to implement:**

In `src/unindent.ts`, export a single function:

```typescript
/**
 * Strip common leading whitespace and trailing blank lines from every fenced
 * code block in `text`.  Returns the transformed string.
 *
 * Algorithm per block:
 * 0. Normalize `\r\n` → `\n` in the full input text before processing.
 * 1. Find the minimum leading whitespace across all non-empty lines.
 * 2. Strip that many characters from the start of every line
 *    (empty lines stay empty — they contribute no content but preserve structure).
 * 3. Pop trailing empty lines.
 *
 * Trailing blank lines are ALWAYS stripped, even from 0-indent blocks.
 * Leading whitespace is only stripped when minIndent > 0.
 * Blocks containing only whitespace are left untouched.
 *
 * Known limitations:
 * - Only space-based indentation is handled (tabs are not expanded).
 * - If one line has 0 indent and others have N indent, nothing is stripped
 *   (minIndent === 0). This is standard textwrap.dedent behavior.
 * - Fenced code blocks using 4+ backticks may be misparsed. The regex uses a
 *   negative lookahead to reject 4+ backtick openings (`/^(\`\`\`(?!\`))/
 * - Line endings in the output are always `\n` (CRLF input is normalized).
 */
export function unindentCodeBlocks(text: string): string {
    // Implementation
}
```

Regex: `/^(\`\`\`(?!\`))([^\n]*)\n([\s\S]*?)^\`\`\`(?!\`)[ \t]*$/gm` — anchored to line boundaries with `m` flag. Uses negative lookahead `(?!\`)` on both opening and closing fences to reject 4+ backtick fences. The opening fence is anchored to `^` (line start). The language tag uses `[^\n]*` to accept any characters (hyphens, dots, plus signs). The closing fence allows optional trailing whitespace `[ \t]*` before end of line.

Edge cases to handle:
- Code block with no common indent (minIndent === 0) → still strip trailing blanks, but don't strip leading whitespace
- Code block with only empty/whitespace lines → leave as-is
- Code block with trailing blank lines → always strip them
- Multiple code blocks in one text → all transformed independently
- Code block with no language tag → works the same
- Language tags with special chars (e.g., `c++`, `objective-c`) → handled by `[^\n]*`
- `\r\n` line endings → normalize to `\n` at the top of the function
- Tab-based indentation → not handled (documented limitation), tabs pass through unchanged

In `tests/unindent.test.ts`, write tests covering:

1. **Strips 2-space common indent** — input has 2-space indent on all lines, output has none
2. **Preserves relative indentation** — inner indentation (4-space vs 2-space) is preserved after stripping 2
3. **Strips trailing blank lines** — code block ending with empty lines has them removed
4. **Leaves 0-indent blocks untouched** — code block with no leading whitespace is unchanged
5. **Handles multiple blocks** — two code blocks in one text, both transformed
6. **Handles no-language blocks** — ``` without a language tag works
7. **Handles empty/whitespace-only blocks** — not corrupted
8. **No-op on text with no code blocks** — plain text passes through unchanged
9. **Preserves text outside code blocks** — prose before/after code blocks is unchanged
10. **Mixed 0/N indent: no leading ws stripped, trailing blanks removed** — one line at 0 indent, others at 2, with trailing blank → leading ws untouched but trailing blank removed
11. **Language tag with special chars** — `c++` or `objective-c` tag passes through correctly
12. **Inline backticks don't trigger** — prose containing ` ``` ` is not falsely matched
13. **Normalizes CRLF line endings** — input with `\r\n` inside code block is unindented correctly, output uses `\n` only
14. **Tab-indented code block passes through unchanged** — `\t`-indented lines are not stripped (documented limitation)

Each test: `expect(unindentCodeBlocks(input)).toBe(expected)`.

**Steps:**
- [ ] Write `src/unindent.ts` with the `unindentCodeBlocks` function
- [ ] Write `tests/unindent.test.ts` with 14 test cases (one per bullet above)
- [ ] Run `bun test` from `/home/daniel/Coding/Javascript/pi-thinking`
  - Did all tests pass? If not, fix failures and re-run.
- [ ] Run `bun run typecheck` (i.e. `tsc --noEmit`)
  - Did it succeed? If not, fix and re-run.
- [ ] Commit with message: "feat: add unindentCodeBlocks transform for code blocks"

**Acceptance criteria:**
- [ ] All 14 tests pass with `bun test`
- [ ] TypeScript compiles cleanly with `bun run typecheck`
- [ ] Function is pure — no side effects, no imports beyond standard library

---

### Task 2: Integrate into `patchTarget` and update tests

**Context:**
Wire `unindentCodeBlocks` into the existing `patchTarget` function so it runs on both `content.text` (regular assistant messages) and `content.thinking` (thinking blocks) before the text is passed to `new Markdown(...)`.

**Files:**
- Modify: `src/patch.ts`
- Modify: `tests/patch.test.ts`

**What to implement:**

In `src/patch.ts`:

1. Add import at top: `import { unindentCodeBlocks } from "./unindent.js";`

2. In the **text branch** (inside the `for` loop over `message.content`), replace:
   ```typescript
   // BEFORE:
   this.contentContainer.addChild(
       new Markdown(content.text.trim(), 1, 0, this.markdownTheme),
   );
   ```
   With:
   ```typescript
   // AFTER:
   this.contentContainer.addChild(
       new Markdown(unindentCodeBlocks(content.text.trim()), 1, 0, this.markdownTheme),
   );
   ```

3. In the **thinking branch** (visible thinking), where the labeled text is built, replace:
   ```typescript
   // BEFORE:
   const labeled = `${labelAnsi}${bodyColorAnsi}${content.thinking.trim()}`;
   ```
   With:
   ```typescript
   // AFTER:
   const labeled = `${labelAnsi}${bodyColorAnsi}${unindentCodeBlocks(content.thinking.trim())}`;
   ```

4. The `hasVisibleContent` check at the top of `updateContent` should also use unindented text for the emptiness check. BUT — the current check uses `.trim()` which already handles pure-whitespace content. The unindent transform doesn't change whether content is "visible", so **no change needed** to the visibility check.

In `tests/patch.test.ts`:

1. Add import: `import { unindentCodeBlocks } from "../src/unindent.js";`

2. Add a **new test** (Test 7): "text branch unindents code blocks"
   - Input: `{ type: "text", text: "Here's code:\n```js\n  const x = 1;\n  const y = 2;\n```\nDone." }`
   - Assert: The Markdown child's text contains `const x = 1;` (without the 2-space indent), NOT `  const x = 1;`
   - Assert: The prose "Here's code:" and "Done." are preserved unchanged

3. Add a **new test** (Test 8): "thinking branch unindents code blocks"
   - Input: `{ type: "thinking", thinking: "```js\n  const x = 1;\n```" }`
   - Assert: The Markdown child's text contains `const x = 1;` (without the 2-space indent)
   - Assert: The text still contains the "Thinking..." label prefix and ANSI codes (no regression)

**Steps:**
- [ ] Add `import { unindentCodeBlocks } from "./unindent.js";` to `src/patch.ts`
- [ ] Apply `unindentCodeBlocks()` to `content.text.trim()` in the text branch
- [ ] Apply `unindentCodeBlocks()` to `content.thinking.trim()` in the thinking branch
- [ ] Add Test 7 to `tests/patch.test.ts`: text branch unindents code blocks
- [ ] Add Test 8 to `tests/patch.test.ts`: thinking branch unindents code blocks
- [ ] Run `bun test` from `/home/daniel/Coding/Javascript/pi-thinking`
  - Did all tests pass (existing + new)? If not, fix failures and re-run.
- [ ] Run `bun run typecheck`
  - Did it succeed? If not, fix and re-run.
- [ ] Commit with message: "feat: integrate unindentCodeBlocks into patchTarget"

**Acceptance criteria:**
- [ ] All existing tests still pass (no regressions)
- [ ] New tests verify unindent works in both text and thinking branches
- [ ] TypeScript compiles cleanly
- [ ] No changes to `src/theme.ts`, `src/hsl.ts`, `src/index.ts`

---

## Manual Verification (after both tasks)

- [ ] Install the extension in pi: verify it loads without errors
- [ ] Send a prompt that produces an indented code block (e.g., "give me a bash script")
- [ ] Verify the code block renders without extra indentation in the terminal
- [ ] Copy the code block from the terminal and verify the pasted code has clean indentation
