<template>
  <div ref="chartContainerRef" class="chart-container" @mousemove="updateCursorPosition" @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave">
    
    <!-- Top content slot (e.g., for LoadChart) -->
    <div v-if="$slots['top-content'] || topContentHeight" class="top-content-container" 
         :style="{ height: currentTopContentHeight + 'px' }">
      <slot name="top-content"></slot>
    </div>
    
    <!-- Resize handle for top content -->
    <div v-if="$slots['top-content'] || topContentHeight" class="resize-handle" 
         @mousedown="startTopContentResize($event)"></div>
    
    <div class="x-axis-container">
      <svg ref="xAxisRef"></svg>
    </div>
    <template v-for="(group, index) in props.destinationGroups" :key="index">
      <div :class="`gantt-container`" :id="`${group.id}-gantt-container`"
        :style="{ height: heightMap.get(group.id) + 'px' }">
        <svg :ref="el => { if (el) ganttRefs[group.id] = el as SVGSVGElement }"></svg>
      </div>
      <div class="resize-handle" @mousedown="startResize($event, group.id)"
        v-if="index < props.destinationGroups.length - 1"></div>
    </template>

    <div v-if="clipboardItems.length && showClipboard" class="pointer-clipboard" :style="{
      top: `${cursorPosition.y + 15}px`,
      left: `${cursorPosition.x + 15}px`
    }">
      <v-chip v-for="(item, index) in clipboardItems" :key="index" color="primary" size="x-small" class="m-1"
        prepend-icon="mdi-pin">
        {{ getClipboardItemName(item) }}
      </v-chip>
    </div>
  </div>
</template>


<script setup lang="ts">
import * as d3 from "d3";
import { updateChart } from "./gantt-editor-lib/chart/update-chart";
import type { GanttEditorDestination, GanttEditorSlot, GanttEditorDestinationGroup, GanttEditorSuggestion, GanttEditorMarkedRegion, Settings } from "./gantt-editor-lib/chart/types";
import { ref, computed, watch, onMounted, onBeforeUnmount, defineProps, defineEmits } from "vue";

interface GanttEditorProps {
  startTime: Date,
  endTime: Date,
  slots: Array<GanttEditorSlot>,
  destinations: Array<GanttEditorDestination>,
  destinationGroups: Array<GanttEditorDestinationGroup>,
  suggestions: Array<GanttEditorSuggestion>,
  markedRegion: GanttEditorMarkedRegion | null,
  isReadOnly: boolean,
  topContentHeight?: number
}
interface GanttEditorEmits {
  onChangeStartAndEndTime: [Date, Date],
  onChangeDestinationId: [string, string, boolean],
  onChangeSlotTime: [string, Date, Date],
  onClickOnSlot: [string],
  onHoverOnSlot: [string],
  onDoubleClickOnSlot: [string],
  onContextClickOnSlot: [string],
  onTopContentHeightChange: [number]
}

const props = defineProps<GanttEditorProps>();
const emit = defineEmits<GanttEditorEmits>();
const chartContainerRef = ref<HTMLElement | null>(null);
const xAxisRef = ref<SVGSVGElement | null>(null);
const containerHeight = ref(0);

// Top content resizing state
const currentTopContentHeight = computed(() => {
  return props.topContentHeight || 0;
});
const isResizingTopContent = ref(false);
const topContentStartY = ref(0);

const isResizing = ref(false);
const resizingElement = ref<string | null>(null);
const startY = ref(0);
const currentHeightPortions = ref<Map<string, number>>(new Map<string, number>());
props.destinationGroups.forEach((group) => {
  currentHeightPortions.value.set(group.id, group.heightPortion);
});

const outerComponentHeight = computed(() => {
  let baseHeight = containerHeight.value - 60 - 3 * (props.destinationGroups.length - 1);
  
  if (props.topContentHeight || currentTopContentHeight.value) {
    baseHeight -= currentTopContentHeight.value + 3; // 3px for resize handle
  }
  
  return baseHeight;
});
const heightMap = computed(() => {
  const map = new Map<string, number>();
  props.destinationGroups.forEach((group) => {
    map.set(group.id, outerComponentHeight.value * currentHeightPortions.value.get(group.id)!);
  });
  return map;
});

const ganttRefs = ref<Record<string, SVGSVGElement>>({});

// Start resize operation
const startResize = (e: MouseEvent, element: string) => {
  isResizing.value = true;
  resizingElement.value = element;
  startY.value = e.clientY;

  document.addEventListener('mousemove', handleResize);
  document.addEventListener('mouseup', stopResize);
  e.preventDefault(); // Prevent text selection during resize
};


// Handle resize during mouse movement
const handleResize = (e: MouseEvent) => {
  if (!isResizing.value || !resizingElement.value) return;

  const deltaY = e.clientY - startY.value;
  const minHeightPortion = 0.01;

  // Find the index of the element being resized
  const currentIndex = props.destinationGroups.findIndex(group => group.id === resizingElement.value);
  if (currentIndex < 0 || currentIndex >= props.destinationGroups.length - 1) return;

  // Get the next element (the one being affected by the resize)
  const nextElement = props.destinationGroups[currentIndex + 1];
  const currentElement = props.destinationGroups[currentIndex];

  // Get current portions
  const currentPortion = currentHeightPortions.value.get(currentElement.id) || 0;
  const nextPortion = currentHeightPortions.value.get(nextElement.id) || 0;

  // Calculate the change in portion based on pixel change
  const portionDelta = deltaY / outerComponentHeight.value;

  // Calculate new portions
  let newCurrentPortion = currentPortion + portionDelta;
  let newNextPortion = nextPortion - portionDelta;

  // Enforce minimum portion constraints
  if (newCurrentPortion < minHeightPortion) {
    const adjustment = minHeightPortion - newCurrentPortion;
    newCurrentPortion = minHeightPortion;
    newNextPortion -= adjustment;
  }

  if (newNextPortion < minHeightPortion) {
    const adjustment = minHeightPortion - newNextPortion;
    newNextPortion = minHeightPortion;
    newCurrentPortion -= adjustment;
  }

  // Update height portions
  currentHeightPortions.value.set(currentElement.id, newCurrentPortion);
  currentHeightPortions.value.set(nextElement.id, newNextPortion);

  // Update start position for next move
  startY.value = e.clientY;

  // Trigger redraw
  triggerUpdate();
};

// Stop resize operation
const stopResize = () => {
  if (isResizing.value) {
    isResizing.value = false;
    resizingElement.value = null;
    triggerUpdate(); // Update the charts after resize
  }
  document.removeEventListener('mousemove', handleResize);
  document.removeEventListener('mouseup', stopResize);
};

const startTopContentResize = (e: MouseEvent) => {
  isResizingTopContent.value = true;
  topContentStartY.value = e.clientY;

  document.addEventListener('mousemove', handleTopContentResize);
  document.addEventListener('mouseup', stopTopContentResize);
  e.preventDefault();
};

// Handle top content resize during mouse movement
const handleTopContentResize = (e: MouseEvent) => {
  if (!isResizingTopContent.value) return;

  const deltaY = e.clientY - topContentStartY.value;
  let newHeight = currentTopContentHeight.value + deltaY;

  // min height constraint
  if (newHeight < 10) newHeight = 10;
  topContentStartY.value = e.clientY;

  emit("onTopContentHeightChange", newHeight);
  triggerUpdate();
};

const stopTopContentResize = () => {
  if (isResizingTopContent.value) {
    isResizingTopContent.value = false;
    triggerUpdate();
  }
  document.removeEventListener('mousemove', handleTopContentResize);
  document.removeEventListener('mouseup', stopTopContentResize);
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

const onMouseEnter = () => {
  showClipboard.value = true;
};

const onMouseLeave = () => {
  showClipboard.value = false;
};

let clipboardController: { update: () => void } | null = null;
let resizeObserver: ResizeObserver | null = null;

const triggerUpdate = () => {
  if (
    xAxisRef.value &&
    chartContainerRef.value &&
    clipboardController &&
    heightMap.value.size > 0
  ) {

    const svgRefs = new Map<string, SVGSVGElement>();
    props.destinationGroups.forEach((group) => {
      if (ganttRefs.value[group.id]) {
        svgRefs.set(group.id, ganttRefs.value[group.id]);
      }
    });

    updateChart(
      xAxisRef.value,
      props.slots.map((slot) => ({
        ...slot,
        destination: {
          id: slot.destinationId,
          displayName: slot.destinationId,
          active: true,
        },
      })),
      props.destinations,
      [],
      window.innerWidth,
      props.startTime,
      props.endTime,
      (item: { id: string; [key: string]: any }, wasSuggestion?: boolean) => {
        if (item.destinationId) {
          emit("onChangeDestinationId", item.id, item.destinationId, wasSuggestion ? true : false);
        } else {
          emit("onChangeSlotTime", item.id, item.openTime, item.closeTime);
        }
      },
      (start: Date, end: Date) => {
        emit("onChangeStartAndEndTime", start, end);
      },
      {
        compactView: false,
      } as Settings,
      clipboardController.update,
      (allocationId: string) => { emit("onClickOnSlot", allocationId); },
      {
        markedRegion: props.markedRegion ? {
          timeInterval: {
            start: props.markedRegion.startTime.getTime(),
            end: props.markedRegion.endTime.getTime()
          },
          destinationId: props.markedRegion.destinationId,
        } : null,
        suggestions: props.suggestions.map((suggestion) => ({
          id: suggestion.slotId,
          alternativeDestination: suggestion.alternativeDestinationId,
          alternativeDestinationDisplayName: suggestion.alternativeDestinationDisplayName || suggestion.alternativeDestinationId,
        })),
        destinationGroups: props.destinationGroups,
        heights: heightMap.value,
        svgRefs: svgRefs,
        isReadOnly: props.isReadOnly,
        onHoverOnSlot: (allocationId: string) => { emit("onHoverOnSlot", allocationId); },
        onDoubleClickOnSlot: (allocationId: string) => { emit("onDoubleClickOnSlot", allocationId); },
        onContextClickOnSlot: (allocationId: string) => { emit("onContextClickOnSlot", allocationId); }
      }
    );
  }
};

watch(
  () => props.startTime,
  () => {
    triggerUpdate();
  },
  { deep: true }
);
watch(
  () => props.endTime,
  () => {
    triggerUpdate();
  },
  { deep: true }
);
watch(
  () => props.slots,
  () => {
    triggerUpdate();
  },
  { deep: true }
);
watch(
  () => props.destinations,
  () => {
    triggerUpdate();
  }
);
watch(
  () => props.destinationGroups,
  () => {
    triggerUpdate();
  }
);
watch(
  () => props.suggestions,
  () => {
    triggerUpdate();
  }
);
watch(
  () => props.markedRegion,
  () => {
    triggerUpdate();
  }
);
watch(
  () => props.isReadOnly,
  () => {
    triggerUpdate();
  }
);

watch(
  () => heightMap.value,
  () => {
    triggerUpdate();
  },
  { deep: true }
);

const reziseWindow = () => {
  triggerUpdate();
};
onMounted(() => {
  setTimeout(async () => {

    clipboardController = { update: updateClipboard };
    updateClipboard();

    window.addEventListener("resize", reziseWindow);

    if (chartContainerRef.value) {
      containerHeight.value = chartContainerRef.value.clientHeight;
      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          containerHeight.value = entry.contentRect.height;
        }
      });
      resizeObserver.observe(chartContainerRef.value);
    }

    triggerUpdate();

  }, 5);
});

onBeforeUnmount(() => {
  d3.select(xAxisRef.value).selectAll("*").remove();
  props.destinationGroups.forEach((group) => {
    if (ganttRefs.value[group.id]) {
      d3.select(ganttRefs.value[group.id]).selectAll("*").remove();
    }
  });
  window.removeEventListener("resize", reziseWindow);

  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
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

.gantt-container {
  overflow-y: auto;
  overflow-x: hidden;
  width: 100%;
  background-color: white;
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

.topic-label,
.row-label {
  font-size: 12px;
}

.slot-text {
  pointer-events: none;
}

.slot-group.dragging {
  cursor: ew-resize;
}

.slot-group:hover .slot-rect {
  fill-opacity: 0.9;
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


/* .attr("class", d => `slot-box ${d.isCopied ? "copied" : ""}`) */

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