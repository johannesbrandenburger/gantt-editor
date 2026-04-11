export type CanvasRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type HelpOverlayHoverTarget = "button" | "close" | null;
export type HelpOverlayHitTarget = "button" | "close" | "panel" | null;

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
  shortcutLabel: string;
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
};

export type HelpOverlayLayout = {
  buttonRect: CanvasRect;
  panelRect: CanvasRect | null;
  closeRect: CanvasRect | null;
  tileLayouts: HelpOverlayTileLayout[];
};
