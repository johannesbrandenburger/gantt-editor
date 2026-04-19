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

export const moveSelectedSlotsToDestinationHelpOverlayTile: HelpOverlayTileDefinition = {
  id: "move-to-destination",
  title: "Move selected slots to destination",
  description:
    "Click on a row to move the selected slots to this destination. You will see a preview while you hover before you confirm with the click.",
  shortcutLabel: ["Click"],
  detail: "",
  minHeight: 132,
  drawPreview: ({ ctx, rect, nowMs, alpha }) => {
    const cycle = (nowMs % ANIMATION_CYCLE_MS) / ANIMATION_CYCLE_MS;

    // Phases of the gesture (cycle is normalized to [0, 1)):
    //   [0.00, 0.18)  idle on the source row, both slots already selected
    //   [0.18, 0.52)  cursor travels from above the source row down into the
    //                 destination row
    //   [0.40, 0.56)  preview ghosts fade in while traveling from the source
    //                 slots to their destination position. Triggered shortly
    //                 after the cursor enters the second row, and intentionally
    //                 quicker than the cursor motion so the previews "snap" in.
    //   [0.56, 0.70)  hover dwell — previews sit at the destination
    //   [0.70, 0.74)  click pressed
    //   [0.74, 0.88)  commit — previews solidify, source slots fade out
    //   [0.88, 1.00)  settle — slots now live on the destination row
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
    // gutter" line, matching the brush-select tile.
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

    const drawSelectedSlot = (
      s: { x: number; y: number; w: number; h: number },
      opacity: number,
    ) => {
      if (opacity <= 0.01) return;
      ctx.save();
      ctx.globalAlpha *= opacity;
      ctx.fillStyle = "#cfd8e5";
      ctx.strokeStyle = "#2563eb";
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.rect(s.x, s.y, s.w, s.h);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    };

    const drawPreviewSlot = (
      s: { x: number; y: number; w: number; h: number },
      opacity: number,
    ) => {
      if (opacity <= 0.01) return;
      ctx.save();
      ctx.globalAlpha *= opacity;
      ctx.fillStyle = "rgba(37, 99, 235, 0.12)";
      ctx.strokeStyle = "rgba(37, 99, 235, 0.7)";
      ctx.lineWidth = 1.25;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.rect(s.x, s.y, s.w, s.h);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    };

    // Source row: solidly selected before commit, fades out as the move commits.
    const sourceOpacity = 1 - commitT;
    drawSelectedSlot(slotA, sourceOpacity);
    drawSelectedSlot(slotB, sourceOpacity);

    // Preview ghosts: start coincident with the source slots and travel down to
    // the destination row, fading in along the way. After the click they
    // crossfade into solid selected slots at the destination position.
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
      drawPreviewSlot(previewA, previewT);
      drawPreviewSlot(previewB, previewT);
    } else {
      const destA = { ...previewA, y: destSlotY };
      const destB = { ...previewB, y: destSlotY };
      drawPreviewSlot(destA, 1 - commitT);
      drawPreviewSlot(destB, 1 - commitT);
      drawSelectedSlot(destA, commitT);
      drawSelectedSlot(destB, commitT);
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

    ctx.restore();
  },
};
