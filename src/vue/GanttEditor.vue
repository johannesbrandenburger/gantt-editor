<template>
  <div
    :ref="setChartContainerRef"
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
        :ref="setChartCanvasRef"
        class="chart-canvas"
        @mousedown="onCanvasMouseDown"
        @pointerup="onCanvasPointerUp"
        @click="onCanvasClick"
        @dblclick="onCanvasDoubleClick"
        @contextmenu.prevent
        @mousemove="onChartMouseMove"
        @mouseleave="onChartMouseLeave"
      ></canvas>
    </div>
  </div>
</template>


<script setup lang="ts">
import type { GanttEditorProps } from "../components/gantt-editor-lib/chart/props";
import { GanttChartCanvasController } from "../components/gantt-editor-lib/chart/controller";
import type { ComponentPublicInstance } from "vue";
import { ref, watch, onMounted, onBeforeUnmount } from "vue";

interface GanttEditorEmits {
  onChangeStartAndEndTime: [Date, Date],
  onChangeDestinationId: [string, string, boolean],
  onBulkChangeDestinationId: [string[], string, boolean],
  onCopyToDestinationId: [string, string, boolean],
  onBulkCopyToDestinationId: [string[], string, boolean],
  onMoveSlotOnTimeAxis: [string, number, boolean],
  onBulkMoveSlotsOnTimeAxis: [string[], number, boolean],
  onCopySlotOnTimeAxis: [string, number, boolean],
  onBulkCopySlotsOnTimeAxis: [string[], number, boolean],
  onChangeSlotTime: [string, Date, Date],
  onSelectionChange: [string[]],
  onClickOnSlot: [string],
  onHoverOnSlot: [string],
  onDoubleClickOnSlot: [string],
  onContextClickOnSlot: [string],
  onTopContentPortionChange: [number, number],
  onChangeVerticalMarker: [string, Date],
  onClickVerticalMarker: [string],
  onContextMenuAction: [string, Date, string],
  onSlotContextMenuAction: [string, string],
}

type GanttEditorWrapperProps = GanttEditorProps & {
  slotContextMenuActions?: GanttEditorProps["slotContextMenuActions"];
};

const props = defineProps<GanttEditorWrapperProps>();
const emit = defineEmits<GanttEditorEmits>();

const chartContainerRef = ref<HTMLElement | null>(null);
const chartCanvasRef = ref<HTMLCanvasElement | null>(null);

const setChartContainerRef = (el: Element | ComponentPublicInstance | null) => {
  chartContainerRef.value = el instanceof HTMLElement ? el : null;
};

const setChartCanvasRef = (el: Element | ComponentPublicInstance | null) => {
  chartCanvasRef.value = el instanceof HTMLCanvasElement ? el : null;
};

const currentTopContentHeight = ref(0);
const exposeTestApi = import.meta.env.DEV || import.meta.env.MODE === "test";

type GanttCanvasTestApi = {
  flush: () => void;
  refreshSelectionFromStorage: () => void;
  getState: () => ReturnType<GanttChartCanvasController["getTestState"]>;
  probeCanvasPoint: (x: number, y: number) => ReturnType<GanttChartCanvasController["probeCanvasPoint"]>;
  findSlotPoint: (
    slotId: string,
    mode?: "center" | "left-edge" | "right-edge",
  ) => ReturnType<GanttChartCanvasController["findSlotPoint"]>;
};

let registeredTestApi: GanttCanvasTestApi | null = null;

const installTestApi = () => {
  if (!exposeTestApi) return;
  registeredTestApi = {
    flush: () => controller.flushForTests(),
    refreshSelectionFromStorage: () => controller.updateSelection(),
    getState: () => controller.getTestState(),
    probeCanvasPoint: (x, y) => controller.probeCanvasPoint(x, y),
    findSlotPoint: (slotId, mode = "center") => controller.findSlotPoint(slotId, mode),
  };
  (window as Window & { __ganttCanvasTestApi?: GanttCanvasTestApi }).__ganttCanvasTestApi = registeredTestApi;
};

const uninstallTestApi = () => {
  if (!exposeTestApi) return;
  const w = window as Window & { __ganttCanvasTestApi?: GanttCanvasTestApi };
  if (w.__ganttCanvasTestApi === registeredTestApi) {
    delete w.__ganttCanvasTestApi;
  }
  registeredTestApi = null;
};

function propsSnapshot(): GanttEditorProps {
  return {
    startTime: props.startTime,
    endTime: props.endTime,
    slots: props.slots,
    destinations: props.destinations,
    destinationGroups: props.destinationGroups,
    suggestions: props.suggestions,
    activateRulers: props.activateRulers,
    verticalMarkers: props.verticalMarkers,
    contextMenuActions: props.contextMenuActions,
    slotContextMenuActions: props.slotContextMenuActions,
    markedRegion: props.markedRegion,
    isReadOnly: props.isReadOnly,
    topContentPortion: props.topContentPortion,
    xAxisOptions: props.xAxisOptions,
    hoverPreviewMaxClipboardSize: props.hoverPreviewMaxClipboardSize,
    features: props.features,
    helpOverlayTiles: props.helpOverlayTiles,
    helpOverlayTileIds: props.helpOverlayTileIds,
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
    onBulkChangeDestinationId: (slotIds, destinationId, preview) => {
      emit("onBulkChangeDestinationId", slotIds, destinationId, preview);
    },
    onCopyToDestinationId: (slotId, destinationId, preview) => {
      emit("onCopyToDestinationId", slotId, destinationId, preview);
    },
    onBulkCopyToDestinationId: (slotIds, destinationId, preview) => {
      emit("onBulkCopyToDestinationId", slotIds, destinationId, preview);
    },
    onMoveSlotOnTimeAxis: (slotId, timeDiffMs, preview) => {
      emit("onMoveSlotOnTimeAxis", slotId, timeDiffMs, preview);
    },
    onBulkMoveSlotsOnTimeAxis: (slotIds, timeDiffMs, preview) => {
      emit("onBulkMoveSlotsOnTimeAxis", slotIds, timeDiffMs, preview);
    },
    onCopySlotOnTimeAxis: (slotId, timeDiffMs, preview) => {
      emit("onCopySlotOnTimeAxis", slotId, timeDiffMs, preview);
    },
    onBulkCopySlotsOnTimeAxis: (slotIds, timeDiffMs, preview) => {
      emit("onBulkCopySlotsOnTimeAxis", slotIds, timeDiffMs, preview);
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
    onContextMenuAction: (actionId, timestamp, destinationId) => {
      emit("onContextMenuAction", actionId, timestamp, destinationId);
    },
    onSlotContextMenuAction: (actionId, slotId) => {
      emit("onSlotContextMenuAction", actionId, slotId);
    },
  },
  {
    onSelectionSlotIds: (slotIds) => {
      emit("onSelectionChange", slotIds);
    },
    onTopContentHeightPx: (h) => {
      currentTopContentHeight.value = h;
    },
  },
);

let refreshQueued = false;
const queueRefreshModel = () => {
  if (refreshQueued) return;
  refreshQueued = true;
  queueMicrotask(() => {
    refreshQueued = false;
    controller.refreshModel(propsSnapshot());
  });
};

watch(
  () => [props.startTime.getTime(), props.endTime.getTime()],
  queueRefreshModel,
);
watch(
  () => [
    props.slots,
    props.destinations,
    props.destinationGroups,
    props.suggestions,
    props.activateRulers,
    props.verticalMarkers,
    props.contextMenuActions,
    props.slotContextMenuActions,
    props.isReadOnly,
    props.topContentPortion,
    props.xAxisOptions,
    props.features,
    props.helpOverlayTiles,
    props.helpOverlayTileIds,
  ],
  queueRefreshModel,
);
watch(
  () => props.markedRegion,
  queueRefreshModel,
  { deep: true },
);

onMounted(() => {
  controller.updateSelection();
  const root = chartContainerRef.value;
  const canvas = chartCanvasRef.value;
  if (root && canvas) {
    controller.attach(root, canvas);
  }
  installTestApi();
});

onBeforeUnmount(() => {
  uninstallTestApi();
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
const onCanvasPointerUp = (e: PointerEvent) => {
  controller.onCanvasPointerUp(e);
};
const onCanvasClick = (e: MouseEvent) => {
  controller.onCanvasClick(e);
};
const onCanvasDoubleClick = (e: MouseEvent) => {
  controller.onCanvasDoubleClick(e);
};
const onMouseEnter = () => {
  controller.onMouseEnter();
};
const onMouseLeave = () => {
  controller.onMouseLeave();
};

const clearSelection = () => {
  controller.clearSelection();
};

const clearClipboard = () => {
  clearSelection();
};

defineExpose({
  clearSelection,
  clearClipboard,
  chartCanvas: chartCanvasRef,
  ganttCanvasTestApi: {
    flush: () => controller.flushForTests(),
    getState: () => controller.getTestState(),
    probeCanvasPoint: (x: number, y: number) => controller.probeCanvasPoint(x, y),
    findSlotPoint: (slotId: string, mode?: "center" | "left-edge" | "right-edge") =>
      controller.findSlotPoint(slotId, mode),
  },
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
