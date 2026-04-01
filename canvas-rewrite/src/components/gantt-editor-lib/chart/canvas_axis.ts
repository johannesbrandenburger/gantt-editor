import type { GanttEditorXAxisOptions } from "./types";
import { createTimeScale, timeDay, type TimeDomainValue } from "./time_scale";

const defaultUpperFormatter = new Intl.DateTimeFormat(undefined, {
  day: "2-digit",
  month: "2-digit",
});

const defaultLowerFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});

export interface DrawXAxisParams {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  startTime: Date;
  endTime: Date;
  margin: { left: number; right: number };
  xAxisOptions?: GanttEditorXAxisOptions;
  /** Top offset when drawing into a larger unified canvas (default 0). */
  offsetY?: number;
}

export function drawXAxisOnCanvas(params: DrawXAxisParams) {
  const { ctx, width, height, startTime, endTime, margin, xAxisOptions } = params;
  const offsetY = params.offsetY ?? 0;

  const chartWidth = width - margin.left - margin.right;
  const xScale = createTimeScale(startTime, endTime, 0, chartWidth, true);

  // Clear axis band
  ctx.clearRect(0, offsetY, width, height);
  ctx.fillStyle = "#f5f5f5";
  ctx.fillRect(0, offsetY, width, height);

  // Formatters (matching original axis.ts defaults)
  const dateFormatter = xAxisOptions?.upper?.tickFormat ?? ((d: TimeDomainValue) => {
    const date = d instanceof Date ? d : new Date(d);
    return defaultUpperFormatter.format(date);
  });
  const timeFormatter = xAxisOptions?.lower?.tickFormat ?? ((d: TimeDomainValue) => {
    const date = d instanceof Date ? d : new Date(d);
    return defaultLowerFormatter.format(date);
  });

  const upperTicks = xScale.ticks(xAxisOptions?.upper?.ticks ?? timeDay.every(1));
  const lowerTicks = xScale.ticks(xAxisOptions?.lower?.ticks);

  // Split axis height into four equal rows:
  // 1) weekday overlay label, 2) date row, 3) time row, 4) current-time label.
  const oneQuarter = height / 4;
  const upperY = offsetY + oneQuarter * 1.5;
  const lowerY = offsetY + oneQuarter * 2.5;
  const tickLineTop = offsetY + height;
  const tickLineBottom = offsetY + height - 5;

  // Draw upper axis ticks (date labels, no tick lines in original)
  ctx.save();
  ctx.fillStyle = "#333";
  ctx.font = "10px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const tick of upperTicks) {
    const x = margin.left + xScale(tick);
    if (x < margin.left || x > width - margin.right) continue;
    ctx.fillText(dateFormatter(tick), x, upperY);
  }
  ctx.restore();

  // Draw lower axis ticks (time labels + tick lines)
  ctx.save();
  ctx.fillStyle = "#333";
  ctx.font = "10px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 1;
  for (const tick of lowerTicks) {
    const x = margin.left + xScale(tick);
    if (x < margin.left || x > width - margin.right) continue;
    // Tick line
    ctx.beginPath();
    ctx.moveTo(x, tickLineTop);
    ctx.lineTo(x, tickLineBottom);
    ctx.stroke();
    // Label
    ctx.fillText(timeFormatter(tick), x, lowerY);
  }
  ctx.restore();

  // Bottom border line
  ctx.save();
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(margin.left, offsetY + height - 0.5);
  ctx.lineTo(width - margin.right, offsetY + height - 0.5);
  ctx.stroke();
  ctx.restore();
}
