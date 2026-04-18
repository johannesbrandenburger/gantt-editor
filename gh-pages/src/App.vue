<template>
  <div class="demo-wrapper">
    <GanttEditor
      ref="ganttEditorRef"
      :isReadOnly="false"
      :startTime="startTime"
      :endTime="endTime"
      :slots="slots"
      :destinations="destinations"
      :destinationGroups="destinationGroups"
      :suggestions="suggestions"
      :markedRegion="null"
      :activate-rulers="'GLOBAL'"
      :contextMenuActions="contextMenuActions"
      :slotContextMenuActions="[
        { id: 'delete', label: 'Delete Slot' },
      ]"
      @onChangeDestinationId="handleChangeDestinationId"
      @onBulkChangeDestinationId="handleBulkChangeDestinationId"
      @onCopyToDestinationId="handleCopyDestinationId"
      @onBulkCopyToDestinationId="handleBulkCopyDestinationId"
      @onMoveSlotOnTimeAxis="handleMoveSlotOnTimeAxis"
      @onBulkMoveSlotsOnTimeAxis="handleBulkMoveSlotsOnTimeAxis"
      @onCopySlotOnTimeAxis="handleCopySlotOnTimeAxis"
      @onBulkCopySlotsOnTimeAxis="handleBulkCopySlotsOnTimeAxis"
      @onChangeSlotTime="handleChangeSlotTime"
      @onContextMenuAction="handleCanvasContextMenuAction"
      @onSlotContextMenuAction="handleSlotContextMenuAction"
      @onChangeStartAndEndTime="handleChangeStartAndEndTime"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type {
  GanttEditorCanvasContextMenuAction,
  GanttEditorSlot,
} from '@/components/gantt-editor-lib/chart/types'
import GanttEditor from '@/vue/GanttEditor.vue'

// Deterministic pseudo-random number generator so the demo is stable across
// reloads. This keeps recorded GIFs consistent.
const makeRandom = (seed: number) => {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0xffffffff
  }
}
const rand = makeRandom(20260101)

const AIRLINES = [
  'LH',
  'BA',
  'AF',
  'KL',
  'UA',
  'DL',
  'EK',
  'QF',
  'SQ',
  'NH',
  'TK',
  'LX',
]

const randInt = (min: number, max: number) =>
  Math.floor(rand() * (max - min + 1)) + min

const pick = <T,>(items: readonly T[]): T =>
  items[Math.floor(rand() * items.length)]

// The demo window spans 3 days starting today at 00:00.
const DEMO_DAYS = 3
const DAY_MS = 24 * 60 * 60 * 1000
const startTime = ref(new Date(new Date().setHours(0, 0, 0, 0)))
const endTime = ref(new Date(startTime.value.getTime() + DEMO_DAYS * DAY_MS - 1))

const NUM_DESTINATIONS = 30
const NUM_SLOTS = 640
const NUM_UNALLOCATED = 32

const generateSlots = (): GanttEditorSlot[] => {
  const dayStart = startTime.value.getTime()
  const dayEnd = endTime.value.getTime()
  const spanMs = dayEnd - dayStart

  const airlineCounters: Record<string, number> = {}

  const allocated: GanttEditorSlot[] = Array.from({ length: NUM_SLOTS }, (_, index) => {
    const airline = pick(AIRLINES)
    airlineCounters[airline] = (airlineCounters[airline] ?? 0) + 1
    const flightNumber = `${airline}${String(airlineCounters[airline]).padStart(3, '0')}`

    // Random open time biased to cover the whole day.
    const openTime = new Date(dayStart + rand() * (spanMs - 60 * 60 * 1000))
    const durationMin = randInt(35, 180)
    let closeTime = new Date(openTime.getTime() + durationMin * 60 * 1000)
    if (closeTime.getTime() > dayEnd) closeTime = new Date(dayEnd)

    // STD is shortly after the service window closes, ETD wanders around STD.
    const stdTimestamp = closeTime.getTime() + randInt(30, 90) * 60 * 1000
    const etdOffset = randInt(-25, 45) * 60 * 1000
    const etdTimestamp = stdTimestamp + etdOffset

    const destinationId = `chute-${randInt(1, NUM_DESTINATIONS)}`

    return {
      id: `${flightNumber}-${index}`,
      displayName: flightNumber,
      group: flightNumber,
      openTime,
      closeTime,
      destinationId,
      hoverData: `<strong>${flightNumber}</strong><br/>Departure: ${new Date(
        etdTimestamp,
      ).toLocaleTimeString()}`,
      deadlines: [
        { id: 'std', timestamp: stdTimestamp, color: '#9e9e9e' },
        { id: 'etd', timestamp: etdTimestamp, color: '#1f1f1f' },
      ],
    }
  })

  const unallocated: GanttEditorSlot[] = Array.from({ length: NUM_UNALLOCATED }, (_, index) => {
    const openTime = new Date(dayStart + rand() * (spanMs - 2 * 60 * 60 * 1000))
    const durationMin = randInt(40, 150)
    let closeTime = new Date(openTime.getTime() + durationMin * 60 * 1000)
    if (closeTime.getTime() > dayEnd) closeTime = new Date(dayEnd)
    const id = `UA-${9000 + index}`
    return {
      id,
      displayName: id,
      group: id,
      openTime,
      closeTime,
      destinationId: 'UNALLOCATED',
      hoverData: `<strong>${id}</strong><br/><em>Unallocated — drag to a chute</em>`,
    }
  })

  return [...allocated, ...unallocated].sort(
    (a, b) => a.openTime.getTime() - b.openTime.getTime(),
  )
}

const slots = ref<GanttEditorSlot[]>(generateSlots())

const destinations = [
  ...Array.from({ length: NUM_DESTINATIONS }, (_, i) => ({
    id: `chute-${i + 1}`,
    displayName: `Chute ${i + 1}`,
    active: true,
    groupId: 'allocated',
  })),
  {
    id: 'UNALLOCATED',
    displayName: 'UNALLOCATED',
    active: true,
    groupId: 'unallocated',
  },
]

const destinationGroups = [
  { id: 'allocated', displayName: 'Allocated', heightPortion: 0.9 },
  { id: 'unallocated', displayName: 'UNALLOCATED', heightPortion: 0.1 },
]

// Show a handful of suggestions so the "apply suggestion" UX is discoverable.
const suggestions = computed(() =>
  slots.value.slice(0, 5).map((slot) => {
    const match = /^chute-(\d+)$/.exec(slot.destinationId ?? '')
    const currentIndex = match ? parseInt(match[1], 10) : 1
    const altIndex = (currentIndex % NUM_DESTINATIONS) + 1
    return {
      slotId: slot.id,
      alternativeDestinationId: `chute-${altIndex}`,
      alternativeDestinationDisplayName: `Chute ${altIndex}`,
    }
  }),
)

const contextMenuActions = ref<GanttEditorCanvasContextMenuAction[]>([
  { id: 'create-flight', label: 'Create a flight here' },
])

const ganttEditorRef = ref<InstanceType<typeof GanttEditor> | null>(null)

// ------------------------------------------------------------------
// Mutation handlers — mirror the behaviour of the internal demo page.
// ------------------------------------------------------------------

const shiftDeadlinesByMs = (
  deadlines: GanttEditorSlot['deadlines'] | undefined,
  timeDiffMs: number,
): GanttEditorSlot['deadlines'] | undefined =>
  deadlines?.map((d) => ({ ...d, timestamp: d.timestamp + timeDiffMs }))

const buildCopiedSlot = (
  slot: GanttEditorSlot,
  destinationId: string,
): GanttEditorSlot => {
  let copyIndex = 1
  let nextId = `${slot.id}-copy-${copyIndex}`
  const existingIds = new Set(slots.value.map((s) => s.id))
  while (existingIds.has(nextId)) {
    copyIndex += 1
    nextId = `${slot.id}-copy-${copyIndex}`
  }
  return { ...slot, id: nextId, group: nextId, destinationId }
}

const buildCopiedSlotOnTimeAxis = (
  slot: GanttEditorSlot,
  timeDiffMs: number,
): GanttEditorSlot => {
  let copyIndex = 1
  let nextId = `${slot.id}-time-copy-${copyIndex}`
  const existingIds = new Set(slots.value.map((s) => s.id))
  while (existingIds.has(nextId)) {
    copyIndex += 1
    nextId = `${slot.id}-time-copy-${copyIndex}`
  }
  return {
    ...slot,
    id: nextId,
    group: nextId,
    openTime: new Date(slot.openTime.getTime() + timeDiffMs),
    closeTime: new Date(slot.closeTime.getTime() + timeDiffMs),
    deadlines: shiftDeadlinesByMs(slot.deadlines, timeDiffMs),
  }
}

const handleChangeStartAndEndTime = (newStart: Date, newEnd: Date) => {
  startTime.value = newStart
  endTime.value = newEnd
}

const handleChangeDestinationId = (slotId: string, destinationId: string) => {
  slots.value = slots.value.map((slot) =>
    slot.id === slotId && !slot.readOnly ? { ...slot, destinationId } : slot,
  )
}

const handleBulkChangeDestinationId = (slotIds: string[], destinationId: string) => {
  const ids = new Set(slotIds)
  slots.value = slots.value.map((slot) =>
    ids.has(slot.id) && !slot.readOnly ? { ...slot, destinationId } : slot,
  )
}

const handleCopyDestinationId = (slotId: string, destinationId: string) => {
  const source = slots.value.find((s) => s.id === slotId)
  if (!source || source.readOnly) return
  slots.value = [...slots.value, buildCopiedSlot(source, destinationId)]
}

const handleBulkCopyDestinationId = (slotIds: string[], destinationId: string) => {
  const ids = new Set(slotIds)
  const sources = slots.value.filter((s) => ids.has(s.id) && !s.readOnly)
  if (sources.length === 0) return
  slots.value = [
    ...slots.value,
    ...sources.map((s) => buildCopiedSlot(s, destinationId)),
  ]
}

const handleMoveSlotOnTimeAxis = (slotId: string, timeDiffMs: number) => {
  if (timeDiffMs === 0) return
  slots.value = slots.value.map((slot) =>
    slot.id === slotId && !slot.readOnly
      ? {
          ...slot,
          openTime: new Date(slot.openTime.getTime() + timeDiffMs),
          closeTime: new Date(slot.closeTime.getTime() + timeDiffMs),
          deadlines: shiftDeadlinesByMs(slot.deadlines, timeDiffMs),
        }
      : slot,
  )
}

const handleBulkMoveSlotsOnTimeAxis = (slotIds: string[], timeDiffMs: number) => {
  if (timeDiffMs === 0) return
  const ids = new Set(slotIds)
  slots.value = slots.value.map((slot) =>
    ids.has(slot.id) && !slot.readOnly
      ? {
          ...slot,
          openTime: new Date(slot.openTime.getTime() + timeDiffMs),
          closeTime: new Date(slot.closeTime.getTime() + timeDiffMs),
          deadlines: shiftDeadlinesByMs(slot.deadlines, timeDiffMs),
        }
      : slot,
  )
}

const handleCopySlotOnTimeAxis = (slotId: string, timeDiffMs: number) => {
  if (timeDiffMs === 0) return
  const source = slots.value.find((s) => s.id === slotId)
  if (!source || source.readOnly) return
  slots.value = [...slots.value, buildCopiedSlotOnTimeAxis(source, timeDiffMs)]
}

const handleBulkCopySlotsOnTimeAxis = (slotIds: string[], timeDiffMs: number) => {
  if (timeDiffMs === 0) return
  const ids = new Set(slotIds)
  const sources = slots.value.filter((s) => ids.has(s.id) && !s.readOnly)
  if (sources.length === 0) return
  slots.value = [
    ...slots.value,
    ...sources.map((s) => buildCopiedSlotOnTimeAxis(s, timeDiffMs)),
  ]
}

const handleChangeSlotTime = (slotId: string, openTime: Date, closeTime: Date) => {
  slots.value = slots.value.map((slot) =>
    slot.id === slotId && !slot.readOnly
      ? { ...slot, openTime, closeTime }
      : slot,
  )
}

const handleCanvasContextMenuAction = (
  actionId: string,
  timestamp: Date,
  destinationId: string,
) => {
  if (actionId !== 'create-flight') return
  if (!destinations.some((d) => d.id === destinationId)) return
  const serial = String(slots.value.length + 1).padStart(4, '0')
  const slotId = `NEW-${serial}`
  const openTime = new Date(timestamp)
  const closeTime = new Date(openTime.getTime() + 60 * 60 * 1000)
  slots.value = [
    ...slots.value,
    {
      id: slotId,
      displayName: slotId,
      group: slotId,
      openTime,
      closeTime,
      destinationId,
    },
  ]
}

const handleSlotContextMenuAction = (actionId: string, slotId: string) => {
  if (actionId !== 'delete') return
  slots.value = slots.value.filter((slot) => slot.id !== slotId)
}
</script>

<style scoped>
.demo-wrapper {
  height: 100vh;
  width: 100%;
  margin: 0;
  background: #fff;
}
</style>
