import type { GanttEditorVerticalMarker } from "./types";
import { createTimeScale } from "./time_scale";

const MARKER_HIT_HALF_WIDTH = 7;

export interface VerticalMarkerRenderModel {
  id: string;
  x: number;
  color: string;
  label: string;
  draggable: boolean;
}

interface BuildVerticalMarkerModelsParams {
  markers: GanttEditorVerticalMarker[];
  margin: { left: number; right: number };
  width: number;
  startTime: Date;
  endTime: Date;
  isReadOnly: boolean;
}

export interface DrawVerticalMarkersParams extends BuildVerticalMarkerModelsParams {
  ctx: CanvasRenderingContext2D;
  lineTop: number;
  lineBottom: number;
  draggingMarker?: { id: string; x: number } | null;
}

export interface HitTestVerticalMarkerParams extends BuildVerticalMarkerModelsParams {
  canvasX: number;
  canvasY: number;
  lineTop: number;
  lineBottom: number;
}

function buildVisibleVerticalMarkerModels(
  params: BuildVerticalMarkerModelsParams,
): VerticalMarkerRenderModel[] {
  const { markers, margin, width, startTime, endTime, isReadOnly } = params;
  const chartWidth = width - margin.left - margin.right;
  if (chartWidth <= 0 || markers.length === 0) return [];

  const xScale = createTimeScale(startTime, endTime, 0, chartWidth, true);
  const start = startTime.getTime();
  const end = endTime.getTime();

  const models: VerticalMarkerRenderModel[] = [];
  for (const marker of markers) {
    const t = new Date(marker.date).getTime();
    if (Number.isNaN(t)) continue;
    if (t < start || t > end) continue;

    models.push({
      id: marker.id,
      x: margin.left + xScale(new Date(marker.date)),
      color: marker.color ?? "#16a34a",
      label: marker.label ?? "",
      draggable: marker.draggable !== false && !isReadOnly,
    });
  }

  return models;
}

export function drawVerticalMarkers(params: DrawVerticalMarkersParams): void {
  const {
    ctx,
    lineTop,
    lineBottom,
    draggingMarker,
  } = params;
  const models = buildVisibleVerticalMarkerModels(params);
  if (models.length === 0 || lineBottom <= lineTop) return;

  for (const marker of models) {
    const x = draggingMarker?.id === marker.id ? draggingMarker.x : marker.x;

    ctx.strokeStyle = marker.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, lineTop);
    ctx.lineTo(x, lineBottom);
    ctx.stroke();
  }
}

/** Last-drawn marker wins when multiple markers overlap at the same x. */
export function hitTestVerticalMarker(
  params: HitTestVerticalMarkerParams,
): VerticalMarkerRenderModel | null {
  const { canvasX, canvasY, lineTop, lineBottom } = params;
  if (lineBottom <= lineTop) return null;
  if (canvasY < lineTop || canvasY > lineBottom) return null;

  const models = buildVisibleVerticalMarkerModels(params);
  if (models.length === 0) return null;

  let hit: VerticalMarkerRenderModel | null = null;
  for (const marker of models) {
    if (Math.abs(canvasX - marker.x) <= MARKER_HIT_HALF_WIDTH) {
      hit = marker;
    }
  }

  return hit;
}
