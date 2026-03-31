import type { Topic } from "./types";

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
  const padding = 0.3;
  const totalRows = topics.reduce(
    (acc, t) => acc + (t.isCollapsed ? 1 : t.rows.length) + 1, // +1 header row per topic
    0,
  );
  const step = rowHeight; // each row occupies rowHeight pixels
  const bandwidth = step * (1 - padding);
  const gap = step - bandwidth;

  let currentY = 15; // initial offset (matches SVG version)
  const layouts: TopicLayout[] = [];

  for (const topic of topics) {
    const gridlineY = currentY;

    const labelX = 10; // absolute x (marginLeft area)
    const labelY = currentY + step - bandwidth / 2;

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
 * Computes the total content height for a set of topics.
 * Matches the SVG version: rowHeight * totalRows + margin.top + margin.bottom.
 */
export function computeContentHeight(
  topics: Topic[],
  rowHeight: number,
): number {
  const totalRows = topics.reduce(
    (acc, t) => acc + (t.isCollapsed ? 1 : t.rows.length) + 1,
    0,
  );
  return rowHeight * totalRows + 40 + 40;
}

/**
 * Draws topic gridlines and labels onto a canvas context.
 */
export function drawTopicLines(params: DrawTopicsParams) {
  const { ctx, width, height, topics, margin, rowHeight, viewportTop, viewportHeight } = params;

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

  const layouts = computeTopicLayout(topics, margin.left, rowHeight);

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
  ctx.save();
  ctx.font = "bold 12px sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  for (const layout of layouts) {
    if (hasViewport && (layout.topic.yEnd < viewportTop || layout.topic.yStart > viewportTop + viewportHeight)) continue;
    ctx.fillStyle = layout.isInactive ? "red" : "black";
    ctx.fillText(layout.labelText, layout.labelX, layout.labelY);
  }
  ctx.restore();
}
