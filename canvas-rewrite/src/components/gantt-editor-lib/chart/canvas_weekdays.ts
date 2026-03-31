import * as d3 from "d3";

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export interface DrawWeekdayOverlayParams {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  margin: { left: number; right: number };
  startTime: Date;
  endTime: Date;
}

/**
 * Draws weekday boundary lines and labels when the visible range is short enough
 * (parity with D3 behavior that enables this overlay for sub-2-week windows).
 */
export function drawWeekdayOverlay(params: DrawWeekdayOverlayParams): void {
  const { ctx, width, height, margin, startTime, endTime } = params;

  const spanMs = endTime.getTime() - startTime.getTime();
  if (spanMs <= 0 || spanMs >= TWO_WEEKS_MS) return;

  const chartWidth = width - margin.left - margin.right;
  if (chartWidth <= 0 || height <= 0) return;

  const xScale = d3.scaleTime().domain([startTime, endTime]).range([0, chartWidth]).clamp(true);
  const days = d3.timeDay.range(startTime, endTime).filter((d) => d.getHours() === 0);
  if (days.length === 0) return;

  ctx.save();

  for (const day of days) {
    const x = margin.left + xScale(day);
    ctx.strokeStyle = "rgba(0, 128, 0, 0.3)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  ctx.fillStyle = "#008000";
  ctx.font = "bold 10px sans-serif";
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  for (const day of days) {
    const x = margin.left + xScale(day) + 3;
    ctx.fillText(WEEKDAY_NAMES[day.getDay()] || "", x, 10);
  }

  ctx.restore();
}
