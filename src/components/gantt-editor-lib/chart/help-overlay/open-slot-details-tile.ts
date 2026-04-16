import type { CanvasRect, HelpOverlayTileDefinition } from "./tile";
import { drawHelpOverlayCursor } from "./cursor";
import { easeInOut } from "./easing";

const ANIMATION_CYCLE_MS = 3400;

function panelOpenProgress(cycle: number): number {
  if (cycle < 0.26) return 0;
  if (cycle < 0.54) return easeInOut((cycle - 0.26) / 0.28);
  if (cycle < 0.86) return 1;
  return 1 - easeInOut((cycle - 0.86) / 0.14);
}

export const openSlotDetailsHelpOverlayTile: HelpOverlayTileDefinition = {
  id: "open-slot-details",
  title: "Open slot details",
  description: "Right-click on a slot to open the details.",
  shortcutLabel: ["Right-click"],
  detail: "",
  minHeight: 118,
  drawPreview: ({ ctx, rect, nowMs, alpha }) => {
    const cycle = (nowMs % ANIMATION_CYCLE_MS) / ANIMATION_CYCLE_MS;
    const pressed = cycle >= 0.2 && cycle < 0.29;
    const open = panelOpenProgress(cycle);

    const previewPad = 8;
    const inner: CanvasRect = {
      x: rect.x + previewPad,
      y: rect.y + previewPad,
      w: rect.w - previewPad * 2,
      h: rect.h - previewPad * 2,
    };

    const slot = {
      x: inner.x + 20,
      y: inner.y + inner.h * 0.48 - 7,
      w: 56,
      h: 14,
    };
    const cursorX = slot.x + slot.w * 0.72;
    const cursorY = slot.y + slot.h * 0.55;

    ctx.save();
    ctx.globalAlpha *= alpha;

    ctx.fillStyle = "#fbfcfd";
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeStyle = "#d8dee6";
    ctx.lineWidth = 1;
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);

    ctx.strokeStyle = "rgba(133, 146, 166, 0.2)";
    ctx.lineWidth = 1;
    for (let row = 0; row < 3; row += 1) {
      const y = inner.y + 16 + row * 24;
      ctx.beginPath();
      ctx.moveTo(inner.x + 4, y + 0.5);
      ctx.lineTo(inner.x + inner.w - 4, y + 0.5);
      ctx.stroke();
    }

    ctx.fillStyle = "#cfd8e5";
    ctx.strokeStyle = "#aab7c8";
    ctx.lineWidth = pressed ? 1.5 : 1;
    ctx.beginPath();
    ctx.rect(slot.x, slot.y, slot.w, slot.h);
    ctx.fill();
    ctx.stroke();

    const detailsW = 70 * open;
    const detailsH = 44 * open;
    const detailsX = slot.x + slot.w + 10;
    const detailsY = slot.y - 16;
    if (open > 0.01) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.98)";
      ctx.strokeStyle = "rgba(148, 163, 184, 0.92)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(detailsX, detailsY, detailsW, detailsH, 5);
      ctx.fill();
      ctx.stroke();
    }

    drawHelpOverlayCursor({
      ctx,
      x: cursorX,
      y: cursorY,
      pressed,
    });

    ctx.restore();
  },
};