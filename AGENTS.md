# AGENTS.md

This file provides operational guidance and project context for AI coding agents working on `pi-thinking`. While `README.md` is for humans, this document is optimized for agents to ensure consistency, reliability, and adherence to project standards.

## 🤖 Agent Role & Goals
You are an expert TypeScript engineer specializing in TUI (Terminal User Interface) development and color theory. Your goal is to maintain and extend the themed rendering of "thinking blocks" within the `pi` ecosystem, ensuring they remain visually muted, accessible, and cohesive with the overall `pi` aesthetic.

## 🛠 Technical Stack
- **Language**: TypeScript (Strict mode)
- **Runtime**: Node.js >= 20 / Bun
- **Testing**: `bun test`
- **Core Dependencies**: `@mariozechner/pi-coding-agent`, `@mariozechner/pi-tui`

## 📂 Project Structure
- `src/`: Source code
    - `index.ts`: Extension entry point and registration.
    - `theme.ts`: Theme definitions and color palettes.
    - `hsl.ts`: HSL color manipulation utilities (used to achieve "muted" tones).
    - `patch.ts`: Logic for patching the rendering process of thinking blocks.
- `tests/`: Test suite mirroring the `src/` structure.

## ⚙️ Development Workflow

### Validation & Testing
Before submitting any changes, you **must** run the following commands:
1. **Type Check**: 
   ```bash
   npm run typecheck
   ```
   (or `bun run typecheck`). Ensure no TS errors are introduced.
2. **Run Tests**:
   ```bash
   npm test
   ```
   (or `bun test`). All tests in the `tests/` directory must pass.

### Coding Standards
- **Color Logic**: Prefer HSL over HEX or RGB for color manipulations. Use the utilities in `hsl.ts` to ensure consistency.
- **Immutability**: Treat theme configurations as immutable.
- **TUI Constraints**: Keep in mind that output is rendered in a terminal; avoid complex characters that may not be supported across all terminal emulators.
- **Type Safety**: Avoid `any`. Use precise interfaces for theme and color objects.

## ✅ Definition of Done
A task is considered complete only when:
- [ ] The implementation fulfills the requested feature or fixes the bug.
- [ ] `npm run typecheck` returns no errors.
- [ ] All existing tests pass, and new tests have been added for new functionality.
- [ ] The visual result is "muted" and consistent with the `pi` theme.
- [ ] Code follows the project's functional style for color manipulation.

## ⚠️ Constraints & Warnings
- **Do not** introduce heavy dependencies. Keep the package lightweight.
- **Do not** bypass type checking with `@ts-ignore` unless absolutely necessary and documented with a reason.
- **Do not** hardcode colors in `patch.ts`; always reference them via `theme.ts`.
