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
const SUGGESTION_FILL = "#f59e0b";
const SUGGESTION_OUTLINE = "rgba(120, 53, 15, 0.45)";
const SUGGESTION_GLOW = "rgba(245, 158, 11, 0.22)";
const SUGGESTION_FILAMENT = "rgba(120, 53, 15, 0.7)";

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
  const ringRadius = size * 0.9;
  const bulbRadius = size * 0.56;
  const bulbCenterY = y - size * 0.18;
  const stemWidth = size * 0.5;
  const stemHeight = size * 0.34;
  const stemTop = bulbCenterY + bulbRadius - size * 0.1;
  const filamentY = bulbCenterY + size * 0.1;

  ctx.fillStyle = SUGGESTION_GLOW;
  ctx.beginPath();
  ctx.arc(x, y, ringRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = SUGGESTION_FILL;
  ctx.beginPath();
  ctx.arc(x, bulbCenterY, bulbRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = SUGGESTION_OUTLINE;
  ctx.lineWidth = Math.max(1, size * 0.1);
  ctx.beginPath();
  ctx.arc(x, bulbCenterY, bulbRadius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
  ctx.beginPath();
  ctx.arc(x - size * 0.2, bulbCenterY - size * 0.2, size * 0.16, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = SUGGESTION_FILL;
  ctx.beginPath();
  ctx.roundRect(x - stemWidth / 2, stemTop, stemWidth, stemHeight, size * 0.14);
  ctx.fill();

  ctx.strokeStyle = SUGGESTION_FILAMENT;
  ctx.lineWidth = Math.max(1, size * 0.12);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x - size * 0.14, filamentY);
  ctx.lineTo(x, filamentY + size * 0.12);
  ctx.lineTo(x + size * 0.14, filamentY);
  ctx.stroke();
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
