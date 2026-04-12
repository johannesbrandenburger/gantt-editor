import type { CanvasRect, HelpOverlayTileDefinition } from "./help_overlay_tile";
import { drawHelpOverlayCursor } from "./help_overlay_cursor";

type MiniSlot = {
  x: number;
  y: number;
  w: number;
  h: number;
};

const ANIMATION_CYCLE_MS = 2800;

function rectContainsRect(outer: CanvasRect, inner: MiniSlot): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

function easeInOut(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export const brushSelectHelpOverlayTile: HelpOverlayTileDefinition = {
  id: "brush-select",
  title: "Select multiple slots",
  description:
    "Drag on empty destination background or along the time axis to select every slot whose bar intersects the brushed time span.",
  shortcutLabel: "Cursor drag",
  detail: "",
  minHeight: 108,
  drawPreview: ({ ctx, rect, nowMs, alpha }) => {
    const cycle = (nowMs % ANIMATION_CYCLE_MS) / ANIMATION_CYCLE_MS;
    const dragProgress = cycle < 0.14 ? 0 : cycle < 0.72 ? easeInOut((cycle - 0.14) / 0.58) : 1;
    const showBrush = cycle >= 0.12 && cycle <= 0.82;
    const previewPad = 8;
    const inner: CanvasRect = {
      x: rect.x + previewPad,
      y: rect.y + previewPad,
      w: rect.w - previewPad * 2,
      h: rect.h - previewPad * 2,
    };

    const slots: MiniSlot[] = [
      { x: inner.x + 18, y: inner.y + 22, w: 38, h: 12 },
      { x: inner.x + 64, y: inner.y + 22, w: 44, h: 12 },
      { x: inner.x + 44, y: inner.y + 50, w: 56, h: 12 },
      { x: inner.x + 112, y: inner.y + 50, w: 30, h: 12 },
    ];
    const dragStartX = inner.x + 12;
    const dragStartY = inner.y + 14;
    const dragEndX = dragStartX + inner.w * 0.74;
    const dragEndY = dragStartY + inner.h * 0.6;
    const brushRight = dragStartX + dragProgress * (dragEndX - dragStartX);
    const brushBottom = dragStartY + dragProgress * (dragEndY - dragStartY);
    const finalBrushRect: CanvasRect = {
      x: dragStartX,
      y: dragStartY,
      w: Math.max(1, dragEndX - dragStartX),
      h: Math.max(1, dragEndY - dragStartY),
    };

    const brushRect: CanvasRect = {
      x: dragStartX,
      y: dragStartY,
      w: Math.max(1, brushRight - dragStartX),
      h: Math.max(1, brushBottom - dragStartY),
    };
    const selectionRect = dragProgress >= 1 ? finalBrushRect : brushRect;
    const showSelectedSlots = cycle >= 0.12;

    ctx.save();
    ctx.globalAlpha *= alpha;

    ctx.fillStyle = "#fbfcfd";
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeStyle = "#d8dee6";
    ctx.lineWidth = 1;
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);

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

    for (const slot of slots) {
      const selected = showSelectedSlots && rectContainsRect(selectionRect, slot);
      ctx.fillStyle = "#cfd8e5";
      ctx.strokeStyle = selected ? "#2563eb" : "#aab7c8";
      ctx.lineWidth = selected ? 1.5 : 1;
      ctx.beginPath();
      ctx.rect(slot.x, slot.y, slot.w, slot.h);
      ctx.fill();
      ctx.stroke();
    }

    if (showBrush) {
      ctx.fillStyle = "rgba(109, 90, 196, 0.12)";
      ctx.strokeStyle = "rgba(109, 90, 196, 0.58)";
      ctx.lineWidth = 1.25;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.roundRect(brushRect.x, brushRect.y, brushRect.w, brushRect.h, 6);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (showSelectedSlots) {
      const cursorX = dragProgress >= 1 ? dragEndX : dragStartX + dragProgress * (dragEndX - dragStartX);
      const cursorY = dragProgress >= 1 ? dragEndY : dragStartY + dragProgress * (dragEndY - dragStartY);
      drawHelpOverlayCursor({
        ctx,
        x: cursorX,
        y: cursorY,
        pressed: showBrush && dragProgress > 0,
      });
    }

    ctx.restore();
  },
};
