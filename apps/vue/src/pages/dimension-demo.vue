<template>
  <div class="dimension-demo">
    <div class="toolbar">
      <label class="zoom-control">
        <span>Default zoom</span>
        <input
          v-model.number="defaultZoomLevel"
          type="range"
          min="0.4"
          max="3"
          step="0.1"
        >
      </label>
      <output>{{ defaultZoomLevel.toFixed(1) }}x</output>
      <button
        class="scale-toggle"
        type="button"
        :aria-pressed="scaleOnResize === 'TIME_ONLY'"
        @click="toggleScaleOnResize"
      >
        {{ scaleOnResizeLabel }}
      </button>
    </div>

    <div class="chart-region">
      <GanttEditor
        :is-read-only="false"
        :default-zoom-level="defaultZoomLevel"
        :scale-on-resize="scaleOnResize"
        :start-time="startTime"
        :end-time="endTime"
        :slots="slots"
        :destinations="destinations"
        :destination-groups="destinationGroups"
        @on-change-start-and-end-time="handleTimeRangeChange"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import GanttEditor from '@/vue/GanttEditor.vue'
import type { GanttEditorScaleOnResize } from '@/components/gantt-editor-lib/chart/props'
import type {
  GanttEditorDestination,
  GanttEditorDestinationGroup,
  GanttEditorSlotWithUiAttributes,
} from '@/components/gantt-editor-lib/chart/types'

const defaultZoomLevel = ref(1)
const scaleOnResize = ref<GanttEditorScaleOnResize>('FULL')
const scaleOnResizeLabel = computed(() =>
  scaleOnResize.value === 'FULL' ? 'Resize: full scale' : 'Resize: time only',
)
const startTime = ref(new Date('2025-01-01T06:00:00Z'))
const endTime = ref(new Date('2025-01-01T18:00:00Z'))

const destinations: GanttEditorDestination[] = Array.from({ length: 18 }, (_, index) => ({
  id: `chute-${index + 1}`,
  displayName: `Chute ${index + 1}`,
  active: true,
  groupId: 'allocated',
}))

const destinationGroups: GanttEditorDestinationGroup[] = [
  { id: 'allocated', displayName: 'Allocated', heightPortion: 1 },
]

const slots: GanttEditorSlotWithUiAttributes[] = destinations.slice(0, 12).map((destination, index) => {
  const openHour = 7 + (index % 6)
  const openTime = new Date(`2025-01-01T${String(openHour).padStart(2, '0')}:00:00Z`)
  const closeTime = new Date(openTime.getTime() + (75 + (index % 3) * 20) * 60_000)

  return {
    id: `slot-${index + 1}`,
    displayName: `Load ${index + 1}`,
    group: `load-${index + 1}`,
    openTime,
    closeTime,
    destinationId: destination.id,
    color: index % 2 === 0 ? '#2563eb' : '#16a34a',
  }
})

function handleTimeRangeChange(nextStartTime: Date, nextEndTime: Date) {
  startTime.value = nextStartTime
  endTime.value = nextEndTime
}

function toggleScaleOnResize() {
  scaleOnResize.value = scaleOnResize.value === 'FULL' ? 'TIME_ONLY' : 'FULL'
}
</script>

<style scoped>
.dimension-demo {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f8fafc;
}

.toolbar {
  height: 56px;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 18px;
  border-bottom: 1px solid #d7dde6;
  background: #ffffff;
  color: #111827;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.zoom-control {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  font-weight: 600;
}

.zoom-control input {
  width: min(360px, 50vw);
}

output {
  min-width: 42px;
  font-variant-numeric: tabular-nums;
  color: #334155;
}

.scale-toggle {
  appearance: none;
  border: 1px solid #b6c0d0;
  border-radius: 6px;
  background: #ffffff;
  color: #111827;
  min-height: 34px;
  padding: 0 12px;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.scale-toggle[aria-pressed="true"] {
  border-color: #2563eb;
  background: #dbeafe;
  color: #1e3a8a;
}

.chart-region {
  flex: 1 1 auto;
  min-height: 0;
}
</style>
