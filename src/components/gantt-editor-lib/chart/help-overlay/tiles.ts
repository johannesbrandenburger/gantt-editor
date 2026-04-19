import type { HelpOverlayTileDefinition } from "./tile";
import { brushSelectHelpOverlayTile } from "./brush-select-tile";
import { multiSelectHelpOverlayTile } from "./multi-select-tile";
import { moveSelectedSlotsToDestinationHelpOverlayTile } from "./move-to-destination-tile";
import { copySelectedSlotsToDestinationHelpOverlayTile } from "./copy-to-destination-tile";
import { resizeSlotEdgesHelpOverlayTile } from "./slot-resize-tile";
import { unifiedZoomHelpOverlayTile } from "./unified-zoom-tile";
import { timeNavigationHelpOverlayTile } from "./time-navigation-tile";
import { canvasContextMenuHelpOverlayTile } from "./context-menu-tile";
import { openSlotDetailsHelpOverlayTile } from "./open-slot-details-tile";
import { escapeKeyHelpOverlayTile } from "./escape-tile";

export const DEFAULT_HELP_OVERLAY_TILES: HelpOverlayTileDefinition[] = [
  multiSelectHelpOverlayTile,
  brushSelectHelpOverlayTile,
  moveSelectedSlotsToDestinationHelpOverlayTile,
  copySelectedSlotsToDestinationHelpOverlayTile,
  resizeSlotEdgesHelpOverlayTile,
  unifiedZoomHelpOverlayTile,
  timeNavigationHelpOverlayTile,
  canvasContextMenuHelpOverlayTile,
  openSlotDetailsHelpOverlayTile,
  escapeKeyHelpOverlayTile,
];
