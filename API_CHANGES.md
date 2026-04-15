# API changes: main -> canvas rewrite

## Breaking
- Removed prop: `lazyRendering`.
- `GanttEditorXAxisOptions` no longer uses d3 types.
  - Before: `tickFormat?: (Date | d3.NumberValue) => string`, `ticks?: d3.TimeInterval`
  - Now: `tickFormat?: (TimeDomainValue) => string`, `ticks?: TimeTickSpec`
- Package no longer depends on d3.
- `GanttEditorSlot` deadlines API changed from fixed fields (`deadline`, `secondaryDeadline`, and color overrides) to `deadlines: Array<{ id, timestamp, color? }>`.

## Added
- New emits:
  - `onBulkChangeDestinationId(slotIds, destinationId, preview)`
  - `onCopyToDestinationId(slotId, destinationId, preview)`
  - `onBulkCopyToDestinationId(slotIds, destinationId, preview)`
  - `onMoveSlotOnTimeAxis(slotId, timeDiffMs, preview)`
  - `onBulkMoveSlotsOnTimeAxis(slotIds, timeDiffMs, preview)`
  - `onCopySlotOnTimeAxis(slotId, timeDiffMs, preview)`
  - `onBulkCopySlotsOnTimeAxis(slotIds, timeDiffMs, preview)`
  - `onSelectionChange(slotIds)`
- New exposed method: `clearSelection()`.
- New exports from package root:
  - Types: `GanttEditorProps`, `GanttEditorCallbacks`, `GanttEditorHost`
  - Class: `GanttChartCanvasController`
  - Helpers: `getSelectionItemDisplayName`, `getClipboardItemDisplayName`
- `GanttEditorSlotWithUiAttributes` adds `isCopyPreview?: boolean`.

## Compatibility notes
- Existing emits remain: `onChangeStartAndEndTime`, `onChangeDestinationId`, `onChangeSlotTime`, `onClickOnSlot`, `onHoverOnSlot`, `onDoubleClickOnSlot`, `onContextClickOnSlot`, `onTopContentPortionChange`, `onChangeVerticalMarker`, `onClickVerticalMarker`.
- `clearClipboard()` is still exposed (now an alias to `clearSelection()`).
