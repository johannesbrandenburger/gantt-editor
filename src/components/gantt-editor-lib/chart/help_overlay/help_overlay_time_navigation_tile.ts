import type { CanvasRect, HelpOverlayTileDefinition } from "./help_overlay_tile";
import { drawHelpOverlayCursor } from "./help_overlay_cursor";
import { easeInOut } from "./help_overlay_easing";

const ANIMATION_CYCLE_MS = 3600;

function segmentT(cycle: number, start: number, end: number): number {
  if (cycle <= start) return 0;
  if (cycle >= end) return 1;
  return (cycle - start) / (end - start);
}

/** Same mini grid as {@link brushSelectHelpOverlayTile}: row guides + time-axis spine. */
function drawMiniCoordinateSystem(ctx: CanvasRenderingContext2D, inner: CanvasRect): void {
  ctx.strokeStyle = "rgba(133, 146, 166, 0.22)";
  ctx.lineWidth = 1;
  for (let row = 0; row < 3; row += 1) {
    const y = inner.y + 12 + row * 28;
    ctx.beginPath();
    ctx.moveTo(inner.x + 2, y + 0.5);
    ctx.lineTo(inner.x + inner.w - 2, y + 0.5);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(133, 146, 166, 0.15)";
  ctx.beginPath();
  ctx.moveTo(inner.x + 16.5, inner.y + 6);
  ctx.lineTo(inner.x + 16.5, inner.y + inner.h - 6);
  ctx.stroke();
}

/** Short vertical ticks along the top edge (time scale); shifts with pan. */
function drawTimeAxisTicksTop(
  ctx: CanvasRenderingContext2D,
  inner: CanvasRect,
  shiftX: number,
): void {
  const left = inner.x + 2;
  const right = inner.x + inner.w - 2;
  const top = inner.y + 0.5;
  const spacing = 17;
  ctx.strokeStyle = "rgba(133, 146, 166, 0.35)";
  ctx.lineWidth = 1;
  for (let i = -3; i < 18; i += 1) {
    const x = inner.x + 10 + i * spacing + shiftX;
    if (x < left || x > right) continue;
    const major = i % 3 === 0;
    const h = major ? 8 : 5;
    ctx.beginPath();
    ctx.moveTo(Math.round(x) + 0.5, top);
    ctx.lineTo(Math.round(x) + 0.5, top + h);
    ctx.stroke();
  }
}

export const timeNavigationHelpOverlayTile: HelpOverlayTileDefinition = {
  id: "time-navigation",
  title: "Move through the timeline",
  description:
    "Use Shift + Cursor Drag or Right Click Cursor Drag to move back and forth in time.",
  shortcutLabel: ["Shift + drag", "Right-drag"],
  detail: "",
  minHeight: 118,
  drawPreview: ({ ctx, rect, nowMs, alpha }) => {
    const cycle = (nowMs % ANIMATION_CYCLE_MS) / ANIMATION_CYCLE_MS;
    const previewPad = 8;
    const inner: CanvasRect = {
      x: rect.x + previewPad,
      y: rect.y + previewPad,
      w: rect.w - previewPad * 2,
      h: rect.h - previewPad * 2,
    };

    const dragRight = easeInOut(segmentT(cycle, 0.14, 0.44));
    const dragLeft = easeInOut(segmentT(cycle, 0.56, 0.86));
    const cursorTravel = dragRight - dragLeft;
    /** Same px scale as cursor motion so slots never outrun the pointer. */
    const panPx = 28;
    const contentShiftX = cursorTravel * panPx;
    const cursorX = inner.x + inner.w * 0.52 + cursorTravel * panPx;
    const cursorY = inner.y + inner.h * 0.52;
    const pressed =
      (cycle >= 0.14 && cycle < 0.44) ||
      (cycle >= 0.56 && cycle < 0.86);

    const slots = [
      { x: inner.x + 18, y: inner.y + 22, w: 38, h: 12 },
      { x: inner.x + 64, y: inner.y + 22, w: 44, h: 12 },
      { x: inner.x + 44, y: inner.y + 50, w: 56, h: 12 },
      { x: inner.x + 112, y: inner.y + 50, w: 30, h: 12 },
    ];

    ctx.save();
    ctx.globalAlpha *= alpha;

    ctx.fillStyle = "#fbfcfd";
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeStyle = "#d8dee6";
    ctx.lineWidth = 1;
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);

    drawMiniCoordinateSystem(ctx, inner);

    ctx.save();
    ctx.beginPath();
    ctx.rect(inner.x, inner.y, inner.w, inner.h);
    ctx.clip();

    drawTimeAxisTicksTop(ctx, inner, contentShiftX);

    for (const s of slots) {
      ctx.fillStyle = "#cfd8e5";
      ctx.strokeStyle = "#aab7c8";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(s.x + contentShiftX, s.y, s.w, s.h);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();

    drawHelpOverlayCursor({
      ctx,
      x: cursorX,
      y: cursorY,
      pressed,
    });

    ctx.restore();
  },
};
