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

export const moveSelectedSlotsToDifferentDayHelpOverlayTile: HelpOverlayTileDefinition = {
  id: "move-to-different-day",
  title: "Move selected slots to different day",
  description:
    "Press shift and click on a different day to move the selected slots to this day. You will see a preview while you hover before you confirm with the click.",
  shortcutLabel: ["Shift + Click"],
  detail: "",
  minHeight: 132,
  nonHoverOffsetMs: ANIMATION_CYCLE_MS * 0.63,
  drawPreview: ({ ctx, rect, nowMs, alpha }) => {
    const cycle = (nowMs % ANIMATION_CYCLE_MS) / ANIMATION_CYCLE_MS;

    // Mirrors the "move to destination" gesture, but the destination is a
    // different day in the *same* row, so the preview slides horizontally
    // across day columns instead of vertically across rows. A "Shift" badge
    // tracks the cursor while the modifier is held.
    //   [0.00, 0.18)  idle on the source day, both slots already selected
    //   [0.18, 0.52)  cursor travels from above the source day across into
    //                 the destination day. "Shift" label fades in alongside.
    //   [0.40, 0.56)  preview ghosts fade in while sliding horizontally from
    //                 the source slots to their destination day position.
    //   [0.56, 0.70)  hover dwell — previews sit at the destination day
    //   [0.70, 0.74)  click pressed
    //   [0.74, 0.88)  commit — previews solidify, source slots fade out
    //   [0.88, 1.00)  settle — slots now live on the destination day
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
    const shiftLabelT = easeInOut(segmentT(cycle, tCursorStart, tCursorStart + 0.08));
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

    // Zoomed-out gantt: one row spanning several day columns. Day labels sit
    // above the row; vertical day dividers and a top/bottom row border frame
    // the row so the move across days reads clearly.
    const dayCount = 5;
    const dayLabelBaselineY = inner.y + 10;
    const rowTopY = inner.y + 18;
    const rowBottomY = inner.y + inner.h - 6;
    const rowCenterY = (rowTopY + rowBottomY) / 2;
    const dayColW = inner.w / dayCount;
    const dayCenterX = (i: number) => inner.x + dayColW * (i + 0.5);

    const sourceDayIndex = 1;
    const destDayIndex = 3;

    ctx.save();
    ctx.font = "600 9px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri"];
    for (let i = 0; i < dayCount; i += 1) {
      const isHighlighted = i === sourceDayIndex || i === destDayIndex;
      ctx.fillStyle = isHighlighted
        ? "rgba(55, 71, 99, 0.95)"
        : "rgba(133, 146, 166, 0.85)";
      ctx.fillText(dayLabels[i] ?? "", dayCenterX(i), dayLabelBaselineY);
    }
    ctx.restore();

    ctx.strokeStyle = "rgba(133, 146, 166, 0.32)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= dayCount; i += 1) {
      const x = inner.x + dayColW * i;
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, rowTopY);
      ctx.lineTo(Math.round(x) + 0.5, rowBottomY);
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(133, 146, 166, 0.4)";
    ctx.beginPath();
    ctx.moveTo(inner.x, rowTopY + 0.5);
    ctx.lineTo(inner.x + inner.w, rowTopY + 0.5);
    ctx.moveTo(inner.x, rowBottomY + 0.5);
    ctx.lineTo(inner.x + inner.w, rowBottomY + 0.5);
    ctx.stroke();

    // Slot geometry: two small selected slots packed inside the source day,
    // centered vertically in the row. Sized so they (and their previews)
    // stay comfortably inside a single day column.
    const slotH = 12;
    const slotAW = 20;
    const slotBW = 14;
    const slotGap = 4;
    const slotsTotalW = slotAW + slotGap + slotBW;
    const sourceLeftX = dayCenterX(sourceDayIndex) - slotsTotalW / 2;
    const destLeftX = dayCenterX(destDayIndex) - slotsTotalW / 2;
    const slotY = rowCenterY - slotH / 2;
    const slotA = { x: sourceLeftX, y: slotY, w: slotAW, h: slotH };
    const slotB = { x: sourceLeftX + slotAW + slotGap, y: slotY, w: slotBW, h: slotH };
    const dx = destLeftX - sourceLeftX;

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

    // Source day: solidly selected before commit, fades out as the move
    // commits to the destination day.
    const sourceOpacity = 1 - commitT;
    drawSelectedSlot(slotA, sourceOpacity);
    drawSelectedSlot(slotB, sourceOpacity);

    // Preview ghosts: start coincident with the source slots and slide
    // horizontally to the destination day, fading in along the way. After the
    // click they crossfade into solid selected slots at the destination.
    const previewA = {
      x: slotA.x + dx * previewT,
      y: slotY,
      w: slotA.w,
      h: slotH,
    };
    const previewB = {
      x: slotB.x + dx * previewT,
      y: slotY,
      w: slotB.w,
      h: slotH,
    };

    if (!committed) {
      drawPreviewSlot(previewA, previewT);
      drawPreviewSlot(previewB, previewT);
    } else {
      const destA = { ...previewA, x: slotA.x + dx };
      const destB = { ...previewB, x: slotB.x + dx };
      drawPreviewSlot(destA, 1 - commitT);
      drawPreviewSlot(destB, 1 - commitT);
      drawSelectedSlot(destA, commitT);
      drawSelectedSlot(destB, commitT);
    }

    // Cursor: enters from just above the source slots and travels almost
    // purely horizontally across to the destination day, leading the preview
    // by a beat. Sits during the hover dwell, presses for the click, and
    // lingers after commit.
    const cursorStartX = slotB.x + slotB.w * 0.6;
    const cursorStartY = slotY - 2;
    const cursorEndX = destLeftX + slotsTotalW * 0.45;
    const cursorEndY = slotY + slotH * 0.55;
    const cursorX = cursorStartX + (cursorEndX - cursorStartX) * cursorT;
    const cursorY = cursorStartY + (cursorEndY - cursorStartY) * cursorT;

    drawHelpOverlayCursor({
      ctx,
      x: cursorX,
      y: cursorY,
      pressed,
    });

    // "Shift" badge tracks the cursor while the modifier is held — fades in
    // as the cursor begins moving and disappears once the click commits.
    if (shiftLabelT > 0.01 && !committed) {
      ctx.save();
      ctx.globalAlpha *= shiftLabelT;
      ctx.fillStyle = "rgba(37, 99, 235, 0.95)";
      ctx.font = "600 9px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText("Shift", cursorX + 10, cursorY - 8);
      ctx.restore();
    }

    ctx.restore();
  },
};
