import { CommonModule } from '@angular/common'
import { Component, HostListener, ViewChild } from '@angular/core'
import {
  GanttEditorAngularComponent,
  GanttEditorTopContentDirective,
  type GanttEditorCanvasContextMenuAction,
  type GanttEditorDestination,
  type GanttEditorDestinationGroup,
  type GanttEditorMarkedRegion,
  type GanttEditorSlot,
  type GanttEditorSuggestion,
  type GanttEditorVerticalMarker,
} from '../../../../../src/angular'

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [CommonModule, GanttEditorAngularComponent, GanttEditorTopContentDirective],
  template: `
    <div class="page">
      <gantt-editor-angular
        #ganttEditorRef
        [isReadOnly]="isReadOnly"
        [startTime]="startTime"
        [endTime]="endTime"
        [slots]="slots"
        [destinations]="destinations"
        [destinationGroups]="destinationGroups"
        [suggestions]="suggestions"
        [verticalMarkers]="verticalMarkers"
        [contextMenuActions]="contextMenuActions"
        [markedRegion]="markedRegion"
        [activateRulers]="'GLOBAL'"
        [topContentPortion]="topContentPortion"
        (onTopContentPortionChange)="onTopContentPortionChange($event)"
        (onSelectionChange)="onSelectionChange($event)"
      >
        <div *ngIf="topContentPortion > 0" ganttEditorTopContent class="toolbar">
          <button
            type="button"
            (click)="toggleReadOnly()"
            [style.background]="isReadOnly ? '#e74c3c' : '#27ae60'"
          >
            {{ isReadOnly ? 'Read-Only Mode' : 'Editable Mode' }}
          </button>

          <button
            type="button"
            data-testid="toggle-marked-region-button"
            (click)="toggleMarkedRegion()"
            [style.background]="markedRegion ? '#e67e22' : '#95a5a6'"
          >
            {{ markedRegion ? 'Disable' : 'Enable' }} Marked Region
          </button>

          <button
            type="button"
            data-testid="clear-selection-button"
            (click)="handleClearSelection()"
            style="background: #3498db"
          >
            Clear Selection
          </button>

          <button
            type="button"
            data-testid="delete-selection-button"
            (click)="handleDeleteSelection()"
            [disabled]="selectedSlotIds.length === 0"
            [style.background]="selectedSlotIds.length > 0 ? '#c0392b' : '#95a5a6'"
          >
            Delete Selection ({{ selectedSlotIds.length }})
          </button>

          <div *ngIf="eventMessage" class="event-message">{{ eventMessage }}</div>
        </div>
      </gantt-editor-angular>
    </div>
  `,
  styles: [
    `
      .page {
        height: 100vh;
        width: 100%;
        margin: 0 auto;
      }

      .toolbar {
        display: flex;
        align-items: center;
        gap: 10px;
        height: 100%;
        padding: 10px;
        background: #f5f5f5;
        border-bottom: 1px solid #ddd;
        box-sizing: border-box;
      }

      button {
        color: #fff;
        border: 1px solid #ccc;
        border-radius: 4px;
        padding: 8px 16px;
        cursor: pointer;
        font-weight: 700;
      }

      button[disabled] {
        cursor: not-allowed;
      }

      .event-message {
        padding: 6px 12px;
        background: #333;
        color: #fff;
        border-radius: 4px;
        font-size: 14px;
      }
    `,
  ],
})
export class HomePageComponent {
  @ViewChild('ganttEditorRef')
  private ganttEditorRef?: GanttEditorAngularComponent

  readonly startTime = new Date('2025-01-01T00:00:00Z')
  readonly endTime = new Date('2025-01-01T23:59:59Z')

  isReadOnly = false
  topContentPortion = 0.1
  eventMessage = ''
  selectedSlotIds: string[] = []

  slots: GanttEditorSlot[] = [
    {
      id: 'LH123-20250101-F',
      displayName: 'LH123 | F',
      group: 'LH123',
      openTime: new Date('2025-01-01T10:00:00Z'),
      closeTime: new Date('2025-01-01T12:00:00Z'),
      destinationId: 'chute-1',
      deadlines: [
        { id: 'std', timestamp: new Date('2025-01-01T13:00:00Z').getTime() },
        { id: 'etd', timestamp: new Date('2025-01-01T13:25:00Z').getTime() },
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

  readonly destinations: GanttEditorDestination[] = [
    { id: 'chute-1', displayName: 'Chute 1', active: true, groupId: 'allocated' },
    { id: 'chute-2', displayName: 'Chute 2', active: true, groupId: 'allocated' },
    { id: 'chute-3', displayName: 'Chute 3', active: true, groupId: 'allocated' },
    { id: 'UNALLOCATED', displayName: 'Unallocated', active: true, groupId: 'unallocated' },
  ]

  readonly destinationGroups: GanttEditorDestinationGroup[] = [
    { id: 'allocated', displayName: 'Allocated Chutes', heightPortion: 0.8 },
    { id: 'unallocated', displayName: 'Unallocated', heightPortion: 0.2 },
  ]

  readonly suggestions: GanttEditorSuggestion[] = []
  readonly verticalMarkers: GanttEditorVerticalMarker[] = []
  readonly contextMenuActions: GanttEditorCanvasContextMenuAction[] = []
  markedRegion: GanttEditorMarkedRegion | null = null

  onTopContentPortionChange([newPortion]: [number, number]): void {
    this.topContentPortion = newPortion
  }

  onSelectionChange(slotIds: string[]): void {
    this.selectedSlotIds = slotIds
  }

  toggleReadOnly(): void {
    this.isReadOnly = !this.isReadOnly
  }

  toggleMarkedRegion(): void {
    this.markedRegion =
      this.markedRegion === null
        ? {
            startTime: new Date('2025-01-01T10:30:00Z'),
            endTime: new Date('2025-01-01T12:30:00Z'),
            destinationId: 'chute-1',
          }
        : null
  }

  handleClearSelection(): void {
    this.ganttEditorRef?.clearSelection()
    this.showEventMessage('Selection cleared programmatically')
  }

  handleDeleteSelection(): void {
    if (this.selectedSlotIds.length === 0) return
    const selected = new Set(this.selectedSlotIds)
    this.slots = this.slots.filter((slot) => !selected.has(slot.id))
    this.ganttEditorRef?.clearSelection()
    this.showEventMessage(`Deleted ${selected.size} selected slot(s)`)
  }

  @HostListener('window:keydown', ['$event'])
  onWindowKeydown(event: KeyboardEvent): void {
    if (event.key.toLowerCase() !== 't') return
    this.topContentPortion = this.topContentPortion === 0 ? 0.1 : 0
  }

  private showEventMessage(message: string): void {
    this.eventMessage = message
    setTimeout(() => {
      if (this.eventMessage === message) {
        this.eventMessage = ''
      }
    }, 2000)
  }
}
