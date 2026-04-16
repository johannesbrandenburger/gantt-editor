# API changes: main -> canvas rewrite

## Breaking
- Wrapper component names were unified to `GanttEditor` across all frameworks:
  - React: `GanttEditorReact` -> `GanttEditor`
  - Vue: `GanttEditorComponent` -> `GanttEditor`
  - Angular: `GanttEditorAngularComponent` + `<gantt-editor-angular>` -> `GanttEditor` + `<gantt-editor>`
- Removed prop: `lazyRendering`.
- `GanttEditorXAxisOptions` no longer uses d3 types.
  - Before: `tickFormat?: (Date | d3.NumberValue) => string`, `ticks?: d3.TimeInterval`
  - Now: `tickFormat?: (TimeDomainValue) => string`, `ticks?: TimeTickSpec`
- Package no longer depends on d3.
- `GanttEditorSlot` deadlines API changed from fixed fields (`deadline`, `secondaryDeadline`, and color overrides) to `deadlines: Array<{ id, timestamp, color }>` (deadline color is required).

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
- `GanttEditorSlot` adds `labelColor?: string` for customizing slot label text color.
- `GanttEditorSlot` adds `customOverlay?: ({ ctx, width, height, slot }) => void` for custom per-slot canvas drawing with slot-local coordinates (`0,0` at slot top-left).

## Compatibility notes
- Existing emits remain: `onChangeStartAndEndTime`, `onChangeDestinationId`, `onChangeSlotTime`, `onClickOnSlot`, `onHoverOnSlot`, `onDoubleClickOnSlot`, `onContextClickOnSlot`, `onTopContentPortionChange`, `onChangeVerticalMarker`, `onClickVerticalMarker`.
- `clearClipboard()` is still exposed (now an alias to `clearSelection()`).
