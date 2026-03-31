<template>
  <div
    ref="chartContainerRef"
    class="chart-container"
    @mousemove="onContainerMouseMove"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
  >

    <div
      v-if="$slots['top-content'] || topContentPortion"
      class="top-content-container"
      :style="{ height: currentTopContentHeight + 'px' }"
    >
      <slot name="top-content"></slot>
    </div>

    <div class="chart-canvas-wrap">
      <canvas
        ref="chartCanvasRef"
        class="chart-canvas"
        @mousedown="onCanvasMouseDown"
        @mousemove="onChartMouseMove"
        @mouseleave="onChartMouseLeave"
        @wheel="onCanvasWheel"
      ></canvas>
    </div>

    <div
      v-if="clipboardItems.length && showClipboard"
      class="pointer-clipboard"
      :style="{
        top: cursorPosition.y + 15 + 'px',
        left: cursorPosition.x + 15 + 'px'
      }"
    >
      <v-chip
        v-for="(item, index) in clipboardItems"
        :key="index"
        color="primary"
        size="x-small"
        class="m-1"
        prepend-icon="mdi-pin"
      >
        {{ getClipboardItemName(item) }}
      </v-chip>
    </div>
  </div>
</template>


<script setup lang="ts">
import type { GanttEditorDestination, GanttEditorSlot, GanttEditorDestinationGroup, GanttEditorSuggestion, GanttEditorMarkedRegion, GanttEditorXAxisOptions, GanttEditorSlotWithUiAttributes } from "./gantt-editor-lib/chart/types";
import { drawXAxisOnCanvas } from "./gantt-editor-lib/chart/canvas_axis";
import {
  setupCanvasPanZoom,
  handlePanZoomWheelEvent,
  clearPanZoomWheelDebounce,
  type PanZoomCleanup,
  type WheelZoomAnchor,
} from "./gantt-editor-lib/chart/canvas_pan_zoom";
import {
  computeRowHeightForUnifiedZoom,
  SLOT_RENDER_RATIO,
} from "./gantt-editor-lib/chart/canvas_slot_scale";
import { processData } from "./gantt-editor-lib/chart/process-data";
import { drawTopicLines, computeContentHeight } from "./gantt-editor-lib/chart/canvas_topics";
import { drawSlots } from "./gantt-editor-lib/chart/canvas_slots";
import {
  computeUnifiedChartLayout,
  hitTestChart,
  canvasLocalPoint,
  anchorYInGroupViewport,
  drawResizeBands,
  type UnifiedChartLayout,
} from "./gantt-editor-lib/chart/unified_chart_layout";
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from "vue";

interface GanttEditorProps {
  startTime: Date,
  endTime: Date,
  slots: Array<GanttEditorSlotWithUiAttributes>,
  destinations: Array<GanttEditorDestination>,
  destinationGroups: Array<GanttEditorDestinationGroup>,
  suggestions: Array<GanttEditorSuggestion>,
  markedRegion: GanttEditorMarkedRegion | null,
  isReadOnly: boolean,
  topContentPortion?: number,
  xAxisOptions?: GanttEditorXAxisOptions,
  lazyRendering?: boolean
}

interface GanttEditorEmits {
  onChangeStartAndEndTime: [Date, Date],
  onChangeDestinationId: [string, string, boolean],
  onChangeSlotTime: [string, Date, Date],
  onClickOnSlot: [string],
  onHoverOnSlot: [string],
  onDoubleClickOnSlot: [string],
  onContextClickOnSlot: [string],
  onTopContentPortionChange: [number, number]
}

const props = defineProps<GanttEditorProps>();
const emit = defineEmits<GanttEditorEmits>();
const chartContainerRef = ref<HTMLElement | null>(null);
const chartCanvasRef = ref<HTMLCanvasElement | null>(null);
const containerHeight = ref(0);
const containerWidth = ref(0);

const X_AXIS_HEIGHT = 50;
/** Fallback before layout; reconciled from visible time span and chart width. */
const DEFAULT_ROW_HEIGHT = 40;
const MIN_ROW_HEIGHT = 5;
const MAX_ROW_HEIGHT = 120;
const rowHeight = ref<number>(DEFAULT_ROW_HEIGHT);

const internalStartTime = ref(new Date(props.startTime));
const internalEndTime = ref(new Date(props.endTime));
let panZoomCleanup: PanZoomCleanup | null = null;

const currentTopContentPortion = ref(props.topContentPortion || 0);
const isResizingTopContent = ref(false);
const topContentStartY = ref(0);

const isResizing = ref(false);
const resizingElement = ref<string | null>(null);
const startY = ref(0);
const currentHeightPortions = ref<Map<string, number>>(new Map<string, number>());
const verticalScrollOffsets = ref<Map<string, number>>(new Map<string, number>());
props.destinationGroups.forEach((group) => {
  currentHeightPortions.value.set(group.id, group.heightPortion);
  verticalScrollOffsets.value.set(group.id, 0);
});

const chartLayout = computed((): UnifiedChartLayout | null => {
  if (containerWidth.value <= 0 || containerHeight.value <= 0) return null;
  if (props.destinationGroups.length === 0) return null;
  return computeUnifiedChartLayout({
    containerWidth: containerWidth.value,
    containerHeight: containerHeight.value,
    destinationGroups: props.destinationGroups,
    heightPortions: currentHeightPortions.value,
    topContentPortion: currentTopContentPortion.value,
    xAxisHeight: X_AXIS_HEIGHT,
    resizeHandlePx: 3,
  });
});

const totalContentHeight = computed(() => chartLayout.value?.totalContentHeight ?? 0);

const currentTopContentHeight = computed(() => chartLayout.value?.currentTopContentHeight ?? 0);

const outerComponentHeight = computed(() => chartLayout.value?.outerComponentHeight ?? 0);

const heightMap = computed(() => {
  const layout = chartLayout.value;
  if (!layout) return new Map<string, number>();
  return layout.groupHeights;
});

const isInitialized = ref(false);

watch(
  () => currentTopContentHeight.value,
  (newHeight) => {
    if (isInitialized.value) {
      emit("onTopContentPortionChange", currentTopContentPortion.value, newHeight);
    }
  }
);

watch(
  () => props.destinationGroups.map((g) => ({ id: g.id, hp: g.heightPortion })),
  () => {
    const nextH = new Map<string, number>();
    const nextS = new Map<string, number>();
    props.destinationGroups.forEach((g) => {
      nextH.set(g.id, currentHeightPortions.value.get(g.id) ?? g.heightPortion);
      nextS.set(g.id, verticalScrollOffsets.value.get(g.id) ?? 0);
    });
    currentHeightPortions.value = nextH;
    verticalScrollOffsets.value = nextS;
  },
  { deep: true },
);

const startTopContentResize = (e: MouseEvent) => {
  isResizingTopContent.value = true;
  topContentStartY.value = e.clientY;
  document.addEventListener("mousemove", handleTopContentResize);
  document.addEventListener("mouseup", stopTopContentResize);
  e.preventDefault();
};

const handleTopContentResize = (e: MouseEvent) => {
  if (!isResizingTopContent.value) return;
  const th = totalContentHeight.value;
  if (th <= 0) return;
  const deltaY = e.clientY - topContentStartY.value;
  const portionDelta = deltaY / th;
  let newPortion = currentTopContentPortion.value + portionDelta;
  if (newPortion < 0.01) newPortion = 0.01;
  if (newPortion > 0.99) newPortion = 0.99;
  currentTopContentPortion.value = newPortion;
  topContentStartY.value = e.clientY;
  emit("onTopContentPortionChange", newPortion, th * newPortion);
};

const stopTopContentResize = () => {
  isResizingTopContent.value = false;
  document.removeEventListener("mousemove", handleTopContentResize);
  document.removeEventListener("mouseup", stopTopContentResize);
};

const startResize = (e: MouseEvent, element: string) => {
  isResizing.value = true;
  resizingElement.value = element;
  startY.value = e.clientY;
  document.addEventListener("mousemove", handleResize);
  document.addEventListener("mouseup", stopResize);
  e.preventDefault();
};

const handleResize = (e: MouseEvent) => {
  if (!isResizing.value || !resizingElement.value) return;
  const o = outerComponentHeight.value;
  if (o <= 0) return;
  const deltaY = e.clientY - startY.value;
  const minHeightPortion = 0.01;
  const currentIndex = props.destinationGroups.findIndex(group => group.id === resizingElement.value);
  if (currentIndex < 0 || currentIndex >= props.destinationGroups.length - 1) return;

  const nextElement = props.destinationGroups[currentIndex + 1];
  const currentElement = props.destinationGroups[currentIndex];
  const currentPortion = currentHeightPortions.value.get(currentElement.id) || 0;
  const nextPortion = currentHeightPortions.value.get(nextElement.id) || 0;
  const portionDelta = deltaY / o;
  const totalPortion = currentPortion + nextPortion;
  let newCurrentPortion = currentPortion + portionDelta;
  let newNextPortion = nextPortion - portionDelta;

  if (newCurrentPortion < minHeightPortion) {
    newCurrentPortion = minHeightPortion;
    newNextPortion = totalPortion - minHeightPortion;
  } else if (newNextPortion < minHeightPortion) {
    newNextPortion = minHeightPortion;
    newCurrentPortion = totalPortion - minHeightPortion;
  }

  currentHeightPortions.value.set(currentElement.id, newCurrentPortion);
  currentHeightPortions.value.set(nextElement.id, newNextPortion);
  startY.value = e.clientY;
  redraw();
};

const stopResize = () => {
  if (isResizing.value) {
    isResizing.value = false;
    resizingElement.value = null;
    redraw();
  }
  document.removeEventListener("mousemove", handleResize);
  document.removeEventListener("mouseup", stopResize);
};

const cursorPosition = ref({ x: 0, y: 0 });
const showClipboard = ref(false);
const clipboardItems = ref<GanttEditorSlot[]>([]);

const updateClipboard = () => {
  const storedData = localStorage.getItem("pointerClipboard");
  if (!storedData) {
    clipboardItems.value = [];
    return;
  }
  try {
    const parsedData = JSON.parse(storedData) as GanttEditorSlot[];
    clipboardItems.value = parsedData;
  } catch (e) {
    console.error("Error updating clipboard content:", e);
    clipboardItems.value = [];
  }
};

function getClipboardItemName(item: GanttEditorSlot): string {
  return item.displayName;
}

const updateCursorPosition = (e: MouseEvent) => {
  cursorPosition.value = { x: e.clientX, y: e.clientY };
};

const onMouseEnter = () => { showClipboard.value = true; };
const onMouseLeave = () => { showClipboard.value = false; };

const hoverResizeBand = ref<string | null>(null);

function resizeHoverKey(layout: UnifiedChartLayout, clientX: number, clientY: number): string | null {
  const canvas = chartCanvasRef.value;
  if (!canvas) return null;
  const pt = canvasLocalPoint(canvas, clientX, clientY);
  const hit = hitTestChart(layout, pt.x, pt.y);
  if (hit.type === "topResize") return "top";
  if (hit.type === "betweenResize") return `between:${hit.groupIdAbove}`;
  return null;
}

const onContainerMouseMove = (e: MouseEvent) => {
  updateCursorPosition(e);
};

const onChartMouseMove = (e: MouseEvent) => {
  updateCursorPosition(e);
  const layout = chartLayout.value;
  const canvas = chartCanvasRef.value;
  if (!layout || !canvas) return;
  const nextHover = resizeHoverKey(layout, e.clientX, e.clientY);
  if (nextHover !== hoverResizeBand.value) {
    hoverResizeBand.value = nextHover;
    redraw();
  } else {
    hoverResizeBand.value = nextHover;
  }
  const pt = canvasLocalPoint(canvas, e.clientX, e.clientY);
  const hit = hitTestChart(layout, pt.x, pt.y);
  if (hit.type === "topResize" || hit.type === "betweenResize") {
    canvas.style.cursor = "ns-resize";
  } else {
    canvas.style.cursor = "";
  }
};

const onChartMouseLeave = () => {
  hoverResizeBand.value = null;
  const canvas = chartCanvasRef.value;
  if (canvas) canvas.style.cursor = "";
};

const clearClipboard = () => {
  localStorage.setItem("pointerClipboard", "[]");
  updateClipboard();
  props.slots.forEach(slot => { slot.isCopied = false; });
};

let resizeObserver: ResizeObserver | null = null;

const setupCanvas = (canvas: HTMLCanvasElement, width: number, height: number) => {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = width + "px";
  canvas.style.height = height + "px";
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  return ctx;
};

const MARGIN = { left: 200, right: 60 };

// processData only uses slots, destinations, and settings.compactView; it does not use the view
// time range or row height. Omitting those reactive deps keeps pan/zoom from re-running O(n) work
// (row assignment + conflict detection) on every wheel tick.
const PROCESS_DATA_VIEW_PLACEHOLDER_START = new Date(0);
const PROCESS_DATA_VIEW_PLACEHOLDER_END = new Date(86400000);

const processedTopics = computed(() => {
  const { processedData_ } = processData(
    props.slots,
    props.destinations,
    PROCESS_DATA_VIEW_PLACEHOLDER_START,
    PROCESS_DATA_VIEW_PLACEHOLDER_END,
    {
      groupBy: "destinationId",
      rowHeight: 0,
      progressChartsDisplay: "None",
      collapseGroups: false,
      editable: !props.isReadOnly,
      compactView: false,
      sortInFrontend: "None",
      slotLimit: 0,
      overlayWeeks: 0,
      overlayDays: 0,
      seperateByClasses: false,
      showSlotState: false,
      showEventDots: false,
      showDeparture: null,
      showEventCharts: false,
      showBagStateCharts: false,
      showCheckInCharts: false,
      showTransferCharts: false,
      showBagStateTimeline: false,
    },
  );
  return processedData_;
});

/**
 * Keeps row height locked to the time scale so slot aspect ratio is stable (see SLOT_RENDER_RATIO).
 * Optionally preserves vertical position under the cursor during wheel zoom.
 */
function reconcileUnifiedZoomRowHeight(wheelAnchor?: WheelZoomAnchor) {
  const chartW = containerWidth.value - MARGIN.left - MARGIN.right;
  const timeRangeMs =
    internalEndTime.value.getTime() - internalStartTime.value.getTime();
  const raw = computeRowHeightForUnifiedZoom(
    chartW,
    timeRangeMs,
    SLOT_RENDER_RATIO,
  );
  if (!Number.isFinite(raw)) return;

  const prevRowHeight = rowHeight.value;
  const next = Math.max(
    MIN_ROW_HEIGHT,
    Math.min(MAX_ROW_HEIGHT, raw),
  );
  if (Math.abs(next - prevRowHeight) < 1e-4) return;

  const layout = chartLayout.value;
  const canvas = chartCanvasRef.value;
  let focusedGroupId: string | null = null;
  let anchorMouseY = 0;
  if (wheelAnchor && layout && canvas) {
    const pt = canvasLocalPoint(canvas, wheelAnchor.clientX, wheelAnchor.clientY);
    const hit = hitTestChart(layout, pt.x, pt.y);
    if (hit.type === "group") {
      focusedGroupId = hit.groupId;
      anchorMouseY = anchorYInGroupViewport(
        layout,
        hit.groupId,
        wheelAnchor.clientX,
        wheelAnchor.clientY,
        canvas,
      );
    }
  }

  rowHeight.value = next;

  const topics = processedTopics.value;
  const topicsByGroupId = new Map<string, typeof topics>();
  for (const t of topics) {
    const list = topicsByGroupId.get(t.groupId);
    if (list) list.push(t);
    else topicsByGroupId.set(t.groupId, [t]);
  }

  props.destinationGroups.forEach((group) => {
    const groupTopics = topicsByGroupId.get(group.id) ?? [];
    const viewportHeight = heightMap.value.get(group.id) || 0;
    const H_old = computeContentHeight(groupTopics, prevRowHeight);
    const H_new = computeContentHeight(groupTopics, next);
    if (H_old <= 0) return;

    const s = verticalScrollOffsets.value.get(group.id) || 0;
    const ratio = H_new / H_old;
    const newScroll =
      group.id === focusedGroupId
        ? (s + anchorMouseY) * ratio - anchorMouseY
        : s * ratio;
    const maxOffset = Math.max(0, H_new - viewportHeight);
    verticalScrollOffsets.value.set(
      group.id,
      Math.max(0, Math.min(maxOffset, newScroll)),
    );
  });
}

function buildPanZoomCallbacks() {
  return {
    marginLeft: MARGIN.left,
    getCurrentTimeRange: () => ({
      start: internalStartTime.value,
      end: internalEndTime.value,
    }),
    getChartWidth: () => containerWidth.value - MARGIN.left - MARGIN.right,
    onTimeRangeChange: (start: Date, end: Date) => {
      internalStartTime.value = start;
      internalEndTime.value = end;
    },
    onTimeRangeCommit: (start: Date, end: Date, wheelAnchor?: WheelZoomAnchor) => {
      internalStartTime.value = start;
      internalEndTime.value = end;
      reconcileUnifiedZoomRowHeight(wheelAnchor);
      emit("onChangeStartAndEndTime", start, end);
    },
  };
}

const onCanvasWheel = (event: WheelEvent) => {
  const canvas = chartCanvasRef.value;
  if (!canvas) return;

  const callbacks = buildPanZoomCallbacks();
  if (handlePanZoomWheelEvent(event, canvas, callbacks)) {
    // internalStartTime / internalEndTime / rowHeight updates already schedule redraw via watch.
    return;
  }


  if (event.ctrlKey || event.shiftKey || event.altKey) return;

  if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;

  const layout = chartLayout.value;
  if (!layout) return;

  const pt = canvasLocalPoint(canvas, event.clientX, event.clientY);
  const hit = hitTestChart(layout, pt.x, pt.y);
  if (hit.type !== "group") return;

  event.preventDefault();

  const groupId = hit.groupId;
  const groupTopics = processedTopics.value.filter(t => t.groupId === groupId);
  const contentHeight = computeContentHeight(groupTopics, rowHeight.value);
  const viewportHeight = heightMap.value.get(groupId) || 0;

  const currentOffset = verticalScrollOffsets.value.get(groupId) || 0;
  const maxOffset = Math.max(0, contentHeight - viewportHeight);
  const newOffset = Math.max(0, Math.min(maxOffset, currentOffset + event.deltaY));

  verticalScrollOffsets.value.set(groupId, newOffset);
  redraw();
};

const onCanvasMouseDown = (e: MouseEvent) => {
  if (e.button !== 0) return;
  const layout = chartLayout.value;
  const canvas = chartCanvasRef.value;
  if (!layout || !canvas) return;
  const pt = canvasLocalPoint(canvas, e.clientX, e.clientY);
  const hit = hitTestChart(layout, pt.x, pt.y);
  if (hit.type === "topResize") {
    startTopContentResize(e);
    return;
  }
  if (hit.type === "betweenResize") {
    startResize(e, hit.groupIdAbove);
  }
};

const drawUnifiedFrame = () => {
  const layout = chartLayout.value;
  const canvas = chartCanvasRef.value;
  if (!layout || !canvas || layout.canvasCssHeight <= 0) return;

  const topics = processedTopics.value;

  const ctx = setupCanvas(canvas, layout.canvasCssWidth, layout.canvasCssHeight);
  if (!ctx) return;

  ctx.clearRect(0, 0, layout.canvasCssWidth, layout.canvasCssHeight);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, layout.canvasCssWidth, layout.canvasCssHeight);

  const bandKey = hoverResizeBand.value;
  drawResizeBands(ctx, layout, bandKey);

  drawXAxisOnCanvas({
    ctx,
    width: layout.canvasCssWidth,
    height: X_AXIS_HEIGHT,
    startTime: internalStartTime.value,
    endTime: internalEndTime.value,
    margin: MARGIN,
    xAxisOptions: props.xAxisOptions,
    offsetY: layout.axisRect.y,
  });

  props.destinationGroups.forEach((group) => {
    const gr = layout.groupRects.get(group.id);
    if (!gr || gr.h <= 0) return;

    const viewportHeight = gr.h;
    const groupTopics = topics.filter(t => t.groupId === group.id);
    const contentHeight = computeContentHeight(groupTopics, rowHeight.value);
    const scrollOffset = verticalScrollOffsets.value.get(group.id) || 0;

    const maxOffset = Math.max(0, contentHeight - viewportHeight);
    const clampedOffset = Math.min(scrollOffset, maxOffset);
    if (clampedOffset !== scrollOffset) {
      verticalScrollOffsets.value.set(group.id, clampedOffset);
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, gr.y, layout.canvasCssWidth, gr.h);
    ctx.clip();
    ctx.translate(0, gr.y - clampedOffset);

    drawTopicLines({
      ctx,
      width: layout.canvasCssWidth,
      height: viewportHeight,
      topics: groupTopics,
      margin: MARGIN,
      rowHeight: rowHeight.value,
      viewportTop: clampedOffset,
      viewportHeight: viewportHeight,
    });

    drawSlots({
      ctx,
      width: layout.canvasCssWidth,
      topics: groupTopics,
      margin: MARGIN,
      rowHeight: rowHeight.value,
      startTime: internalStartTime.value,
      endTime: internalEndTime.value,
      viewportTop: clampedOffset,
      viewportHeight: viewportHeight,
    });

    ctx.restore();
  });
};

const redraw = () => {
  drawUnifiedFrame();
};

watch(
  () => props.topContentPortion,
  (newPortion) => {
    if (newPortion !== undefined) {
      currentTopContentPortion.value = newPortion;
    }
  }
);

watch(
  [() => props.startTime, () => props.endTime],
  ([newStart, newEnd]) => {
    internalStartTime.value = new Date(newStart);
    internalEndTime.value = new Date(newEnd);
    reconcileUnifiedZoomRowHeight();
  }
);

watch(containerWidth, () => {
  reconcileUnifiedZoomRowHeight();
});

watch(
  [containerWidth, containerHeight, currentTopContentPortion, internalStartTime, internalEndTime, rowHeight, () => props.slots, () => props.destinations, currentHeightPortions],
  () => { redraw(); }
);

onMounted(() => {
  updateClipboard();

  if (chartContainerRef.value) {
    containerHeight.value = chartContainerRef.value.clientHeight;
    containerWidth.value = chartContainerRef.value.clientWidth;
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        containerHeight.value = entry.contentRect.height;
        containerWidth.value = entry.contentRect.width;
      }
    });
    resizeObserver.observe(chartContainerRef.value);
  }

  nextTick(() => {
    reconcileUnifiedZoomRowHeight();
    redraw();
    isInitialized.value = true;

    if (chartCanvasRef.value) {
      panZoomCleanup = setupCanvasPanZoom(chartCanvasRef.value, buildPanZoomCallbacks());
    }
  });
});

onBeforeUnmount(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  if (panZoomCleanup) {
    panZoomCleanup.destroy();
    panZoomCleanup = null;
  }
  clearPanZoomWheelDebounce();
});

defineExpose({
  clearClipboard,
  chartCanvas: chartCanvasRef,
});
</script>

<style lang="css">
.chart-container {
  color: #000;
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.chart-canvas-wrap {
  flex: 1;
  min-height: 0;
  width: 100%;
  position: relative;
}

.chart-canvas {
  display: block;
}

.top-content-container {
  width: 100%;
  overflow: hidden;
  background-color: white;
}

.pointer-clipboard {
  position: fixed;
  z-index: 1000;
  pointer-events: none;
}

.clipboard-chip text {
  pointer-events: none;
}

@keyframes interval-marker-pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 0.7; }
}

.slot-box.copied {
  stroke: #000;
  stroke-width: 1px;
  stroke-dasharray: 5, 5;
  animation: dash 1s linear infinite;

  @keyframes dash {
    0% {
      stroke-dashoffset: 0;
    }

    100% {
      stroke-dashoffset: 10;
    }
  }
}
</style>
