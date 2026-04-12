import {
  layoutWithLines,
  measureNaturalWidth,
  prepareWithSegments,
  type PreparedTextWithSegments,
} from "@chenglou/pretext";
import type {
  CanvasRect,
  HelpOverlayHitTarget,
  HelpOverlayHoverTarget,
  HelpOverlayLayout,
  HelpOverlayTileDefinition,
  HelpOverlayTileLayout,
} from "./help_overlay_tile";

const OUTER_PAD = 8;
const BUTTON_SIZE = 24;
const BUTTON_PANEL_GAP = 6;
const PANEL_PAD_X = 10;
const PANEL_PAD_Y = 10;
const TILE_GAP = 6;
const HEADER_HEIGHT = 28;
const CLOSE_SIZE = 18;
const TILE_INNER_PAD = 8;
const PREVIEW_TEXT_GAP = 6;
const PREVIEW_FIXED_WIDTH = 168;
const PREVIEW_FIXED_HEIGHT = 100;
const TILE_TEXT_MIN_WIDTH = 132;
const TITLE_FONT = "600 14px sans-serif";
const DESCRIPTION_FONT = "12px sans-serif";
const DETAIL_FONT = "11px sans-serif";
const SHORTCUT_FONT = "600 11px sans-serif";
const TITLE_LINE_HEIGHT = 17;
const TITLE_BASELINE_OFFSET = 13;
const TITLE_TO_DESCRIPTION_GAP = 3;
const DESCRIPTION_LINE_HEIGHT = 15;
const DESCRIPTION_BASELINE_OFFSET = 11;
const DETAIL_TOP_GAP = 4;
const DETAIL_LINE_HEIGHT = 14;
const DETAIL_BASELINE_OFFSET = 10;
const SHORTCUT_TOP_GAP = 5;
const SHORTCUT_HEIGHT = 18;
const SHORTCUT_TEXT_PAD_X = 6;
const TEXT_BOTTOM_PAD = 6;
const TEXT_TOP_PAD = 8;

const preparedTextCache = new Map<string, PreparedTextWithSegments>();

type TextBlockLayout = {
  lines: string[];
  height: number;
};

type TileCandidateLayout = {
  textWidth: number;
  height: number;
  titleLines: string[];
  descriptionLines: string[];
  detailLines: string[];
  titleY: number;
  descriptionY: number;
  detailY: number | null;
  shortcutRect: CanvasRect | null;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function easeOutCubic(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return 1 - Math.pow(1 - t, 3);
}

function rectContainsPoint(rect: CanvasRect | null, x: number, y: number): boolean {
  if (!rect) return false;
  return x >= rect.x && y >= rect.y && x <= rect.x + rect.w && y <= rect.y + rect.h;
}

function drawWrappedTextLines(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  x: number,
  baselineY: number,
  lineHeight: number,
): void {
  for (let i = 0; i < lines.length; i += 1) {
    ctx.fillText(lines[i]!, x, baselineY + i * lineHeight);
  }
}

function getPreparedText(text: string, font: string): PreparedTextWithSegments {
  const cacheKey = `${font}\n${text}`;
  const cached = preparedTextCache.get(cacheKey);
  if (cached) return cached;

  const prepared = prepareWithSegments(text, font);
  preparedTextCache.set(cacheKey, prepared);
  return prepared;
}

function layoutTextBlock(text: string, font: string, maxWidth: number, lineHeight: number): TextBlockLayout {
  const trimmed = text.trim();
  if (!trimmed) {
    return { lines: [], height: 0 };
  }

  const result = layoutWithLines(getPreparedText(trimmed, font), Math.max(1, maxWidth), lineHeight);
  return {
    lines: result.lines.map((line) => line.text),
    height: result.lineCount * lineHeight,
  };
}

function measureTextNaturalWidth(text: string, font: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return measureNaturalWidth(getPreparedText(trimmed, font));
}

function buildTileCandidateLayout(tile: HelpOverlayTileDefinition, tileWidth: number): TileCandidateLayout | null {
  const textWidth = tileWidth - TILE_INNER_PAD * 2 - PREVIEW_FIXED_WIDTH - PREVIEW_TEXT_GAP;
  if (textWidth < TILE_TEXT_MIN_WIDTH) {
    return null;
  }

  const titleBlock = layoutTextBlock(tile.title, TITLE_FONT, textWidth, TITLE_LINE_HEIGHT);
  const descriptionBlock = layoutTextBlock(
    tile.description,
    DESCRIPTION_FONT,
    textWidth,
    DESCRIPTION_LINE_HEIGHT,
  );
  const detailBlock = layoutTextBlock(tile.detail, DETAIL_FONT, textWidth, DETAIL_LINE_HEIGHT);

  let cursorTop = TEXT_TOP_PAD;
  const titleY = cursorTop + TITLE_BASELINE_OFFSET;
  cursorTop += titleBlock.height;

  const descriptionY = cursorTop + TITLE_TO_DESCRIPTION_GAP + DESCRIPTION_BASELINE_OFFSET;
  cursorTop += TITLE_TO_DESCRIPTION_GAP + descriptionBlock.height;

  let detailY: number | null = null;
  if (detailBlock.height > 0) {
    detailY = cursorTop + DETAIL_TOP_GAP + DETAIL_BASELINE_OFFSET;
    cursorTop += DETAIL_TOP_GAP + detailBlock.height;
  }

  let shortcutRect: CanvasRect | null = null;
  if (tile.shortcutLabel) {
    const shortcutWidth = Math.min(
      textWidth,
      Math.ceil(measureTextNaturalWidth(tile.shortcutLabel, SHORTCUT_FONT)) + SHORTCUT_TEXT_PAD_X * 2,
    );
    shortcutRect = {
      x: 0,
      y: cursorTop + SHORTCUT_TOP_GAP,
      w: shortcutWidth,
      h: SHORTCUT_HEIGHT,
    };
    cursorTop = shortcutRect.y + shortcutRect.h;
  }

  const height = Math.max(
    tile.minHeight,
    cursorTop + TEXT_BOTTOM_PAD,
    PREVIEW_FIXED_HEIGHT + TILE_INNER_PAD * 2,
  );
  return {
    textWidth,
    height,
    titleLines: titleBlock.lines,
    descriptionLines: descriptionBlock.lines,
    detailLines: detailBlock.lines,
    titleY,
    descriptionY,
    detailY,
    shortcutRect,
  };
}

function layoutTiles(
  tiles: HelpOverlayTileDefinition[],
  panelX: number,
  panelY: number,
  panelWidth: number,
  _ctx?: CanvasRenderingContext2D | null,
): HelpOverlayTileLayout[] {
  const tileWidth = panelWidth - PANEL_PAD_X * 2;
  const tileLayouts: HelpOverlayTileLayout[] = [];

  let y = panelY + PANEL_PAD_Y + HEADER_HEIGHT;
  for (const tile of tiles) {
    const resolvedCandidate = buildTileCandidateLayout(tile, tileWidth);
    if (!resolvedCandidate) {
      continue;
    }

    const rect: CanvasRect = {
      x: panelX + PANEL_PAD_X,
      y,
      w: tileWidth,
      h: resolvedCandidate.height,
    };
    const previewRect: CanvasRect = {
      x: rect.x + TILE_INNER_PAD,
      y: rect.y + TILE_INNER_PAD,
      w: PREVIEW_FIXED_WIDTH,
      h: PREVIEW_FIXED_HEIGHT,
    };
    const textX = previewRect.x + previewRect.w + PREVIEW_TEXT_GAP;
    const shortcutRect = resolvedCandidate.shortcutRect
      ? {
          x: textX,
          y: rect.y + resolvedCandidate.shortcutRect.y,
          w: resolvedCandidate.shortcutRect.w,
          h: resolvedCandidate.shortcutRect.h,
        }
      : null;
    tileLayouts.push({
      tile,
      rect,
      previewRect,
      textX,
      textWidth: resolvedCandidate.textWidth,
      titleLines: resolvedCandidate.titleLines,
      titleY: rect.y + resolvedCandidate.titleY,
      descriptionLines: resolvedCandidate.descriptionLines,
      descriptionY: rect.y + resolvedCandidate.descriptionY,
      detailLines: resolvedCandidate.detailLines,
      detailY: resolvedCandidate.detailY === null ? null : rect.y + resolvedCandidate.detailY,
      shortcutRect,
    });
    y += resolvedCandidate.height + TILE_GAP;
  }

  return tileLayouts;
}

export function buildHelpOverlayLayout(
  width: number,
  height: number,
  tiles: HelpOverlayTileDefinition[],
  ctx?: CanvasRenderingContext2D | null,
): HelpOverlayLayout {
  const buttonRect: CanvasRect = {
    x: Math.max(OUTER_PAD, width - OUTER_PAD - BUTTON_SIZE),
    y: OUTER_PAD,
    w: BUTTON_SIZE,
    h: BUTTON_SIZE,
  };

  if (tiles.length === 0) {
    return {
      buttonRect,
      panelRect: null,
      closeRect: null,
      tileLayouts: [],
    };
  }

  const panelMaxWidth = Math.max(300, width - OUTER_PAD * 2);
  const panelWidth = clamp(panelMaxWidth * 0.56, 380, 520);
  const provisionalPanelX = Math.max(OUTER_PAD, width - OUTER_PAD - panelWidth);
  const provisionalPanelY = buttonRect.y + buttonRect.h + BUTTON_PANEL_GAP;
  const tileLayouts = layoutTiles(tiles, provisionalPanelX, provisionalPanelY, panelWidth, ctx);
  const tileAreaHeight =
    tileLayouts.reduce((sum, tile) => sum + tile.rect.h, 0) +
    Math.max(0, tileLayouts.length - 1) * TILE_GAP;
  const panelHeight = HEADER_HEIGHT + PANEL_PAD_Y * 2 + tileAreaHeight;
  const panelY = Math.min(provisionalPanelY, Math.max(OUTER_PAD, height - OUTER_PAD - panelHeight));
  const panelRect: CanvasRect = {
    x: provisionalPanelX,
    y: panelY,
    w: panelWidth,
    h: panelHeight,
  };
  const adjustedTileLayouts = layoutTiles(tiles, panelRect.x, panelRect.y, panelRect.w, ctx);
  const closeRect: CanvasRect = {
    x: panelRect.x + panelRect.w - PANEL_PAD_X - CLOSE_SIZE,
    y: panelRect.y + PANEL_PAD_Y,
    w: CLOSE_SIZE,
    h: CLOSE_SIZE,
  };

  return {
    buttonRect,
    panelRect,
    closeRect,
    tileLayouts: adjustedTileLayouts,
  };
}

type DrawHelpOverlayArgs = {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  nowMs: number;
  progress: number;
  tiles: HelpOverlayTileDefinition[];
  hoverTarget: HelpOverlayHoverTarget;
  /** Hovered tile preview time is `nowMs - hoveredTileAnimationStartMs`. */
  hoveredTileAnimationStartMs: number | null;
};

export function drawHelpOverlay(args: DrawHelpOverlayArgs): HelpOverlayLayout {
  const { ctx, width, height, nowMs, progress, tiles, hoverTarget, hoveredTileAnimationStartMs } = args;
  const layout = buildHelpOverlayLayout(width, height, tiles, ctx);
  const buttonHovered = hoverTarget === "button";
  const closeHovered = hoverTarget === "close";

  drawHelpButton(ctx, layout.buttonRect, {
    active: progress > 0.02,
    hovered: buttonHovered,
  });

  if (progress <= 0.001 || !layout.panelRect || !layout.closeRect) {
    return layout;
  }

  const eased = easeOutCubic(progress);
  const panelAlpha = eased;
  const panelOffsetY = (1 - eased) * -10;

  ctx.save();
  ctx.fillStyle = `rgba(15, 23, 42, ${0.045 * panelAlpha})`;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = panelAlpha;
  ctx.translate(0, panelOffsetY);
  drawHelpPanel(ctx, layout.panelRect);
  drawHelpHeader(ctx, layout.panelRect, layout.closeRect, closeHovered);

  const hoveredTileId =
    hoverTarget !== null && typeof hoverTarget === "object" && hoverTarget.kind === "tile"
      ? hoverTarget.id
      : null;
  for (const tileLayout of layout.tileLayouts) {
    const previewNowMs =
      hoveredTileId === tileLayout.tile.id && hoveredTileAnimationStartMs !== null
        ? nowMs - hoveredTileAnimationStartMs
        : 0;
    drawHelpTile(ctx, tileLayout, previewNowMs, panelAlpha);
  }

  ctx.restore();
  return layout;
}

function drawHelpButton(
  ctx: CanvasRenderingContext2D,
  rect: CanvasRect,
  state: { active: boolean; hovered: boolean },
): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w / 2, 0, Math.PI * 2);
  ctx.fillStyle = state.active ? "#1f2937" : state.hovered ? "#ffffff" : "rgba(255, 255, 255, 0.96)";
  ctx.fill();
  ctx.strokeStyle = state.active ? "#1f2937" : "#cfd6df";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = state.active ? "#ffffff" : "#1f2937";
  ctx.font = "600 14px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("?", rect.x + rect.w / 2, rect.y + rect.h / 2 + 0.5);
  ctx.restore();
}

function drawHelpPanel(ctx: CanvasRenderingContext2D, rect: CanvasRect): void {
  ctx.save();
  ctx.shadowColor = "rgba(15, 23, 42, 0.08)";
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = "rgba(255, 255, 255, 0.98)";
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "#d7dde5";
  ctx.lineWidth = 1;
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
  ctx.restore();
}

function drawHelpHeader(
  ctx: CanvasRenderingContext2D,
  panelRect: CanvasRect,
  closeRect: CanvasRect,
  closeHovered: boolean,
): void {
  ctx.save();
  ctx.fillStyle = "#111827";
  ctx.font = "600 15px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("Quick help", panelRect.x + PANEL_PAD_X, panelRect.y + 22);

  ctx.beginPath();
  ctx.arc(closeRect.x + closeRect.w / 2, closeRect.y + closeRect.h / 2, closeRect.w / 2, 0, Math.PI * 2);
  ctx.fillStyle = closeHovered ? "#eef2f7" : "#ffffff";
  ctx.fill();
  ctx.strokeStyle = "#d5dce5";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.strokeStyle = "#5b6472";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(closeRect.x + 6.5, closeRect.y + 6.5);
  ctx.lineTo(closeRect.x + closeRect.w - 6.5, closeRect.y + closeRect.h - 6.5);
  ctx.moveTo(closeRect.x + closeRect.w - 6.5, closeRect.y + 6.5);
  ctx.lineTo(closeRect.x + 6.5, closeRect.y + closeRect.h - 6.5);
  ctx.stroke();

  ctx.restore();
}

function drawHelpTile(
  ctx: CanvasRenderingContext2D,
  tileLayout: HelpOverlayTileLayout,
  nowMs: number,
  alpha: number,
): void {
  const {
    tile,
    rect,
    previewRect,
    textX,
    textWidth,
    titleLines,
    titleY,
    descriptionLines,
    descriptionY,
    detailLines,
    detailY,
    shortcutRect,
  } = tileLayout;

  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.strokeStyle = "#e0e5ec";
  ctx.lineWidth = 1;
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.rect(previewRect.x, previewRect.y, previewRect.w, previewRect.h);
  ctx.clip();
  tile.drawPreview({
    ctx,
    rect: previewRect,
    nowMs,
    alpha,
  });
  ctx.restore();

  ctx.save();
  ctx.fillStyle = "#111827";
  ctx.font = TITLE_FONT;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  drawWrappedTextLines(ctx, titleLines, textX, titleY, TITLE_LINE_HEIGHT);

  ctx.fillStyle = "#4b5563";
  ctx.font = DESCRIPTION_FONT;
  drawWrappedTextLines(ctx, descriptionLines, textX, descriptionY, DESCRIPTION_LINE_HEIGHT);

  if (detailLines.length > 0 && detailY !== null) {
    ctx.fillStyle = "#6b7280";
    ctx.font = DETAIL_FONT;
    drawWrappedTextLines(ctx, detailLines, textX, detailY, DETAIL_LINE_HEIGHT);
  }

  if (tile.shortcutLabel && shortcutRect) {
    ctx.font = SHORTCUT_FONT;
    const labelWidth = Math.min(
      textWidth,
      shortcutRect.w,
    );
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(shortcutRect.x, shortcutRect.y, labelWidth, SHORTCUT_HEIGHT);
    ctx.strokeStyle = "#d9dfe8";
    ctx.lineWidth = 1;
    ctx.strokeRect(shortcutRect.x + 0.5, shortcutRect.y + 0.5, labelWidth - 1, SHORTCUT_HEIGHT - 1);
    ctx.fillStyle = "#374151";
    ctx.fillText(tile.shortcutLabel, shortcutRect.x + SHORTCUT_TEXT_PAD_X, shortcutRect.y + 13.5);
  }
  ctx.restore();
}

export function hitTestHelpOverlay(
  layout: HelpOverlayLayout,
  progress: number,
  x: number,
  y: number,
): HelpOverlayHitTarget {
  if (rectContainsPoint(layout.buttonRect, x, y)) {
    return "button";
  }
  if (progress <= 0.001 || !layout.panelRect) {
    return null;
  }
  if (rectContainsPoint(layout.closeRect, x, y)) {
    return "close";
  }
  if (rectContainsPoint(layout.panelRect, x, y)) {
    for (const tileLayout of layout.tileLayouts) {
      if (rectContainsPoint(tileLayout.rect, x, y)) {
        return { kind: "tile", id: tileLayout.tile.id };
      }
    }
    return "panel";
  }
  return null;
}
