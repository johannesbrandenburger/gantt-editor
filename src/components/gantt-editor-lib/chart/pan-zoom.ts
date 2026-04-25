export type WheelZoomMode = "preserve-aspect" | "time-only";

/** Passed on wheel zoom commit so the chart can keep content stable under the cursor while row height updates. */
export type WheelZoomAnchor = {
  clientX: number;
  clientY: number;
  /** Cursor position in chart-canvas local CSS pixels (avoids an extra layout read downstream). */
  localX?: number;
  localY?: number;
  mode: WheelZoomMode;
};

export interface PanZoomCallbacks {
  /**
   * Immediate re-render with new time range (no parent emit).
   * Pass `wheelZoomAnchor` for modifier+wheel zoom so row height tracks the time scale under the cursor.
   */
  onTimeRangeChange: (
    start: Date,
    end: Date,
    wheelZoomAnchor?: WheelZoomAnchor,
  ) => void;
  /**
   * Sync visible range to the parent after a gesture settles (debounced wheel, end of drag-pan).
   * Local time/row state is already applied via {@link onTimeRangeChange}.
   */
  onTimeRangeCommit: (start: Date, end: Date, wheelZoomAnchor?: WheelZoomAnchor) => void;
  /** Returns the current visible time range. */
  getCurrentTimeRange: () => { start: Date; end: Date };
  /** Returns chart width excluding margins. */
  getChartWidth: () => number;
  /** Left margin (label area). */
  marginLeft: number;
  /** Returns whether time-axis zoom (modifier+wheel) is currently enabled. */
  isZoomEnabled: () => boolean;
  /**
   * Optional fixed time (ms) to use as zoom anchor instead of the mouse position.
   * When provided, the chart zooms around this timestamp regardless of cursor location.
   */
  getFixedZoomAnchorTimeMs?: () => number | null;
  /**
   * Selects how modifier+wheel zoom should update chart geometry at a canvas-local point.
   * Defaults to preserving slot aspect ratio for existing callers.
   */
  getWheelZoomMode?: (localX: number, localY: number) => WheelZoomMode;
}

export interface PanZoomCleanup {
  destroy: () => void;
}

/** One modifier+wheel step on the unified time scale (~4% per tick). Row height is derived from visible span and chart width in the chart component. */
const ZOOM_WHEEL_STEP = 1.04;

/**
 * Maximum visible time span when zooming out with modifier+wheel (ms).
 * Default ~6 months; raise for wider views (rows shrink until the chart hits its min row height clamp).
 */
export const MAX_WHEEL_VISIBLE_TIME_RANGE_MS = 180 * 24 * 60 * 60 * 1000;

/** Rough line height when wheel `deltaMode` is DOM_DELTA_LINE. */
const WHEEL_LINE_HEIGHT_PX = 32;

/**
 * Maps horizontal wheel delta to a time shift so panning stays ~constant in screen pixels
 * regardless of zoom (visible time span).
 */
function horizontalWheelDeltaToMs(
  deltaX: number,
  deltaMode: number,
  timeRangeMs: number,
  chartWidth: number,
): number {
  if (chartWidth <= 0 || timeRangeMs <= 0) return 0;

  let deltaPx = deltaX;
  if (deltaMode === WheelEvent.DOM_DELTA_LINE) {
    deltaPx *= WHEEL_LINE_HEIGHT_PX;
  } else if (deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    deltaPx *= chartWidth;
  }

  return (deltaPx * timeRangeMs) / chartWidth;
}

/** Translate horizontal drag pixels into a time-domain shift for the current visible range. */
function dragDeltaPxToMs(dxPx: number, chartWidth: number, startMs: number, endMs: number): number {
  if (chartWidth <= 0) return 0;
  return (dxPx * (endMs - startMs)) / chartWidth;
}

let sharedScrollTimeout: ReturnType<typeof setTimeout> | null = null;

function scheduleTimeRangeParentCommit(
  callbacks: PanZoomCallbacks,
  delayMs: number,
  wheelZoomAnchor?: WheelZoomAnchor,
): void {
  if (sharedScrollTimeout) clearTimeout(sharedScrollTimeout);
  sharedScrollTimeout = setTimeout(() => {
    const { start, end } = callbacks.getCurrentTimeRange();
    callbacks.onTimeRangeCommit(start, end, wheelZoomAnchor);
    sharedScrollTimeout = null;
  }, delayMs);
}

/**
 * Horizontal trackpad pan or modifier+wheel zoom. Returns true if the event was consumed.
 * Vertical scrolling is handled by the caller (e.g. per-group scroll on the unified canvas).
 */
export function handlePanZoomWheelEvent(
  event: WheelEvent,
  chartElement: HTMLElement,
  callbacks: PanZoomCallbacks,
): boolean {
  const { start, end } = callbacks.getCurrentTimeRange();
  const startMs = start.getTime();
  const endMs = end.getTime();
  const timeRangeMs = endMs - startMs;

  if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
    event.preventDefault();
    event.stopPropagation();

    const chartWidth = callbacks.getChartWidth();
    const panMs = horizontalWheelDeltaToMs(
      event.deltaX,
      event.deltaMode,
      timeRangeMs,
      chartWidth,
    );
    const newStart = new Date(startMs + panMs);
    const newEnd = new Date(endMs + panMs);

    callbacks.onTimeRangeChange(newStart, newEnd);
    scheduleTimeRangeParentCommit(callbacks, 150);
    return true;
  }

  const shouldZoom = event.ctrlKey || event.shiftKey || event.altKey;
  if (!shouldZoom) return false;
  if (!callbacks.isZoomEnabled()) {
    // On trackpads, pinch emits ctrl+wheel; consume it to avoid browser/page zoom.
    if (event.ctrlKey) {
      event.preventDefault();
      event.stopPropagation();
      return true;
    }
    return false;
  }
  if (timeRangeMs <= 0) return false;

  event.preventDefault();

  const chartWidth = callbacks.getChartWidth();
  if (chartWidth <= 0) return false;

  const rect = chartElement.getBoundingClientRect();
  const localX = event.clientX - rect.left;
  const localY = event.clientY - rect.top;

  const fixedAnchorMs = callbacks.getFixedZoomAnchorTimeMs?.() ?? null;
  let mouseOffset: number;
  let mouseTimeMs: number;
  if (fixedAnchorMs !== null) {
    mouseTimeMs = fixedAnchorMs;
    mouseOffset = timeRangeMs > 0 ? (mouseTimeMs - startMs) / timeRangeMs : 0.5;
    mouseOffset = Math.max(0, Math.min(1, mouseOffset));
  } else {
    const rawMouseX = localX - callbacks.marginLeft;
    const mouseX =
      chartWidth > 0 ? Math.max(0, Math.min(chartWidth, rawMouseX)) : rawMouseX;
    mouseOffset = chartWidth > 0 ? mouseX / chartWidth : 0;
    mouseTimeMs = startMs + timeRangeMs * mouseOffset;
  }

  const timeZoomFactor =
    event.deltaY > 0 ? ZOOM_WHEEL_STEP : 1 / ZOOM_WHEEL_STEP;

  const newTimeRange = timeRangeMs * timeZoomFactor;
  const constrainedTimeRange = Math.min(newTimeRange, MAX_WHEEL_VISIBLE_TIME_RANGE_MS);

  const newStart = new Date(mouseTimeMs - constrainedTimeRange * mouseOffset);
  const newEnd = new Date(newStart.getTime() + constrainedTimeRange);

  const wheelZoomAnchor: WheelZoomAnchor = {
    clientX: event.clientX,
    clientY: event.clientY,
    localX,
    localY,
    mode: callbacks.getWheelZoomMode?.(localX, localY) ?? "preserve-aspect",
  };

  callbacks.onTimeRangeChange(newStart, newEnd, wheelZoomAnchor);
  scheduleTimeRangeParentCommit(callbacks, 150, wheelZoomAnchor);
  return true;
}

/**
 * Middle-click, right-click, or shift-drag time pan. Wheel is not attached here — use {@link handlePanZoomWheelEvent}
 * on the chart canvas together with vertical scroll routing.
 */
export function setupCanvasPanZoom(
  chartElement: HTMLElement,
  callbacks: PanZoomCallbacks,
): PanZoomCleanup {
  let isPanning = false;
  let startPanX = 0;
  let originalStart: Date;
  let originalEnd: Date;

  const onMouseDown = (event: MouseEvent) => {
    const isMiddleButton = event.button === 1;
    const isRightButton = event.button === 2;
    const isShiftDrag = event.shiftKey;
    if (!isMiddleButton && !isRightButton && !isShiftDrag) return;
    event.preventDefault();

    isPanning = true;
    startPanX = event.clientX;
    const { start, end } = callbacks.getCurrentTimeRange();
    originalStart = start;
    originalEnd = end;

    document.addEventListener("mousemove", onPanMove);
    document.addEventListener("mouseup", onPanUp);
  };

  const onPanMove = (event: MouseEvent) => {
    if (!isPanning) return;
    const dx = event.clientX - startPanX;
    const chartWidth = callbacks.getChartWidth();
    const originalStartMs = originalStart.getTime();
    const originalEndMs = originalEnd.getTime();
    const timeShiftMs = dragDeltaPxToMs(dx, chartWidth, originalStartMs, originalEndMs);
    const newStart = new Date(originalStartMs - timeShiftMs);
    const newEnd = new Date(originalEndMs - timeShiftMs);

    callbacks.onTimeRangeChange(newStart, newEnd);
  };

  const onPanUp = (event: MouseEvent) => {
    if (!isPanning) return;
    isPanning = false;
    document.removeEventListener("mousemove", onPanMove);
    document.removeEventListener("mouseup", onPanUp);

    if (event.clientX !== startPanX) {
      const dx = event.clientX - startPanX;
      const chartWidth = callbacks.getChartWidth();
      const originalStartMs = originalStart.getTime();
      const originalEndMs = originalEnd.getTime();
      const timeShiftMs = dragDeltaPxToMs(dx, chartWidth, originalStartMs, originalEndMs);
      const newStart = new Date(originalStartMs - timeShiftMs);
      const newEnd = new Date(originalEndMs - timeShiftMs);
      callbacks.onTimeRangeCommit(newStart, newEnd);
    }
  };

  const onContextMenu = (event: Event) => {
    event.preventDefault();
  };

  chartElement.addEventListener("mousedown", onMouseDown);
  chartElement.addEventListener("contextmenu", onContextMenu);

  return {
    destroy() {
      chartElement.removeEventListener("mousedown", onMouseDown);
      chartElement.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("mousemove", onPanMove);
      document.removeEventListener("mouseup", onPanUp);
    },
  };
}

/** Call from the chart component on unmount so debounced wheel commit does not fire after teardown. */
export function clearPanZoomWheelDebounce(): void {
  if (sharedScrollTimeout) clearTimeout(sharedScrollTimeout);
  sharedScrollTimeout = null;
}
