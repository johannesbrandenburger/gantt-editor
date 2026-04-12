import type { CanvasRect, HelpOverlayTileDefinition } from "./help_overlay_tile";
import { drawHelpOverlayCursor } from "./help_overlay_cursor";
import { easeInOut } from "./help_overlay_easing";

const ANIMATION_CYCLE_MS = 3000;

export const multiSelectHelpOverlayTile: HelpOverlayTileDefinition = {
  id: "multi-select",
  title: "Add or remove from selection",
  description:
    "With the pointer over a slot bar, Ctrl+click (Cmd+click on macOS) toggles that slot in the selection without clearing the rest.",
  shortcutLabel: "Ctrl/Cmd + click",
  detail: "When nothing is selected, a normal click still selects a single slot.",
  minHeight: 118,
  drawPreview: ({ ctx, rect, nowMs, alpha }) => {
    const cycle = (nowMs % ANIMATION_CYCLE_MS) / ANIMATION_CYCLE_MS;
    const pulse = cycle < 0.45 ? easeInOut(cycle / 0.45) : cycle < 0.55 ? 1 : easeInOut((1 - cycle) / 0.45);
    const secondClick = cycle >= 0.52;
    const previewPad = 8;
    const inner: CanvasRect = {
      x: rect.x + previewPad,
      y: rect.y + previewPad,
      w: rect.w - previewPad * 2,
      h: rect.h - previewPad * 2,
    };

    const slotA = { x: inner.x + 14, y: inner.y + 28, w: 46, h: 14 };
    const slotB = { x: inner.x + 72, y: inner.y + 28, w: 52, h: 14 };
    const selectedA = secondClick || pulse > 0.35;
    const selectedB = secondClick;

    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.fillStyle = "#fbfcfd";
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeStyle = "#d8dee6";
    ctx.lineWidth = 1;
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);

    const drawSlot = (s: typeof slotA, selected: boolean, hot: boolean) => {
      ctx.fillStyle = selected ? "#5f6f88" : "#cfd8e5";
      ctx.strokeStyle = hot ? "#2563eb" : selected ? "#495b74" : "#aab7c8";
      ctx.lineWidth = hot ? 2 : 1;
      ctx.beginPath();
      ctx.rect(s.x, s.y, s.w, s.h);
      ctx.fill();
      ctx.stroke();
    };

    drawSlot(slotA, selectedA, pulse > 0.2 && pulse < 0.95 && !secondClick);
    drawSlot(slotB, selectedB, secondClick);

    const cx = secondClick ? slotB.x + slotB.w * 0.55 : slotA.x + slotA.w * 0.55;
    const cy = slotA.y + slotA.h / 2;
    drawHelpOverlayCursor({
      ctx,
      x: cx,
      y: cy,
      pressed: pulse > 0.15 && pulse < 0.42,
    });

    if (pulse > 0.08 && pulse < 0.5 && !secondClick) {
      ctx.fillStyle = "rgba(37, 99, 235, 0.92)";
      ctx.font = "600 9px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText("Ctrl", cx, slotA.y - 4);
    }

    ctx.restore();
  },
};
