import type { Topic } from "./types";
import { createTimeScale } from "./time_scale";
import {
  computeTopicLayout,
  TOPIC_BAND_PADDING,
  type TopicLayout,
} from "./canvas_topics";
import { computeSlotRect } from "./canvas_slots";

interface DepartureMarkerDrawDefinition {
  id: string;
  x1: number;
  x2: number;
  lineY: number;
  lineHeight: number;
  lineColor: string;
  markerOpacity?: number;
  layer?: number;
  markerVisible: boolean;
  connectorVisible: boolean;
}

export interface DrawDepartureMarkersParams {
  ctx: CanvasRenderingContext2D;
  width: number;
  topics: Topic[];
  margin: { left: number; right: number };
  rowHeight: number;
  startTime: Date;
  endTime: Date;
  viewportTop?: number;
  viewportHeight?: number;
  topicLayouts?: TopicLayout[];
  slotTimeOverride?: { slotId: string; openTime: Date; closeTime: Date } | null;
  slotYTransition?: { shiftsBySlotId: ReadonlyMap<string, number>; progress: number } | null;
  previewPulseAlpha?: number;
}

export interface HitTestDepartureGapParams {
  width: number;
  topics: Topic[];
  margin: { left: number; right: number };
  rowHeight: number;
  startTime: Date;
  endTime: Date;
  canvasX: number;
  /** Content Y: same coordinate space as slot rowTop (viewport scroll already applied). */
  contentY: number;
}

const DEPARTURE_MARKER_HOVER_HALF_WIDTH_PX = 4;

/** First index of slot with closeTime > t (slots sorted by openTime ascending). */
function firstSlotIndexCloseAfter(
  slots: { openTime: Date; closeTime: Date }[],
  t: Date,
): number {
  const tm = t.getTime();
  let lo = 0;
  let hi = slots.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (slots[mid]!.closeTime.getTime() <= tm) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

type SlotDeadlineMarker = {
  id: string;
  timestamp: number;
  color: string;
  layer: number;
};

function slotDeadlines(slot: Topic["rows"][number]["slots"][number]): SlotDeadlineMarker[] {
  return (slot.deadlines ?? [])
    .filter((deadline) => Number.isFinite(deadline.timestamp))
    .map((deadline, index) => ({
      id: deadline.id || `deadline-${index}`,
      timestamp: deadline.timestamp,
      color: deadline.color,
      layer: index,
    }));
}

/**
 * Draws slot-level departure markers on canvas with the same geometry and layering
 * semantics as the SVG implementation.
 */
export function drawDepartureMarkers(params: DrawDepartureMarkersParams): void {
  const {
    ctx,
    width,
    topics,
    margin,
    rowHeight,
    startTime,
    endTime,
    viewportTop,
    viewportHeight,
    topicLayouts,
    slotTimeOverride,
    slotYTransition,
    previewPulseAlpha,
  } = params;

  const chartWidth = width - margin.left - margin.right;
  if (chartWidth <= 0) return;

  const xScale = createTimeScale(startTime, endTime, 0, chartWidth, true);

  const hasViewport = viewportTop !== undefined && viewportHeight !== undefined;
  const step = rowHeight;
  const bandwidth = step * (1 - TOPIC_BAND_PADDING);
  const gap = step - bandwidth;

  const layouts = topicLayouts ?? computeTopicLayout(topics, margin.left, rowHeight);
  const markerDefinitions: DepartureMarkerDrawDefinition[] = [];

  for (const layout of layouts) {
    const topic = layout.topic;
    if (topic.isCollapsed) continue;
    if (hasViewport && (topic.yEnd < viewportTop || topic.yStart > viewportTop + viewportHeight)) {
      continue;
    }

    topic.rows.forEach((row, rowIndex) => {
      const rowTop = layout.rowYs[rowIndex];
      if (rowTop === undefined) return;

      const baseLineY = rowTop - gap / 2;
      const lineHeight = step;

      const slots = row.slots;
      const i0 = firstSlotIndexCloseAfter(slots, startTime);
      for (let i = i0; i < slots.length; i++) {
        const slot = slots[i]!;
        if (slot.openTime >= endTime) break;

        const slotForGeom =
          slotTimeOverride && slotTimeOverride.slotId === slot.id
            ? {
                ...slot,
                openTime: slotTimeOverride.openTime,
                closeTime: slotTimeOverride.closeTime,
              }
            : slot;

        const slotRect = computeSlotRect(
          slotForGeom,
          xScale,
          chartWidth,
          margin.left,
          rowTop,
          bandwidth,
          gap,
          topic.isCollapsed,
        );
        if (!slotRect) continue;

        const shift = slotYTransition?.shiftsBySlotId.get(slot.id);
        const lineY =
          shift !== undefined && slotYTransition
            ? baseLineY + shift * (1 - slotYTransition.progress)
            : baseLineY;

        const markers = slotDeadlines(slot);

        for (const marker of markers) {
          const markerTimeMs = marker.timestamp;
          if (Number.isNaN(markerTimeMs)) continue;
          const markerDate = new Date(markerTimeMs);
          const markerVisible = markerDate >= startTime && markerDate <= endTime;
          const slotOpenMs = slotForGeom.openTime.getTime();
          const slotCloseMs = slotForGeom.closeTime.getTime();
          const markerInsideSlot = markerTimeMs >= slotOpenMs && markerTimeMs <= slotCloseMs;

          const departureX = margin.left + xScale(markerDate);
          const barStartX = slotRect.x;
          const barEndX = slotRect.x + slotRect.width;
          const connectorAnchorX = departureX < barStartX ? barStartX : barEndX;

          markerDefinitions.push({
            id: `departure-${slot.id}-${marker.id}`,
            x1: connectorAnchorX,
            x2: departureX,
            lineY,
            lineHeight,
            lineColor: marker.color,
            markerOpacity:
              slot.isPreview && previewPulseAlpha !== undefined
                ? Math.max(0.25, Math.min(1, previewPulseAlpha))
                : 1,
            layer: marker.layer,
            markerVisible,
            connectorVisible: !markerInsideSlot && Math.abs(departureX - connectorAnchorX) > 1,
          });
        }
      }
    });
  }

  if (markerDefinitions.length === 0) return;

  const ordered = [...markerDefinitions].sort((a, b) => (a.layer || 0) - (b.layer || 0));

  for (const marker of ordered) {
    if (!marker.markerVisible) continue;
    ctx.globalAlpha = marker.markerOpacity ?? 1;
    ctx.fillStyle = marker.lineColor;
    ctx.fillRect(marker.x2 - 1, marker.lineY, 2, marker.lineHeight);
  }

  for (const marker of ordered) {
    if (!marker.connectorVisible) continue;
    ctx.globalAlpha = marker.markerOpacity ?? 1;
    ctx.strokeStyle = marker.lineColor;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    const y = marker.lineY + marker.lineHeight / 2;
    ctx.moveTo(marker.x1, y);
    ctx.lineTo(marker.x2, y);
    ctx.stroke();
  }

  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

/**
 * Returns the slot id when the pointer is inside a departure-marker hover area:
 * either the line corridor between slot end and marker, or directly on the marker line.
 */
export function hitTestDepartureGap(params: HitTestDepartureGapParams): string | null {
  const {
    width,
    topics,
    margin,
    rowHeight,
    startTime,
    endTime,
    canvasX,
    contentY,
  } = params;

  const chartWidth = width - margin.left - margin.right;
  if (chartWidth <= 0) return null;

  const xScale = createTimeScale(startTime, endTime, 0, chartWidth, true);
  const step = rowHeight;
  const bandwidth = step * (1 - TOPIC_BAND_PADDING);
  const gap = step - bandwidth;
  const layouts = computeTopicLayout(topics, margin.left, rowHeight);

  for (const layout of layouts) {
    const topic = layout.topic;
    if (topic.isCollapsed) continue;

    for (let rowIndex = 0; rowIndex < topic.rows.length; rowIndex++) {
      const row = topic.rows[rowIndex]!;
      const rowTop = layout.rowYs[rowIndex];
      if (rowTop === undefined) continue;

      const y0 = rowTop;
      const y1 = rowTop + bandwidth;
      if (contentY < y0 || contentY > y1) continue;

      const slots = row.slots;
      const i0 = firstSlotIndexCloseAfter(slots, startTime);
      for (let i = i0; i < slots.length; i++) {
        const slot = slots[i]!;
        if (slot.openTime >= endTime) break;

        const slotRect = computeSlotRect(
          slot,
          xScale,
          chartWidth,
          margin.left,
          rowTop,
          bandwidth,
          gap,
          topic.isCollapsed,
        );
        if (!slotRect) continue;

        const markerDates = slotDeadlines(slot)
          .map((marker) => new Date(marker.timestamp))
          .filter((d) => d >= startTime && d <= endTime);
        if (markerDates.length === 0) continue;

        const barStartX = slotRect.x;
        const barEndX = slotRect.x + slotRect.width;
        for (const markerDate of markerDates) {
          const markerTimeMs = markerDate.getTime();
          const slotOpenMs = slot.openTime.getTime();
          const slotCloseMs = slot.closeTime.getTime();
          const markerInsideSlot = markerTimeMs >= slotOpenMs && markerTimeMs <= slotCloseMs;
          const markerX = margin.left + xScale(markerDate);
          const connectorAnchorX = markerX < barStartX ? barStartX : barEndX;

          // Treat the marker line itself as hoverable.
          if (Math.abs(canvasX - markerX) <= DEPARTURE_MARKER_HOVER_HALF_WIDTH_PX) {
            return slot.id;
          }

          if (!markerInsideSlot) {
            const x0 = Math.min(connectorAnchorX, markerX) + 4;
            const x1 = Math.max(connectorAnchorX, markerX) - 4;
            if (x1 <= x0) continue;
            if (canvasX >= x0 && canvasX <= x1) {
              return slot.id;
            }
          }
        }
      }
    }
  }

  return null;
}
