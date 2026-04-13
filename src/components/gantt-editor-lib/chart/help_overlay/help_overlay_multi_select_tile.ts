import type { CanvasRect, HelpOverlayTileDefinition } from "./help_overlay_tile";
import { drawHelpOverlayCursor } from "./help_overlay_cursor";
import { easeInOut } from "./help_overlay_easing";
import {
  helpOverlayIsApplePlatform,
  helpOverlayPrimaryModifierShortLabel,
} from "./help_overlay_platform";

/** Longer cycle so hover → first click → travel → second click reads clearly. */
const ANIMATION_CYCLE_MS = 5200;

/** Normalized time [0,1] within [start, end). */
function segmentT(cycle: number, start: number, end: number): number {
  if (cycle <= start) return 0;
  if (cycle >= end) return 1;
  return (cycle - start) / (end - start);
}

const multiSelectDescription = helpOverlayIsApplePlatform()
  ? "Click on a slot to select it. Hold the Command key to select multiple slots."
  : "Click on a slot to select it. Hold Ctrl to select multiple slots.";

const multiSelectShortcutLabel = `${helpOverlayPrimaryModifierShortLabel()} + Click`;

export const multiSelectHelpOverlayTile: HelpOverlayTileDefinition = {
  id: "multi-select",
  title: "Select slots",
  description: multiSelectDescription,
  shortcutLabel: [multiSelectShortcutLabel],
  detail: "",
  minHeight: 118,
  drawPreview: ({ ctx, rect, nowMs, alpha }) => {
    const cycle = (nowMs % ANIMATION_CYCLE_MS) / ANIMATION_CYCLE_MS;

    // Shorter press + hot dwell so the gesture reads snappier (same story, less screen time).
    const tFirstPressStart = 0.26;
    const tFirstPressEnd = 0.3;
    const tMoveStart = 0.315;
    const tMoveEnd = 0.64;
    const tSecondPressStart = 0.67;
    const tSecondPressEnd = 0.71;
    /** Same dwell after release as on slot A (`tMoveStart - tFirstPressEnd`) before “leaving” the gesture. */
    const tSecondHotEnd =
      tSecondPressEnd + (tMoveStart - tFirstPressEnd);

    const pressedFirst =
      cycle >= tFirstPressStart && cycle < tFirstPressEnd;
    const pressedSecond =
      cycle >= tSecondPressStart && cycle < tSecondPressEnd;

    const moveT = easeInOut(segmentT(cycle, tMoveStart, tMoveEnd));

    const previewPad = 8;
    const inner: CanvasRect = {
      x: rect.x + previewPad,
      y: rect.y + previewPad,
      w: rect.w - previewPad * 2,
      h: rect.h - previewPad * 2,
    };

    const slotA = { x: inner.x + 14, y: inner.y + 28, w: 46, h: 14 };
    const slotB = { x: inner.x + 72, y: inner.y + 28, w: 52, h: 14 };
    const cxA = slotA.x + slotA.w * 0.55;
    const cxB = slotB.x + slotB.w * 0.55;
    const cySlots = slotA.y + slotA.h / 2;

    // Selection applies when the click releases, in lockstep with the cursor un-pressing.
    const selectedA = cycle >= tFirstPressEnd;
    const selectedB = cycle >= tSecondPressEnd;

    // Hot fill: starts with mousedown on that slot (not when the cursor is still traveling). Same dwell-after-release as slot A.
    const hotA = cycle >= tFirstPressStart && cycle < tMoveStart;
    const hotB =
      cycle >= tSecondPressStart && cycle < tSecondHotEnd;

    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.fillStyle = "#fbfcfd";
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeStyle = "#d8dee6";
    ctx.lineWidth = 1;
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);

    const drawSlot = (s: typeof slotA, selected: boolean, hot: boolean) => {
      ctx.fillStyle = hot ? "#5f6f88" : "#cfd8e5";
      ctx.strokeStyle = selected ? "#2563eb" : "#aab7c8";
      ctx.lineWidth = hot ? 2 : 1;
      ctx.beginPath();
      ctx.rect(s.x, s.y, s.w, s.h);
      ctx.fill();
      ctx.stroke();
    };

    drawSlot(slotA, selectedA, hotA);
    drawSlot(slotB, selectedB, hotB);

    const cx = cxA + (cxB - cxA) * moveT;
    const cy = cySlots;

    drawHelpOverlayCursor({
      ctx,
      x: cx,
      y: cy,
      pressed: pressedFirst || pressedSecond,
    });

    if (cycle >= tMoveEnd && cycle < 0.96) {
      ctx.fillStyle = "rgba(37, 99, 235, 0.92)";
      ctx.font = "600 9px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(helpOverlayPrimaryModifierShortLabel(), cx, slotB.y - 4);
    }

    ctx.restore();
  },
};
