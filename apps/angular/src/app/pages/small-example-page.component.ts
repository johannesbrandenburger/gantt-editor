import { Component } from '@angular/core'
import {
  GanttEditor,
  type GanttEditorDestination,
  type GanttEditorDestinationGroup,
  type GanttEditorSlot,
} from 'gantt-editor/angular'

@Component({
  selector: 'app-small-example-page',
  standalone: true,
  imports: [GanttEditor],
  template: `
    <div class="page">
      <gantt-editor
        [isReadOnly]="false"
        [startTime]="startTime"
        [endTime]="endTime"
        [slots]="slots"
        [destinations]="destinations"
        [destinationGroups]="destinationGroups"
        [markedRegion]="null"
        [suggestions]="[]"
        (onChangeStartAndEndTime)="handleChangeStartAndEndTime($event)"
        (onChangeDestinationId)="handleChangeDestinationId($event)"
        (onCopyToDestinationId)="handleCopyToDestinationId($event)"
        (onMoveSlotOnTimeAxis)="handleMoveSlotOnTimeAxis($event)"
        (onCopySlotOnTimeAxis)="handleCopySlotOnTimeAxis($event)"
        (onChangeSlotTime)="handleChangeSlotTime($event)"
        (onClickOnSlot)="handleClickOnSlot($event)"
        (onHoverOnSlot)="handleHoverOnSlot($event)"
        (onDoubleClickOnSlot)="handleDoubleClickOnSlot($event)"
        (onContextClickOnSlot)="handleContextClickOnSlot($event)"
      />
    </div>
  `,
  styles: [
    `
      .page {
        height: 100vh;
        width: 100%;
        margin: 0 auto;
      }
    `,
  ],
})
export class SmallExamplePageComponent {
  readonly startTime = new Date('2025-01-01T00:00:00Z')
  readonly endTime = new Date('2025-01-02T00:00:00Z')

  readonly slots: GanttEditorSlot[] = [
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
  ]

  readonly destinations: GanttEditorDestination[] = [
    { id: 'chute-1', displayName: 'Chute 1', active: true, groupId: 'allocated' },
    { id: 'chute-2', displayName: 'Chute 2', active: false, groupId: 'allocated' },
    { id: 'chute-3', displayName: 'Chute 3', active: true, groupId: 'allocated' },
    { id: 'UNALLOCATED', displayName: 'Unallocated', active: true, groupId: 'unallocated' },
  ]

  readonly destinationGroups: GanttEditorDestinationGroup[] = [
    { id: 'allocated', displayName: 'Allocated Chutes', heightPortion: 0.8 },
    { id: 'unallocated', displayName: 'Unallocated Chute', heightPortion: 0.2 },
  ]

  handleChangeStartAndEndTime([newStartTime, newEndTime]: [Date, Date]): void {
    console.log(`onChangeStartAndEndTime(${newStartTime}, ${newEndTime})`)
  }

  handleChangeDestinationId([slotIds, newDestinationId]: [string[], string]): void {
    console.log(`onChangeDestinationId(${slotIds.join(',')}, ${newDestinationId})`)
  }

  handleCopyToDestinationId([slotIds, newDestinationId]: [string[], string]): void {
    console.log(`onCopyToDestinationId(${slotIds.join(',')}, ${newDestinationId})`)
  }

  handleMoveSlotOnTimeAxis([slotIds, timeDiffMs]: [string[], number]): void {
    console.log(`onMoveSlotOnTimeAxis(${slotIds.join(',')}, ${timeDiffMs})`)
  }

  handleCopySlotOnTimeAxis([slotIds, timeDiffMs]: [string[], number]): void {
    console.log(`onCopySlotOnTimeAxis(${slotIds.join(',')}, ${timeDiffMs})`)
  }

  handleChangeSlotTime([slotId, newOpenTime, newCloseTime]: [string, Date, Date]): void {
    console.log(`onChangeSlotTime(${slotId}, ${newOpenTime}, ${newCloseTime})`)
  }

  handleClickOnSlot(slotId: string): void {
    console.log(`onClickOnSlot(${slotId})`)
  }

  handleHoverOnSlot(slotId: string): void {
    console.log(`onHoverOnSlot(${slotId})`)
  }

  handleDoubleClickOnSlot(slotId: string): void {
    console.log(`onDoubleClickOnSlot(${slotId})`)
  }

  handleContextClickOnSlot(slotId: string): void {
    console.log(`onContextClickOnSlot(${slotId})`)
  }
}
