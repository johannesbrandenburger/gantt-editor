import { hitTestVerticalMarker } from "./vertical-markers";
import { hitTestSuggestionButton } from "./suggestions";
import type { Topic, GanttEditorSuggestion } from "./types";
import type { UnifiedChartLayout } from "./unified-chart-layout";
import type { GanttEditorDateTimeFormatters, GanttEditorProps } from "./props";
import { timeMsToCanvasX, verticalMarkerDateFromCanvasX } from "./time-utils";

type ChartMargin = {
  left: number;
  right: number;
};

type DrawMarkedRegionOverlayArgs = {
  ctx: CanvasRenderingContext2D;
  groupId: string;
  contentHeight: number;
  width: number;
  markedRegion: GanttEditorProps["markedRegion"];
  destinationGroups: GanttEditorProps["destinationGroups"];
  topicsByGroupId: Map<string, Topic[]>;
  startTime: Date;
  endTime: Date;
  margin: ChartMargin;
};

export function drawMarkedRegionOverlay(args: DrawMarkedRegionOverlayArgs): void {
  const {
    ctx,
    groupId,
    contentHeight,
    width,
    markedRegion,
    destinationGroups,
    topicsByGroupId,
    startTime,
    endTime,
    margin,
  } = args;

  if (!markedRegion) return;

  const firstGroupId = destinationGroups[0]?.id;
  let yStart = 0;
  let yEnd = contentHeight;

  if (markedRegion.destinationId === "multiple") {
    if (!firstGroupId || groupId !== firstGroupId) return;
    if (yEnd <= yStart) return;
  } else {
    const topic = (topicsByGroupId.get(groupId) ?? []).find(
      (item) => item.id === markedRegion.destinationId,
    );
    if (!topic) return;
    yStart = topic.yStart;
    yEnd = topic.yEnd;
    if (yEnd <= yStart) return;
  }

  const startMs = markedRegion.startTime.getTime();
  const endMs = markedRegion.endTime.getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return;

  const xStart = timeMsToCanvasX(startMs, width, startTime, endTime, margin);
  const xEnd = timeMsToCanvasX(endMs, width, startTime, endTime, margin);
  const markerWidth = xEnd - xStart;
  if (markerWidth <= 0) return;

  ctx.save();
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = "rgba(255, 255, 0, 0.2)";
  ctx.strokeStyle = "rgba(255, 215, 0, 0.8)";
  ctx.lineWidth = 2;
  ctx.fillRect(xStart, yStart, markerWidth, yEnd - yStart);
  ctx.strokeRect(xStart, yStart, markerWidth, yEnd - yStart);
  ctx.restore();
}

export function drawCurrentTimeIndicator(
  ctx: CanvasRenderingContext2D,
  layout: UnifiedChartLayout,
  startTime: Date,
  endTime: Date,
  margin: ChartMargin,
  locale?: string | string[],
  dateTimeFormatters?: GanttEditorDateTimeFormatters,
  currentTimeIndicatorLabel?: (value: Date) => string,
): void {
  const now = new Date();
  if (now < startTime || now > endTime) return;

  const x = timeMsToCanvasX(now.getTime(), layout.canvasCssWidth, startTime, endTime, margin);
  const axisRowHeight = layout.axisRect.h / 4;
  const labelY = layout.axisRect.y + axisRowHeight * 3.5;
  const labelText = formatCurrentTimeLabel(
    now,
    locale,
    currentTimeIndicatorLabel,
    dateTimeFormatters?.currentTime,
  );
  ctx.save();

  ctx.strokeStyle = "red";
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(x, layout.axisRect.y);
  ctx.lineTo(x, layout.canvasCssHeight);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.font = "bold 10px sans-serif";
  const textMetrics = ctx.measureText(labelText);
  const textWidth = textMetrics.width;
  const labelPadX = 4;
  const labelWidth = textWidth + labelPadX * 2;
  const labelHeight = Math.max(12, axisRowHeight - 0.5);
  const labelTop = labelY - labelHeight / 2;
  const textBaselineY = centeredTextAlphabeticBaseline(textMetrics, labelTop, labelHeight);

  ctx.fillStyle = "rgba(255, 0, 0, 0.75)";
  ctx.fillRect(x, labelTop, labelWidth, labelHeight);

  ctx.fillStyle = "white";
  ctx.font = "bold 10px sans-serif";
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillText(labelText, x + labelPadX, textBaselineY);

  ctx.restore();
}

export function drawMouseTimeStrip(
  ctx: CanvasRenderingContext2D,
  layout: UnifiedChartLayout,
  startTime: Date,
  endTime: Date,
  margin: ChartMargin,
  canvasX: number,
  locale?: string | string[],
  dateTimeFormatters?: GanttEditorDateTimeFormatters,
): void {
  const minX = margin.left;
  const maxX = layout.canvasCssWidth - margin.right;
  if (canvasX < minX || canvasX > maxX) return;

  const value = verticalMarkerDateFromCanvasX(
    canvasX,
    layout.canvasCssWidth,
    startTime,
    endTime,
    margin,
  );
  const axisRowHeight = layout.axisRect.h / 4;
  const labelY = layout.axisRect.y + axisRowHeight * 2.5;
  const labelText = formatMouseTimeLabel(value, locale, dateTimeFormatters?.onMouseTimeStrip);
  ctx.save();

  ctx.strokeStyle = "rgba(33, 150, 243, 0.9)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(canvasX, layout.axisRect.y);
  ctx.lineTo(canvasX, layout.canvasCssHeight);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.font = "bold 10px sans-serif";
  const textMetrics = ctx.measureText(labelText);
  const textWidth = textMetrics.width;
  const labelPadX = 4;
  const labelWidth = textWidth + labelPadX * 2;
  const labelHeight = Math.max(12, axisRowHeight - 0.5);
  const labelTop = labelY - labelHeight / 2;
  const textBaselineY = centeredTextAlphabeticBaseline(textMetrics, labelTop, labelHeight);
  const labelLeft = Math.max(
    minX,
    Math.min(maxX - labelWidth, canvasX - labelWidth / 2),
  );

  ctx.fillStyle = "rgba(33, 150, 243, 0.85)";
  ctx.fillRect(labelLeft, labelTop, labelWidth, labelHeight);

  ctx.fillStyle = "white";
  ctx.font = "bold 10px sans-serif";
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillText(labelText, labelLeft + labelPadX, textBaselineY);

  ctx.restore();
}

function centeredTextAlphabeticBaseline(
  metrics: TextMetrics,
  containerTop: number,
  containerHeight: number,
): number {
  const ascent = metrics.actualBoundingBoxAscent;
  const descent = metrics.actualBoundingBoxDescent;

  if (Number.isFinite(ascent) && Number.isFinite(descent) && ascent + descent > 0) {
    return containerTop + (containerHeight - ascent - descent) / 2 + ascent;
  }

  return containerTop + containerHeight / 2;
}

function formatCurrentTimeLabel(
  value: Date,
  locale?: string | string[],
  currentTimeIndicatorLabel?: (value: Date) => string,
  formatter?: Intl.DateTimeFormat,
): string {
  if (currentTimeIndicatorLabel) return currentTimeIndicatorLabel(value);
  if (formatter) return formatter.format(value);
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(value);
}

function formatMouseTimeLabel(
  value: Date,
  locale?: string | string[],
  formatter?: Intl.DateTimeFormat,
): string {
  if (formatter) return formatter.format(value);
  return new Intl.DateTimeFormat(locale, {
    timeStyle: "short",
  }).format(value);
}

type HitSuggestionForGroupArgs = {
  canvasX: number;
  contentY: number;
  width: number;
  groupTopics: Topic[];
  suggestions: GanttEditorSuggestion[];
  rowHeight: number;
  startTime: Date;
  endTime: Date;
  margin: ChartMargin;
};

export function hitSuggestionForGroup(args: HitSuggestionForGroupArgs) {
  const { canvasX, contentY, width, groupTopics, suggestions, rowHeight, startTime, endTime, margin } =
    args;
  return hitTestSuggestionButton({
    width,
    topics: groupTopics,
    suggestions,
    margin,
    rowHeight,
    startTime,
    endTime,
    canvasX,
    contentY,
  });
}

type HitVerticalMarkerForGroupArgs = {
  groupId: string;
  canvasX: number;
  canvasY: number;
  width: number;
  layout: UnifiedChartLayout;
  markers: GanttEditorProps["verticalMarkers"];
  isReadOnly: boolean;
  startTime: Date;
  endTime: Date;
  margin: ChartMargin;
};

export function hitVerticalMarkerForGroup(args: HitVerticalMarkerForGroupArgs) {
  const {
    groupId,
    canvasX,
    canvasY,
    width,
    layout,
    markers,
    isReadOnly,
    startTime,
    endTime,
    margin,
  } = args;
  const gr = layout.groupRects.get(groupId);
  if (!gr) return null;

  return hitTestVerticalMarker({
    markers: markers ?? [],
    margin,
    width,
    startTime,
    endTime,
    isReadOnly,
    canvasX,
    canvasY,
    lineTop: gr.y,
    lineBottom: gr.y + gr.h,
  });
}
