import GanttEditor from './GanttEditor.vue'

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
} from '../components/gantt-editor-lib/chart/props'

export type { GanttEditorRulerMode } from '../components/gantt-editor-lib/chart/props'
export type { HelpOverlayTileDefinition } from '../components/gantt-editor-lib/chart/help-overlay/tile'

export {
    getSelectionItemDisplayName,
    getClipboardItemDisplayName,
} from '../components/gantt-editor-lib/chart/props'

export { GanttChartCanvasController } from '../components/gantt-editor-lib/chart/controller'

export { GanttEditor }
export default GanttEditor
