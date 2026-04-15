import GanttEditorComponent from './GanttEditorComponent.vue'

export type {
    GanttEditorSlot,
    GanttEditorSlotDeadline,
    GanttEditorDestination,
    GanttEditorDestinationGroup,
    GanttEditorMarkedRegion,
    GanttEditorSuggestion,
    GanttEditorCanvasContextMenuAction,
    GanttEditorSlotContextMenuAction,
    GanttEditorVerticalMarker,
    GanttEditorSlotWithUiAttributes,
    GanttEditorXAxisOptions,
} from '../components/gantt-editor-lib/chart/types.ts'

export type {
    GanttEditorProps,
    GanttEditorCallbacks,
    GanttEditorHost,
    GanttEditorFeature,
} from '../components/gantt-editor-lib/chart/gantt_canvas_props'

export type { GanttEditorRulerMode } from '../components/gantt-editor-lib/chart/gantt_canvas_props'
export type { HelpOverlayTileDefinition } from '../components/gantt-editor-lib/chart/help_overlay/help_overlay_tile'

export {
    getSelectionItemDisplayName,
    getClipboardItemDisplayName,
} from '../components/gantt-editor-lib/chart/gantt_canvas_props'

export { GanttChartCanvasController } from '../components/gantt-editor-lib/chart/gantt_chart_canvas_controller'

export { GanttEditorComponent }
export default GanttEditorComponent
