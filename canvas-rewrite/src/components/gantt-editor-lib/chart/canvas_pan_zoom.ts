import * as d3 from "d3";

export interface PanZoomCallbacks {
  /** Immediate re-render with new time range (no data fetch). */
  onTimeRangeChange: (start: Date, end: Date) => void;
  /** Final commit after scroll/drag ends — triggers data fetch via parent emit. */
  onTimeRangeCommit: (start: Date, end: Date) => void;
  /** Returns the current visible time range. */
  getCurrentTimeRange: () => { start: Date; end: Date };
  /** Returns chart width excluding margins. */
  getChartWidth: () => number;
  /** Left margin (label area). */
  marginLeft: number;
  /**
   * Applied together with wheel zoom so time span and row height scale like a single map:
   * zoom in → shorter visible range, taller rows; zoom out → the inverse.
   * Anchor is viewport coordinates so vertical scroll can stay fixed under the cursor.
   */
  applyRowHeightZoomFactor: (
    factor: number,
    anchor: { clientX: number; clientY: number },
  ) => void;
}

export interface PanZoomCleanup {
  destroy: () => void;
}

/** One modifier+wheel “step”: zoom out multiplies visible time span by this; zoom in uses the reciprocal. Row height uses the inverse so both axes stay matched (~4% per tick vs the old ~10%). */
const ZOOM_WHEEL_STEP = 1.04;

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

/**
 * Attaches horizontal scroll (trackpad swipe), right-click drag panning,
 * and modifier+wheel zoom (ctrl/shift/alt) to a container element.
 * Wheel zoom updates the visible time range and row height together (uniform scale).
 */
export function setupCanvasPanZoom(
  container: HTMLElement,
  callbacks: PanZoomCallbacks,
): PanZoomCleanup {
  let isPanning = false;
  let startPanX = 0;
  let originalStart: Date;
  let originalEnd: Date;
  let scrollTimeout: ReturnType<typeof setTimeout> | null = null;
  let lastScrollDates: { start: Date; end: Date } | null = null;

  // ── Wheel: horizontal scroll + zoom ──────────────────────────
  const onWheel = (event: WheelEvent) => {
    // Horizontal trackpad swipe
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
      event.preventDefault();
      event.stopPropagation();

      const { start, end } = callbacks.getCurrentTimeRange();
      const chartWidth = callbacks.getChartWidth();
      const timeRangeMs = end.getTime() - start.getTime();
      const panMs = horizontalWheelDeltaToMs(
        event.deltaX,
        event.deltaMode,
        timeRangeMs,
        chartWidth,
      );
      const newStart = new Date(start.getTime() + panMs);
      const newEnd = new Date(end.getTime() + panMs);

      lastScrollDates = { start: newStart, end: newEnd };
      callbacks.onTimeRangeChange(newStart, newEnd);

      if (scrollTimeout) clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        if (lastScrollDates) {
          callbacks.onTimeRangeCommit(lastScrollDates.start, lastScrollDates.end);
          lastScrollDates = null;
        }
        scrollTimeout = null;
      }, 150);
      return;
    }

    // Uniform zoom: modifier + wheel (same gesture as before on the time axis, plus row height)
    const shouldZoom = event.ctrlKey || event.shiftKey || event.altKey;
    if (!shouldZoom) return;

    event.preventDefault();

    const { start, end } = callbacks.getCurrentTimeRange();
    const chartWidth = callbacks.getChartWidth();

    const rawMouseX =
      event.clientX - container.getBoundingClientRect().left - callbacks.marginLeft;
    const mouseX =
      chartWidth > 0 ? Math.max(0, Math.min(chartWidth, rawMouseX)) : rawMouseX;

    const scale = d3.scaleTime()
      .domain([start, end])
      .range([0, chartWidth]);
    const mouseTime = scale.invert(mouseX);

    const timeZoomFactor =
      event.deltaY > 0 ? ZOOM_WHEEL_STEP : 1 / ZOOM_WHEEL_STEP;
    const rowZoomFactor =
      event.deltaY > 0 ? 1 / ZOOM_WHEEL_STEP : ZOOM_WHEEL_STEP;
    const timeRange = end.getTime() - start.getTime();
    const mouseOffset = (mouseTime.getTime() - start.getTime()) / timeRange;

    const newTimeRange = timeRange * timeZoomFactor;
    const maxTimeRange = 4 * 24 * 60 * 60 * 1000;
    const constrainedTimeRange = Math.min(newTimeRange, maxTimeRange);

    const newStart = new Date(mouseTime.getTime() - constrainedTimeRange * mouseOffset);
    const newEnd = new Date(newStart.getTime() + constrainedTimeRange);

    callbacks.onTimeRangeCommit(newStart, newEnd);
    callbacks.applyRowHeightZoomFactor(rowZoomFactor, {
      clientX: event.clientX,
      clientY: event.clientY,
    });
  };

  // ── Right-click / shift-drag pan ────────────────────────────
  const onMouseDown = (event: MouseEvent) => {
    if (event.button !== 2 && !event.shiftKey) return;
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
    const scale = d3.scaleTime()
      .domain([originalStart, originalEnd])
      .range([0, chartWidth]);

    const timeShift = scale.invert(dx).getTime() - scale.invert(0).getTime();
    const newStart = new Date(originalStart.getTime() - timeShift);
    const newEnd = new Date(originalEnd.getTime() - timeShift);

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
      const scale = d3.scaleTime()
        .domain([originalStart, originalEnd])
        .range([0, chartWidth]);

      const timeShift = scale.invert(dx).getTime() - scale.invert(0).getTime();
      const newStart = new Date(originalStart.getTime() - timeShift);
      const newEnd = new Date(originalEnd.getTime() - timeShift);
      callbacks.onTimeRangeCommit(newStart, newEnd);
    }
  };

  const onContextMenu = (event: Event) => {
    event.preventDefault();
  };

  // ── Attach ──────────────────────────────────────────────────
  container.addEventListener("wheel", onWheel, { passive: false });
  container.addEventListener("mousedown", onMouseDown);
  container.addEventListener("contextmenu", onContextMenu);

  return {
    destroy() {
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("mousedown", onMouseDown);
      container.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("mousemove", onPanMove);
      document.removeEventListener("mouseup", onPanUp);
      if (scrollTimeout) clearTimeout(scrollTimeout);
    },
  };
}
