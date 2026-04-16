import { useMemo, useState } from 'react'
import {
  GanttEditor,
  type GanttEditorDestination,
  type GanttEditorDestinationGroup,
  type GanttEditorSlot,
// } from '@pf/gantt-editor-component-react'
} from '../../../../src/react'

const pageStyle: React.CSSProperties = {
  width: '100%',
  height: '100vh',
  margin: '0 auto',
}

export function SmallExamplePage() {
  const [startTime] = useState(() => new Date('2025-01-01T00:00:00Z'))
  const [endTime] = useState(() => new Date('2025-01-02T00:00:00Z'))

  const slots = useMemo<GanttEditorSlot[]>(
    () => [
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
        hoverData: `Departure: ${new Date('2025-01-01T13:25:00Z').toLocaleString()}`,
        color: '#3498db',
      },
    ],
    [],
  )

  const destinations = useMemo<GanttEditorDestination[]>(
    () => [
      { id: 'chute-1', displayName: 'Chute 1', active: true, groupId: 'allocated' },
      { id: 'chute-2', displayName: 'Chute 2', active: false, groupId: 'allocated' },
      { id: 'chute-3', displayName: 'Chute 3', active: true, groupId: 'allocated' },
      { id: 'UNALLOCATED', displayName: 'Unallocated', active: true, groupId: 'unallocated' },
    ],
    [],
  )

  const destinationGroups = useMemo<GanttEditorDestinationGroup[]>(
    () => [
      { id: 'allocated', displayName: 'Allocated Chutes', heightPortion: 0.8 },
      { id: 'unallocated', displayName: 'Unallocated Chute', heightPortion: 0.2 },
    ],
    [],
  )

  return (
    <div style={pageStyle}>
      <GanttEditor
        isReadOnly={false}
        startTime={startTime}
        endTime={endTime}
        slots={slots}
        destinations={destinations}
        destinationGroups={destinationGroups}
        markedRegion={null}
        suggestions={[]}
        onChangeStartAndEndTime={(newStartTime, newEndTime) =>
          console.log(`onChangeStartAndEndTime(${newStartTime}, ${newEndTime})`)
        }
        onChangeDestinationId={(slotId, newDestinationId) =>
          console.log(`onChangeDestinationId(${slotId}, ${newDestinationId})`)
        }
        onBulkChangeDestinationId={(slotIds, newDestinationId) =>
          console.log(`onBulkChangeDestinationId(${slotIds.join(',')}, ${newDestinationId})`)
        }
        onCopyToDestinationId={(slotId, newDestinationId) =>
          console.log(`onCopyToDestinationId(${slotId}, ${newDestinationId})`)
        }
        onBulkCopyToDestinationId={(slotIds, newDestinationId) =>
          console.log(`onBulkCopyToDestinationId(${slotIds.join(',')}, ${newDestinationId})`)
        }
        onMoveSlotOnTimeAxis={(slotId, timeDiffMs) =>
          console.log(`onMoveSlotOnTimeAxis(${slotId}, ${timeDiffMs})`)
        }
        onBulkMoveSlotsOnTimeAxis={(slotIds, timeDiffMs) =>
          console.log(`onBulkMoveSlotsOnTimeAxis(${slotIds.join(',')}, ${timeDiffMs})`)
        }
        onCopySlotOnTimeAxis={(slotId, timeDiffMs) =>
          console.log(`onCopySlotOnTimeAxis(${slotId}, ${timeDiffMs})`)
        }
        onBulkCopySlotsOnTimeAxis={(slotIds, timeDiffMs) =>
          console.log(`onBulkCopySlotsOnTimeAxis(${slotIds.join(',')}, ${timeDiffMs})`)
        }
        onChangeSlotTime={(slotId, newOpenTime, newCloseTime) =>
          console.log(`onChangeSlotTime(${slotId}, ${newOpenTime}, ${newCloseTime})`)
        }
        onClickOnSlot={(slotId) => console.log(`onClickOnSlot(${slotId})`)}
        onHoverOnSlot={(slotId) => console.log(`onHoverOnSlot(${slotId})`)}
        onDoubleClickOnSlot={(slotId) => console.log(`onDoubleClickOnSlot(${slotId})`)}
        onContextClickOnSlot={(slotId) => console.log(`onContextClickOnSlot(${slotId})`)}
      />
    </div>
  )
}
