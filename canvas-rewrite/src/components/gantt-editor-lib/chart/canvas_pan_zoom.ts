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
}

export interface PanZoomCleanup {
  destroy: () => void;
}

/**
 * Attaches horizontal scroll (trackpad swipe), right-click drag panning,
 * and pinch/shift-wheel zoom to a container element.
 * Mirrors the SVG version's setup-pan-zoom.ts behaviour.
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
      const newStart = new Date(start.getTime() + event.deltaX * 50000);
      const newEnd = new Date(end.getTime() + event.deltaX * 50000);

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

    // Zoom: pinch (ctrlKey) on trackpad, or shift+wheel on mouse
    const isTrackpad = Math.abs(event.deltaY) < 100 && event.deltaY % 1 !== 0;
    const shouldZoom = (isTrackpad && event.ctrlKey) || (!isTrackpad && event.shiftKey);
    if (!shouldZoom) return;

    event.preventDefault();

    const { start, end } = callbacks.getCurrentTimeRange();
    const chartWidth = callbacks.getChartWidth();

    const mouseX = event.clientX - container.getBoundingClientRect().left - callbacks.marginLeft;

    const scale = d3.scaleTime()
      .domain([start, end])
      .range([0, chartWidth]);
    const mouseTime = scale.invert(mouseX);

    const zoomFactor = event.deltaY > 0 ? 1.1 : 0.9;
    const timeRange = end.getTime() - start.getTime();
    const mouseOffset = (mouseTime.getTime() - start.getTime()) / timeRange;

    const newTimeRange = timeRange * zoomFactor;
    const maxTimeRange = 4 * 24 * 60 * 60 * 1000;
    const constrainedTimeRange = Math.min(newTimeRange, maxTimeRange);

    const newStart = new Date(mouseTime.getTime() - constrainedTimeRange * mouseOffset);
    const newEnd = new Date(newStart.getTime() + constrainedTimeRange);

    callbacks.onTimeRangeCommit(newStart, newEnd);
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
