import { useEffect, useMemo, useRef, useState } from 'react'
import {
  GanttEditor,
  type GanttEditorCanvasContextMenuAction,
  type GanttEditorDestination,
  type GanttEditorDestinationGroup,
  type GanttEditorMarkedRegion,
  type GanttEditorRef,
  type GanttEditorSlot,
  type GanttEditorSuggestion,
  type GanttEditorVerticalMarker,
} from '../../../../src/react'

const pageStyle: React.CSSProperties = {
  width: '100%',
  height: '100vh',
  margin: '0 auto',
}

const toolbarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  height: '100%',
  padding: '10px',
  background: '#f5f5f5',
  borderBottom: '1px solid #ddd',
  boxSizing: 'border-box',
}

const buttonStyle: React.CSSProperties = {
  color: '#fff',
  border: '1px solid #ccc',
  borderRadius: '4px',
  padding: '8px 16px',
  cursor: 'pointer',
  fontWeight: 700,
}

const startTime = new Date('2025-01-01T00:00:00Z')
const endTime = new Date('2025-01-01T23:59:59Z')

const initialSlots: GanttEditorSlot[] = [
  {
    id: 'LH123-20250101-F',
    displayName: 'LH123 | F',
    group: 'LH123',
    openTime: new Date('2025-01-01T10:00:00Z'),
    closeTime: new Date('2025-01-01T12:00:00Z'),
    destinationId: 'chute-1',
    deadlines: [
      { id: 'std', timestamp: new Date('2025-01-01T13:00:00Z').getTime(), color: '#9e9e9e' },
      { id: 'etd', timestamp: new Date('2025-01-01T13:25:00Z').getTime(), color: '#1f1f1f' },
    ],
    hoverData: 'Main demo slot',
    color: '#3498db',
  },
  {
    id: 'OS200-20250101-G',
    displayName: 'OS200 | G',
    group: 'OS200',
    openTime: new Date('2025-01-01T09:00:00Z'),
    closeTime: new Date('2025-01-01T10:15:00Z'),
    destinationId: 'chute-2',
    color: '#2ecc71',
  },
  {
    id: 'AA300-20250101-U',
    displayName: 'AA300 | U',
    group: 'AA300',
    openTime: new Date('2025-01-01T14:00:00Z'),
    closeTime: new Date('2025-01-01T15:30:00Z'),
    destinationId: 'UNALLOCATED',
    color: '#9b59b6',
  },
]

const destinations: GanttEditorDestination[] = [
  { id: 'chute-1', displayName: 'Chute 1', active: true, groupId: 'allocated' },
  { id: 'chute-2', displayName: 'Chute 2', active: true, groupId: 'allocated' },
  { id: 'chute-3', displayName: 'Chute 3', active: true, groupId: 'allocated' },
  { id: 'UNALLOCATED', displayName: 'Unallocated', active: true, groupId: 'unallocated' },
]

const destinationGroups: GanttEditorDestinationGroup[] = [
  { id: 'allocated', displayName: 'Allocated Chutes', heightPortion: 0.8 },
  { id: 'unallocated', displayName: 'Unallocated', heightPortion: 0.2 },
]

export function HomePage() {
  const ganttEditorRef = useRef<GanttEditorRef | null>(null)
  const messageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [isReadOnly, setIsReadOnly] = useState(false)
  const [topContentPortion, setTopContentPortion] = useState(0.1)
  const [eventMessage, setEventMessage] = useState('')
  const [selectedSlotIds, setSelectedSlotIds] = useState<string[]>([])
  const [slots, setSlots] = useState<GanttEditorSlot[]>(initialSlots)
  const [markedRegion, setMarkedRegion] = useState<GanttEditorMarkedRegion | null>(null)

  const suggestions = useMemo<GanttEditorSuggestion[]>(() => [], [])
  const verticalMarkers = useMemo<GanttEditorVerticalMarker[]>(() => [], [])
  const contextMenuActions = useMemo<GanttEditorCanvasContextMenuAction[]>(() => [], [])

  const showEventMessage = (message: string): void => {
    setEventMessage(message)
    if (messageTimeoutRef.current) {
      clearTimeout(messageTimeoutRef.current)
    }
    messageTimeoutRef.current = setTimeout(() => {
      setEventMessage((current) => (current === message ? '' : current))
      messageTimeoutRef.current = null
    }, 2000)
  }

  const toggleMarkedRegion = (): void => {
    setMarkedRegion((current) =>
      current
        ? null
        : {
            startTime: new Date('2025-01-01T10:30:00Z'),
            endTime: new Date('2025-01-01T12:30:00Z'),
            destinationId: 'chute-1',
          },
    )
  }

  const handleClearSelection = (): void => {
    ganttEditorRef.current?.clearSelection()
    showEventMessage('Selection cleared programmatically')
  }

  const handleDeleteSelection = (): void => {
    if (selectedSlotIds.length === 0) return
    const selected = new Set(selectedSlotIds)
    setSlots((current) => current.filter((slot) => !selected.has(slot.id)))
    ganttEditorRef.current?.clearSelection()
    showEventMessage(`Deleted ${selected.size} selected slot(s)`)
  }

  useEffect(() => {
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 't') return
      setTopContentPortion((current) => (current === 0 ? 0.1 : 0))
    }

    window.addEventListener('keydown', onWindowKeyDown)
    return () => {
      window.removeEventListener('keydown', onWindowKeyDown)
      if (messageTimeoutRef.current) {
        clearTimeout(messageTimeoutRef.current)
      }
    }
  }, [])

  return (
    <div style={pageStyle}>
      <GanttEditor
        ref={ganttEditorRef}
        isReadOnly={isReadOnly}
        startTime={startTime}
        endTime={endTime}
        slots={slots}
        destinations={destinations}
        destinationGroups={destinationGroups}
        suggestions={suggestions}
        verticalMarkers={verticalMarkers}
        contextMenuActions={contextMenuActions}
        markedRegion={markedRegion}
        activateRulers='GLOBAL'
        topContentPortion={topContentPortion}
        onSelectionChange={setSelectedSlotIds}
        onTopContentPortionChange={(portion) => setTopContentPortion(portion)}
        topContent={
          topContentPortion > 0 ? (
            <div style={toolbarStyle}>
              <button
                type='button'
                style={{ ...buttonStyle, background: isReadOnly ? '#e74c3c' : '#27ae60' }}
                onClick={() => setIsReadOnly((current) => !current)}
              >
                {isReadOnly ? 'Read-Only Mode' : 'Editable Mode'}
              </button>

              <button
                type='button'
                data-testid='toggle-marked-region-button'
                style={{ ...buttonStyle, background: markedRegion ? '#e67e22' : '#95a5a6' }}
                onClick={toggleMarkedRegion}
              >
                {markedRegion ? 'Disable' : 'Enable'} Marked Region
              </button>

              <button
                type='button'
                data-testid='clear-selection-button'
                style={{ ...buttonStyle, background: '#3498db' }}
                onClick={handleClearSelection}
              >
                Clear Selection
              </button>

              <button
                type='button'
                data-testid='delete-selection-button'
                style={{
                  ...buttonStyle,
                  background: selectedSlotIds.length > 0 ? '#c0392b' : '#95a5a6',
                  cursor: selectedSlotIds.length > 0 ? 'pointer' : 'not-allowed',
                }}
                disabled={selectedSlotIds.length === 0}
                onClick={handleDeleteSelection}
              >
                Delete Selection ({selectedSlotIds.length})
              </button>

              {eventMessage && (
                <div
                  style={{
                    padding: '6px 12px',
                    background: '#333',
                    color: '#fff',
                    borderRadius: '4px',
                    fontSize: '14px',
                  }}
                >
                  {eventMessage}
                </div>
              )}
            </div>
          ) : null
        }
      />
    </div>
  )
}
