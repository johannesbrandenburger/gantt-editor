import { Component } from '@angular/core'
import {
  GanttEditorAngularComponent,
  type GanttEditorDestination,
  type GanttEditorDestinationGroup,
  type GanttEditorSlot,
// } from '@pf/gantt-editor-component-angular'
} from '../../../../../src/angular'

@Component({
  selector: 'app-small-example-page',
  standalone: true,
  imports: [GanttEditorAngularComponent],
  template: `
    <div class="page">
      <gantt-editor-angular
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
        (onBulkChangeDestinationId)="handleBulkChangeDestinationId($event)"
        (onCopyToDestinationId)="handleCopyToDestinationId($event)"
        (onBulkCopyToDestinationId)="handleBulkCopyToDestinationId($event)"
        (onMoveSlotOnTimeAxis)="handleMoveSlotOnTimeAxis($event)"
        (onBulkMoveSlotsOnTimeAxis)="handleBulkMoveSlotsOnTimeAxis($event)"
        (onCopySlotOnTimeAxis)="handleCopySlotOnTimeAxis($event)"
        (onBulkCopySlotsOnTimeAxis)="handleBulkCopySlotsOnTimeAxis($event)"
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
      deadline: new Date('2025-01-01T13:00:00Z'),
      secondaryDeadline: new Date('2025-01-01T13:25:00Z'),
      deadlineColor: '#9b59b6',
      secondaryDeadlineColor: '#e74c3c',
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

  handleChangeDestinationId([slotId, newDestinationId]: [string, string, boolean]): void {
    console.log(`onChangeDestinationId(${slotId}, ${newDestinationId})`)
  }

  handleBulkChangeDestinationId([slotIds, newDestinationId]: [string[], string, boolean]): void {
    console.log(`onBulkChangeDestinationId(${slotIds.join(',')}, ${newDestinationId})`)
  }

  handleCopyToDestinationId([slotId, newDestinationId]: [string, string, boolean]): void {
    console.log(`onCopyToDestinationId(${slotId}, ${newDestinationId})`)
  }

  handleBulkCopyToDestinationId([slotIds, newDestinationId]: [string[], string, boolean]): void {
    console.log(`onBulkCopyToDestinationId(${slotIds.join(',')}, ${newDestinationId})`)
  }

  handleMoveSlotOnTimeAxis([slotId, timeDiffMs]: [string, number, boolean]): void {
    console.log(`onMoveSlotOnTimeAxis(${slotId}, ${timeDiffMs})`)
  }

  handleBulkMoveSlotsOnTimeAxis([slotIds, timeDiffMs]: [string[], number, boolean]): void {
    console.log(`onBulkMoveSlotsOnTimeAxis(${slotIds.join(',')}, ${timeDiffMs})`)
  }

  handleCopySlotOnTimeAxis([slotId, timeDiffMs]: [string, number, boolean]): void {
    console.log(`onCopySlotOnTimeAxis(${slotId}, ${timeDiffMs})`)
  }

  handleBulkCopySlotsOnTimeAxis([slotIds, timeDiffMs]: [string[], number, boolean]): void {
    console.log(`onBulkCopySlotsOnTimeAxis(${slotIds.join(',')}, ${timeDiffMs})`)
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
