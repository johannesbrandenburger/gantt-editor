import type { CanvasRect, HelpOverlayTileDefinition } from "./tile";
import { drawHelpOverlayCursor } from "./cursor";
import { easeInOut } from "./easing";

const ANIMATION_CYCLE_MS = 3200;

export const resizeSlotEdgesHelpOverlayTile: HelpOverlayTileDefinition = {
  id: "resize-slot-edges",
  title: "Resize a slot",
  description: "Resize a slot by dragging its edges",
  shortcutLabel: ["Drag bar edge"],
  detail: "",
  minHeight: 118,
  nonHoverOffsetMs: ANIMATION_CYCLE_MS * 0.4,
  drawPreview: ({ ctx, rect, nowMs, alpha }) => {
    const cycle = (nowMs % ANIMATION_CYCLE_MS) / ANIMATION_CYCLE_MS;
    const edge = cycle < 0.5 ? "right" : "left";
    const u = edge === "right" ? easeInOut(cycle / 0.5) : easeInOut((cycle - 0.5) / 0.5);
    const previewPad = 8;
    const inner: CanvasRect = {
      x: rect.x + previewPad,
      y: rect.y + previewPad,
      w: rect.w - previewPad * 2,
      h: rect.h - previewPad * 2,
    };

    const midY = inner.y + inner.h / 2 - 7;
    const baseX = inner.x + 40;
    const baseW = 58;
    const dw = (edge === "right" ? 1 : -1) * 22 * u;
    const x = edge === "right" ? baseX : baseX + dw;
    const w = edge === "right" ? baseW + dw : baseW - dw;

    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.fillStyle = "#fbfcfd";
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeStyle = "#d8dee6";
    ctx.lineWidth = 1;
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);

    ctx.fillStyle = "#5f6f88";
    ctx.strokeStyle = "#495b74";
    ctx.beginPath();
    ctx.rect(x, midY, Math.max(8, w), 14);
    ctx.fill();
    ctx.stroke();

    const handleX = edge === "right" ? x + Math.max(8, w) : x;
    ctx.fillStyle = "rgba(37, 99, 235, 0.95)";
    ctx.fillRect(handleX - 2, midY - 1, 4, 16);

    const cx = handleX;
    const cy = midY + 7;
    drawHelpOverlayCursor({
      ctx,
      x: cx,
      y: cy,
      pressed: u > 0.02 && u < 0.98,
    });

    ctx.restore();
  },
};
