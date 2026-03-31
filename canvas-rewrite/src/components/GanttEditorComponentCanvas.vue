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
        @click="onCanvasClick"
        @dblclick="onCanvasDoubleClick"
        @contextmenu.prevent="onCanvasContextMenu"
        @mousemove="onChartMouseMove"
        @mouseleave="onChartMouseLeave"
      ></canvas>
    </div>
  </div>
</template>


<script setup lang="ts">
import type { GanttEditorCanvasProps } from "./gantt-editor-lib/chart/gantt_canvas_props";
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
  onTopContentPortionChange: [number, number],
  onChangeVerticalMarker: [string, Date],
  onClickVerticalMarker: [string],
}

const props = defineProps<GanttEditorCanvasProps>();
const emit = defineEmits<GanttEditorEmits>();

const chartContainerRef = ref<HTMLElement | null>(null);
const chartCanvasRef = ref<HTMLCanvasElement | null>(null);

const currentTopContentHeight = ref(0);

function propsSnapshot(): GanttEditorCanvasProps {
  return {
    startTime: props.startTime,
    endTime: props.endTime,
    slots: props.slots,
    destinations: props.destinations,
    destinationGroups: props.destinationGroups,
    suggestions: props.suggestions,
    verticalMarkers: props.verticalMarkers,
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
    onChangeDestinationId: (slotId, destinationId, preview) => {
      emit("onChangeDestinationId", slotId, destinationId, preview);
    },
    onClickOnSlot: (slotId) => {
      emit("onClickOnSlot", slotId);
    },
    onHoverOnSlot: (slotId) => {
      emit("onHoverOnSlot", slotId);
    },
    onDoubleClickOnSlot: (slotId) => {
      emit("onDoubleClickOnSlot", slotId);
    },
    onContextClickOnSlot: (slotId) => {
      emit("onContextClickOnSlot", slotId);
    },
    onVerticalMarkerChange: (id, date) => {
      emit("onChangeVerticalMarker", id, date);
    },
    onVerticalMarkerClick: (id) => {
      emit("onClickVerticalMarker", id);
    },
  },
  {
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
    props.verticalMarkers,
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
const onCanvasClick = (e: MouseEvent) => {
  controller.onCanvasClick(e);
};
const onCanvasDoubleClick = (e: MouseEvent) => {
  controller.onCanvasDoubleClick(e);
};
const onCanvasContextMenu = (e: MouseEvent) => {
  controller.onCanvasContextMenu(e);
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
</style>
