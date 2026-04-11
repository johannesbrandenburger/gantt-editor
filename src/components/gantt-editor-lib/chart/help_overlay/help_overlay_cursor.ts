type DrawHelpOverlayCursorArgs = {
  ctx: CanvasRenderingContext2D;
  x: number;
  y: number;
  pressed?: boolean;
};

function traceCursorPath(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 16);
  ctx.lineTo(4.5, 12.5);
  ctx.lineTo(8.5, 20);
  ctx.lineTo(11.5, 18.5);
  ctx.lineTo(7.5, 11);
  ctx.lineTo(13, 11);
  ctx.closePath();
}

export function drawHelpOverlayCursor(args: DrawHelpOverlayCursorArgs): void {
  const { ctx, x, y, pressed = false } = args;

  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = pressed ? "rgba(55, 65, 81, 0.98)" : "rgba(255, 255, 255, 0.98)";
  ctx.strokeStyle = "rgba(31, 41, 55, 0.98)";
  ctx.lineWidth = pressed ? 1.2 : 1.1;
  traceCursorPath(ctx);
  ctx.fill();
  ctx.stroke();

  if (pressed) {
    ctx.save();
    ctx.translate(1.25, 1.8);
    ctx.scale(0.78, 0.78);
    ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
    traceCursorPath(ctx);
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}
