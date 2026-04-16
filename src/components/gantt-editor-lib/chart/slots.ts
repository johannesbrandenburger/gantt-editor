import type { Topic, GanttEditorSlotWithUiAttributes } from "./types";
import { mapSlotToStateColor } from "../helpers";
import {
  computeTopicLayout,
  scaledBoldSansFont,
  TEXT_SCALE_BASE_ROW_HEIGHT,
  TOPIC_BAND_PADDING,
  type TopicLayout,
} from "./topics";
import { slotsAllowLabelsAndInteraction } from "./slot-scale";
import { createTimeScale, type TimeScale } from "./time-scale";

function slotTextPaddingPx(rowHeight: number): number {
  return Math.round(Math.max(2, (5 * rowHeight) / TEXT_SCALE_BASE_ROW_HEIGHT));
}

function minSlotWidthForTextPx(rowHeight: number): number {
  return Math.max(8, Math.round((20 * rowHeight) / TEXT_SCALE_BASE_ROW_HEIGHT));
}

/** Matches SVG resize handles: 8px wide, centered on bar edges. */
export const SLOT_RESIZE_HANDLE_WIDTH_PX = 8;
export const SLOT_RESIZE_HANDLE_HALF_PX = SLOT_RESIZE_HANDLE_WIDTH_PX / 2;
/** Minimum bar width in inner chart pixels (matches update-chart.ts). */
export const SLOT_MIN_INNER_WIDTH_PX = 10;

export interface SlotRect {
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  opacity: number;
  text: string;
  isCopied: boolean;
  isPreview: boolean;
  isHighlighted: boolean;
  slotId: string;
  slot: GanttEditorSlotWithUiAttributes;
  isStartInView: boolean;
  isEndInView: boolean;
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
  /** When set, skips internal computeTopicLayout (caller computed once per frame). */
  topicLayouts?: TopicLayout[];
  /** Live preview while resizing a slot (does not mutate source data). */
  slotTimeOverride?: { slotId: string; openTime: Date; closeTime: Date } | null;
  /** Transitional Y-shift animation for slots after row arrangement changes. */
  slotYTransition?: { shiftsBySlotId: ReadonlyMap<string, number>; progress: number } | null;
  /** Optional alpha pulse applied to temporary destination preview slots. */
  previewPulseAlpha?: number;
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
 * Draws slot bars onto a canvas, matching the SVG version's slot rendering.
 * Assumes the topic gridlines/labels have already been drawn on this context.
 */
export function drawSlots(params: DrawSlotsParams) {
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

  const hasViewport = viewportTop !== undefined && viewportHeight !== undefined;

  const chartWidth = width - margin.left - margin.right;
  const xScale = createTimeScale(startTime, endTime, 0, chartWidth, true);

  // d3.scaleBand equivalent
  const padding = TOPIC_BAND_PADDING;
  const step = rowHeight;
  const bandwidth = step * (1 - padding);
  const gap = step - bandwidth;

  const layouts = topicLayouts ?? computeTopicLayout(topics, margin.left, rowHeight);

  ctx.save();

  for (const layout of layouts) {
    const topic = layout.topic;
    // Cull topics outside the visible viewport
    if (hasViewport && (topic.yEnd < viewportTop || topic.yStart > viewportTop + viewportHeight)) continue;
    topic.rows.forEach((row, rowIndex) => {
      const rowTop = layout.rowYs[rowIndex];
      if (rowTop === undefined) return;

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
        const slotDef = computeSlotRect(
          slotForGeom, xScale, chartWidth, margin.left, rowTop, bandwidth, gap,
          topic.isCollapsed,
        );
        if (!slotDef) continue;

        if (slotYTransition) {
          const shift = slotYTransition.shiftsBySlotId.get(slot.id);
          if (shift !== undefined) {
            slotDef.y += shift * (1 - slotYTransition.progress);
          }
        }

        // Draw the filled bar
        ctx.globalAlpha =
          slotDef.isPreview && previewPulseAlpha !== undefined
            ? Math.max(0.25, Math.min(1, slotDef.opacity * previewPulseAlpha))
            : slotDef.opacity;
        ctx.fillStyle = slotDef.fill;
        ctx.fillRect(slotDef.x, slotDef.y, slotDef.width, slotDef.height);

        if (slotDef.isPreview) {
          ctx.strokeStyle = slotDef.slot.isCopyPreview ? "#166534" : "#1d4ed8";
          ctx.lineWidth = 1.25;
          ctx.setLineDash([6, 4]);
          ctx.strokeRect(slotDef.x + 0.5, slotDef.y + 0.5, Math.max(0, slotDef.width - 1), Math.max(0, slotDef.height - 1));
          ctx.setLineDash([]);
        }

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

        // Draw text (clipped to slot rect); overview zoom skips labels for density/clarity
        const minTextW = minSlotWidthForTextPx(rowHeight);
        if (
          slotsAllowLabelsAndInteraction(rowHeight) &&
          !topic.isCollapsed &&
          slotDef.width > minTextW
        ) {
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

export function computeSlotRect(
  slot: GanttEditorSlotWithUiAttributes,
  xScale: TimeScale,
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

  const isPreview = !!slot.isPreview;
  let fill = slot.color ?? mapSlotToStateColor(slot) ?? "lightgrey";
  if (isPreview) {
    fill = slot.isCopyPreview ? "rgba(34, 197, 94, 0.6)" : "rgba(37, 99, 235, 0.65)";
  }

  return {
    x,
    y: rowTop,
    width: slotWidth,
    height: bandwidth,
    fill,
    opacity: isCollapsed ? (isPreview ? 0.32 : 0.4) : (isPreview ? 0.72 : 1),
    text: slot.displayName,
    isCopied: !!slot.isCopied,
    isPreview,
    isHighlighted: false,
    slotId: slot.id,
    slot,
    isStartInView,
    isEndInView,
  };
}

export type SlotResizeEdge = "left" | "right";

export interface HitTestSlotResizeParams {
  topics: Topic[];
  canvasX: number;
  /** Content Y: same space as `rowTop` in drawSlots (viewport scroll applied). */
  contentY: number;
  margin: { left: number; right: number };
  width: number;
  rowHeight: number;
  startTime: Date;
  endTime: Date;
  isReadOnly: boolean;
}

export interface HitTestSlotBarParams {
  topics: Topic[];
  canvasX: number;
  /** Content Y: same space as `rowTop` in drawSlots (viewport scroll applied). */
  contentY: number;
  margin: { left: number; right: number };
  width: number;
  rowHeight: number;
  startTime: Date;
  endTime: Date;
}

export type SlotBarHit = {
  slotId: string;
  slot: GanttEditorSlotWithUiAttributes;
  /** Full rendered rect in canvas coordinates (includes left margin). */
  rect: { x: number; y: number; width: number; height: number };
};

export interface CollectSlotsInRectParams {
  topics: Topic[];
  selectionRect: { x0: number; y0: number; x1: number; y1: number };
  margin: { left: number; right: number };
  width: number;
  rowHeight: number;
  startTime: Date;
  endTime: Date;
  excludeReadOnly?: boolean;
}

/**
 * Hit-test left/right resize handles (8px bands on bar edges), last-drawn slot wins.
 */
export type SlotResizeHit = {
  slotId: string;
  edge: SlotResizeEdge;
  slot: GanttEditorSlotWithUiAttributes;
  /** Left edge in inner chart pixels (matches SVG slot `x`). */
  displayInnerLeft: number;
  /** Bar width in inner chart pixels. */
  displayInnerWidth: number;
};

export function hitTestSlotResizeEdge(p: HitTestSlotResizeParams): SlotResizeHit | null {
  if (p.isReadOnly) return null;
  if (!slotsAllowLabelsAndInteraction(p.rowHeight)) return null;

  const chartWidth = p.width - p.margin.left - p.margin.right;
  if (chartWidth <= 0) return null;

  const xScale = createTimeScale(p.startTime, p.endTime, 0, chartWidth, true);

  const padding = TOPIC_BAND_PADDING;
  const step = p.rowHeight;
  const bandwidth = step * (1 - padding);
  const gap = step - bandwidth;

  const layouts = computeTopicLayout(p.topics, p.margin.left, p.rowHeight);
  let hit: SlotResizeHit | null = null;

  for (const layout of layouts) {
    const topic = layout.topic;
    topic.rows.forEach((row, rowIndex) => {
      const rowTop = layout.rowYs[rowIndex];
      if (rowTop === undefined) return;

      const y0 = rowTop;
      const y1 = rowTop + bandwidth;
      if (p.contentY < y0 || p.contentY >= y1) return;

      const slots = row.slots;
      const i0 = firstSlotIndexCloseAfter(slots, p.startTime);
      for (let i = i0; i < slots.length; i++) {
        const slot = slots[i]!;
        if (slot.openTime >= p.endTime) break;

        if (slot.readOnly) continue;

        const def = computeSlotRect(
          slot,
          xScale,
          chartWidth,
          p.margin.left,
          rowTop,
          bandwidth,
          gap,
          topic.isCollapsed,
        );
        if (!def) continue;

        const half = SLOT_RESIZE_HANDLE_HALF_PX;
        let edgeHit: SlotResizeEdge | null = null;
        if (def.isStartInView) {
          const left0 = def.x - half;
          const left1 = def.x + half;
          if (p.canvasX >= left0 && p.canvasX <= left1) edgeHit = "left";
        }
        if (def.isEndInView && edgeHit === null) {
          const right0 = def.x + def.width - half;
          const right1 = def.x + def.width + half;
          if (p.canvasX >= right0 && p.canvasX <= right1) edgeHit = "right";
        }
        if (edgeHit) {
          hit = {
            slotId: slot.id,
            edge: edgeHit,
            slot,
            displayInnerLeft: def.x - p.margin.left,
            displayInnerWidth: def.width,
          };
        }
      }
    });
  }

  return hit;
}

/**
 * Hit-test slot bars (last-drawn slot wins), used for click/dblclick/context interactions.
 */
export function hitTestSlotBar(p: HitTestSlotBarParams): SlotBarHit | null {
  if (!slotsAllowLabelsAndInteraction(p.rowHeight)) return null;

  const chartWidth = p.width - p.margin.left - p.margin.right;
  if (chartWidth <= 0) return null;

  const xScale = createTimeScale(p.startTime, p.endTime, 0, chartWidth, true);

  const padding = TOPIC_BAND_PADDING;
  const step = p.rowHeight;
  const bandwidth = step * (1 - padding);
  const gap = step - bandwidth;

  const layouts = computeTopicLayout(p.topics, p.margin.left, p.rowHeight);
  let hit: SlotBarHit | null = null;

  for (const layout of layouts) {
    const topic = layout.topic;
    topic.rows.forEach((row, rowIndex) => {
      const rowTop = layout.rowYs[rowIndex];
      if (rowTop === undefined) return;

      const y0 = rowTop;
      const y1 = rowTop + bandwidth;
      if (p.contentY < y0 || p.contentY >= y1) return;

      const slots = row.slots;
      const i0 = firstSlotIndexCloseAfter(slots, p.startTime);
      for (let i = i0; i < slots.length; i++) {
        const slot = slots[i]!;
        if (slot.openTime >= p.endTime) break;

        const def = computeSlotRect(
          slot,
          xScale,
          chartWidth,
          p.margin.left,
          rowTop,
          bandwidth,
          gap,
          topic.isCollapsed,
        );
        if (!def) continue;
        if (
          p.canvasX >= def.x &&
          p.canvasX <= def.x + def.width &&
          p.contentY >= def.y &&
          p.contentY <= def.y + def.height
        ) {
          hit = {
            slotId: slot.id,
            slot,
            rect: { x: def.x, y: def.y, width: def.width, height: def.height },
          };
        }
      }
    });
  }

  return hit;
}

/**
 * Collect slots fully contained in a selection rectangle (matches SVG brush behavior).
 */
export function collectSlotsFullyInsideRect(
  p: CollectSlotsInRectParams,
): GanttEditorSlotWithUiAttributes[] {
  const chartWidth = p.width - p.margin.left - p.margin.right;
  if (chartWidth <= 0) return [];

  const x0 = Math.min(p.selectionRect.x0, p.selectionRect.x1);
  const y0 = Math.min(p.selectionRect.y0, p.selectionRect.y1);
  const x1 = Math.max(p.selectionRect.x0, p.selectionRect.x1);
  const y1 = Math.max(p.selectionRect.y0, p.selectionRect.y1);

  const xScale = createTimeScale(p.startTime, p.endTime, 0, chartWidth, true);

  const padding = TOPIC_BAND_PADDING;
  const step = p.rowHeight;
  const bandwidth = step * (1 - padding);
  const gap = step - bandwidth;

  const layouts = computeTopicLayout(p.topics, p.margin.left, p.rowHeight);
  const selected: GanttEditorSlotWithUiAttributes[] = [];

  for (const layout of layouts) {
    const topic = layout.topic;
    topic.rows.forEach((row, rowIndex) => {
      const rowTop = layout.rowYs[rowIndex];
      if (rowTop === undefined) return;

      const slots = row.slots;
      const i0 = firstSlotIndexCloseAfter(slots, p.startTime);
      for (let i = i0; i < slots.length; i++) {
        const slot = slots[i]!;
        if (slot.openTime >= p.endTime) break;
        if (p.excludeReadOnly && slot.readOnly) continue;

        const def = computeSlotRect(
          slot,
          xScale,
          chartWidth,
          p.margin.left,
          rowTop,
          bandwidth,
          gap,
          topic.isCollapsed,
        );
        if (!def) continue;

        const slotRight = def.x + def.width;
        const slotBottom = def.y + def.height;
        if (x0 <= def.x && slotRight <= x1 && y0 <= def.y && slotBottom <= y1) {
          selected.push(slot);
        }
      }
    });
  }

  return selected;
}

// ---------------------------------------------------------------------------
// Slot position index – pre-computed pixel bounds per slot for fast selection
// ---------------------------------------------------------------------------

export interface SlotPositionEntry {
  slotId: string;
  slot: GanttEditorSlotWithUiAttributes;
  /** Canvas-local left edge (margin included). */
  x: number;
  /** Content-space top edge (scroll offset not applied). */
  y: number;
  /** Canvas-local right edge (margin included). */
  x2: number;
  /** Content-space bottom edge. */
  y2: number;
}

export interface BuildSlotPositionIndexParams {
  topics: Topic[];
  margin: { left: number; right: number };
  width: number;
  rowHeight: number;
  startTime: Date;
  endTime: Date;
  excludeReadOnly?: boolean;
}

/**
 * Pre-computes pixel bounds for every slot in all topics/rows.
 * Cache the result per group (keyed by width / time-range / rowHeight / data-fingerprint)
 * and pass to {@link collectSlotsFromIndexInRect} to avoid rebuilding geometry on every
 * brush-selection mouseup.
 */
export function buildSlotPositionIndex(
  p: BuildSlotPositionIndexParams,
): SlotPositionEntry[] {
  const chartWidth = p.width - p.margin.left - p.margin.right;
  if (chartWidth <= 0) return [];

  const xScale = createTimeScale(p.startTime, p.endTime, 0, chartWidth, true);
  const [domainStart, domainEnd] = xScale.domain();

  const padding = TOPIC_BAND_PADDING;
  const step = p.rowHeight;
  const bandwidth = step * (1 - padding);

  const layouts = computeTopicLayout(p.topics, p.margin.left, p.rowHeight);
  const entries: SlotPositionEntry[] = [];

  for (const layout of layouts) {
    const topic = layout.topic;
    topic.rows.forEach((row, rowIndex) => {
      const rowTop = layout.rowYs[rowIndex];
      if (rowTop === undefined) return;
      const rowBottom = rowTop + bandwidth;

      for (const slot of row.slots) {
        if (p.excludeReadOnly && slot.readOnly) continue;

        const isStartInView = slot.openTime >= domainStart && slot.openTime <= domainEnd;
        const isEndInView = slot.closeTime >= domainStart && slot.closeTime <= domainEnd;
        const x = p.margin.left + (isStartInView ? xScale(slot.openTime) : 0);
        const x2 = p.margin.left + (isEndInView ? xScale(slot.closeTime) : chartWidth);
        if (x2 - x <= 0) continue;

        entries.push({ slotId: slot.id, slot, x, y: rowTop, x2, y2: rowBottom });
      }
    });
  }

  return entries;
}

/**
 * Returns all slots from a pre-built position index whose pixel bounds are fully
 * contained in the given selection rectangle (content-space Y coordinates).
 */
export function collectSlotsFromIndexInRect(
  entries: SlotPositionEntry[],
  selectionRect: { x0: number; y0: number; x1: number; y1: number },
): GanttEditorSlotWithUiAttributes[] {
  const x0 = Math.min(selectionRect.x0, selectionRect.x1);
  const y0 = Math.min(selectionRect.y0, selectionRect.y1);
  const x1 = Math.max(selectionRect.x0, selectionRect.x1);
  const y1 = Math.max(selectionRect.y0, selectionRect.y1);

  const selected: GanttEditorSlotWithUiAttributes[] = [];
  for (const entry of entries) {
    if (x0 <= entry.x && entry.x2 <= x1 && y0 <= entry.y && entry.y2 <= y1) {
      selected.push(entry.slot);
    }
  }
  return selected;
}

/**
 * Final open/close after a resize drag (inner-chart geometry, same as SVG `dragLeftRightEnd`).
 */
export function slotTimesAfterResizeDrag(
  edge: SlotResizeEdge,
  dxPx: number,
  displayInnerLeft: number,
  displayInnerWidth: number,
  chartWidth: number,
  xScale: TimeScale,
): { openTime: Date; closeTime: Date } {
  if (edge === "left") {
    const newInnerLeft = Math.min(
      displayInnerLeft + displayInnerWidth - SLOT_MIN_INNER_WIDTH_PX,
      displayInnerLeft + dxPx,
    );
    const newInnerRight = displayInnerLeft + displayInnerWidth;
    return {
      openTime: xScale.invert(newInnerLeft),
      closeTime: xScale.invert(newInnerRight),
    };
  }
  const newInnerWidth = Math.max(
    SLOT_MIN_INNER_WIDTH_PX,
    Math.min(chartWidth - displayInnerLeft, displayInnerWidth + dxPx),
  );
  const newInnerRight = displayInnerLeft + newInnerWidth;
  return {
    openTime: xScale.invert(displayInnerLeft),
    closeTime: xScale.invert(newInnerRight),
  };
}

/** Build scale from visible range and return {@link slotTimesAfterResizeDrag}. */
export function slotTimesForResizeDragStep(
  edge: SlotResizeEdge,
  dxPx: number,
  displayInnerLeft: number,
  displayInnerWidth: number,
  chartWidth: number,
  startTime: Date,
  endTime: Date,
): { openTime: Date; closeTime: Date } {
  const xScale = createTimeScale(startTime, endTime, 0, chartWidth, true);
  return slotTimesAfterResizeDrag(
    edge,
    dxPx,
    displayInnerLeft,
    displayInnerWidth,
    chartWidth,
    xScale,
  );
}
