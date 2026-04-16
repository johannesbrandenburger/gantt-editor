import type {
  CanvasRect,
  HelpOverlayHitTarget,
  HelpOverlayHoverTarget,
  HelpOverlayLayout,
  HelpOverlayTileDefinition,
  HelpOverlayTileLayout,
} from "./tile";

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
const SHORTCUT_HEIGHT = 20;
const SHORTCUT_TEXT_PAD_X = 6;
const SHORTCUT_CHIP_GAP_X = 10;
const SHORTCUT_ROW_GAP = 4;
const SHORTCUT_RADIUS = 5;
const SHORTCUT_SEPARATOR_PAD_X = 3;
const TEXT_BOTTOM_PAD = 6;
const TEXT_TOP_PAD = 8;

const measuredTextWidthCache = new Map<string, number>();
let textMeasureCtx: CanvasRenderingContext2D | null = null;

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
  shortcutRects: CanvasRect[];
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

function roundedRectPath(ctx: CanvasRenderingContext2D, rect: CanvasRect, radius: number): void {
  const r = Math.max(0, Math.min(radius, rect.w / 2, rect.h / 2));
  ctx.beginPath();
  ctx.moveTo(rect.x + r, rect.y);
  ctx.lineTo(rect.x + rect.w - r, rect.y);
  ctx.arcTo(rect.x + rect.w, rect.y, rect.x + rect.w, rect.y + r, r);
  ctx.lineTo(rect.x + rect.w, rect.y + rect.h - r);
  ctx.arcTo(rect.x + rect.w, rect.y + rect.h, rect.x + rect.w - r, rect.y + rect.h, r);
  ctx.lineTo(rect.x + r, rect.y + rect.h);
  ctx.arcTo(rect.x, rect.y + rect.h, rect.x, rect.y + rect.h - r, r);
  ctx.lineTo(rect.x, rect.y + r);
  ctx.arcTo(rect.x, rect.y, rect.x + r, rect.y, r);
  ctx.closePath();
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

function getTextMeasureContext(): CanvasRenderingContext2D | null {
  if (textMeasureCtx) return textMeasureCtx;
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  textMeasureCtx = canvas.getContext("2d");
  return textMeasureCtx;
}

function measureTextWidth(text: string, font: string): number {
  const cacheKey = `${font}\n${text}`;
  const cached = measuredTextWidthCache.get(cacheKey);
  if (cached) return cached;

  const ctx = getTextMeasureContext();
  if (!ctx) return text.length * 7;
  ctx.font = font;
  const width = ctx.measureText(text).width;
  measuredTextWidthCache.set(cacheKey, width);
  return width;
}

function layoutTextBlock(text: string, font: string, maxWidth: number, lineHeight: number): TextBlockLayout {
  const trimmed = text.trim();
  if (!trimmed) {
    return { lines: [], height: 0 };
  }

  const width = Math.max(1, maxWidth);
  const lines: string[] = [];
  const paragraphs = trimmed.split(/\r?\n/);

  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }

    let current = "";
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (measureTextWidth(next, font) <= width || !current) {
        current = next;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }

  return {
    lines,
    height: lines.length * lineHeight,
  };
}

function measureTextNaturalWidth(text: string, font: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return measureTextWidth(trimmed, font);
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

  const shortcutRects: CanvasRect[] = [];
  const shortcutLabels = tile.shortcutLabel.map((label) => label.trim()).filter(Boolean);
  if (shortcutLabels.length > 0) {
    let shortcutX = 0;
    let shortcutY = cursorTop + SHORTCUT_TOP_GAP;
    for (const label of shortcutLabels) {
      const shortcutWidth = Math.min(
        textWidth,
        Math.ceil(measureTextNaturalWidth(label, SHORTCUT_FONT)) + SHORTCUT_TEXT_PAD_X * 2,
      );
      if (shortcutX > 0 && shortcutX + shortcutWidth > textWidth) {
        shortcutX = 0;
        shortcutY += SHORTCUT_HEIGHT + SHORTCUT_ROW_GAP;
      }
      shortcutRects.push({
        x: shortcutX,
        y: shortcutY,
        w: shortcutWidth,
        h: SHORTCUT_HEIGHT,
      });
      shortcutX += shortcutWidth + SHORTCUT_CHIP_GAP_X;
    }
    const lastShortcutRect = shortcutRects[shortcutRects.length - 1]!;
    cursorTop = lastShortcutRect.y + lastShortcutRect.h;
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
    shortcutRects,
  };
}

function layoutTiles(
  tiles: HelpOverlayTileDefinition[],
  panelX: number,
  panelWidth: number,
  _ctx?: CanvasRenderingContext2D | null,
): HelpOverlayTileLayout[] {
  const tileWidth = panelWidth - PANEL_PAD_X * 2;
  const tileLayouts: HelpOverlayTileLayout[] = [];

  let contentY = 0;
  for (const tile of tiles) {
    const resolvedCandidate = buildTileCandidateLayout(tile, tileWidth);
    if (!resolvedCandidate) {
      continue;
    }

    const rect: CanvasRect = {
      x: panelX + PANEL_PAD_X,
      y: contentY,
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
    const shortcutRects = resolvedCandidate.shortcutRects.map((shortcutRect) => ({
      x: textX + shortcutRect.x,
      y: rect.y + shortcutRect.y,
      w: shortcutRect.w,
      h: shortcutRect.h,
    }));
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
      shortcutRects,
    });
    contentY += resolvedCandidate.height + TILE_GAP;
  }

  return tileLayouts;
}

function tilesContentHeightFromLayouts(layouts: HelpOverlayTileLayout[]): number {
  if (layouts.length === 0) return 0;
  const last = layouts[layouts.length - 1]!;
  return last.rect.y + last.rect.h;
}

export function buildHelpOverlayLayout(
  width: number,
  height: number,
  tiles: HelpOverlayTileDefinition[],
  ctx?: CanvasRenderingContext2D | null,
): HelpOverlayLayout {
  if (tiles.length === 0) {
    return {
      buttonRect: null,
      panelRect: null,
      closeRect: null,
      tilesContentTopY: 0,
      tilesClipRect: null,
      tilesContentHeight: 0,
      tilesMaxScrollY: 0,
      tileLayouts: [],
    };
  }

  const buttonRect: CanvasRect = {
    x: Math.max(OUTER_PAD, width - OUTER_PAD - BUTTON_SIZE),
    y: OUTER_PAD,
    w: BUTTON_SIZE,
    h: BUTTON_SIZE,
  };

  const panelMaxWidth = Math.max(300, width - OUTER_PAD * 2);
  const panelWidth = clamp(panelMaxWidth * 0.56, 380, 520);
  const provisionalPanelX = Math.max(OUTER_PAD, width - OUTER_PAD - panelWidth);
  const provisionalPanelY = buttonRect.y + buttonRect.h + BUTTON_PANEL_GAP;
  const provisionalTileLayouts = layoutTiles(tiles, provisionalPanelX, panelWidth, ctx);
  const tileContentHeight = tilesContentHeightFromLayouts(provisionalTileLayouts);
  const uncappedPanelHeight = HEADER_HEIGHT + PANEL_PAD_Y * 2 + tileContentHeight;
  const maxPanelBottom = height - OUTER_PAD;
  const panelY = Math.min(
    provisionalPanelY,
    Math.max(OUTER_PAD, maxPanelBottom - uncappedPanelHeight),
  );
  const maxPanelHeight = Math.max(HEADER_HEIGHT + PANEL_PAD_Y * 2 + 40, maxPanelBottom - panelY);
  const panelHeight = Math.min(uncappedPanelHeight, maxPanelHeight);
  const tilesViewportHeight = panelHeight - HEADER_HEIGHT - PANEL_PAD_Y * 2;
  const tilesMaxScrollY = Math.max(0, tileContentHeight - tilesViewportHeight);
  const panelRect: CanvasRect = {
    x: provisionalPanelX,
    y: panelY,
    w: panelWidth,
    h: panelHeight,
  };
  const tilesContentTopY = panelRect.y + PANEL_PAD_Y + HEADER_HEIGHT;
  const tilesClipRect: CanvasRect = {
    x: panelRect.x,
    y: tilesContentTopY,
    w: panelRect.w,
    h: tilesViewportHeight,
  };
  const adjustedTileLayouts = layoutTiles(tiles, panelRect.x, panelRect.w, ctx);
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
    tilesContentTopY,
    tilesClipRect,
    tilesContentHeight: tileContentHeight,
    tilesMaxScrollY,
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
  /** Active tile preview time is `nowMs - activeTileAnimationStartMs`. */
  activeTileAnimationStartMs: number | null;
  /** Tile id whose preview animation is currently active. */
  activeTileId: string | null;
  /** Vertical scroll offset for the tile list (pixels). */
  tilesScrollY: number;
};

export function drawHelpOverlay(args: DrawHelpOverlayArgs): HelpOverlayLayout {
  const {
    ctx,
    width,
    height,
    nowMs,
    progress,
    tiles,
    hoverTarget,
    activeTileAnimationStartMs,
    activeTileId,
    tilesScrollY,
  } = args;
  const layout = buildHelpOverlayLayout(width, height, tiles, ctx);
  const buttonHovered = hoverTarget === "button";
  const closeHovered = hoverTarget === "close";

  if (layout.buttonRect) {
    drawHelpButton(ctx, layout.buttonRect, {
      active: progress > 0.02,
      hovered: buttonHovered,
    });
  }

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

  if (layout.tilesClipRect && layout.tileLayouts.length > 0) {
    const scrollY = clamp(tilesScrollY, 0, layout.tilesMaxScrollY);
    ctx.save();
    ctx.beginPath();
    ctx.rect(
      layout.tilesClipRect.x,
      layout.tilesClipRect.y,
      layout.tilesClipRect.w,
      layout.tilesClipRect.h,
    );
    ctx.clip();
    ctx.translate(0, layout.tilesContentTopY - scrollY);
    for (const tileLayout of layout.tileLayouts) {
      const previewNowMs =
        activeTileId === tileLayout.tile.id && activeTileAnimationStartMs !== null
          ? nowMs - activeTileAnimationStartMs
          : 0;
      drawHelpTile(ctx, tileLayout, previewNowMs, panelAlpha, activeTileId === tileLayout.tile.id);
    }
    ctx.restore();
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
  active: boolean,
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
    shortcutRects,
  } = tileLayout;

  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.strokeStyle = active ? "#0d5ccb" : "#e0e5ec";
  ctx.lineWidth = active ? 1.5 : 1;
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

  if (tile.shortcutLabel.length > 0 && shortcutRects.length > 0) {
    ctx.font = SHORTCUT_FONT;
    const labels = tile.shortcutLabel.map((label) => label.trim()).filter(Boolean);
    for (let i = 0; i < shortcutRects.length; i += 1) {
      const shortcutRect = shortcutRects[i]!;
      const label = labels[i] ?? "";
      const labelWidth = Math.min(textWidth, shortcutRect.w);
      ctx.fillStyle = "#f8fafc";
      roundedRectPath(ctx, { ...shortcutRect, w: labelWidth }, SHORTCUT_RADIUS);
      ctx.fill();
      ctx.strokeStyle = "#d9dfe8";
      ctx.lineWidth = 1;
      roundedRectPath(
        ctx,
        {
          x: shortcutRect.x + 0.5,
          y: shortcutRect.y + 0.5,
          w: Math.max(0, labelWidth - 1),
          h: Math.max(0, SHORTCUT_HEIGHT - 1),
        },
        Math.max(0, SHORTCUT_RADIUS - 0.5),
      );
      ctx.stroke();
      ctx.fillStyle = "#374151";
      ctx.fillText(label, shortcutRect.x + SHORTCUT_TEXT_PAD_X, shortcutRect.y + 13.5);

      const nextShortcutRect = shortcutRects[i + 1];
      if (nextShortcutRect && nextShortcutRect.y === shortcutRect.y) {
        ctx.fillStyle = "#6b7280";
        const separatorX = shortcutRect.x + labelWidth + (nextShortcutRect.x - (shortcutRect.x + labelWidth)) / 2;
        ctx.fillText("/", separatorX - 2, shortcutRect.y + 13.5);
      } else if (nextShortcutRect) {
        ctx.fillStyle = "#6b7280";
        const separatorX = Math.min(
          textX + textWidth - SHORTCUT_TEXT_PAD_X,
          shortcutRect.x + labelWidth + SHORTCUT_SEPARATOR_PAD_X,
        );
        ctx.fillText("/", separatorX, shortcutRect.y + 13.5);
      }
    }
  }
  ctx.restore();
}

export function hitTestHelpOverlay(
  layout: HelpOverlayLayout,
  progress: number,
  x: number,
  y: number,
  tilesScrollY: number,
): HelpOverlayHitTarget {
  if (layout.buttonRect && rectContainsPoint(layout.buttonRect, x, y)) {
    return "button";
  }
  if (progress <= 0.001 || !layout.panelRect) {
    return null;
  }
  if (layout.closeRect && rectContainsPoint(layout.closeRect, x, y)) {
    return "close";
  }
  if (rectContainsPoint(layout.panelRect, x, y)) {
    const scrollY = clamp(tilesScrollY, 0, layout.tilesMaxScrollY);
    const contentY = y - layout.tilesContentTopY + scrollY;
    for (const tileLayout of layout.tileLayouts) {
      const tr = tileLayout.rect;
      if (
        x >= tr.x &&
        x <= tr.x + tr.w &&
        contentY >= tr.y &&
        contentY <= tr.y + tr.h
      ) {
        return { kind: "tile", id: tileLayout.tile.id };
      }
    }
    return "panel";
  }
  return null;
}

/** Clamp scroll offset to the range allowed by the built layout. */
export function clampHelpOverlayTilesScrollY(layout: HelpOverlayLayout, scrollY: number): number {
  return clamp(scrollY, 0, layout.tilesMaxScrollY);
}
