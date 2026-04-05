import type { GanttEditorProps } from "./gantt_canvas_props";

export const X_AXIS_HEIGHT = 50;
/** Fallback before layout; reconciled from visible time span and chart width. */
export const DEFAULT_ROW_HEIGHT = 40;
/** Lower bound for unified zoom so many rows fit when fully zoomed out (band ~= (1-padding) x this). */
export const MIN_ROW_HEIGHT = 1;
export const MAX_ROW_HEIGHT = 120;

// Temporary slowdown for manual animation verification. (2 looks better)
const TEMP_ANIMATION_SLOWDOWN_MULTIPLIER = 2;
export const SLOT_REFLOW_ANIMATION_MS = 180 * TEMP_ANIMATION_SLOWDOWN_MULTIPLIER;
export const SLOT_REFLOW_PENDING_TTL_MS = 2_000;
export const DESTINATION_PREVIEW_TRANSITION_MS = 180 * TEMP_ANIMATION_SLOWDOWN_MULTIPLIER;

export const MARGIN = { left: 200, right: 12 };

// processData only uses slots, destinations, and settings.compactView; it does not use the view
// time range or row height. Omitting those reactive deps keeps pan/zoom from re-running O(n) work
// (row assignment + conflict detection) on every wheel tick.
export const PROCESS_DATA_VIEW_PLACEHOLDER_START = new Date(0);
export const PROCESS_DATA_VIEW_PLACEHOLDER_END = new Date(86400000);

export const SELECTION_STORAGE_KEY = "pointerSelection";
export const LEGACY_CLIPBOARD_STORAGE_KEY = "pointerClipboard";
export const BRUSH_DRAG_THRESHOLD_PX = 3;
export const CLIPBOARD_PREVIEW_MAX_ITEMS = 5;

export type TopicLayoutSnapshot = {
  topicYById: Map<string, number>;
  contentHeight: number;
};

export type TopicLayoutShiftByGroup = {
  shiftsByTopicId: Map<string, number>;
  contentHeightShift: number;
};

export function destinationGroupsSnapshot(
  groups: GanttEditorProps["destinationGroups"],
): string {
  return groups.map((g) => `${g.id}:${g.heightPortion}:${g.displayName}`).join("\0");
}

export function markedRegionSnapshot(region: GanttEditorProps["markedRegion"]): string {
  if (!region) return "";
  return `${region.destinationId}:${region.startTime.getTime()}:${region.endTime.getTime()}`;
}