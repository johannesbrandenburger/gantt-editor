import type { GanttEditorDestinationGroup } from "./types";

export const DEFAULT_RESIZE_HANDLE_PX = 3;

export type AxisRect = { y: number; h: number };
export type GroupRect = { y: number; h: number };
export type ResizeBandRect = {
  y: number;
  h: number;
  kind: "top" | "between";
  /** For `between`: lower group id (pair boundary). */
  groupIdAbove: string | null;
  groupIdBelow: string | null;
};

export type UnifiedChartLayout = {
  canvasCssWidth: number;
  canvasCssHeight: number;
  totalContentHeight: number;
  currentTopContentHeight: number;
  outerComponentHeight: number;
  /** Height of each destination group viewport (same as legacy heightMap). */
  groupHeights: Map<string, number>;
  axisRect: AxisRect;
  /** Top-of-chart resize (only when top slot is used). */
  topResizeRect: ResizeBandRect | null;
  /** Between destination groups, in order. */
  betweenGroupResizeRects: ResizeBandRect[];
  groupRects: Map<string, GroupRect>;
};

export type ChartHit =
  | { type: "topResize" }
  | { type: "betweenResize"; groupIdAbove: string; groupIdBelow: string }
  | { type: "axis" }
  | { type: "group"; groupId: string }
  | { type: "none" };

export function computeTotalContentHeight(
  containerHeight: number,
  destinationGroupCount: number,
  hasTopSlot: boolean,
  resizeHandlePx: number,
): number {
  return (
    containerHeight -
    resizeHandlePx * Math.max(0, destinationGroupCount - 1) -
    (hasTopSlot ? resizeHandlePx : 0)
  );
}

/**
 * Layout for a single chart canvas placed below the optional top-content slot.
 * Y increases downward; origin is the top-left of the canvas.
 */
export function computeUnifiedChartLayout(params: {
  containerWidth: number;
  containerHeight: number;
  destinationGroups: GanttEditorDestinationGroup[];
  heightPortions: Map<string, number>;
  topContentPortion: number;
  xAxisHeight: number;
  resizeHandlePx: number;
}): UnifiedChartLayout {
  const {
    containerWidth,
    containerHeight,
    destinationGroups,
    heightPortions,
    topContentPortion,
    xAxisHeight,
    resizeHandlePx,
  } = params;

  const hasTopSlot = topContentPortion > 0;
  const totalContentHeight = computeTotalContentHeight(
    containerHeight,
    destinationGroups.length,
    hasTopSlot,
    resizeHandlePx,
  );

  const currentTopContentHeight = totalContentHeight * topContentPortion;
  const outerComponentHeight =
    totalContentHeight * (1 - topContentPortion) - xAxisHeight;

  const canvasCssWidth = containerWidth;
  const canvasCssHeight = hasTopSlot
    ? containerHeight - currentTopContentHeight
    : containerHeight;

  const groupHeights = new Map<string, number>();
  destinationGroups.forEach((g) => {
    groupHeights.set(g.id, outerComponentHeight * (heightPortions.get(g.id) ?? 0));
  });

  let y = 0;
  let topResizeRect: ResizeBandRect | null = null;
  if (hasTopSlot) {
    topResizeRect = {
      y,
      h: resizeHandlePx,
      kind: "top",
      groupIdAbove: null,
      groupIdBelow: null,
    };
    y += resizeHandlePx;
  }

  const axisY = y;
  y += xAxisHeight;

  const groupRects = new Map<string, GroupRect>();
  const betweenGroupResizeRects: ResizeBandRect[] = [];

  destinationGroups.forEach((group, index) => {
    const h = groupHeights.get(group.id) ?? 0;
    groupRects.set(group.id, { y, h });
    y += h;
    if (index < destinationGroups.length - 1) {
      const next = destinationGroups[index + 1];
      betweenGroupResizeRects.push({
        y,
        h: resizeHandlePx,
        kind: "between",
        groupIdAbove: group.id,
        groupIdBelow: next.id,
      });
      y += resizeHandlePx;
    }
  });

  return {
    canvasCssWidth,
    canvasCssHeight,
    totalContentHeight,
    currentTopContentHeight,
    outerComponentHeight,
    groupHeights,
    axisRect: { y: axisY, h: xAxisHeight },
    topResizeRect,
    betweenGroupResizeRects,
    groupRects,
  };
}

function pointInRect(px: number, py: number, r: { y: number; h: number }): boolean {
  return py >= r.y && py < r.y + r.h;
}

/**
 * Hit-test in canvas CSS pixel space (same coords as layout rects).
 */
export function hitTestChart(
  layout: UnifiedChartLayout,
  canvasLocalX: number,
  canvasLocalY: number,
): ChartHit {
  if (canvasLocalY < 0 || canvasLocalX < 0) return { type: "none" };

  if (layout.topResizeRect && pointInRect(canvasLocalX, canvasLocalY, layout.topResizeRect)) {
    return { type: "topResize" };
  }

  for (const band of layout.betweenGroupResizeRects) {
    if (pointInRect(canvasLocalX, canvasLocalY, band)) {
      if (band.groupIdAbove && band.groupIdBelow) {
        return {
          type: "betweenResize",
          groupIdAbove: band.groupIdAbove,
          groupIdBelow: band.groupIdBelow,
        };
      }
    }
  }

  if (pointInRect(canvasLocalX, canvasLocalY, layout.axisRect)) {
    return { type: "axis" };
  }

  const groupIds = Array.from(layout.groupRects.keys());
  for (let i = 0; i < groupIds.length; i++) {
    const groupId = groupIds[i]!;
    const rect = layout.groupRects.get(groupId)!;
    if (pointInRect(canvasLocalX, canvasLocalY, rect)) {
      return { type: "group", groupId };
    }
  }

  return { type: "none" };
}

export function canvasLocalPoint(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const r = canvas.getBoundingClientRect();
  return {
    x: clientX - r.left,
    y: clientY - r.top,
  };
}

/** Mouse Y relative to the top of a group's viewport (0..rect.h). */
export function anchorYInGroupViewport(
  layout: UnifiedChartLayout,
  groupId: string,
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement,
): number {
  const { y } = canvasLocalPoint(canvas, clientX, clientY);
  const gr = layout.groupRects.get(groupId);
  if (!gr || gr.h <= 0) return 0;
  return Math.max(0, Math.min(gr.h, y - gr.y));
}

export const RESIZE_HANDLE_COLORS = {
  idle: "#e0e0e0",
  hover: "#3700ff",
  active: "#6200ee",
} as const;

export function drawResizeBands(
  ctx: CanvasRenderingContext2D,
  layout: UnifiedChartLayout,
  /** `"top"`, `"between:<groupIdAbove>"`, or null */
  hoverBand: string | null,
): void {
  const drawBand = (r: { y: number; h: number }, hot: boolean) => {
    ctx.fillStyle = hot ? RESIZE_HANDLE_COLORS.hover : RESIZE_HANDLE_COLORS.idle;
    ctx.fillRect(0, r.y, layout.canvasCssWidth, r.h);
  };

  if (layout.topResizeRect) {
    const hot = hoverBand === "top";
    drawBand(layout.topResizeRect, hot);
  }

  for (const band of layout.betweenGroupResizeRects) {
    const key =
      band.groupIdAbove && band.groupIdBelow
        ? (`between:${band.groupIdAbove}` as const)
        : null;
    const hot = key !== null && hoverBand === key;
    drawBand(band, hot);
  }
}
