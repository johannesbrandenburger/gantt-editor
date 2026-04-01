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
  lineColor?: string;
  markerOpacity?: number;
  layer?: number;
  lineVisible: boolean;
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

/**
 * Draws slot-level departure markers (STD/ETD) on canvas with the same geometry and layering
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

      const lineY = rowTop - gap / 2;
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

        const hasEstimatedTime = !!slot.secondaryDeadline;
        const deadlinesDiffer =
          hasEstimatedTime
          && new Date(slot.deadline || 0).getTime() !== new Date(slot.secondaryDeadline || 0).getTime();

        const markers = [
          {
            id: `departure-${slot.id}-std`,
            date: slot.deadline,
            lineColor: slot.deadlineColor ?? (deadlinesDiffer ? "#9e9e9e" : "#1f1f1f"),
            markerOpacity: deadlinesDiffer ? 0.6 : 1,
            layer: 0,
          },
          {
            id: `departure-${slot.id}-etd`,
            date: slot.secondaryDeadline,
            lineColor: slot.secondaryDeadlineColor ?? "#1f1f1f",
            markerOpacity: 1,
            layer: 1,
          },
        ];

        for (const marker of markers) {
          if (!marker.date) continue;

          const markerDate = new Date(marker.date);
          if (Number.isNaN(markerDate.getTime())) continue;
          if (markerDate < startTime || markerDate > endTime) continue;

          const departureX = margin.left + xScale(markerDate);
          const barEndX = slotRect.x + slotRect.width;

          markerDefinitions.push({
            id: marker.id,
            x1: barEndX,
            x2: departureX,
            lineY,
            lineHeight,
            lineColor: marker.lineColor,
            markerOpacity: marker.markerOpacity,
            layer: marker.layer,
            lineVisible: departureX < barEndX,
          });
        }
      }
    });
  }

  if (markerDefinitions.length === 0) return;

  const ordered = [...markerDefinitions].sort((a, b) => (a.layer || 0) - (b.layer || 0));

  for (const marker of ordered) {
    ctx.globalAlpha = marker.markerOpacity ?? 1;
    ctx.fillStyle = marker.lineColor || "black";
    ctx.fillRect(marker.x2 - 1, marker.lineY, 2, marker.lineHeight);
  }

  for (const marker of ordered) {
    if (marker.lineVisible) continue;
    ctx.globalAlpha = marker.markerOpacity ?? 1;
    ctx.strokeStyle = marker.lineColor || "gray";
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
 * Returns the slot id when the pointer is inside a departure-marker hover corridor
 * (the area between slot end and a visible marker, with small margins at both ends).
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

        const markerDates = [slot.deadline, slot.secondaryDeadline].filter(
          (d): d is Date => !!d && d >= startTime && d <= endTime,
        );
        if (markerDates.length === 0) continue;

        const barEndX = slotRect.x + slotRect.width;
        for (const markerDate of markerDates) {
          const markerX = margin.left + xScale(markerDate);
          const x0 = Math.min(barEndX, markerX) + 4;
          const x1 = Math.max(barEndX, markerX) - 4;
          if (x1 <= x0) continue;
          if (canvasX >= x0 && canvasX <= x1) {
            return slot.id;
          }
        }
      }
    }
  }

  return null;
}