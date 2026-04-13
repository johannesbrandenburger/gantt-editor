type DrawHelpOverlayCursorArgs = {
  ctx: CanvasRenderingContext2D;
  x: number;
  y: number;
  pressed?: boolean;
};

function traceCursorPath(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();

  // Symmetrical, standard arrow cursor silhouette
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 16);
  ctx.lineTo(4.6, 11.7);
  ctx.lineTo(7.4, 18);
  ctx.lineTo(10.2, 16.7);
  ctx.lineTo(7.4, 10.6);
  ctx.lineTo(13, 10.6);
  ctx.closePath();
}

export function drawHelpOverlayCursor(
  args: DrawHelpOverlayCursorArgs,
): void {
  const { ctx, x, y, pressed = false } = args;

  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = pressed
    ? "rgba(55, 65, 81, 0.98)"
    : "rgba(255, 255, 255, 0.98)";
  ctx.strokeStyle = "rgba(31, 41, 55, 0.98)";
  ctx.lineWidth = pressed ? 1.2 : 1.1;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  traceCursorPath(ctx);
  ctx.fill();
  ctx.stroke();

  if (pressed) {
    ctx.save();
    ctx.translate(1.2, 1.6);
    ctx.scale(0.78, 0.78);
    ctx.fillStyle = "rgba(255, 255, 255, 0.16)";
    traceCursorPath(ctx);
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}