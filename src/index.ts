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
