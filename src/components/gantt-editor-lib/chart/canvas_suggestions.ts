import type { GanttEditorSuggestion, Topic } from "./types";
import {
  computeTopicLayout,
  TOPIC_BAND_PADDING,
  type TopicLayout,
} from "./canvas_topics";
import { createTimeScale } from "./time_scale";

const SUGGESTION_MIN_SIZE_PX = 4;
const SUGGESTION_MAX_SIZE_PX = 16;
const SUGGESTION_HIT_RADIUS_MULTIPLIER = 1.15;
const SUGGESTION_HOVER_SCALE = 1.15;
const SUGGESTION_FILL = "#ffc720";

export interface SuggestionButtonDefinition {
  x: number;
  y: number;
  size: number;
  hitRadius: number;
  text: string;
  slotId: string;
}

interface SuggestionLayoutParams {
  width: number;
  topics: Topic[];
  suggestions: GanttEditorSuggestion[];
  margin: { left: number; right: number };
  rowHeight: number;
  startTime: Date;
  endTime: Date;
  viewportTop?: number;
  viewportHeight?: number;
  topicLayouts?: TopicLayout[];
}

export interface DrawSuggestionButtonsParams extends SuggestionLayoutParams {
  ctx: CanvasRenderingContext2D;
  hoveredSlotId?: string | null;
}

export interface HitTestSuggestionButtonParams extends SuggestionLayoutParams {
  canvasX: number;
  contentY: number;
}

function slotIntersectsVisibleTimeRange(
  openTime: Date,
  closeTime: Date,
  startTime: Date,
  endTime: Date,
): boolean {
  return closeTime > startTime && openTime < endTime;
}

function buildSuggestionDefinitions(
  params: SuggestionLayoutParams,
): SuggestionButtonDefinition[] {
  const {
    width,
    topics,
    suggestions,
    margin,
    rowHeight,
    startTime,
    endTime,
    viewportTop,
    viewportHeight,
    topicLayouts,
  } = params;

  const chartWidth = width - margin.left - margin.right;
  if (chartWidth <= 0 || suggestions.length === 0) return [];

  const hasViewport = viewportTop !== undefined && viewportHeight !== undefined;
  const xScale = createTimeScale(startTime, endTime, 0, chartWidth, true);
  const layouts = topicLayouts ?? computeTopicLayout(topics, margin.left, rowHeight);
  const suggestionsBySlotId = new Map(suggestions.map((s) => [s.slotId, s]));
  const bandwidth = rowHeight * (1 - TOPIC_BAND_PADDING);
  const markerSize = Math.max(
    SUGGESTION_MIN_SIZE_PX,
    Math.min(SUGGESTION_MAX_SIZE_PX, bandwidth * 0.35),
  );
  const hitRadius = markerSize * SUGGESTION_HIT_RADIUS_MULTIPLIER;

  const defs: SuggestionButtonDefinition[] = [];
  for (const layout of layouts) {
    const topic = layout.topic;
    if (topic.isCollapsed) continue;
    if (hasViewport && (topic.yEnd < viewportTop || topic.yStart > viewportTop + viewportHeight)) {
      continue;
    }

    topic.rows.forEach((row, rowIndex) => {
      const rowTop = layout.rowYs[rowIndex];
      if (rowTop === undefined) return;
      for (const slot of row.slots) {
        const suggestion = suggestionsBySlotId.get(slot.id);
        if (!suggestion) continue;
        if (!slotIntersectsVisibleTimeRange(slot.openTime, slot.closeTime, startTime, endTime)) {
          continue;
        }

        const displayName =
          suggestion.alternativeDestinationDisplayName || suggestion.alternativeDestinationId;

        defs.push({
          x: margin.left + xScale(slot.openTime) - markerSize * 1.6,
          y: rowTop + bandwidth / 2,
          size: markerSize,
          hitRadius,
          text: `Move to alternative destination ${displayName}`,
          slotId: slot.id,
        });
      }
    });
  }

  return defs;
}

function drawSuggestionShape(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
): void {
  // Pear-shaped lightbulb outline – aspect ratio 0.7541 (from PowerPoint design spec)
  const hw = size * 0.56;
  const W = hw * 2;
  const H = W / 0.7541;
  const top = y - H / 2;
  const px = (nx: number) => x + (nx - 0.5) * W;
  const py = (ny: number) => top + ny * H;

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = SUGGESTION_FILL;
  ctx.lineWidth = Math.max(1, size * 0.2);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // Main lightbulb pear outline
  ctx.beginPath();
  ctx.moveTo(px(0.5), py(0));
  ctx.bezierCurveTo(px(0.776), py(0), px(1.0), py(0.169), px(1.0), py(0.377));
  ctx.bezierCurveTo(px(1.0), py(0.481), px(0.944), py(0.575), px(0.854), py(0.644));
  ctx.lineTo(px(0.824), py(0.664));
  ctx.lineTo(px(0.762), py(0.718));
  ctx.lineTo(px(0.697), py(0.805));
  ctx.lineTo(px(0.659), py(0.923));
  ctx.lineTo(px(0.653), py(0.934));
  ctx.bezierCurveTo(px(0.653), py(0.970), px(0.585), py(1.0), px(0.5), py(1.0));
  ctx.bezierCurveTo(px(0.415), py(1.0), px(0.347), py(0.970), px(0.347), py(0.934));
  ctx.lineTo(px(0.344), py(0.923));
  ctx.lineTo(px(0.306), py(0.809));
  ctx.lineTo(px(0.241), py(0.722));
  ctx.lineTo(px(0.176), py(0.664));
  ctx.lineTo(px(0.146), py(0.644));
  ctx.bezierCurveTo(px(0.056), py(0.575), px(0), py(0.481), px(0), py(0.377));
  ctx.bezierCurveTo(px(0), py(0.169), px(0.224), py(0), px(0.5), py(0));
  ctx.closePath();
  ctx.stroke();

  // Horizontal ring on the base
  ctx.beginPath();
  ctx.moveTo(px(0.304), py(0.897));
  ctx.lineTo(px(0.696), py(0.897));
  ctx.stroke();

  ctx.restore();
}

export function drawSuggestionButtons(params: DrawSuggestionButtonsParams): void {
  const { ctx, hoveredSlotId = null } = params;
  const defs = buildSuggestionDefinitions(params);
  if (defs.length === 0) return;

  ctx.save();

  for (const def of defs) {
    const isHovered = hoveredSlotId === def.slotId;
    drawSuggestionShape(ctx, def.x, def.y, def.size * (isHovered ? SUGGESTION_HOVER_SCALE : 1));
  }

  ctx.restore();
}

/** Last-drawn suggestion wins when hit areas overlap. */
export function hitTestSuggestionButton(
  params: HitTestSuggestionButtonParams,
): SuggestionButtonDefinition | null {
  const { canvasX, contentY } = params;
  const defs = buildSuggestionDefinitions(params);
  if (defs.length === 0) return null;

  let hit: SuggestionButtonDefinition | null = null;
  for (const def of defs) {
    const dx = canvasX - def.x;
    const dy = contentY - def.y;
    if (dx * dx + dy * dy <= def.hitRadius * def.hitRadius) {
      hit = def;
    }
  }

  return hit;
}
