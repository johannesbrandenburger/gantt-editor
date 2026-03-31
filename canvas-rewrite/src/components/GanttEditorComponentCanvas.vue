<template>
  <div
    ref="chartContainerRef"
    class="chart-container"
    @mousemove="updateCursorPosition"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
  >

    <!-- Top content slot (e.g., for LoadChart) -->
    <div
      v-if="$slots['top-content'] || topContentPortion"
      class="top-content-container"
      :style="{ height: currentTopContentHeight + 'px' }"
    >
      <slot name="top-content"></slot>
    </div>

    <!-- Resize handle for top content -->
    <div
      v-if="$slots['top-content'] || topContentPortion"
      class="resize-handle"
      @mousedown="startTopContentResize($event)"
    ></div>

    <!-- X-Axis canvas -->
    <div class="x-axis-container">
      <canvas ref="xAxisCanvasRef"></canvas>
    </div>

    <!-- Per-group gantt chart canvases -->
    <template
      v-for="(group, index) in props.destinationGroups"
      :key="group.id"
    >
      <div
        class="gantt-canvas-container"
        :id="group.id + '-gantt-container'"
        :style="{ height: heightMap.get(group.id) + 'px' }"
      >
        <canvas :ref="el => { if (el) ganttCanvasRefs[group.id] = el as HTMLCanvasElement }"></canvas>
      </div>
      <div
        class="resize-handle"
        @mousedown="startResize($event, group.id)"
        v-if="index < props.destinationGroups.length - 1"
      ></div>
    </template>

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
import { setupCanvasPanZoom, type PanZoomCleanup } from "./gantt-editor-lib/chart/canvas_pan_zoom";
import { processData } from "./gantt-editor-lib/chart/process-data";
import { drawTopicLines, computeContentHeight } from "./gantt-editor-lib/chart/canvas_topics";
import { drawSlots } from "./gantt-editor-lib/chart/canvas_slots";
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";

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
const xAxisCanvasRef = ref<HTMLCanvasElement | null>(null);
const ganttCanvasRefs = ref<Record<string, HTMLCanvasElement>>({});
const containerHeight = ref(0);
const containerWidth = ref(0);

const X_AXIS_HEIGHT = 50;
const DEFAULT_ROW_HEIGHT = 40;
const rowHeight = ref(DEFAULT_ROW_HEIGHT);

// Internal time range (mutated during pan/scroll for immediate re-render)
const internalStartTime = ref(new Date(props.startTime));
const internalEndTime = ref(new Date(props.endTime));
let panZoomCleanup: PanZoomCleanup | null = null;
let verticalScrollCleanups: Array<() => void> = [];

// Top content resizing state
const currentTopContentPortion = ref(props.topContentPortion || 0);
const isResizingTopContent = ref(false);
const topContentStartY = ref(0);

// Group resize state
const isResizing = ref(false);
const resizingElement = ref<string | null>(null);
const startY = ref(0);
const currentHeightPortions = ref<Map<string, number>>(new Map<string, number>());
const verticalScrollOffsets = ref<Map<string, number>>(new Map<string, number>());
props.destinationGroups.forEach((group) => {
  currentHeightPortions.value.set(group.id, group.heightPortion);
  verticalScrollOffsets.value.set(group.id, 0);
});

const totalContentHeight = computed(() => {
  return containerHeight.value - 3 * (props.destinationGroups.length - 1) - (currentTopContentPortion.value > 0 ? 3 : 0);
});

const currentTopContentHeight = computed(() => {
  return totalContentHeight.value * currentTopContentPortion.value;
});

const outerComponentHeight = computed(() => {
  return totalContentHeight.value * (1 - currentTopContentPortion.value) - X_AXIS_HEIGHT;
});

const heightMap = computed(() => {
  const map = new Map<string, number>();
  props.destinationGroups.forEach((group) => {
    map.set(group.id, outerComponentHeight.value * (currentHeightPortions.value.get(group.id) || 0));
  });
  return map;
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

// Top content resize
const startTopContentResize = (e: MouseEvent) => {
  isResizingTopContent.value = true;
  topContentStartY.value = e.clientY;
  document.addEventListener('mousemove', handleTopContentResize);
  document.addEventListener('mouseup', stopTopContentResize);
  e.preventDefault();
};

const handleTopContentResize = (e: MouseEvent) => {
  if (!isResizingTopContent.value) return;
  const deltaY = e.clientY - topContentStartY.value;
  const portionDelta = deltaY / totalContentHeight.value;
  let newPortion = currentTopContentPortion.value + portionDelta;
  if (newPortion < 0.01) newPortion = 0.01;
  if (newPortion > 0.99) newPortion = 0.99;
  currentTopContentPortion.value = newPortion;
  topContentStartY.value = e.clientY;
  emit("onTopContentPortionChange", newPortion, totalContentHeight.value * newPortion);
};

const stopTopContentResize = () => {
  isResizingTopContent.value = false;
  document.removeEventListener('mousemove', handleTopContentResize);
  document.removeEventListener('mouseup', stopTopContentResize);
};

// Group resize
const startResize = (e: MouseEvent, element: string) => {
  isResizing.value = true;
  resizingElement.value = element;
  startY.value = e.clientY;
  document.addEventListener('mousemove', handleResize);
  document.addEventListener('mouseup', stopResize);
  e.preventDefault();
};

const handleResize = (e: MouseEvent) => {
  if (!isResizing.value || !resizingElement.value) return;
  const deltaY = e.clientY - startY.value;
  const minHeightPortion = 0.01;
  const currentIndex = props.destinationGroups.findIndex(group => group.id === resizingElement.value);
  if (currentIndex < 0 || currentIndex >= props.destinationGroups.length - 1) return;

  const nextElement = props.destinationGroups[currentIndex + 1];
  const currentElement = props.destinationGroups[currentIndex];
  const currentPortion = currentHeightPortions.value.get(currentElement.id) || 0;
  const nextPortion = currentHeightPortions.value.get(nextElement.id) || 0;
  const portionDelta = deltaY / outerComponentHeight.value;
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
  document.removeEventListener('mousemove', handleResize);
  document.removeEventListener('mouseup', stopResize);
};

// Clipboard
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

const clearClipboard = () => {
  localStorage.setItem("pointerClipboard", "[]");
  updateClipboard();
  props.slots.forEach(slot => { slot.isCopied = false; });
};

// Canvas drawing
let resizeObserver: ResizeObserver | null = null;

const setupCanvas = (canvas: HTMLCanvasElement, width: number, height: number) => {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  return ctx;
};

const MARGIN = { left: 200, right: 60 };

// Cache processed data — only recompute when slots/destinations change, NOT on pan/zoom
const processedTopics = computed(() => {
  const { processedData_ } = processData(
    props.slots,
    props.destinations,
    props.startTime,
    props.endTime,
    {
      groupBy: 'destinationId',
      rowHeight: rowHeight.value,
      progressChartsDisplay: 'None',
      collapseGroups: false,
      editable: !props.isReadOnly,
      compactView: false,
      sortInFrontend: 'None',
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

const drawXAxis = () => {
  if (!xAxisCanvasRef.value) return;
  const ctx = setupCanvas(xAxisCanvasRef.value, containerWidth.value, X_AXIS_HEIGHT);
  if (!ctx) return;
  drawXAxisOnCanvas({
    ctx,
    width: containerWidth.value,
    height: X_AXIS_HEIGHT,
    startTime: internalStartTime.value,
    endTime: internalEndTime.value,
    margin: MARGIN,
    xAxisOptions: props.xAxisOptions,
  });
};

const drawGantt = () => {
  const topics = processedTopics.value;

  props.destinationGroups.forEach((group) => {
    const canvas = ganttCanvasRefs.value[group.id];
    if (!canvas) return;
    const viewportHeight = heightMap.value.get(group.id) || 0;
    if (viewportHeight <= 0) return;

    const groupTopics = topics.filter(t => t.groupId === group.id);
    const contentHeight = computeContentHeight(groupTopics, rowHeight.value);
    const scrollOffset = verticalScrollOffsets.value.get(group.id) || 0;

    // Clamp scroll offset in case content shrank
    const maxOffset = Math.max(0, contentHeight - viewportHeight);
    const clampedOffset = Math.min(scrollOffset, maxOffset);
    if (clampedOffset !== scrollOffset) {
      verticalScrollOffsets.value.set(group.id, clampedOffset);
    }

    // Canvas is viewport-sized (not content-sized)
    const ctx = setupCanvas(canvas, containerWidth.value, viewportHeight);
    if (!ctx) return;

    ctx.save();
    ctx.translate(0, -clampedOffset);

    drawTopicLines({
      ctx,
      width: containerWidth.value,
      height: viewportHeight,
      topics: groupTopics,
      margin: MARGIN,
      rowHeight: rowHeight.value,
      viewportTop: clampedOffset,
      viewportHeight: viewportHeight,
    });

    drawSlots({
      ctx,
      width: containerWidth.value,
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
  drawXAxis();
  drawGantt();
};

watch(
  () => props.topContentPortion,
  (newPortion) => {
    if (newPortion !== undefined) {
      currentTopContentPortion.value = newPortion;
    }
  }
);

// Sync internal time when props change from parent
watch(
  [() => props.startTime, () => props.endTime],
  ([newStart, newEnd]) => {
    internalStartTime.value = new Date(newStart);
    internalEndTime.value = new Date(newEnd);
  }
);

watch(
  [containerWidth, containerHeight, currentTopContentPortion, internalStartTime, internalEndTime, rowHeight, () => props.slots, () => props.destinations],
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

  redraw();
  isInitialized.value = true;

  // Setup pan & zoom on the chart container
  if (chartContainerRef.value) {
    panZoomCleanup = setupCanvasPanZoom(chartContainerRef.value, {
      marginLeft: MARGIN.left,
      getCurrentTimeRange: () => ({
        start: internalStartTime.value,
        end: internalEndTime.value,
      }),
      getChartWidth: () => containerWidth.value - MARGIN.left - MARGIN.right,
      onTimeRangeChange: (start, end) => {
        internalStartTime.value = start;
        internalEndTime.value = end;
        console.log("Hier")
      },
      onTimeRangeCommit: (start, end) => {
        internalStartTime.value = start;
        internalEndTime.value = end;
        emit('onChangeStartAndEndTime', start, end);
      },
    });
  }

  // Setup vertical scrolling on each group container
  props.destinationGroups.forEach((group) => {
    const containerEl = document.getElementById(group.id + '-gantt-container');
    if (!containerEl) return;

    const onWheel = (event: WheelEvent) => {
      // Only handle vertical scroll (not horizontal, not zoom)
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      // ctrl or alt held → zoom, not scroll
      if (event.ctrlKey || event.altKey) return;

      event.preventDefault();

      const groupTopics = processedTopics.value.filter(t => t.groupId === group.id);
      const contentHeight = computeContentHeight(groupTopics, rowHeight.value);
      const viewportHeight = heightMap.value.get(group.id) || 0;

      const currentOffset = verticalScrollOffsets.value.get(group.id) || 0;
      const maxOffset = Math.max(0, contentHeight - viewportHeight);
      const newOffset = Math.max(0, Math.min(maxOffset, currentOffset + event.deltaY));

      verticalScrollOffsets.value.set(group.id, newOffset);
      redraw();
    };

    containerEl.addEventListener('wheel', onWheel, { passive: false });
    verticalScrollCleanups.push(() => containerEl.removeEventListener('wheel', onWheel));

    // Vertical zoom: alt(option)+wheel
    const onVerticalZoom = (event: WheelEvent) => {
      if (!event.altKey) return;
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      event.preventDefault();

      const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
      const newHeight = Math.round(Math.max(5, Math.min(120, rowHeight.value * zoomFactor)));
      rowHeight.value = newHeight;
      redraw();
    };

    containerEl.addEventListener('wheel', onVerticalZoom, { passive: false });
    verticalScrollCleanups.push(() => containerEl.removeEventListener('wheel', onVerticalZoom));
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
  verticalScrollCleanups.forEach(fn => fn());
  verticalScrollCleanups = [];
});

defineExpose({
  clearClipboard,
  xAxisCanvas: xAxisCanvasRef,
  ganttCanvasRefs: ganttCanvasRefs,
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

.x-axis-container {
  position: sticky;
  top: 0;
  z-index: 10;
  height: 50px;
  width: 100%;
  overflow: hidden;
  background-color: white;
}

.x-axis-container canvas {
  display: block;
}

.gantt-canvas-container {
  overflow: hidden;
  width: 100%;
  background-color: white;
}

.gantt-canvas-container canvas {
  display: block;
}

.resize-handle {
  height: 3px;
  width: 100%;
  background-color: #e0e0e0;
  cursor: ns-resize;
  z-index: 10;
}

.resize-handle:hover {
  background-color: #3700ff;
}

.resize-handle:active {
  background-color: #6200ee;
}

.top-content-container {
  width: 100%;
  overflow: hidden;
  background-color: white;
}

/* New styling for the Vuetify pointer clipboard */
.pointer-clipboard {
  position: fixed;
  z-index: 1000;
  pointer-events: none;
}

/* Keep any existing styles for clipboard chips if needed */
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
