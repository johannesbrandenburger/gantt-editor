import type { HelpOverlayTileDefinition } from "./help_overlay_tile";
import { brushSelectHelpOverlayTile } from "./help_overlay_brush_select_tile";
import { multiSelectHelpOverlayTile } from "./help_overlay_multi_select_tile";
import { resizeSlotEdgesHelpOverlayTile } from "./help_overlay_slot_resize_tile";
import { unifiedZoomHelpOverlayTile } from "./help_overlay_unified_zoom_tile";
import { canvasContextMenuHelpOverlayTile } from "./help_overlay_context_menu_tile";
import { escapeKeyHelpOverlayTile } from "./help_overlay_escape_tile";

export const DEFAULT_HELP_OVERLAY_TILES: HelpOverlayTileDefinition[] = [
  multiSelectHelpOverlayTile,
  brushSelectHelpOverlayTile,
  resizeSlotEdgesHelpOverlayTile,
  unifiedZoomHelpOverlayTile,
  canvasContextMenuHelpOverlayTile,
  escapeKeyHelpOverlayTile,
];
