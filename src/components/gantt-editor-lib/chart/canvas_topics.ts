import type { Topic } from "./types";

/** Matches default row height in GanttEditor — fonts/padding scale from this baseline. */
export const TEXT_SCALE_BASE_ROW_HEIGHT = 40;
const TOPIC_HEADER_MAX_FONT_PX = 10;
const TOPIC_HEADER_MIN_FONT_PX = 3;

/** Band padding for topic rows (must match slot band geometry in canvas_slots). Lower = denser rows. */
export const TOPIC_BAND_PADDING = 0.2;

/** Bold label font for topic headers and slot names; scales with row height. */
export function scaledBoldSansFont(rowHeight: number): string {
  const px = Math.round(
    Math.max(1, Math.min(36, (12 * rowHeight) / TEXT_SCALE_BASE_ROW_HEIGHT)),
  );
  return `bold ${px}px sans-serif`;
}

/**
 * Destination/topic headers should remain readable in overview zoom.
 * Keep normal size at default row height while using a higher minimum than slot text.
 */
export function scaledTopicHeaderFont(rowHeight: number): string {
  const px = Math.round(
    Math.max(
      TOPIC_HEADER_MIN_FONT_PX,
      Math.min(TOPIC_HEADER_MAX_FONT_PX, 6 + (6 * rowHeight) / TEXT_SCALE_BASE_ROW_HEIGHT),
    ),
  );
  return `bold ${px}px sans-serif`;
}

function topicHeaderFontSpec(px: number): string {
  return `bold ${Math.round(px)}px sans-serif`;
}

function truncateTextToWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (maxWidth <= 0) return "";
  if (ctx.measureText(text).width <= maxWidth) return text;

  const ellipsis = "...";
  const ellipsisWidth = ctx.measureText(ellipsis).width;
  if (ellipsisWidth > maxWidth) return "";

  let low = 0;
  let high = text.length;
  let best = "";
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = `${text.slice(0, mid)}${ellipsis}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      best = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return best;
}

function fitTopicHeaderFontPx(
  ctx: CanvasRenderingContext2D,
  text: string,
  labelScaleHeight: number,
  maxLabelWidth: number,
): number {
  const unclamped = 6 + (6 * labelScaleHeight) / TEXT_SCALE_BASE_ROW_HEIGHT;
  const basePx = Math.max(
    TOPIC_HEADER_MIN_FONT_PX,
    Math.min(TOPIC_HEADER_MAX_FONT_PX, unclamped),
  );

  ctx.font = topicHeaderFontSpec(basePx);
  const textWidth = ctx.measureText(text).width;
  if (textWidth <= 0 || textWidth <= maxLabelWidth) {
    return basePx;
  }

  const widthFittedPx = (basePx * maxLabelWidth) / textWidth;
  return Math.max(TOPIC_HEADER_MIN_FONT_PX, Math.min(basePx, widthFittedPx));
}

export function scaledLabelInsetX(rowHeight: number): number {
  const scaled = (10 * rowHeight) / TEXT_SCALE_BASE_ROW_HEIGHT;
  return Math.round(Math.max(6, Math.min(10, scaled)));
}

function scaledLabelOffsetY(rowHeight: number): number {
  return Math.round(Math.max(4, Math.min(18, rowHeight / 2)));
}

export interface TopicLayout {
  topic: Topic;
  /** Y position of the horizontal gridline at the top of this topic. */
  gridlineY: number;
  /** Label position. */
  labelX: number;
  labelY: number;
  /** Display text including collapse/inactive indicators. */
  labelText: string;
  isInactive: boolean;
  /** Per-row Y positions (centre of each row band). */
  rowYs: number[];
}

export interface DrawTopicsParams {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  topics: Topic[];
  margin: { left: number; right: number };
  rowHeight: number;
  viewportTop?: number;
  viewportHeight?: number;
  /** When set, skips internal computeTopicLayout (caller computed once per frame). */
  layouts?: TopicLayout[];
  /** When false, topic names in the margin are omitted (dense overview). */
  showTopicHeaderText?: boolean;
  /** Minimum rendered topic height required to draw a topic header label. */
  topicHeaderMinVisibleHeightPx?: number;
}

/**
 * Computes layout positions for all topics/rows in one group.
 * Mirrors the yScale / currentY logic from the SVG update-chart.ts.
 */
export function computeTopicLayout(
  topics: Topic[],
  marginLeft: number,
  rowHeight: number,
): TopicLayout[] {
  // d3.scaleBand equivalent values
  const padding = TOPIC_BAND_PADDING;
  const totalRows = topics.reduce(
    (acc, t) => acc + (t.isCollapsed ? 1 : t.rows.length) + 1, // +1 header row per topic
    0,
  );
  const step = rowHeight; // each row occupies rowHeight pixels
  const bandwidth = step * (1 - padding);
  const gap = step - bandwidth;

  let currentY = 0;
  const layouts: TopicLayout[] = [];

  for (const topic of topics) {
    const gridlineY = currentY;

    const labelX = scaledLabelInsetX(rowHeight);
    const labelY = currentY + scaledLabelOffsetY(step);

    let labelText = "";
    if (topic.isInactive) labelText += "⚠️ ";
    labelText += topic.name;
    labelText += topic.isCollapsed ? " ►" : " ▼";

    const rowYs: number[] = [];

    if (topic.rows.length === 0) {
      currentY += step;
    }

    topic.yStart = gridlineY;
    topic.yEnd = currentY;

    for (const _row of topic.rows) {
      rowYs.push(currentY + gap / 2);
      currentY += step;
      topic.yEnd = currentY;
    }

    layouts.push({
      topic,
      gridlineY,
      labelX,
      labelY,
      labelText,
      isInactive: topic.isInactive,
      rowYs,
    });
  }

  return layouts;
}

/**
 * Scrollable content height for a group — matches the bottom extent of {@link computeTopicLayout}
 * (unified canvas has no per-SVG margin.top/bottom).
 */
export function computeContentHeight(
  topics: Topic[],
  rowHeight: number,
): number {
  if (topics.length === 0) return 0;
  const layouts = computeTopicLayout(topics, 0, rowHeight);
  return layouts[layouts.length - 1]!.topic.yEnd;
}

/**
 * Draws topic gridlines and labels onto a canvas context.
 */
export function drawTopicLines(params: DrawTopicsParams) {
  const {
    ctx,
    width,
    height,
    topics,
    margin,
    rowHeight,
    viewportTop,
    viewportHeight,
    layouts: layoutsIn,
    showTopicHeaderText = true,
    topicHeaderMinVisibleHeightPx = 0,
  } = params;

  const hasViewport = viewportTop !== undefined && viewportHeight !== undefined;

  // Clear — use viewport coordinates when scrolling is active
  if (hasViewport) {
    ctx.clearRect(0, viewportTop, width, viewportHeight);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, viewportTop, width, viewportHeight);
  } else {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }

  const layouts = layoutsIn ?? computeTopicLayout(topics, margin.left, rowHeight);

  // Draw horizontal gridlines (one per topic, full width)
  ctx.save();
  ctx.strokeStyle = "#dee2e6";
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.5;
  for (const layout of layouts) {
    if (hasViewport && (layout.topic.yEnd < viewportTop || layout.topic.yStart > viewportTop + viewportHeight)) continue;
    const y = Math.round(layout.gridlineY) + 0.5; // crisp line
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  // Also draw a closing gridline at the bottom of the last topic
  if (layouts.length > 0) {
    const lastLayout = layouts[layouts.length - 1];
    if (!hasViewport || !(lastLayout.topic.yEnd < viewportTop || lastLayout.topic.yStart > viewportTop + viewportHeight)) {
      const lastY = Math.round(lastLayout.topic.yEnd) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, lastY);
      ctx.lineTo(width, lastY);
      ctx.stroke();
    }
  }
  ctx.restore();

  // Draw topic header labels (bold, in the margin area)
  if (showTopicHeaderText) {
    ctx.save();
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    const maxLabelWidth = Math.max(0, margin.left - scaledLabelInsetX(rowHeight) - 8);
    for (const layout of layouts) {
      if (hasViewport && (layout.topic.yEnd < viewportTop || layout.topic.yStart > viewportTop + viewportHeight)) continue;
      const topicHeight = Math.max(0, layout.topic.yEnd - layout.topic.yStart);
      const effectiveVisibleHeight = Math.max(rowHeight, topicHeight);
      if (effectiveVisibleHeight <= topicHeaderMinVisibleHeightPx) continue;
      const fontPx = fitTopicHeaderFontPx(
        ctx,
        layout.labelText,
        effectiveVisibleHeight,
        maxLabelWidth,
      );
      ctx.font = topicHeaderFontSpec(fontPx);
      const displayLabel = truncateTextToWidth(ctx, layout.labelText, maxLabelWidth);
      if (!displayLabel) continue;
      const minLabelY = layout.topic.yStart + fontPx / 2 + 1;
      const preferredLabelY = layout.topic.yStart + fontPx / 2 + 4;
      const maxLabelY = Math.max(minLabelY, layout.topic.yEnd - fontPx / 2 - 1);
      const labelY = Math.min(maxLabelY, preferredLabelY);
      ctx.fillStyle = layout.isInactive ? "red" : "black";
      ctx.fillText(displayLabel, layout.labelX, labelY);
    }
    ctx.restore();
  }
}
