import * as d3 from "d3";
import type { Topic, GanttEditorSlotWithUiAttributes } from "./types";
import { mapSlotToStateColor } from "../helpers";
import {
  computeTopicLayout,
  scaledBoldSansFont,
  TEXT_SCALE_BASE_ROW_HEIGHT,
} from "./canvas_topics";

function slotTextPaddingPx(rowHeight: number): number {
  return Math.round(Math.max(2, (5 * rowHeight) / TEXT_SCALE_BASE_ROW_HEIGHT));
}

function minSlotWidthForTextPx(rowHeight: number): number {
  return Math.max(8, Math.round((20 * rowHeight) / TEXT_SCALE_BASE_ROW_HEIGHT));
}

export interface SlotRect {
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  opacity: number;
  text: string;
  isCopied: boolean;
  isHighlighted: boolean;
}

export interface DrawSlotsParams {
  ctx: CanvasRenderingContext2D;
  width: number;
  topics: Topic[];
  margin: { left: number; right: number };
  rowHeight: number;
  startTime: Date;
  endTime: Date;
  viewportTop?: number;
  viewportHeight?: number;
}

/**
 * Draws slot bars onto a canvas, matching the SVG version's slot rendering.
 * Assumes the topic gridlines/labels have already been drawn on this context.
 */
export function drawSlots(params: DrawSlotsParams) {
  const { ctx, width, topics, margin, rowHeight, startTime, endTime, viewportTop, viewportHeight } = params;

  const hasViewport = viewportTop !== undefined && viewportHeight !== undefined;

  const chartWidth = width - margin.left - margin.right;
  const xScale = d3.scaleTime()
    .domain([startTime, endTime])
    .range([0, chartWidth])
    .clamp(true);

  // d3.scaleBand equivalent
  const padding = 0.3;
  const step = rowHeight;
  const bandwidth = step * (1 - padding);
  const gap = step - bandwidth;

  const layouts = computeTopicLayout(topics, margin.left, rowHeight);

  ctx.save();

  for (const layout of layouts) {
    const topic = layout.topic;
    // Cull topics outside the visible viewport
    if (hasViewport && (topic.yEnd < viewportTop || topic.yStart > viewportTop + viewportHeight)) continue;
    topic.rows.forEach((row, rowIndex) => {
      const rowTop = layout.rowYs[rowIndex];
      if (rowTop === undefined) return;

      for (const slot of row.slots) {
        // Horizontal culling: skip slots entirely outside the visible time range
        if (slot.closeTime <= startTime || slot.openTime >= endTime) continue;

        const slotDef = computeSlotRect(
          slot, xScale, chartWidth, margin.left, rowTop, bandwidth, gap,
          topic.isCollapsed,
        );
        if (!slotDef) continue;

        // Draw the filled bar
        ctx.globalAlpha = slotDef.opacity;
        ctx.fillStyle = slotDef.fill;
        ctx.fillRect(slotDef.x, slotDef.y, slotDef.width, slotDef.height);

        // Highlight border (orange) when label-selected
        if (slotDef.isHighlighted) {
          ctx.strokeStyle = "#ff7a00";
          ctx.lineWidth = 3;
          ctx.strokeRect(slotDef.x, slotDef.y, slotDef.width, slotDef.height);
        }

        // Copied indicator: dashed border
        if (slotDef.isCopied) {
          ctx.strokeStyle = "#000";
          ctx.lineWidth = 1;
          ctx.setLineDash([5, 5]);
          ctx.strokeRect(slotDef.x, slotDef.y, slotDef.width, slotDef.height);
          ctx.setLineDash([]);
        }

        // Draw text (clipped to slot rect)
        const minTextW = minSlotWidthForTextPx(rowHeight);
        if (!topic.isCollapsed && slotDef.width > minTextW) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(slotDef.x, slotDef.y, slotDef.width, slotDef.height);
          ctx.clip();

          ctx.globalAlpha = 1;
          ctx.fillStyle = "#ffffff";
          ctx.font = scaledBoldSansFont(rowHeight);
          ctx.textBaseline = "middle";
          ctx.textAlign = "left";
          ctx.fillText(
            slotDef.text,
            slotDef.x + slotTextPaddingPx(rowHeight),
            slotDef.y + slotDef.height / 2,
          );
          ctx.restore();
        }
      }
    });
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

function computeSlotRect(
  slot: GanttEditorSlotWithUiAttributes,
  xScale: d3.ScaleTime<number, number>,
  chartWidth: number,
  marginLeft: number,
  rowTop: number,
  bandwidth: number,
  _gap: number,
  isCollapsed: boolean,
): SlotRect | null {
  const openTime = slot.openTime;
  const closeTime = slot.closeTime;

  let slotWidth = xScale(closeTime) - xScale(openTime);
  if (slotWidth <= 0) return null;

  const isStartInView = openTime >= xScale.domain()[0] && openTime <= xScale.domain()[1];
  const isEndInView = closeTime >= xScale.domain()[0] && closeTime <= xScale.domain()[1];

  const x = marginLeft + (isStartInView ? xScale(openTime) : 0);
  const x2 = marginLeft + (isEndInView ? xScale(closeTime) : chartWidth);
  slotWidth = x2 - x;

  if (slotWidth <= 0) return null;

  let fill = slot.color ?? mapSlotToStateColor(slot) ?? "lightgrey";

  return {
    x,
    y: rowTop,
    width: slotWidth,
    height: bandwidth,
    fill,
    opacity: isCollapsed ? 0.4 : 1,
    text: slot.displayName,
    isCopied: !!slot.isCopied,
    isHighlighted: false,
  };
}
