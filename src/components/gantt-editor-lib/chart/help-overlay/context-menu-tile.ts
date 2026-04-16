import type { CanvasRect, HelpOverlayTileDefinition } from "./tile";
import { drawHelpOverlayCursor } from "./cursor";
import { easeInOut } from "./easing";

const ANIMATION_CYCLE_MS = 3000;

export const canvasContextMenuHelpOverlayTile: HelpOverlayTileDefinition = {
  id: "canvas-context-menu",
  title: "Context menu",
  description: "Click on a free area to open the context menu",
  shortcutLabel: ["Right-click"],
  detail: "",
  minHeight: 124,
  drawPreview: ({ ctx, rect, nowMs, alpha }) => {
    const cycle = (nowMs % ANIMATION_CYCLE_MS) / ANIMATION_CYCLE_MS;
    const open = cycle >= 0.15 && cycle < 0.88;
    const u = open ? easeInOut(Math.min(1, (cycle - 0.15) / 0.2)) : 0;
    const previewPad = 8;
    const inner: CanvasRect = {
      x: rect.x + previewPad,
      y: rect.y + previewPad,
      w: rect.w - previewPad * 2,
      h: rect.h - previewPad * 2,
    };

    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.fillStyle = "#fbfcfd";
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeStyle = "#d8dee6";
    ctx.lineWidth = 1;
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);

    const mx = inner.x + inner.w * 0.35;
    const my = inner.y + inner.h * 0.48;
    if (open) {
      const mw = 50 * u;
      const mh = 24 * u;
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(mx - 4, my - 4, mw, mh, 4);
      ctx.fill();
      ctx.stroke();
      if (u > 0.65) {
        ctx.fillStyle = "#334155";
        ctx.font = "10px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("...", mx + 4, my + 10 * u);
      }
    }

    drawHelpOverlayCursor({
      ctx,
      x: mx - 10,
      y: my - 10,
      pressed: cycle > 0.08 && cycle < 0.18,
    });

    ctx.restore();
  },
};
