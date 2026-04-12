import type { HelpOverlayTileDefinition } from "./help_overlay_tile";
import { brushSelectHelpOverlayTile } from "./help_overlay_brush_select_tile";
import { unifiedZoomHelpOverlayTile } from "./help_overlay_unified_zoom_tile";

export const DEFAULT_HELP_OVERLAY_TILES: HelpOverlayTileDefinition[] = [
  brushSelectHelpOverlayTile,
  unifiedZoomHelpOverlayTile,
];
