import type { CanvasRect, HelpOverlayTileDefinition } from "./help_overlay_tile";
import { drawHelpOverlayCursor } from "./help_overlay_cursor";

const ANIMATION_CYCLE_MS = 3200;

/** Per-row relative widths; varied counts and lengths per row. */
const ROW_UNITS: number[][] = [
  [1.2, 1.6, 0.95],
  [2.4, 1.1],
  [0.85, 1.15, 1.0, 0.75],
  [1.7, 1.3],
  [1.0, 1.25, 0.9, 1.05],
];

const GAP_X = 3;
const GAP_Y = 5;

function easeInOut(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function zoomAmountFromCycle(cycle: number): number {
  if (cycle < 0.42) {
    return easeInOut(cycle / 0.42);
  }
  if (cycle < 0.5) {
    return 1;
  }
  if (cycle < 0.92) {
    return easeInOut(1 - (cycle - 0.5) / 0.42);
  }
  return 0;
}

export const unifiedZoomHelpOverlayTile: HelpOverlayTileDefinition = {
  id: "unified-zoom",
  title: "Zoom",
  description: "Hold Shift and scroll with the mouse wheel.",
  shortcutLabel: "Shift + wheel",
  detail: "",
  minHeight: 108,
  drawPreview: ({ ctx, rect, nowMs, alpha }) => {
    const cycle = (nowMs % ANIMATION_CYCLE_MS) / ANIMATION_CYCLE_MS;
    const zoomIn = zoomAmountFromCycle(cycle);
    const showWheelHint = cycle < 0.94;

    const previewPad = 8;
    const inner: CanvasRect = {
      x: rect.x + previewPad,
      y: rect.y + previewPad,
      w: rect.w - previewPad * 2,
      h: rect.h - previewPad * 2,
    };

    const slotW = 16 + zoomIn * 38;
    const slotH = 6 + zoomIn * 13;

    const marginX = 5;
    const maxRowW = inner.w - marginX * 2;

    const rowCount = ROW_UNITS.length;
    const totalH = rowCount * slotH + (rowCount - 1) * GAP_Y;
    const blockTop = inner.y + (inner.h - totalH) / 2;

    const slots: { x: number; y: number; w: number; h: number }[] = [];
    let y = blockTop;
    for (const units of ROW_UNITS) {
      const n = units.length;
      const rawWs = units.map((u) => u * slotW);
      const gapsW = (n - 1) * GAP_X;
      const sumRaw = rawWs.reduce((a, b) => a + b, 0);
      const rowW = sumRaw + gapsW;
      const scale = rowW > maxRowW ? (maxRowW - gapsW) / sumRaw : 1;
      const usedW = sumRaw * scale + gapsW;
      let x = inner.x + marginX + (maxRowW - usedW) / 2;
      for (let i = 0; i < n; i += 1) {
        const w = Math.max(2, rawWs[i]! * scale);
        slots.push({ x, y, w, h: slotH });
        x += w + GAP_X;
      }
      y += slotH + GAP_Y;
    }

    /** Tip at exact center of preview tile (no fractional offset). */
    const pointerX = rect.x + rect.w / 2;
    const pointerY = rect.y + rect.h / 2;

    ctx.save();
    ctx.globalAlpha *= alpha;

    ctx.fillStyle = "#fbfcfd";
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeStyle = "#d8dee6";
    ctx.lineWidth = 1;
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);

    for (const s of slots) {
      ctx.fillStyle = "#cfd8e5";
      ctx.strokeStyle = "#aab7c8";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(s.x, s.y, s.w, s.h);
      ctx.fill();
      ctx.stroke();
    }

    if (showWheelHint) {
      drawHelpOverlayCursor({
        ctx,
        x: pointerX,
        y: pointerY,
        pressed: false,
      });
    }

    ctx.restore();
  },
};
