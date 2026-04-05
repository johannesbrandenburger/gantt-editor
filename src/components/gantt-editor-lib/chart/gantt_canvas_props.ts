import type {
  GanttEditorDestination,
  GanttEditorDestinationGroup,
  GanttEditorMarkedRegion,
  GanttEditorSlot,
  GanttEditorSlotWithUiAttributes,
  GanttEditorSuggestion,
  GanttEditorVerticalMarker,
  GanttEditorXAxisOptions,
} from "./types";

export type GanttEditorRulerMode = "ROW" | "GLOBAL" | null;

/**
 * Framework-agnostic input model for the canvas Gantt chart.
 * Kept aligned with the Vue component’s `defineProps` surface so other frameworks
 * (e.g. Angular) can bind the same fields without redefining types.
 */
export interface GanttEditorProps {
  startTime: Date;
  endTime: Date;
  slots: Array<GanttEditorSlotWithUiAttributes>;
  destinations: Array<GanttEditorDestination>;
  destinationGroups: Array<GanttEditorDestinationGroup>;
  suggestions: Array<GanttEditorSuggestion>;
  /** Enable slot-edge snap rulers while resizing (`null` disables). */
  activateRulers?: GanttEditorRulerMode;
  verticalMarkers?: Array<GanttEditorVerticalMarker>;
  markedRegion: GanttEditorMarkedRegion | null;
  isReadOnly: boolean;
  topContentPortion?: number;
  xAxisOptions?: GanttEditorXAxisOptions;
}

/**
 * Event callbacks for the canvas chart (framework bindings wire these to outputs).
 * Required entries are invoked today; optional ones mirror legacy emit names for future handlers.
 */
export interface GanttEditorCallbacks {
  onChangeStartAndEndTime: (start: Date, end: Date) => void;
  onTopContentPortionChange: (portion: number, heightPx: number) => void;
  onChangeSlotTime: (slotId: string, openTime: Date, closeTime: Date) => void;
  onChangeDestinationId?: (slotId: string, destinationId: string, preview: boolean) => void;
  onBulkChangeDestinationId?: (slotIds: string[], destinationId: string, preview: boolean) => void;
  onCopyToDestinationId?: (slotId: string, destinationId: string, preview: boolean) => void;
  onBulkCopyToDestinationId?: (slotIds: string[], destinationId: string, preview: boolean) => void;
  onMoveSlotOnTimeAxis?: (slotId: string, timeDiffMs: number, preview: boolean) => void;
  onBulkMoveSlotsOnTimeAxis?: (slotIds: string[], timeDiffMs: number, preview: boolean) => void;
  onCopySlotOnTimeAxis?: (slotId: string, timeDiffMs: number, preview: boolean) => void;
  onBulkCopySlotsOnTimeAxis?: (slotIds: string[], timeDiffMs: number, preview: boolean) => void;
  onClickOnSlot?: (slotId: string) => void;
  onHoverOnSlot?: (slotId: string) => void;
  onDoubleClickOnSlot?: (slotId: string) => void;
  onContextClickOnSlot?: (slotId: string) => void;
  onVerticalMarkerChange?: (id: string, date: Date) => void;
  onVerticalMarkerClick?: (id: string) => void;
}

/** Optional hooks for host UI state (Vue refs, Angular signals, etc.). */
export interface GanttEditorHost {
  onCursorMove?: (x: number, y: number) => void;
  onSelectionVisibility?: (visible: boolean) => void;
  onSelectionItems?: (items: GanttEditorSlot[]) => void;
  onSelectionSlotIds?: (slotIds: string[]) => void;
  /** @deprecated Use onSelectionVisibility instead. */
  onClipboardVisibility?: (visible: boolean) => void;
  /** @deprecated Use onSelectionItems instead. */
  onClipboardItems?: (items: GanttEditorSlot[]) => void;
  /** Top content height in CSS px (for layout outside the canvas). */
  onTopContentHeightPx?: (heightPx: number) => void;
}

export function getSelectionItemDisplayName(item: GanttEditorSlot): string {
  return item.displayName;
}

/** @deprecated Use getSelectionItemDisplayName instead. */
export function getClipboardItemDisplayName(item: GanttEditorSlot): string {
  return getSelectionItemDisplayName(item);
}
