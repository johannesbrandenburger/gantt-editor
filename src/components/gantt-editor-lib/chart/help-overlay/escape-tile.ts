import type { CanvasRect, HelpOverlayTileDefinition } from "./tile";
import { easeInOut } from "./easing";

const ANIMATION_CYCLE_MS = 2600;

export const escapeKeyHelpOverlayTile: HelpOverlayTileDefinition = {
  id: "escape-key",
  title: "Clear selection",
  description:
    "Escape clears the current slot selection.",
  shortcutLabel: ["Escape"],
  detail: "",
  minHeight: 100,
  drawPreview: ({ ctx, rect, nowMs, alpha }) => {
    const cycle = (nowMs % ANIMATION_CYCLE_MS) / ANIMATION_CYCLE_MS;
    const glow = easeInOut(Math.abs(Math.sin(cycle * Math.PI)));
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

    const kx = inner.x + inner.w / 2 - 38;
    const ky = inner.y + inner.h / 2 - 14;
    ctx.fillStyle = `rgba(248, 250, 252, ${0.5 + glow * 0.5})`;
    ctx.strokeStyle = `rgba(100, 116, 139, ${0.4 + glow * 0.45})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(kx, ky, 76, 28, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#1e293b";
    ctx.font = "600 13px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Esc", kx + 38, ky + 14);

    ctx.restore();
  },
};
