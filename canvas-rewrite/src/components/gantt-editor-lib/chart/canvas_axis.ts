import * as d3 from "d3";
import type { GanttEditorXAxisOptions } from "./types";

export interface DrawXAxisParams {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  startTime: Date;
  endTime: Date;
  margin: { left: number; right: number };
  xAxisOptions?: GanttEditorXAxisOptions;
}

export function drawXAxisOnCanvas(params: DrawXAxisParams) {
  const { ctx, width, height, startTime, endTime, margin, xAxisOptions } = params;

  const chartWidth = width - margin.left - margin.right;
  const xScale = d3.scaleTime()
    .domain([startTime, endTime])
    .range([0, chartWidth])
    .clamp(true);

  // Clear
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#f5f5f5";
  ctx.fillRect(0, 0, width, height);

  // Formatters (matching original axis.ts defaults)
  const dateFormatter = xAxisOptions?.upper?.tickFormat ?? ((d: Date | d3.NumberValue) => {
    return d instanceof Date ? d3.timeFormat("%d.%m.")(d) : "";
  });
  const timeFormatter = xAxisOptions?.lower?.tickFormat ?? ((d: Date | d3.NumberValue) => {
    return d instanceof Date ? d3.timeFormat("%H:%M")(d) : "";
  });

  // Generate ticks using d3
  const upperTicks = xScale.ticks(xAxisOptions?.upper?.ticks ?? d3.timeDay.every(1)!);
  const lowerTicks = xScale.ticks(xAxisOptions?.lower?.ticks as any);

  // Layout constants (matching original SVG: margin.top=40, upper at y=-20, lower at y=0)
  // In canvas the x-axis container is 50px tall.
  // Original SVG: xAxisGroup translated to (margin.left, 40). Upper axis at y=-20, lower at y=0.
  // So upper text ~ y=20 (40-20), lower text ~ y=40 (40+0). Tick lines from y=40 downward.
  // We map: upper row center = 14, lower row center = 36, tick lines end at 50.
  const upperY = 14;
  const lowerY = 36;
  const tickLineTop = height;
  const tickLineBottom = height-5;

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
  ctx.moveTo(margin.left, height - 0.5);
  ctx.lineTo(width - margin.right, height - 0.5);
  ctx.stroke();
  ctx.restore();
}
