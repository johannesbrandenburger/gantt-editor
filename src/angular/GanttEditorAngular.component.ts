import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ContentChild,
  Directive,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core'
import { CommonModule } from '@angular/common'
import type { GanttEditorProps } from '../components/gantt-editor-lib/chart/gantt_canvas_props'
import { GanttChartCanvasController } from '../components/gantt-editor-lib/chart/gantt_chart_canvas_controller'

type SlotPointMode = 'center' | 'left-edge' | 'right-edge'

type GanttCanvasTestApi = {
  flush: () => void
  refreshSelectionFromStorage: () => void
  getState: () => ReturnType<GanttChartCanvasController['getTestState']>
  probeCanvasPoint: (x: number, y: number) => ReturnType<GanttChartCanvasController['probeCanvasPoint']>
  findSlotPoint: (slotId: string, mode?: SlotPointMode) => ReturnType<GanttChartCanvasController['findSlotPoint']>
}

@Directive({
  selector: '[ganttEditorTopContent]',
})
export class GanttEditorTopContentDirective {}

@Component({
  selector: 'gantt-editor-angular',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      .chart-container {
        color: #000;
        position: relative;
        width: 100%;
        height: 100%;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }

      .top-content-container {
        width: 100%;
        overflow: hidden;
        background-color: white;
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
    `,
  ],
  template: `
    <div
      #chartContainer
      class="chart-container"
      (mousemove)="onContainerMouseMove($event)"
      (mouseenter)="onMouseEnter()"
      (mouseleave)="onMouseLeave()"
    >
      <div
        *ngIf="hasTopContent()"
        class="top-content-container"
        [style.height.px]="currentTopContentHeight"
      >
        <ng-content select="[ganttEditorTopContent]"></ng-content>
      </div>

      <div class="chart-canvas-wrap">
        <canvas
          #chartCanvas
          class="chart-canvas"
          (mousedown)="onCanvasMouseDown($event)"
          (pointerup)="onCanvasPointerUp($event)"
          (click)="onCanvasClick($event)"
          (dblclick)="onCanvasDoubleClick($event)"
          (contextmenu)="$event.preventDefault()"
          (mousemove)="onChartMouseMove($event)"
          (mouseleave)="onChartMouseLeave()"
        ></canvas>
      </div>
    </div>
  `,
})
export class GanttEditorAngularComponent implements GanttEditorProps, AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) startTime!: Date
  @Input({ required: true }) endTime!: Date
  @Input({ required: true }) slots!: GanttEditorProps['slots']
  @Input({ required: true }) destinations!: GanttEditorProps['destinations']
  @Input({ required: true }) destinationGroups!: GanttEditorProps['destinationGroups']
  @Input({ required: true }) suggestions!: GanttEditorProps['suggestions']
  @Input() activateRulers?: GanttEditorProps['activateRulers']
  @Input() verticalMarkers?: GanttEditorProps['verticalMarkers']
  @Input() contextMenuActions?: GanttEditorProps['contextMenuActions']
  @Input({ required: true }) markedRegion!: GanttEditorProps['markedRegion']
  @Input({ required: true }) isReadOnly!: boolean
  @Input() topContentPortion?: number
  @Input() xAxisOptions?: GanttEditorProps['xAxisOptions']
  @Input() hoverPreviewMaxClipboardSize?: number
  @Input() features?: GanttEditorProps['features']
  @Input() helpOverlayTiles?: GanttEditorProps['helpOverlayTiles']
  @Input() helpOverlayTileIds?: GanttEditorProps['helpOverlayTileIds']

  @Output() onChangeStartAndEndTime = new EventEmitter<[Date, Date]>()
  @Output() onChangeDestinationId = new EventEmitter<[string, string, boolean]>()
  @Output() onBulkChangeDestinationId = new EventEmitter<[string[], string, boolean]>()
  @Output() onCopyToDestinationId = new EventEmitter<[string, string, boolean]>()
  @Output() onBulkCopyToDestinationId = new EventEmitter<[string[], string, boolean]>()
  @Output() onMoveSlotOnTimeAxis = new EventEmitter<[string, number, boolean]>()
  @Output() onBulkMoveSlotsOnTimeAxis = new EventEmitter<[string[], number, boolean]>()
  @Output() onCopySlotOnTimeAxis = new EventEmitter<[string, number, boolean]>()
  @Output() onBulkCopySlotsOnTimeAxis = new EventEmitter<[string[], number, boolean]>()
  @Output() onChangeSlotTime = new EventEmitter<[string, Date, Date]>()
  @Output() onSelectionChange = new EventEmitter<string[]>()
  @Output() onClickOnSlot = new EventEmitter<string>()
  @Output() onHoverOnSlot = new EventEmitter<string>()
  @Output() onDoubleClickOnSlot = new EventEmitter<string>()
  @Output() onContextClickOnSlot = new EventEmitter<string>()
  @Output() onTopContentPortionChange = new EventEmitter<[number, number]>()
  @Output() onChangeVerticalMarker = new EventEmitter<[string, Date]>()
  @Output() onClickVerticalMarker = new EventEmitter<string>()
  @Output() onContextMenuAction = new EventEmitter<[string, Date, string]>()

  @ViewChild('chartContainer', { static: true })
  private chartContainerRef!: ElementRef<HTMLElement>

  @ViewChild('chartCanvas', { static: true })
  private chartCanvasRef!: ElementRef<HTMLCanvasElement>

  @ContentChild(GanttEditorTopContentDirective)
  private topContentDirective: GanttEditorTopContentDirective | null = null

  currentTopContentHeight = 0
  readonly ganttCanvasTestApi: GanttCanvasTestApi = {
    flush: () => this.controller.flushForTests(),
    refreshSelectionFromStorage: () => this.controller.updateSelection(),
    getState: () => this.controller.getTestState(),
    probeCanvasPoint: (x: number, y: number) => this.controller.probeCanvasPoint(x, y),
    findSlotPoint: (slotId: string, mode: SlotPointMode = 'center') =>
      this.controller.findSlotPoint(slotId, mode),
  }

  private static readonly INITIAL_CONTROLLER_PROPS: GanttEditorProps = {
    startTime: new Date(0),
    endTime: new Date(1),
    slots: [],
    destinations: [],
    destinationGroups: [],
    suggestions: [],
    markedRegion: null,
    isReadOnly: true,
  }

  private readonly controller = new GanttChartCanvasController(
    GanttEditorAngularComponent.INITIAL_CONTROLLER_PROPS,
    {
      onChangeStartAndEndTime: (start, end) => this.onChangeStartAndEndTime.emit([start, end]),
      onTopContentPortionChange: (portion, heightPx) =>
        this.onTopContentPortionChange.emit([portion, heightPx]),
      onChangeSlotTime: (slotId, openTime, closeTime) =>
        this.onChangeSlotTime.emit([slotId, openTime, closeTime]),
      onChangeDestinationId: (slotId, destinationId, preview) =>
        this.onChangeDestinationId.emit([slotId, destinationId, preview]),
      onBulkChangeDestinationId: (slotIds, destinationId, preview) =>
        this.onBulkChangeDestinationId.emit([slotIds, destinationId, preview]),
      onCopyToDestinationId: (slotId, destinationId, preview) =>
        this.onCopyToDestinationId.emit([slotId, destinationId, preview]),
      onBulkCopyToDestinationId: (slotIds, destinationId, preview) =>
        this.onBulkCopyToDestinationId.emit([slotIds, destinationId, preview]),
      onMoveSlotOnTimeAxis: (slotId, timeDiffMs, preview) =>
        this.onMoveSlotOnTimeAxis.emit([slotId, timeDiffMs, preview]),
      onBulkMoveSlotsOnTimeAxis: (slotIds, timeDiffMs, preview) =>
        this.onBulkMoveSlotsOnTimeAxis.emit([slotIds, timeDiffMs, preview]),
      onCopySlotOnTimeAxis: (slotId, timeDiffMs, preview) =>
        this.onCopySlotOnTimeAxis.emit([slotId, timeDiffMs, preview]),
      onBulkCopySlotsOnTimeAxis: (slotIds, timeDiffMs, preview) =>
        this.onBulkCopySlotsOnTimeAxis.emit([slotIds, timeDiffMs, preview]),
      onClickOnSlot: (slotId) => this.onClickOnSlot.emit(slotId),
      onHoverOnSlot: (slotId) => this.onHoverOnSlot.emit(slotId),
      onDoubleClickOnSlot: (slotId) => this.onDoubleClickOnSlot.emit(slotId),
      onContextClickOnSlot: (slotId) => this.onContextClickOnSlot.emit(slotId),
      onVerticalMarkerChange: (id, date) => this.onChangeVerticalMarker.emit([id, date]),
      onVerticalMarkerClick: (id) => this.onClickVerticalMarker.emit(id),
      onContextMenuAction: (actionId, timestamp, destinationId) =>
        this.onContextMenuAction.emit([actionId, timestamp, destinationId]),
    },
    {
      onSelectionSlotIds: (slotIds) => this.onSelectionChange.emit(slotIds),
      onTopContentHeightPx: (heightPx) => {
        this.currentTopContentHeight = heightPx
        this.cdr.markForCheck()
      },
    },
  )

  private refreshQueued = false
  private isAttached = false
  private readonly exposeTestApi = typeof window !== 'undefined'
  private registeredTestApi: GanttCanvasTestApi | null = null

  constructor(
    private readonly cdr: ChangeDetectorRef,
    private readonly ngZone: NgZone,
  ) {}

  ngAfterViewInit(): void {
    // Inputs are assigned after construction; sync the model before first render.
    this.controller.refreshModel(this.propsSnapshot())
    this.controller.updateSelection()
    this.controller.attach(this.chartContainerRef.nativeElement, this.chartCanvasRef.nativeElement)
    this.installTestApi()
    this.isAttached = true
  }

  ngOnChanges(_changes: SimpleChanges): void {
    if (!this.isAttached) return
    this.queueRefreshModel()
  }

  ngOnDestroy(): void {
    this.uninstallTestApi()
    this.controller.detach()
    this.isAttached = false
  }

  get chartCanvas(): HTMLCanvasElement | null {
    return this.chartCanvasRef?.nativeElement ?? null
  }

  hasTopContent(): boolean {
    return Boolean(this.topContentDirective) || Boolean(this.topContentPortion)
  }

  clearSelection(): void {
    this.controller.clearSelection()
  }

  clearClipboard(): void {
    this.controller.clearSelection()
  }

  onContainerMouseMove(event: MouseEvent): void {
    this.controller.onContainerMouseMove(event)
  }

  onChartMouseMove(event: MouseEvent): void {
    this.controller.onChartMouseMove(event)
  }

  onChartMouseLeave(): void {
    this.controller.onChartMouseLeave()
  }

  onCanvasMouseDown(event: MouseEvent): void {
    this.controller.onCanvasMouseDown(event)
  }

  onCanvasPointerUp(event: PointerEvent): void {
    this.controller.onCanvasPointerUp(event)
  }

  onCanvasClick(event: MouseEvent): void {
    this.controller.onCanvasClick(event)
  }

  onCanvasDoubleClick(event: MouseEvent): void {
    this.controller.onCanvasDoubleClick(event)
  }

  onMouseEnter(): void {
    this.controller.onMouseEnter()
  }

  onMouseLeave(): void {
    this.controller.onMouseLeave()
  }

  private queueRefreshModel(): void {
    if (this.refreshQueued) return
    this.refreshQueued = true
    this.ngZone.runOutsideAngular(() => {
      queueMicrotask(() => {
        this.refreshQueued = false
        this.controller.refreshModel(this.propsSnapshot())
      })
    })
  }

  private installTestApi(): void {
    if (!this.exposeTestApi || typeof window === 'undefined') return
    this.registeredTestApi = this.ganttCanvasTestApi
    ;(window as Window & { __ganttCanvasTestApi?: GanttCanvasTestApi }).__ganttCanvasTestApi =
      this.registeredTestApi
  }

  private uninstallTestApi(): void {
    if (!this.exposeTestApi || typeof window === 'undefined') return
    const w = window as Window & { __ganttCanvasTestApi?: GanttCanvasTestApi }
    if (w.__ganttCanvasTestApi === this.registeredTestApi) {
      delete w.__ganttCanvasTestApi
    }
    this.registeredTestApi = null
  }

  private propsSnapshot(): GanttEditorProps {
    return {
      startTime: this.startTime,
      endTime: this.endTime,
      slots: this.slots,
      destinations: this.destinations,
      destinationGroups: this.destinationGroups,
      suggestions: this.suggestions,
      activateRulers: this.activateRulers,
      verticalMarkers: this.verticalMarkers,
      contextMenuActions: this.contextMenuActions,
      markedRegion: this.markedRegion,
      isReadOnly: this.isReadOnly,
      topContentPortion: this.topContentPortion,
      xAxisOptions: this.xAxisOptions,
      hoverPreviewMaxClipboardSize: this.hoverPreviewMaxClipboardSize,
      features: this.features,
      helpOverlayTiles: this.helpOverlayTiles,
      helpOverlayTileIds: this.helpOverlayTileIds,
    }
  }
}