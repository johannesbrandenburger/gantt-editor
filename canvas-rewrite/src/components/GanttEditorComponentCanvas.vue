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
        {{ getClipboardItemDisplayName(item) }}
      </v-chip>
    </div>
  </div>
</template>


<script setup lang="ts">
import type { GanttEditorSlot } from "./gantt-editor-lib/chart/types";
import type { GanttEditorCanvasProps } from "./gantt-editor-lib/chart/gantt_canvas_props";
import { getClipboardItemDisplayName } from "./gantt-editor-lib/chart/gantt_canvas_props";
import { GanttChartCanvasController } from "./gantt-editor-lib/chart/gantt_chart_canvas_controller";
import { ref, watch, onMounted, onBeforeUnmount } from "vue";

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

const props = defineProps<GanttEditorCanvasProps>();
const emit = defineEmits<GanttEditorEmits>();

const chartContainerRef = ref<HTMLElement | null>(null);
const chartCanvasRef = ref<HTMLCanvasElement | null>(null);

const cursorPosition = ref({ x: 0, y: 0 });
const showClipboard = ref(false);
const clipboardItems = ref<GanttEditorSlot[]>([]);
const currentTopContentHeight = ref(0);

function propsSnapshot(): GanttEditorCanvasProps {
  return {
    startTime: props.startTime,
    endTime: props.endTime,
    slots: props.slots,
    destinations: props.destinations,
    destinationGroups: props.destinationGroups,
    suggestions: props.suggestions,
    markedRegion: props.markedRegion,
    isReadOnly: props.isReadOnly,
    topContentPortion: props.topContentPortion,
    xAxisOptions: props.xAxisOptions,
  };
}

const controller = new GanttChartCanvasController(
  propsSnapshot(),
  {
    onChangeStartAndEndTime: (start, end) => {
      emit("onChangeStartAndEndTime", start, end);
    },
    onTopContentPortionChange: (portion, heightPx) => {
      emit("onTopContentPortionChange", portion, heightPx);
    },
    onChangeSlotTime: (slotId, openTime, closeTime) => {
      emit("onChangeSlotTime", slotId, openTime, closeTime);
    },
  },
  {
    onCursorMove: (x, y) => {
      cursorPosition.value = { x, y };
    },
    onClipboardVisibility: (visible) => {
      showClipboard.value = visible;
    },
    onClipboardItems: (items) => {
      clipboardItems.value = items;
    },
    onTopContentHeightPx: (h) => {
      currentTopContentHeight.value = h;
    },
  },
);

watch(
  () => [
    props.startTime,
    props.endTime,
    props.slots,
    props.destinations,
    props.destinationGroups,
    props.suggestions,
    props.markedRegion,
    props.isReadOnly,
    props.topContentPortion,
    props.xAxisOptions,
  ],
  () => {
    controller.refreshModel(propsSnapshot());
  },
  // { deep: true }, // TODO: check if deep needed
);

onMounted(() => {
  controller.updateClipboard();
  const root = chartContainerRef.value;
  const canvas = chartCanvasRef.value;
  if (root && canvas) {
    controller.attach(root, canvas);
  }
});

onBeforeUnmount(() => {
  controller.detach();
});

const onContainerMouseMove = (e: MouseEvent) => {
  controller.onContainerMouseMove(e);
};
const onChartMouseMove = (e: MouseEvent) => {
  controller.onChartMouseMove(e);
};
const onChartMouseLeave = () => {
  controller.onChartMouseLeave();
};
const onCanvasMouseDown = (e: MouseEvent) => {
  controller.onCanvasMouseDown(e);
};
const onMouseEnter = () => {
  controller.onMouseEnter();
};
const onMouseLeave = () => {
  controller.onMouseLeave();
};

const clearClipboard = () => {
  controller.clearClipboard();
};

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
