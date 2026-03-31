import GanttEditorComponent from './components/GanttEditorComponentCanvas.vue'
export type {
    GanttEditorSlot,
    GanttEditorDestination,
    GanttEditorDestinationGroup,
    GanttEditorMarkedRegion,
    GanttEditorSuggestion,
    GanttEditorVerticalMarker,
    GanttEditorSlotWithUiAttributes,
    GanttEditorXAxisOptions,
} from './components/gantt-editor-lib/chart/types.ts'
export type {
    GanttEditorCanvasProps,
    GanttEditorCanvasCallbacks,
    GanttChartCanvasHost,
} from './components/gantt-editor-lib/chart/gantt_canvas_props'
export { getClipboardItemDisplayName } from './components/gantt-editor-lib/chart/gantt_canvas_props'
export { GanttChartCanvasController } from './components/gantt-editor-lib/chart/gantt_chart_canvas_controller'

// Named export
export { GanttEditorComponent }

// Default export
export default GanttEditorComponent
