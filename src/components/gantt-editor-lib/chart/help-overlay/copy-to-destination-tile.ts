import type { CanvasRect, HelpOverlayTileDefinition } from "./tile";
import { drawHelpOverlayCursor } from "./cursor";
import { easeInOut } from "./easing";

/** Long enough that hover → preview → click → commit reads as a single story. */
const ANIMATION_CYCLE_MS = 5200;

/** Normalized time [0,1] within [start, end). */
function segmentT(cycle: number, start: number, end: number): number {
  if (cycle <= start) return 0;
  if (cycle >= end) return 1;
  return (cycle - start) / (end - start);
}

export const copySelectedSlotsToDestinationHelpOverlayTile: HelpOverlayTileDefinition = {
  id: "copy-to-destination",
  title: "Copy selected slots to destination",
  description:
    "Click on a row with the Alt key pressed to copy the selected slots to this destination instead of moving them.",
  shortcutLabel: ["Alt + Click"],
  detail: "",
  minHeight: 132,
  drawPreview: ({ ctx, rect, nowMs, alpha }) => {
    const cycle = (nowMs % ANIMATION_CYCLE_MS) / ANIMATION_CYCLE_MS;

    // Mirrors the "move to destination" gesture, but the source slots stay put
    // because copying preserves them. The destination preview/commit is green
    // and an "Alt" label floats near the cursor while the modifier is held.
    //   [0.00, 0.18)  idle on the source row, both slots already selected
    //   [0.18, 0.52)  cursor travels from above the source row down into the
    //                 destination row. "Alt" label fades in alongside.
    //   [0.40, 0.56)  green preview ghosts fade in while traveling from the
    //                 source slots to their destination position.
    //   [0.56, 0.70)  hover dwell — previews sit at the destination
    //   [0.70, 0.74)  click pressed
    //   [0.74, 0.88)  commit — green previews solidify into selected copies
    //   [0.88, 1.00)  settle — original blue selection still on the source row,
    //                 new green copies live on the destination row
    const tCursorStart = 0.18;
    const tCursorEnd = 0.52;
    const tPreviewStart = 0.4;
    const tPreviewEnd = 0.56;
    const tHoverEnd = 0.7;
    const tPressEnd = 0.74;
    const tCommitEnd = 0.88;

    const cursorT = easeInOut(segmentT(cycle, tCursorStart, tCursorEnd));
    const previewT = easeInOut(segmentT(cycle, tPreviewStart, tPreviewEnd));
    const commitT = easeInOut(segmentT(cycle, tPressEnd, tCommitEnd));
    const altLabelT = easeInOut(segmentT(cycle, tCursorStart, tCursorStart + 0.08));
    const pressed = cycle >= tHoverEnd && cycle < tPressEnd;
    const committed = cycle >= tPressEnd;

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

    // Grid background — plain horizontal row separators + a thin vertical "label
    // gutter" line, matching the move-to-destination tile.
    const rowGap = 32;
    const gridTopY = inner.y + 14;
    const sourceRowCenterY = gridTopY + rowGap * 0.5;
    const destRowCenterY = gridTopY + rowGap * 1.5;

    ctx.strokeStyle = "rgba(133, 146, 166, 0.22)";
    ctx.lineWidth = 1;
    for (let row = 0; row < 3; row += 1) {
      const y = gridTopY + row * rowGap;
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

    // Slot geometry: two selected slots side by side, vertically centered in
    // the source row.
    const slotH = 14;
    const slotAW = 46;
    const slotBW = 36;
    const slotGap = 8;
    const slotsTotalW = slotAW + slotGap + slotBW;
    const slotsLeftX = inner.x + Math.max(22, (inner.w - slotsTotalW) / 2 - 6);
    const sourceSlotY = sourceRowCenterY - slotH / 2;
    const destSlotY = destRowCenterY - slotH / 2;
    const slotA = { x: slotsLeftX, y: sourceSlotY, w: slotAW, h: slotH };
    const slotB = { x: slotsLeftX + slotAW + slotGap, y: sourceSlotY, w: slotBW, h: slotH };

    const drawSlot = (
      s: { x: number; y: number; w: number; h: number },
      opacity: number,
      color: { fill: string; stroke: string; lineWidth?: number },
    ) => {
      if (opacity <= 0.01) return;
      ctx.save();
      ctx.globalAlpha *= opacity;
      ctx.fillStyle = color.fill;
      ctx.strokeStyle = color.stroke;
      ctx.lineWidth = color.lineWidth ?? 1.25;
      ctx.beginPath();
      ctx.rect(s.x, s.y, s.w, s.h);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    };

    const drawPreviewSlot = (
      s: { x: number; y: number; w: number; h: number },
      opacity: number,
      color: { fill: string; stroke: string },
    ) => {
      if (opacity <= 0.01) return;
      ctx.save();
      ctx.globalAlpha *= opacity;
      ctx.fillStyle = color.fill;
      ctx.strokeStyle = color.stroke;
      ctx.lineWidth = 1.25;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.rect(s.x, s.y, s.w, s.h);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    };

    const selectedColor = { fill: "#cfd8e5", stroke: "#2563eb", lineWidth: 1.25 };
    const unselectedColor = { fill: "#cfd8e5", stroke: "#aab7c8", lineWidth: 1 };
    const copyPreviewColor = {
      fill: "rgba(22, 163, 74, 0.14)",
      stroke: "rgba(22, 163, 74, 0.7)",
    };

    // Source row: stays selected (blue) until the click commits the copy, at
    // which point it drops back to an unselected style alongside the new
    // destination slots — the click consumed the selection.
    const sourceColor = committed ? unselectedColor : selectedColor;
    drawSlot(slotA, 1, sourceColor);
    drawSlot(slotB, 1, sourceColor);

    // Preview ghosts: start coincident with the source slots and travel down to
    // the destination row in green, fading in along the way. After the click
    // they crossfade into solid (unselected) slots at the destination position.
    const previewA = {
      x: slotA.x,
      y: sourceSlotY + (destSlotY - sourceSlotY) * previewT,
      w: slotA.w,
      h: slotH,
    };
    const previewB = {
      x: slotB.x,
      y: sourceSlotY + (destSlotY - sourceSlotY) * previewT,
      w: slotB.w,
      h: slotH,
    };

    if (!committed) {
      drawPreviewSlot(previewA, previewT, copyPreviewColor);
      drawPreviewSlot(previewB, previewT, copyPreviewColor);
    } else {
      const destA = { ...previewA, y: destSlotY };
      const destB = { ...previewB, y: destSlotY };
      drawPreviewSlot(destA, 1 - commitT, copyPreviewColor);
      drawPreviewSlot(destB, 1 - commitT, copyPreviewColor);
      drawSlot(destA, commitT, unselectedColor);
      drawSlot(destB, commitT, unselectedColor);
    }

    // Cursor: travels from above the source row into the destination row,
    // leading the preview animation by a beat. Sits during the hover dwell,
    // presses for the click, and lingers after commit.
    const cursorStartX = slotB.x + slotB.w * 0.6;
    const cursorStartY = sourceSlotY - 2;
    const cursorEndX = slotB.x + slotB.w * 0.35;
    const cursorEndY = destSlotY + slotH * 0.55;
    const cursorX = cursorStartX + (cursorEndX - cursorStartX) * cursorT;
    const cursorY = cursorStartY + (cursorEndY - cursorStartY) * cursorT;

    drawHelpOverlayCursor({
      ctx,
      x: cursorX,
      y: cursorY,
      pressed,
    });

    // "Alt" badge tracks the cursor while the modifier is held — fades in as
    // the cursor begins moving and disappears once the click commits.
    if (altLabelT > 0.01 && !committed) {
      ctx.save();
      ctx.globalAlpha *= altLabelT;
      ctx.fillStyle = "rgba(22, 163, 74, 0.95)";
      ctx.font = "600 9px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText("Alt", cursorX + 6, cursorY - 8);
      ctx.restore();
    }

    ctx.restore();
  },
};
