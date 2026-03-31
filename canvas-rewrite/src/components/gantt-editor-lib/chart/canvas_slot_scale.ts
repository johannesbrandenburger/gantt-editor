import { TOPIC_BAND_PADDING } from "./canvas_topics";

/**
 * Duration used to define slot aspect: a slot this long has width:height =
 * {@link SLOT_RENDER_RATIO} : 1 on the row band (bandheight = rowHeight × (1 − padding)).
 * Default one hour → with ratio 1, a one-hour slot is a square at any zoom.
 */
export const REFERENCE_SLOT_DURATION_MS = 60 * 60 * 1000;

/**
 * Tunable: for a slot of {@link REFERENCE_SLOT_DURATION_MS}, horizontal span ÷ band height.
 * `1` = that slot is a square; larger = wider relative to height.
 */
/** Higher → shorter rows at the same time span (more chutes visible when zoomed out). */
export const SLOT_RENDER_RATIO = 2.25;

/**
 * When unified row height (px) is at or below this — heavily zoomed out — skip slot bar labels
 * and all slot pointer hit targets. Use {@link slotsAllowLabelsAndInteraction} for new slot UX.
 */
export const SLOT_OVERVIEW_MAX_ROW_HEIGHT_PX = 14;

export function slotsAllowLabelsAndInteraction(rowHeight: number): boolean {
  return rowHeight > SLOT_OVERVIEW_MAX_ROW_HEIGHT_PX;
}

/**
 * Destination/topic labels stay visible longer than slot text so users can still orient when zoomed out.
 */
export const DESTINATION_LABEL_MIN_ROW_HEIGHT_PX = 6;

export function destinationLabelsVisible(rowHeight: number): boolean {
  return rowHeight > DESTINATION_LABEL_MIN_ROW_HEIGHT_PX;
}

/**
 * Row height (full step) so time scale and band height stay locked: zoom is one map scale.
 *
 * For slot duration `d` ms: rendered width ÷ band height =
 * `(chartWidth / timeRangeMs × d) / (rowHeight × (1 − padding))`
 * = `(chartWidth × d) / (timeRangeMs × bandwidth)`.
 * Setting that equal to `SLOT_RENDER_RATIO × (d / REFERENCE_SLOT_DURATION_MS)` yields the formula below.
 */
export function computeRowHeightForUnifiedZoom(
  chartWidthPx: number,
  timeRangeMs: number,
  ratio: number = SLOT_RENDER_RATIO,
): number {
  if (chartWidthPx <= 0 || timeRangeMs <= 0 || ratio <= 0) {
    return NaN;
  }
  const bandwidth =
    (chartWidthPx * REFERENCE_SLOT_DURATION_MS) / (ratio * timeRangeMs);
  return bandwidth / (1 - TOPIC_BAND_PADDING);
}
