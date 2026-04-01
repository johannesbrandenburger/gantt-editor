import type { GanttEditorSuggestion, Topic } from "./types";
import { computeTopicLayout, type TopicLayout } from "./canvas_topics";
import { createTimeScale } from "./time_scale";

const SUGGESTION_ICON = "💡";
const SUGGESTION_HIT_RADIUS = 10;

export interface SuggestionButtonDefinition {
  x: number;
  y: number;
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

        const displayName =
          suggestion.alternativeDestinationDisplayName || suggestion.alternativeDestinationId;

        defs.push({
          x: margin.left + xScale(slot.openTime) - 20,
          y: rowTop + 10,
          text: `Move to alternative destination ${displayName}`,
          slotId: slot.id,
        });
      }
    });
  }

  return defs;
}

export function drawSuggestionButtons(params: DrawSuggestionButtonsParams): void {
  const { ctx, hoveredSlotId = null } = params;
  const defs = buildSuggestionDefinitions(params);
  if (defs.length === 0) return;

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (const def of defs) {
    const isHovered = hoveredSlotId === def.slotId;
    ctx.font = isHovered ? "30px sans-serif" : "18px sans-serif";
    ctx.fillStyle = "#f0ad4e";
    ctx.fillText(SUGGESTION_ICON, def.x, def.y);
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
    if (dx * dx + dy * dy <= SUGGESTION_HIT_RADIUS * SUGGESTION_HIT_RADIUS) {
      hit = def;
    }
  }

  return hit;
}
