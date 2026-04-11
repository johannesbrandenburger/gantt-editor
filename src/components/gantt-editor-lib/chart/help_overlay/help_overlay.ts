import type {
  CanvasRect,
  HelpOverlayHitTarget,
  HelpOverlayHoverTarget,
  HelpOverlayLayout,
  HelpOverlayTileDefinition,
  HelpOverlayTileLayout,
} from "./help_overlay_tile";

const OUTER_PAD = 16;
const BUTTON_SIZE = 28;
const BUTTON_PANEL_GAP = 12;
const PANEL_PAD_X = 18;
const PANEL_PAD_Y = 18;
const TILE_GAP = 12;
const HEADER_HEIGHT = 56;
const CLOSE_SIZE = 22;
const PREVIEW_WIDTH = 188;

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

function layoutTiles(
  tiles: HelpOverlayTileDefinition[],
  panelX: number,
  panelY: number,
  panelWidth: number,
): HelpOverlayTileLayout[] {
  const tileWidth = panelWidth - PANEL_PAD_X * 2;
  const previewWidth = Math.min(PREVIEW_WIDTH, Math.max(140, tileWidth * 0.52));
  const textWidth = tileWidth - previewWidth - 18;
  const tileLayouts: HelpOverlayTileLayout[] = [];

  let y = panelY + PANEL_PAD_Y + HEADER_HEIGHT;
  for (const tile of tiles) {
    const rect: CanvasRect = {
      x: panelX + PANEL_PAD_X,
      y,
      w: tileWidth,
      h: tile.minHeight,
    };
    const previewRect: CanvasRect = {
      x: rect.x + 14,
      y: rect.y + 14,
      w: previewWidth,
      h: rect.h - 28,
    };
    const textX = previewRect.x + previewRect.w + 18;
    tileLayouts.push({
      tile,
      rect,
      previewRect,
      textX,
      textWidth,
    });
    y += tile.minHeight + TILE_GAP;
  }

  return tileLayouts;
}

export function buildHelpOverlayLayout(
  width: number,
  height: number,
  tiles: HelpOverlayTileDefinition[],
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
  const panelWidth = clamp(panelMaxWidth * 0.48, 340, 480);
  const provisionalPanelX = Math.max(OUTER_PAD, width - OUTER_PAD - panelWidth);
  const provisionalPanelY = buttonRect.y + buttonRect.h + BUTTON_PANEL_GAP;
  const tileLayouts = layoutTiles(tiles, provisionalPanelX, provisionalPanelY, panelWidth);
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
  const adjustedTileLayouts = layoutTiles(tiles, panelRect.x, panelRect.y, panelRect.w);
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
};

export function drawHelpOverlay(args: DrawHelpOverlayArgs): HelpOverlayLayout {
  const { ctx, width, height, nowMs, progress, tiles, hoverTarget } = args;
  const layout = buildHelpOverlayLayout(width, height, tiles);
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

  for (const tileLayout of layout.tileLayouts) {
    drawHelpTile(ctx, tileLayout, nowMs, panelAlpha);
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
  ctx.font = "600 16px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("How to use the chart", panelRect.x + PANEL_PAD_X, panelRect.y + 24);

  ctx.fillStyle = "#5b6472";
  ctx.font = "12px sans-serif";
  ctx.fillText("Quick help", panelRect.x + PANEL_PAD_X, panelRect.y + 44);

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
  ctx.moveTo(closeRect.x + 7, closeRect.y + 7);
  ctx.lineTo(closeRect.x + closeRect.w - 7, closeRect.y + closeRect.h - 7);
  ctx.moveTo(closeRect.x + closeRect.w - 7, closeRect.y + 7);
  ctx.lineTo(closeRect.x + 7, closeRect.y + closeRect.h - 7);
  ctx.stroke();

  ctx.restore();
}

function drawHelpTile(
  ctx: CanvasRenderingContext2D,
  tileLayout: HelpOverlayTileLayout,
  nowMs: number,
  alpha: number,
): void {
  const { tile, rect, previewRect, textX, textWidth } = tileLayout;

  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.strokeStyle = "#e0e5ec";
  ctx.lineWidth = 1;
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
  ctx.restore();

  tile.drawPreview({
    ctx,
    rect: previewRect,
    nowMs,
    alpha,
  });

  const titleY = rect.y + 32;
  const descriptionY = titleY + 24;
  const detailY = descriptionY + 32;
  const descriptionMaxLines = tile.detail ? 2 : 3;

  ctx.save();
  ctx.fillStyle = "#111827";
  ctx.font = "600 15px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(tile.title, textX, titleY);

  ctx.fillStyle = "#4b5563";
  ctx.font = "13px sans-serif";
  wrapCanvasText(ctx, tile.description, textX, descriptionY, textWidth, 18, descriptionMaxLines);

  if (tile.detail) {
    ctx.fillStyle = "#6b7280";
    ctx.font = "12px sans-serif";
    wrapCanvasText(ctx, tile.detail, textX, detailY, textWidth, 17, 2);
  }

  if (tile.shortcutLabel) {
    const shortcutY = rect.y + rect.h - 28;
    const labelWidth = Math.min(textWidth, ctx.measureText(tile.shortcutLabel).width + 18);
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(textX, shortcutY - 12, labelWidth, 22);
    ctx.strokeStyle = "#d9dfe8";
    ctx.lineWidth = 1;
    ctx.strokeRect(textX + 0.5, shortcutY - 11.5, labelWidth - 1, 21);
    ctx.fillStyle = "#374151";
    ctx.font = "600 11px sans-serif";
    ctx.fillText(tile.shortcutLabel, textX + 9, shortcutY + 3);
  }
  ctx.restore();
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
): void {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || current.length === 0) {
      current = next;
      continue;
    }
    lines.push(current);
    current = word;
    if (lines.length === maxLines - 1) break;
  }

  if (lines.length < maxLines && current) {
    lines.push(current);
  }

  for (let i = 0; i < lines.length; i += 1) {
    ctx.fillText(lines[i]!, x, y + i * lineHeight);
  }
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
    return "panel";
  }
  return null;
}
