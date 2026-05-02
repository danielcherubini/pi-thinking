import type { ExtensionAPI, Theme } from "@mariozechner/pi-coding-agent";
import { patchThinkingRenderer } from "./patch.js";
import { transformThinkingContent } from "./transform.js";

export default function piThinkingExtension(pi: ExtensionAPI): void {
  pi.on("session_start", (_event, ctx) => {
    if (!ctx.hasUI) return;
    const ui = ctx.ui as any;
    const getTheme = (): Theme => ui.theme as Theme;
    patchThinkingRenderer(getTheme);
  });

  pi.on("message_end", async (event) => {
    // Mutate thinking content in-place (prepend label, unindent code).
    // For hidden-thinking blocks, the original patch renders them as plain
    // Text (not Markdown), so mutating the content has no visual effect.
    transformThinkingContent(event.message as any);
  });
}
