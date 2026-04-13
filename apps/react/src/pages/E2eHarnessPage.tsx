import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  GanttEditorReact,
  type GanttEditorFeature,
  type GanttEditorRulerMode,
  type GanttEditorCanvasContextMenuAction,
  type GanttEditorDestination,
  type GanttEditorDestinationGroup,
  type GanttEditorMarkedRegion,
  type GanttEditorReactRef,
  type GanttEditorSlotWithUiAttributes,
  type GanttEditorSuggestion,
  type GanttEditorVerticalMarker,
} from '../../../../src/react'

type FixtureName =
  | 'core'
  | 'dense'
  | 'readonly'
  | 'markers'
  | 'suggestions'
  | 'topic-collapse'
  | 'performance'

type HarnessData = {
  startTime: Date
  endTime: Date
  slots: GanttEditorSlotWithUiAttributes[]
  destinations: GanttEditorDestination[]
  destinationGroups: GanttEditorDestinationGroup[]
  suggestions: GanttEditorSuggestion[]
  verticalMarkers: GanttEditorVerticalMarker[]
  contextMenuActions: GanttEditorCanvasContextMenuAction[]
  markedRegion: GanttEditorMarkedRegion | null
  activateRulers: GanttEditorRulerMode
  isReadOnly: boolean
  topContentPortion: number
  features?: GanttEditorFeature[]
}

type QueryInput = Partial<{
  fixture: string
  readOnly: string
  slots: string
  suggestions: string
  markers: string
  markedRegion: string
  activateRulers: string
  topContentPortion: string
  features: string
  startTime: string
  endTime: string
  data: string
}>

type HarnessApi = {
  getConfig: () => HarnessData
  setConfig: (partial: Partial<HarnessData>) => HarnessData
  resetFromUrl: () => HarnessData
  applyQuery: (query: QueryInput) => Promise<void>
  getEvents: () => Record<string, unknown[]>
  clearEvents: () => void
  callClearClipboard: () => boolean
  inspectExposedApi: (slotId: string) => {
    hasApi: boolean
    hasLayout: boolean
    probeSlotId: string | null
    foundSlotPoint: boolean
  }
  setGanttMounted: (mounted: boolean) => Promise<boolean>
}

type HarnessWindow = Window & {
  __ganttE2eHarness?: HarnessApi
}

const FEATURE_IDS: readonly GanttEditorFeature[] = [
  'select-slots',
  'brush-select-slots',
  'resize-slot-time',
  'apply-slot-suggestions',
  'collapse-topics',
  'canvas-context-menu',
  'move-vertical-markers',
  'move-vertical-markers-from-context-menu',
  'move-slots-to-destination',
  'bulk-move-slots-to-destination',
  'copy-slots-to-destination',
  'bulk-copy-slots-to-destination',
  'move-slots-on-time-axis',
  'bulk-move-slots-on-time-axis',
  'copy-slots-on-time-axis',
  'bulk-copy-slots-on-time-axis',
  'preview-slots-to-destination',
  'preview-slots-on-time-axis',
  'copy-modifier-alt',
  'time-axis-modifier-shift',
]

const FEATURE_ID_SET = new Set<GanttEditorFeature>(FEATURE_IDS)

function parseFeatures(value: string | null | undefined): GanttEditorFeature[] | undefined {
  if (!value) return undefined
  const parsed = value
    .split(',')
    .map((item) => item.trim())
    .filter((item): item is GanttEditorFeature => FEATURE_ID_SET.has(item as GanttEditorFeature))
  return parsed.length > 0 ? parsed : []
}

const destinationsBase: GanttEditorDestination[] = [
  { id: 'chute-1', displayName: 'Chute 1', active: true, groupId: 'allocated' },
  { id: 'chute-2', displayName: 'Chute 2', active: true, groupId: 'allocated' },
  { id: 'chute-3', displayName: 'Chute 3', active: true, groupId: 'allocated' },
  { id: 'UNALLOCATED', displayName: 'Unallocated', active: true, groupId: 'unallocated' },
]

const destinationGroupsBase: GanttEditorDestinationGroup[] = [
  { id: 'allocated', displayName: 'Allocated Chutes', heightPortion: 0.8 },
  { id: 'unallocated', displayName: 'Unallocated', heightPortion: 0.2 },
]

const isoDay = '2025-01-01'
const defaultStart = new Date(`${isoDay}T00:00:00Z`)
const defaultEnd = new Date(`${isoDay}T23:59:59Z`)

function parseBoolean(value: string | null | undefined, fallback = false): boolean {
  if (value == null || value === '') return fallback
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

function parseNumber(value: string | null | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function parseDate(value: string | null | undefined, fallback: Date): Date {
  if (!value) return fallback
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? fallback : parsed
}

function normalizeFixture(value: string | null | undefined): FixtureName {
  if (
    value === 'dense' ||
    value === 'readonly' ||
    value === 'markers' ||
    value === 'suggestions' ||
    value === 'topic-collapse' ||
    value === 'performance'
  ) {
    return value
  }
  return 'core'
}

function suggestionSlots(): GanttEditorSlotWithUiAttributes[] {
  return [
    {
      id: 'SUGGEST-100',
      displayName: 'SUGGEST-100',
      group: 'SUGGEST-100',
      openTime: new Date(`${isoDay}T08:30:00Z`),
      closeTime: new Date(`${isoDay}T10:00:00Z`),
      destinationId: 'chute-1',
      color: '#2980b9',
    },
  ]
}

function topicCollapseSlots(): GanttEditorSlotWithUiAttributes[] {
  return [
    {
      id: 'COLL-001-A',
      displayName: 'COLL-001-A',
      group: 'TOPIC-COLL-001',
      openTime: new Date(`${isoDay}T09:00:00Z`),
      closeTime: new Date(`${isoDay}T10:00:00Z`),
      destinationId: 'chute-1',
      color: '#16a085',
    },
    {
      id: 'COLL-001-B',
      displayName: 'COLL-001-B',
      group: 'TOPIC-COLL-001',
      openTime: new Date(`${isoDay}T10:15:00Z`),
      closeTime: new Date(`${isoDay}T11:00:00Z`),
      destinationId: 'chute-2',
      color: '#27ae60',
    },
    {
      id: 'COLL-002-A',
      displayName: 'COLL-002-A',
      group: 'TOPIC-COLL-002',
      openTime: new Date(`${isoDay}T12:00:00Z`),
      closeTime: new Date(`${isoDay}T13:00:00Z`),
      destinationId: 'chute-3',
      color: '#8e44ad',
    },
  ]
}

function coreSlots(): GanttEditorSlotWithUiAttributes[] {
  return [
    {
      id: 'LH123-20250101-F',
      displayName: 'LH123 | F',
      group: 'LH123',
      openTime: new Date(`${isoDay}T10:00:00Z`),
      closeTime: new Date(`${isoDay}T12:00:00Z`),
      destinationId: 'chute-1',
      deadline: new Date(`${isoDay}T13:00:00Z`),
      secondaryDeadline: new Date(`${isoDay}T13:25:00Z`),
      color: '#3498db',
      hoverData: 'Core slot for e2e interactions',
    },
    {
      id: 'OS200-20250101-G',
      displayName: 'OS200 | G',
      group: 'OS200',
      openTime: new Date(`${isoDay}T09:00:00Z`),
      closeTime: new Date(`${isoDay}T10:15:00Z`),
      destinationId: 'chute-2',
      color: '#2ecc71',
    },
    {
      id: 'AA300-20250101-U',
      displayName: 'AA300 | U',
      group: 'AA300',
      openTime: new Date(`${isoDay}T14:00:00Z`),
      closeTime: new Date(`${isoDay}T15:30:00Z`),
      destinationId: 'UNALLOCATED',
      color: '#9b59b6',
    },
  ]
}

function denseSlots(total: number): GanttEditorSlotWithUiAttributes[] {
  const boundedTotal = Math.max(3, Math.min(400, total))
  return Array.from({ length: boundedTotal }, (_, idx) => {
    const openHour = 1 + (idx % 20)
    const openMinute = (idx % 4) * 15
    const close = new Date(Date.UTC(2025, 0, 1, openHour + 1, openMinute, 0))
    const open = new Date(Date.UTC(2025, 0, 1, openHour, openMinute, 0))
    return {
      id: `DENSE-${String(idx + 1).padStart(4, '0')}`,
      displayName: `DENSE-${idx + 1}`,
      group: `GROUP-${Math.floor(idx / 2) + 1}`,
      openTime: open,
      closeTime: close,
      destinationId: idx % 6 === 0 ? 'UNALLOCATED' : `chute-${(idx % 3) + 1}`,
      color: idx % 2 === 0 ? '#1abc9c' : '#e67e22',
    }
  })
}

function performanceSlots(
  total: number,
  rangeStart: Date,
  rangeEnd: Date,
): GanttEditorSlotWithUiAttributes[] {
  const boundedTotal = Math.max(1, Math.min(80_000, total))
  const startMs = rangeStart.getTime()
  const endMs = Math.max(startMs + 60_000, rangeEnd.getTime())
  const spanMs = endMs - startMs

  return Array.from({ length: boundedTotal }, (_, idx) => {
    const openRatio = idx / boundedTotal
    const openMs = startMs + Math.floor(spanMs * openRatio)
    const overlapDurationDays = 10 + (idx % 4)
    const closeMs = Math.min(endMs, openMs + overlapDurationDays * 24 * 60 * 60 * 1000)
    return {
      id: `PERF-${String(idx + 1).padStart(5, '0')}`,
      displayName: `PERF-${idx + 1}`,
      group: `PERF-TOPIC-${idx + 1}`,
      openTime: new Date(openMs),
      closeTime: new Date(closeMs),
      destinationId: idx % 12 === 0 ? 'UNALLOCATED' : `chute-${(idx % 3) + 1}`,
      color: idx % 2 === 0 ? '#0d9488' : '#ea580c',
    }
  })
}

function baseData(fixture: FixtureName, slotCount: number): HarnessData {
  const performanceStart = new Date('2025-01-01T00:00:00Z')
  const performanceEnd = new Date('2025-03-31T23:59:59Z')

  const data: HarnessData = {
    startTime: fixture === 'performance' ? performanceStart : defaultStart,
    endTime: fixture === 'performance' ? performanceEnd : defaultEnd,
    slots:
      fixture === 'dense'
        ? denseSlots(slotCount)
        : fixture === 'performance'
          ? performanceSlots(slotCount, performanceStart, performanceEnd)
          : fixture === 'suggestions'
            ? suggestionSlots()
            : fixture === 'topic-collapse'
              ? topicCollapseSlots()
              : coreSlots(),
    destinations: destinationsBase,
    destinationGroups: destinationGroupsBase,
    suggestions: [],
    verticalMarkers: [],
    contextMenuActions: [],
    markedRegion: null,
    activateRulers: null,
    isReadOnly: fixture === 'readonly',
    topContentPortion: 0,
  }

  if (fixture === 'markers') {
    data.verticalMarkers = [
      { id: 'm-std', date: new Date(`${isoDay}T11:00:00Z`), color: '#e74c3c', label: 'STD' },
      { id: 'm-etd', date: new Date(`${isoDay}T11:30:00Z`), color: '#2ecc71', label: 'ETD' },
      {
        id: 'm-context-only',
        date: new Date(`${isoDay}T12:00:00Z`),
        color: '#f39c12',
        label: 'CTX',
        draggable: false,
        movableByContextMenu: true,
      },
      {
        id: 'm-drag-only',
        date: new Date(`${isoDay}T12:20:00Z`),
        color: '#34495e',
        label: 'DRAG',
        draggable: true,
        movableByContextMenu: false,
      },
    ]
    data.suggestions = [{ slotId: 'LH123-20250101-F', alternativeDestinationId: 'chute-3' }]
    data.markedRegion = {
      startTime: new Date(`${isoDay}T10:30:00Z`),
      endTime: new Date(`${isoDay}T12:30:00Z`),
      destinationId: 'multiple',
    }
    data.contextMenuActions = [{ id: 'create-flight', label: 'Create a flight here' }]
  }

  if (fixture === 'suggestions') {
    data.suggestions = [{ slotId: 'SUGGEST-100', alternativeDestinationId: 'chute-3' }]
  }

  if (fixture === 'topic-collapse') {
    data.topContentPortion = 0
  }

  return data
}

function cloneData(data: HarnessData): HarnessData {
  return {
    ...data,
    startTime: new Date(data.startTime),
    endTime: new Date(data.endTime),
    slots: data.slots.map((slot) => ({
      ...slot,
      openTime: new Date(slot.openTime),
      closeTime: new Date(slot.closeTime),
      deadline: slot.deadline ? new Date(slot.deadline) : undefined,
      secondaryDeadline: slot.secondaryDeadline ? new Date(slot.secondaryDeadline) : undefined,
    })),
    destinations: data.destinations.map((destination) => ({ ...destination })),
    destinationGroups: data.destinationGroups.map((group) => ({ ...group })),
    suggestions: data.suggestions.map((suggestion) => ({ ...suggestion })),
    verticalMarkers: data.verticalMarkers.map((marker) => ({ ...marker, date: new Date(marker.date) })),
    contextMenuActions: data.contextMenuActions.map((action) => ({ ...action })),
    markedRegion: data.markedRegion
      ? {
          ...data.markedRegion,
          startTime: new Date(data.markedRegion.startTime),
          endTime: new Date(data.markedRegion.endTime),
        }
      : null,
    activateRulers: data.activateRulers ?? null,
  }
}

function parseDataQuery(raw: string | null | undefined): Partial<HarnessData> | null {
  if (!raw) return null
  try {
    const decoded = decodeURIComponent(raw)
    const parsed = JSON.parse(decoded) as Partial<HarnessData>
    return parsed
  } catch {
    return null
  }
}

function fromQuery(query: QueryInput): HarnessData {
  const fixture = normalizeFixture(query.fixture ?? null)
  const slotCount = parseNumber(query.slots ?? null, 40)
  const data = baseData(fixture, slotCount)

  data.isReadOnly = parseBoolean(query.readOnly ?? null, data.isReadOnly)
  const rulersRaw = (query.activateRulers ?? '').toUpperCase()
  data.activateRulers = rulersRaw === 'ROW' || rulersRaw === 'GLOBAL' ? rulersRaw : null
  data.topContentPortion = Math.max(0, Math.min(0.5, parseNumber(query.topContentPortion ?? null, 0)))
  data.features = parseFeatures(query.features ?? null)
  data.startTime = parseDate(query.startTime ?? null, data.startTime)
  data.endTime = parseDate(query.endTime ?? null, data.endTime)

  if (parseBoolean(query.suggestions ?? null, data.suggestions.length > 0) && data.suggestions.length === 0) {
    data.suggestions = [{ slotId: 'LH123-20250101-F', alternativeDestinationId: 'chute-2' }]
  }
  if (parseBoolean(query.markers ?? null, data.verticalMarkers.length > 0) && data.verticalMarkers.length === 0) {
    data.verticalMarkers = [{ id: 'm-auto', date: new Date(`${isoDay}T11:45:00Z`), color: '#8e44ad', label: 'AUTO' }]
  }
  if (parseBoolean(query.markedRegion ?? null, !!data.markedRegion) && !data.markedRegion) {
    data.markedRegion = {
      startTime: new Date(`${isoDay}T09:45:00Z`),
      endTime: new Date(`${isoDay}T12:15:00Z`),
      destinationId: 'multiple',
    }
  }

  const custom = parseDataQuery(query.data ?? null)
  if (custom) {
    return cloneData({
      ...data,
      ...custom,
      startTime: custom.startTime ? new Date(custom.startTime) : data.startTime,
      endTime: custom.endTime ? new Date(custom.endTime) : data.endTime,
      slots: custom.slots
        ? custom.slots.map((slot) => ({
            ...slot,
            openTime: new Date(slot.openTime),
            closeTime: new Date(slot.closeTime),
            deadline: slot.deadline ? new Date(slot.deadline) : undefined,
            secondaryDeadline: slot.secondaryDeadline ? new Date(slot.secondaryDeadline) : undefined,
          }))
        : data.slots,
      verticalMarkers: custom.verticalMarkers
        ? custom.verticalMarkers.map((marker) => ({ ...marker, date: new Date(marker.date) }))
        : data.verticalMarkers,
      markedRegion: custom.markedRegion
        ? {
            ...custom.markedRegion,
            startTime: new Date(custom.markedRegion.startTime),
            endTime: new Date(custom.markedRegion.endTime),
          }
        : data.markedRegion,
      activateRulers: custom.activateRulers ?? data.activateRulers,
      features: custom.features ?? data.features,
    })
  }

  return cloneData(data)
}

function queryFromSearch(search: string): QueryInput {
  const params = new URLSearchParams(search)
  const query: QueryInput = {}
  params.forEach((value, key) => {
    query[key as keyof QueryInput] = value
  })
  return query
}

function buildCopiedSlot(
  source: GanttEditorSlotWithUiAttributes,
  destinationId: string,
  existingIds: Set<string>,
): GanttEditorSlotWithUiAttributes {
  let copyNumber = 1
  let nextId = `${source.id}__copy__${copyNumber}`
  while (existingIds.has(nextId)) {
    copyNumber += 1
    nextId = `${source.id}__copy__${copyNumber}`
  }
  existingIds.add(nextId)
  return {
    ...source,
    id: nextId,
    group: nextId,
    destinationId,
    isCopied: false,
  }
}

function shiftDateByMs(value: Date | undefined, timeDiffMs: number): Date | undefined {
  return value ? new Date(value.getTime() + timeDiffMs) : undefined
}

function buildCopiedSlotOnTimeAxis(
  source: GanttEditorSlotWithUiAttributes,
  timeDiffMs: number,
  existingIds: Set<string>,
): GanttEditorSlotWithUiAttributes {
  let copyNumber = 1
  let nextId = `${source.id}__time_copy__${copyNumber}`
  while (existingIds.has(nextId)) {
    copyNumber += 1
    nextId = `${source.id}__time_copy__${copyNumber}`
  }
  existingIds.add(nextId)
  return {
    ...source,
    id: nextId,
    group: nextId,
    openTime: new Date(source.openTime.getTime() + timeDiffMs),
    closeTime: new Date(source.closeTime.getTime() + timeDiffMs),
    deadline: shiftDateByMs(source.deadline, timeDiffMs),
    secondaryDeadline: shiftDateByMs(source.secondaryDeadline, timeDiffMs),
    isCopied: false,
  }
}

const pageStyle: React.CSSProperties = {
  height: '100vh',
  width: '100%',
  margin: '0 auto',
}

export function E2eHarnessPage() {
  const location = useLocation()
  const navigate = useNavigate()

  const [harnessData, setHarnessData] = useState<HarnessData>(() => fromQuery(queryFromSearch(location.search)))
  const [harnessEvents, setHarnessEvents] = useState<Record<string, unknown[]>>({})
  const [ganttMounted, setGanttMounted] = useState(true)

  const ganttEditorRef = useRef<GanttEditorReactRef | null>(null)
  const harnessDataRef = useRef(harnessData)
  const harnessEventsRef = useRef(harnessEvents)
  const ganttMountedRef = useRef(ganttMounted)
  const locationRef = useRef(location)

  useEffect(() => {
    harnessDataRef.current = harnessData
  }, [harnessData])

  useEffect(() => {
    harnessEventsRef.current = harnessEvents
  }, [harnessEvents])

  useEffect(() => {
    ganttMountedRef.current = ganttMounted
  }, [ganttMounted])

  useEffect(() => {
    locationRef.current = location
  }, [location])

  useEffect(() => {
    setHarnessData(fromQuery(queryFromSearch(location.search)))
  }, [location.search])

  const recordEvent = useCallback((name: string, payload: unknown): void => {
    setHarnessEvents((currentEvents) => {
      const current = currentEvents[name] ?? []
      return {
        ...currentEvents,
        [name]: [...current, payload],
      }
    })
  }, [])

  const logEvent = useCallback(
    (name: string, payload: unknown): void => {
      recordEvent(name, payload)
      console.log(`[e2e-harness] ${name}`, payload)
    },
    [recordEvent],
  )

  const onChangeStartAndEndTime = useCallback(
    (start: Date, end: Date): void => {
      setHarnessData((current) => ({ ...current, startTime: start, endTime: end }))
      logEvent('onChangeStartAndEndTime', { start, end })
    },
    [logEvent],
  )

  const onChangeDestinationId = useCallback(
    (slotId: string, destinationId: string, preview: boolean): void => {
      if (!preview) {
        setHarnessData((current) => ({
          ...current,
          slots: current.slots.map((slot) => (slot.id === slotId ? { ...slot, destinationId } : slot)),
        }))
      }
      logEvent('onChangeDestinationId', { slotId, destinationId, preview })
    },
    [logEvent],
  )

  const onBulkChangeDestinationId = useCallback(
    (slotIds: string[], destinationId: string, preview: boolean): void => {
      if (!preview) {
        const movedSlotIds = new Set(slotIds)
        setHarnessData((current) => ({
          ...current,
          slots: current.slots.map((slot) =>
            movedSlotIds.has(slot.id) ? { ...slot, destinationId } : slot,
          ),
        }))
      }
      logEvent('onBulkChangeDestinationId', { slotIds, destinationId, preview })
    },
    [logEvent],
  )

  const onCopyToDestinationId = useCallback(
    (slotId: string, destinationId: string, preview: boolean): void => {
      if (!preview) {
        setHarnessData((current) => {
          const existingIds = new Set(current.slots.map((slot) => slot.id))
          const source = current.slots.find((slot) => slot.id === slotId)
          if (!source || source.destinationId === destinationId) {
            return current
          }
          return {
            ...current,
            slots: [...current.slots, buildCopiedSlot(source, destinationId, existingIds)],
          }
        })
      }
      logEvent('onCopyToDestinationId', { slotId, destinationId, preview })
    },
    [logEvent],
  )

  const onBulkCopyToDestinationId = useCallback(
    (slotIds: string[], destinationId: string, preview: boolean): void => {
      if (!preview) {
        setHarnessData((current) => {
          const sourceIds = new Set(slotIds)
          const existingIds = new Set(current.slots.map((slot) => slot.id))
          const sources = current.slots.filter(
            (slot) => sourceIds.has(slot.id) && slot.destinationId !== destinationId,
          )
          if (sources.length === 0) {
            return current
          }
          return {
            ...current,
            slots: [
              ...current.slots,
              ...sources.map((source) => buildCopiedSlot(source, destinationId, existingIds)),
            ],
          }
        })
      }
      logEvent('onBulkCopyToDestinationId', { slotIds, destinationId, preview })
    },
    [logEvent],
  )

  const onChangeSlotTime = useCallback(
    (slotId: string, openTime: Date, closeTime: Date): void => {
      setHarnessData((current) => ({
        ...current,
        slots: current.slots.map((slot) =>
          slot.id === slotId
            ? {
                ...slot,
                openTime,
                closeTime,
              }
            : slot,
        ),
      }))
      logEvent('onChangeSlotTime', { slotId, openTime, closeTime })
    },
    [logEvent],
  )

  const onMoveSlotOnTimeAxis = useCallback(
    (slotId: string, timeDiffMs: number, preview: boolean): void => {
      if (!preview && timeDiffMs !== 0) {
        setHarnessData((current) => ({
          ...current,
          slots: current.slots.map((slot) =>
            slot.id === slotId
              ? {
                  ...slot,
                  openTime: new Date(slot.openTime.getTime() + timeDiffMs),
                  closeTime: new Date(slot.closeTime.getTime() + timeDiffMs),
                  deadline: shiftDateByMs(slot.deadline, timeDiffMs),
                  secondaryDeadline: shiftDateByMs(slot.secondaryDeadline, timeDiffMs),
                }
              : slot,
          ),
        }))
      }
      logEvent('onMoveSlotOnTimeAxis', { slotId, timeDiffMs, preview })
    },
    [logEvent],
  )

  const onBulkMoveSlotsOnTimeAxis = useCallback(
    (slotIds: string[], timeDiffMs: number, preview: boolean): void => {
      if (!preview && timeDiffMs !== 0) {
        const movedSlotIds = new Set(slotIds)
        setHarnessData((current) => ({
          ...current,
          slots: current.slots.map((slot) =>
            movedSlotIds.has(slot.id)
              ? {
                  ...slot,
                  openTime: new Date(slot.openTime.getTime() + timeDiffMs),
                  closeTime: new Date(slot.closeTime.getTime() + timeDiffMs),
                  deadline: shiftDateByMs(slot.deadline, timeDiffMs),
                  secondaryDeadline: shiftDateByMs(slot.secondaryDeadline, timeDiffMs),
                }
              : slot,
          ),
        }))
      }
      logEvent('onBulkMoveSlotsOnTimeAxis', { slotIds, timeDiffMs, preview })
    },
    [logEvent],
  )

  const onCopySlotOnTimeAxis = useCallback(
    (slotId: string, timeDiffMs: number, preview: boolean): void => {
      if (!preview && timeDiffMs !== 0) {
        setHarnessData((current) => {
          const existingIds = new Set(current.slots.map((slot) => slot.id))
          const source = current.slots.find((slot) => slot.id === slotId)
          if (!source) {
            return current
          }
          return {
            ...current,
            slots: [...current.slots, buildCopiedSlotOnTimeAxis(source, timeDiffMs, existingIds)],
          }
        })
      }
      logEvent('onCopySlotOnTimeAxis', { slotId, timeDiffMs, preview })
    },
    [logEvent],
  )

  const onBulkCopySlotsOnTimeAxis = useCallback(
    (slotIds: string[], timeDiffMs: number, preview: boolean): void => {
      if (!preview && timeDiffMs !== 0) {
        setHarnessData((current) => {
          const sourceIds = new Set(slotIds)
          const existingIds = new Set(current.slots.map((slot) => slot.id))
          const sources = current.slots.filter((slot) => sourceIds.has(slot.id))
          if (sources.length === 0) {
            return current
          }
          return {
            ...current,
            slots: [
              ...current.slots,
              ...sources.map((source) => buildCopiedSlotOnTimeAxis(source, timeDiffMs, existingIds)),
            ],
          }
        })
      }
      logEvent('onBulkCopySlotsOnTimeAxis', { slotIds, timeDiffMs, preview })
    },
    [logEvent],
  )

  const onClickOnSlot = useCallback(
    (slotId: string): void => {
      logEvent('onClickOnSlot', { slotId })
    },
    [logEvent],
  )

  const onHoverOnSlot = useCallback(
    (slotId: string): void => {
      logEvent('onHoverOnSlot', { slotId })
    },
    [logEvent],
  )

  const onDoubleClickOnSlot = useCallback(
    (slotId: string): void => {
      logEvent('onDoubleClickOnSlot', { slotId })
    },
    [logEvent],
  )

  const onContextClickOnSlot = useCallback(
    (slotId: string): void => {
      logEvent('onContextClickOnSlot', { slotId })
    },
    [logEvent],
  )

  const onSelectionChange = useCallback(
    (slotIds: string[]): void => {
      logEvent('onSelectionChange', { slotIds: [...slotIds] })
    },
    [logEvent],
  )

  const onChangeVerticalMarker = useCallback(
    (id: string, date: Date): void => {
      setHarnessData((current) => ({
        ...current,
        verticalMarkers: current.verticalMarkers.map((marker) =>
          marker.id === id ? { ...marker, date } : marker,
        ),
      }))
      logEvent('onChangeVerticalMarker', { id, date })
    },
    [logEvent],
  )

  const onClickVerticalMarker = useCallback(
    (id: string): void => {
      logEvent('onClickVerticalMarker', { id })
    },
    [logEvent],
  )

  const onContextMenuAction = useCallback(
    (actionId: string, timestamp: Date, destinationId: string): void => {
      logEvent('onContextMenuAction', { actionId, timestamp, destinationId })
    },
    [logEvent],
  )

  const testApi = useMemo<HarnessApi>(
    () => ({
      getConfig: () => cloneData(harnessDataRef.current),
      setConfig: (partial) => {
        const nextConfig = cloneData({ ...harnessDataRef.current, ...partial })
        setHarnessData(nextConfig)
        return cloneData(nextConfig)
      },
      resetFromUrl: () => {
        const nextConfig = fromQuery(queryFromSearch(locationRef.current.search))
        setHarnessData(nextConfig)
        return cloneData(nextConfig)
      },
      applyQuery: async (query) => {
        const params = new URLSearchParams(locationRef.current.search)
        for (const [key, value] of Object.entries(query)) {
          if (value === null || value === undefined) {
            params.delete(key)
          } else {
            params.set(key, String(value))
          }
        }
        const search = params.toString()
        navigate(
          {
            pathname: locationRef.current.pathname,
            search: search ? `?${search}` : '',
          },
          { replace: true },
        )
      },
      getEvents: () => ({ ...harnessEventsRef.current }),
      clearEvents: () => {
        setHarnessEvents({})
      },
      callClearClipboard: () => {
        const instance = ganttEditorRef.current
        if (!instance) return false
        instance.clearClipboard()
        return true
      },
      inspectExposedApi: (slotId) => {
        const instance = ganttEditorRef.current
        const api = instance?.ganttCanvasTestApi
        if (!api) {
          return {
            hasApi: false,
            hasLayout: false,
            probeSlotId: null,
            foundSlotPoint: false,
          }
        }

        api.flush()
        const state = api.getState()
        const layout = state.layout
        const point = api.findSlotPoint(slotId, 'center')
        const probeSlotId = point ? api.probeCanvasPoint(point.x, point.y).slotId : null

        return {
          hasApi: true,
          hasLayout: !!layout,
          probeSlotId,
          foundSlotPoint: !!point,
        }
      },
      setGanttMounted: async (mounted) => {
        setGanttMounted(mounted)
        await new Promise<void>((resolve, reject) => {
          const timeoutMs = 2000
          const startedAt = performance.now()

          const settle = () => {
            const w = window as Window & { __ganttCanvasTestApi?: unknown }
            const hasApi = !!w.__ganttCanvasTestApi
            const hasCanvas = !!document.querySelector('canvas.chart-canvas')
            const ready = mounted ? hasApi && hasCanvas : !hasApi && !hasCanvas
            if (ready) {
              resolve()
              return
            }
            if (performance.now() - startedAt >= timeoutMs) {
              reject(new Error('Timed out waiting for gantt mount state to settle'))
              return
            }
            requestAnimationFrame(settle)
          }

          requestAnimationFrame(settle)
        })
        return ganttMountedRef.current
      },
    }),
    [navigate],
  )

  useEffect(() => {
    ;(window as HarnessWindow).__ganttE2eHarness = testApi
    return () => {
      const w = window as HarnessWindow
      if (w.__ganttE2eHarness === testApi) {
        delete w.__ganttE2eHarness
      }
    }
  }, [testApi])

  return (
    <div style={pageStyle}>
      {ganttMounted && (
        <GanttEditorReact
          ref={ganttEditorRef}
          isReadOnly={harnessData.isReadOnly}
          startTime={harnessData.startTime}
          endTime={harnessData.endTime}
          slots={harnessData.slots}
          destinations={harnessData.destinations}
          destinationGroups={harnessData.destinationGroups}
          suggestions={harnessData.suggestions}
          verticalMarkers={harnessData.verticalMarkers}
          contextMenuActions={harnessData.contextMenuActions}
          markedRegion={harnessData.markedRegion}
          topContentPortion={harnessData.topContentPortion}
          activateRulers={harnessData.activateRulers}
          features={harnessData.features}
          onChangeStartAndEndTime={onChangeStartAndEndTime}
          onChangeDestinationId={onChangeDestinationId}
          onBulkChangeDestinationId={onBulkChangeDestinationId}
          onCopyToDestinationId={onCopyToDestinationId}
          onBulkCopyToDestinationId={onBulkCopyToDestinationId}
          onMoveSlotOnTimeAxis={onMoveSlotOnTimeAxis}
          onBulkMoveSlotsOnTimeAxis={onBulkMoveSlotsOnTimeAxis}
          onCopySlotOnTimeAxis={onCopySlotOnTimeAxis}
          onBulkCopySlotsOnTimeAxis={onBulkCopySlotsOnTimeAxis}
          onChangeSlotTime={onChangeSlotTime}
          onClickOnSlot={onClickOnSlot}
          onHoverOnSlot={onHoverOnSlot}
          onDoubleClickOnSlot={onDoubleClickOnSlot}
          onContextClickOnSlot={onContextClickOnSlot}
          onSelectionChange={onSelectionChange}
          onChangeVerticalMarker={onChangeVerticalMarker}
          onClickVerticalMarker={onClickVerticalMarker}
          onContextMenuAction={onContextMenuAction}
        />
      )}
    </div>
  )
}
