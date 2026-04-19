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
    const rightEnd = 0.45;
    const leftStart = 0.55;

    let rightProgress: number;
    let leftProgress: number;
    let phase: "right" | "transition" | "left";
    let transitionProgress = 0;
    if (cycle < rightEnd) {
      rightProgress = easeInOut(cycle / rightEnd);
      leftProgress = 0;
      phase = "right";
    } else if (cycle < leftStart) {
      rightProgress = 1;
      leftProgress = 0;
      phase = "transition";
      transitionProgress = easeInOut((cycle - rightEnd) / (leftStart - rightEnd));
    } else {
      rightProgress = 1;
      leftProgress = easeInOut((cycle - leftStart) / (1 - leftStart));
      phase = "left";
    }

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
    const extend = 22;
    const rightDelta = extend * rightProgress;
    const leftDelta = extend * leftProgress;
    const x = baseX - leftDelta;
    const w = baseW + rightDelta + leftDelta;
    const renderedW = Math.max(8, w);
    const rightHandleX = x + renderedW;
    const leftHandleX = x;

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
    ctx.rect(x, midY, renderedW, 14);
    ctx.fill();
    ctx.stroke();

    const handleX = phase === "left" ? leftHandleX : rightHandleX;
    ctx.fillStyle = "rgba(37, 99, 235, 0.95)";
    ctx.fillRect(handleX - 2, midY - 1, 4, 16);

    let cursorX: number;
    let pressed: boolean;
    if (phase === "right") {
      cursorX = rightHandleX;
      pressed = rightProgress > 0.02 && rightProgress < 0.98;
    } else if (phase === "transition") {
      cursorX = rightHandleX + (leftHandleX - rightHandleX) * transitionProgress;
      pressed = false;
    } else {
      cursorX = leftHandleX;
      pressed = leftProgress > 0.02 && leftProgress < 0.98;
    }

    const cy = midY + 7;
    drawHelpOverlayCursor({
      ctx,
      x: cursorX,
      y: cy,
      pressed,
    });

    ctx.restore();
  },
};
