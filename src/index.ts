import GanttEditorComponent from './components/GanttEditorComponent.vue'
export type {
    GanttEditorSlot,
    GanttEditorDestination,
    GanttEditorDestinationGroup,
    GanttEditorMarkedRegion,
    GanttEditorSuggestion,
    GanttEditorCanvasContextMenuAction,
    GanttEditorVerticalMarker,
    GanttEditorSlotWithUiAttributes,
    GanttEditorXAxisOptions,
} from './components/gantt-editor-lib/chart/types.ts'
export type {
    GanttEditorProps,
    GanttEditorCallbacks,
    GanttEditorHost,
} from './components/gantt-editor-lib/chart/gantt_canvas_props'
export type { GanttEditorRulerMode } from './components/gantt-editor-lib/chart/gantt_canvas_props'
export type { HelpOverlayTileDefinition } from './components/gantt-editor-lib/chart/help_overlay/help_overlay_tile'
export {
    getSelectionItemDisplayName,
    getClipboardItemDisplayName,
} from './components/gantt-editor-lib/chart/gantt_canvas_props'
export { GanttChartCanvasController } from './components/gantt-editor-lib/chart/gantt_chart_canvas_controller'

// Named export
export { GanttEditorComponent }

// Default export
export default GanttEditorComponent
