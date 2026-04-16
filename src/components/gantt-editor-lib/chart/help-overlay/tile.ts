export type CanvasRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type HelpOverlayTileHit = { kind: "tile"; id: string };

export type HelpOverlayHoverTarget = "button" | "close" | HelpOverlayTileHit | null;
export type HelpOverlayHitTarget = "button" | "close" | "panel" | HelpOverlayTileHit | null;

export type DrawHelpOverlayTilePreviewArgs = {
  ctx: CanvasRenderingContext2D;
  rect: CanvasRect;
  nowMs: number;
  alpha: number;
};

export type HelpOverlayTileDefinition = {
  id: string;
  title: string;
  description: string;
  shortcutLabel: string[];
  detail: string;
  minHeight: number;
  drawPreview: (args: DrawHelpOverlayTilePreviewArgs) => void;
};

export type HelpOverlayTileLayout = {
  tile: HelpOverlayTileDefinition;
  rect: CanvasRect;
  previewRect: CanvasRect;
  textX: number;
  textWidth: number;
  titleLines: string[];
  titleY: number;
  descriptionLines: string[];
  descriptionY: number;
  detailLines: string[];
  detailY: number | null;
  shortcutRects: CanvasRect[];
};

export type HelpOverlayLayout = {
  buttonRect: CanvasRect | null;
  panelRect: CanvasRect | null;
  closeRect: CanvasRect | null;
  /** Canvas Y of the first pixel of scrollable tile content when scroll is 0. */
  tilesContentTopY: number;
  /** Clip rect for the scrollable tile list (inside the panel, below the header). */
  tilesClipRect: CanvasRect | null;
  /** Total height of tile content (sum of tile heights and gaps). */
  tilesContentHeight: number;
  /** Max scroll offset;0 when everything fits. */
  tilesMaxScrollY: number;
  tileLayouts: HelpOverlayTileLayout[];
};
