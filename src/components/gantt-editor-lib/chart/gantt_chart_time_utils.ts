type ChartMargin = {
  left: number;
  right: number;
};

export function timeMsToCanvasX(
  timeMs: number,
  width: number,
  startTime: Date,
  endTime: Date,
  margin: ChartMargin,
): number {
  const chartWidth = width - margin.left - margin.right;
  if (chartWidth <= 0) return margin.left;

  const startMs = startTime.getTime();
  const endMs = endTime.getTime();
  const span = endMs - startMs;
  if (span <= 0) return margin.left;

  const clamped = Math.max(startMs, Math.min(endMs, timeMs));
  return margin.left + ((clamped - startMs) / span) * chartWidth;
}

export function clampVerticalMarkerCanvasX(x: number, width: number, margin: ChartMargin): number {
  const minX = margin.left;
  const maxX = width - margin.right;
  return Math.max(minX, Math.min(maxX, x));
}

export function verticalMarkerDateFromCanvasX(
  x: number,
  width: number,
  startTime: Date,
  endTime: Date,
  margin: ChartMargin,
): Date {
  const chartWidth = width - margin.left - margin.right;
  if (chartWidth <= 0) return new Date(startTime);

  const clamped = clampVerticalMarkerCanvasX(x, width, margin);
  const innerX = clamped - margin.left;
  const startMs = startTime.getTime();
  const endMs = endTime.getTime();
  const spanMs = Math.max(0, endMs - startMs);
  const ratio = Math.max(0, Math.min(1, innerX / chartWidth));
  return new Date(startMs + spanMs * ratio);
}