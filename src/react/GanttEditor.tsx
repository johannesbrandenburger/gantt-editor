import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import type {
  GanttEditorCallbacks,
  GanttEditorProps as GanttEditorCanvasProps,
} from '../components/gantt-editor-lib/chart/props'
import { GanttChartCanvasController } from '../components/gantt-editor-lib/chart/controller'

type SlotPointMode = 'center' | 'left-edge' | 'right-edge'

type GanttCanvasTestApi = {
  flush: () => void
  refreshSelectionFromStorage: () => void
  getState: () => ReturnType<GanttChartCanvasController['getTestState']>
  probeCanvasPoint: (x: number, y: number) => ReturnType<GanttChartCanvasController['probeCanvasPoint']>
  findSlotPoint: (slotId: string, mode?: SlotPointMode) => ReturnType<GanttChartCanvasController['findSlotPoint']>
}

export interface GanttEditorWrapperProps extends GanttEditorCanvasProps {
  onChangeStartAndEndTime?: (start: Date, end: Date) => void
  onChangeDestinationId?: (slotId: string, destinationId: string, preview: boolean) => void
  onBulkChangeDestinationId?: (slotIds: string[], destinationId: string, preview: boolean) => void
  onCopyToDestinationId?: (slotId: string, destinationId: string, preview: boolean) => void
  onBulkCopyToDestinationId?: (slotIds: string[], destinationId: string, preview: boolean) => void
  onMoveSlotOnTimeAxis?: (slotId: string, timeDiffMs: number, preview: boolean) => void
  onBulkMoveSlotsOnTimeAxis?: (slotIds: string[], timeDiffMs: number, preview: boolean) => void
  onCopySlotOnTimeAxis?: (slotId: string, timeDiffMs: number, preview: boolean) => void
  onBulkCopySlotsOnTimeAxis?: (slotIds: string[], timeDiffMs: number, preview: boolean) => void
  onChangeSlotTime?: (slotId: string, openTime: Date, closeTime: Date) => void
  onSelectionChange?: (slotIds: string[]) => void
  onClickOnSlot?: (slotId: string) => void
  onHoverOnSlot?: (slotId: string) => void
  onDoubleClickOnSlot?: (slotId: string) => void
  onContextClickOnSlot?: (slotId: string) => void
  onTopContentPortionChange?: (portion: number, heightPx: number) => void
  onChangeVerticalMarker?: (id: string, date: Date) => void
  onClickVerticalMarker?: (id: string) => void
  onContextMenuAction?: (actionId: string, timestamp: Date, destinationId: string) => void
  onSlotContextMenuAction?: (actionId: string, slotId: string) => void
  topContent?: ReactNode
  className?: string
  style?: CSSProperties
}

export interface GanttEditorRef {
  clearSelection: () => void
  clearClipboard: () => void
  chartCanvas: HTMLCanvasElement | null
  ganttCanvasTestApi: GanttCanvasTestApi
}

const containerStyle: CSSProperties = {
  color: '#000',
  position: 'relative',
  width: '100%',
  height: '100%',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
}

const topContentStyle = (height: number): CSSProperties => ({
  width: '100%',
  overflow: 'hidden',
  backgroundColor: 'white',
  height,
})

const chartCanvasWrapStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  width: '100%',
  position: 'relative',
}

const chartCanvasStyle: CSSProperties = {
  display: 'block',
}

function snapshotProps(props: GanttEditorWrapperProps): GanttEditorCanvasProps {
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
  }
}

function markedRegionKey(markedRegion: GanttEditorCanvasProps['markedRegion']): string {
  if (!markedRegion) return 'null'
  return `${markedRegion.destinationId}|${markedRegion.startTime.getTime()}|${markedRegion.endTime.getTime()}`
}

export const GanttEditor = forwardRef<GanttEditorRef, GanttEditorWrapperProps>(
  (props, ref) => {
    const propsRef = useRef(props)
    propsRef.current = props

    const containerRef = useRef<HTMLDivElement | null>(null)
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const refreshQueuedRef = useRef(false)
    const exposeTestApi = import.meta.env.DEV || import.meta.env.MODE === 'test'
    const registeredTestApiRef = useRef<GanttCanvasTestApi | null>(null)
    const [currentTopContentHeight, setCurrentTopContentHeight] = useState(0)

    const controllerRef = useRef<GanttChartCanvasController | null>(null)
    if (!controllerRef.current) {
      const callbacks: GanttEditorCallbacks = {
        onChangeStartAndEndTime: (start, end) => propsRef.current.onChangeStartAndEndTime?.(start, end),
        onTopContentPortionChange: (portion, heightPx) =>
          propsRef.current.onTopContentPortionChange?.(portion, heightPx),
        onChangeSlotTime: (slotId, openTime, closeTime) =>
          propsRef.current.onChangeSlotTime?.(slotId, openTime, closeTime),
        onChangeDestinationId: (slotId, destinationId, preview) =>
          propsRef.current.onChangeDestinationId?.(slotId, destinationId, preview),
        onBulkChangeDestinationId: (slotIds, destinationId, preview) =>
          propsRef.current.onBulkChangeDestinationId?.(slotIds, destinationId, preview),
        onCopyToDestinationId: (slotId, destinationId, preview) =>
          propsRef.current.onCopyToDestinationId?.(slotId, destinationId, preview),
        onBulkCopyToDestinationId: (slotIds, destinationId, preview) =>
          propsRef.current.onBulkCopyToDestinationId?.(slotIds, destinationId, preview),
        onMoveSlotOnTimeAxis: (slotId, timeDiffMs, preview) =>
          propsRef.current.onMoveSlotOnTimeAxis?.(slotId, timeDiffMs, preview),
        onBulkMoveSlotsOnTimeAxis: (slotIds, timeDiffMs, preview) =>
          propsRef.current.onBulkMoveSlotsOnTimeAxis?.(slotIds, timeDiffMs, preview),
        onCopySlotOnTimeAxis: (slotId, timeDiffMs, preview) =>
          propsRef.current.onCopySlotOnTimeAxis?.(slotId, timeDiffMs, preview),
        onBulkCopySlotsOnTimeAxis: (slotIds, timeDiffMs, preview) =>
          propsRef.current.onBulkCopySlotsOnTimeAxis?.(slotIds, timeDiffMs, preview),
        onClickOnSlot: (slotId) => propsRef.current.onClickOnSlot?.(slotId),
        onHoverOnSlot: (slotId) => propsRef.current.onHoverOnSlot?.(slotId),
        onDoubleClickOnSlot: (slotId) => propsRef.current.onDoubleClickOnSlot?.(slotId),
        onContextClickOnSlot: (slotId) => propsRef.current.onContextClickOnSlot?.(slotId),
        onVerticalMarkerChange: (id, date) => propsRef.current.onChangeVerticalMarker?.(id, date),
        onVerticalMarkerClick: (id) => propsRef.current.onClickVerticalMarker?.(id),
        onContextMenuAction: (actionId, timestamp, destinationId) =>
          propsRef.current.onContextMenuAction?.(actionId, timestamp, destinationId),
        onSlotContextMenuAction: (actionId, slotId) =>
          propsRef.current.onSlotContextMenuAction?.(actionId, slotId),
      }

      controllerRef.current = new GanttChartCanvasController(snapshotProps(props), callbacks, {
        onSelectionSlotIds: (slotIds) => {
          propsRef.current.onSelectionChange?.(slotIds)
        },
        onTopContentHeightPx: (heightPx) => {
          setCurrentTopContentHeight(heightPx)
        },
      })
    }

    const controller = controllerRef.current

    const queueRefreshModel = () => {
      if (refreshQueuedRef.current) return
      refreshQueuedRef.current = true
      queueMicrotask(() => {
        refreshQueuedRef.current = false
        controller.refreshModel(snapshotProps(propsRef.current))
      })
    }

    useEffect(() => {
      controller.updateSelection()
      if (containerRef.current && canvasRef.current) {
        controller.attach(containerRef.current, canvasRef.current)
      }
      return () => {
        controller.detach()
      }
    }, [controller])

    useEffect(() => {
      const container = containerRef.current
      const canvas = canvasRef.current
      if (!container || !canvas) return

      const handleContainerMouseEnter = () => controller.onMouseEnter()
      const handleContainerMouseLeave = () => controller.onMouseLeave()
      const handleCanvasMouseLeave = () => controller.onChartMouseLeave()

      container.addEventListener('mouseenter', handleContainerMouseEnter)
      container.addEventListener('mouseleave', handleContainerMouseLeave)
      canvas.addEventListener('mouseleave', handleCanvasMouseLeave)

      return () => {
        container.removeEventListener('mouseenter', handleContainerMouseEnter)
        container.removeEventListener('mouseleave', handleContainerMouseLeave)
        canvas.removeEventListener('mouseleave', handleCanvasMouseLeave)
      }
    }, [controller])

    const trackedMarkedRegionKey = useMemo(() => markedRegionKey(props.markedRegion), [props.markedRegion])

    useEffect(() => {
      queueRefreshModel()
    }, [
      props.startTime.getTime(),
      props.endTime.getTime(),
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
      trackedMarkedRegionKey,
    ])

    const ganttCanvasTestApi = useMemo<GanttCanvasTestApi>(
      () => ({
        flush: () => controller.flushForTests(),
        refreshSelectionFromStorage: () => controller.updateSelection(),
        getState: () => controller.getTestState(),
        probeCanvasPoint: (x: number, y: number) => controller.probeCanvasPoint(x, y),
        findSlotPoint: (slotId: string, mode: SlotPointMode = 'center') =>
          controller.findSlotPoint(slotId, mode),
      }),
      [controller],
    )

    useEffect(() => {
      if (!exposeTestApi || typeof window === 'undefined') return
      registeredTestApiRef.current = ganttCanvasTestApi
      ;(window as Window & { __ganttCanvasTestApi?: GanttCanvasTestApi }).__ganttCanvasTestApi =
        registeredTestApiRef.current

      return () => {
        const w = window as Window & { __ganttCanvasTestApi?: GanttCanvasTestApi }
        if (w.__ganttCanvasTestApi === registeredTestApiRef.current) {
          delete w.__ganttCanvasTestApi
        }
        registeredTestApiRef.current = null
      }
    }, [exposeTestApi, ganttCanvasTestApi])

    useImperativeHandle(
      ref,
      () => ({
        clearSelection: () => controller.clearSelection(),
        clearClipboard: () => controller.clearSelection(),
        chartCanvas: canvasRef.current,
        ganttCanvasTestApi,
      }),
      [controller, ganttCanvasTestApi],
    )

    const showTopContent = Boolean(props.topContent) || Boolean(props.topContentPortion)
    const mergedContainerStyle: CSSProperties = {
      ...containerStyle,
      ...props.style,
    }
    const containerClassName = props.className ? `chart-container ${props.className}` : 'chart-container'

    return (
      <div
        ref={containerRef}
        className={containerClassName}
        style={mergedContainerStyle}
        onMouseMove={(e) => controller.onContainerMouseMove(e.nativeEvent)}
        onMouseEnter={() => controller.onMouseEnter()}
        onMouseLeave={() => controller.onMouseLeave()}
      >
        {showTopContent && (
          <div className='top-content-container' style={topContentStyle(currentTopContentHeight)}>
            {props.topContent}
          </div>
        )}

        <div style={chartCanvasWrapStyle}>
          <canvas
            className='chart-canvas'
            ref={canvasRef}
            style={chartCanvasStyle}
            onMouseDown={(e) => controller.onCanvasMouseDown(e.nativeEvent)}
            onPointerUp={(e) => controller.onCanvasPointerUp(e.nativeEvent)}
            onClick={(e) => controller.onCanvasClick(e.nativeEvent)}
            onDoubleClick={(e) => controller.onCanvasDoubleClick(e.nativeEvent)}
            onContextMenu={(e) => e.preventDefault()}
            onMouseMove={(e) => controller.onChartMouseMove(e.nativeEvent)}
            onMouseLeave={() => controller.onChartMouseLeave()}
          />
        </div>
      </div>
    )
  },
)

GanttEditor.displayName = 'GanttEditor'
