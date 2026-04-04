import { hitTestVerticalMarker } from "./canvas_vertical_markers";
import { hitTestSuggestionButton } from "./canvas_suggestions";
import type { Topic, GanttEditorSuggestion } from "./types";
import type { UnifiedChartLayout } from "./unified_chart_layout";
import type { GanttEditorProps } from "./gantt_canvas_props";
import { timeMsToCanvasX } from "./gantt_chart_time_utils";

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
): void {
  const now = new Date();
  if (now < startTime || now > endTime) return;

  const x = timeMsToCanvasX(now.getTime(), layout.canvasCssWidth, startTime, endTime, margin);
  const axisRowHeight = layout.axisRect.h / 4;
  const labelY = layout.axisRect.y + axisRowHeight * 3.5;
  const labelText = formatCurrentTimeLabel(now);
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
  const textWidth = ctx.measureText(labelText).width;
  const labelPadX = 4;
  const labelWidth = textWidth + labelPadX * 2;
  const labelHeight = Math.max(10, axisRowHeight - 2);
  const labelTop = labelY - labelHeight / 2;

  ctx.fillStyle = "rgba(255, 0, 0, 0.75)";
  ctx.fillRect(x, labelTop, labelWidth, labelHeight);

  ctx.fillStyle = "white";
  ctx.font = "bold 10px sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(labelText, x + labelPadX, labelY);

  ctx.restore();
}

function formatCurrentTimeLabel(value: Date): string {
  const hh = `${value.getHours()}`.padStart(2, "0");
  const mm = `${value.getMinutes()}`.padStart(2, "0");
  return `${hh}:${mm}`;
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
    groupY: gr.y,
    groupHeight: gr.h,
  });
}