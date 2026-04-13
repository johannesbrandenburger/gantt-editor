# Gantt Editor Vue Component

Canvas-based Vue 3 Gantt editor component for interactive slot assignment, time editing, selection, and bulk operations.

## Install via GitLab Package Registry

1. Create an `.npmrc` file in your project root:

```bash
@pf:registry=https://code.oair.io/api/v4/projects/671/packages/npm/
//code.oair.io/api/v4/projects/671/packages/npm/:_authToken=${GITLAB_ACCESS_TOKEN}
```

2. Create a GitLab access token [here](https://code.oair.io/pf/products/bagiq/hlc-ui-components/gantt-editor-vue-component/-/settings/access_tokens) (see [GitLab docs](https://docs.gitlab.com/user/packages/npm_registry/#authenticate-to-the-package-registry)).

- Role: `Developer`
- Scopes: `read_api`

3. Install package:

```bash
GITLAB_ACCESS_TOKEN=<your-gitlab-access-token> npm install @pf/gantt-editor-vue-component@latest
```

Run the same command later to update.

## Manual Integration

If you do not consume the package from the registry, copy these files into your project:

```text
src/components/
  GanttEditorComponent.vue
  gantt-editor-lib/*
```

## Usage Example

```vue
<script setup lang="ts">
import { ref } from "vue";
import GanttEditorComponent, {
  type GanttEditorCanvasContextMenuAction,
  type GanttEditorVerticalMarker,
  type GanttEditorRulerMode,
  type GanttEditorSlot,
  type GanttEditorDestination,
  type GanttEditorDestinationGroup,
} from "@pf/gantt-editor-vue-component";

const startTime = ref(new Date("2025-01-01T00:00:00Z"));
const endTime = ref(new Date("2025-01-02T00:00:00Z"));

const slots = ref<GanttEditorSlot[]>([
  {
    id: "LH123-20250101-F",
    displayName: "LH123 | F",
    group: "LH123",
    openTime: new Date("2025-01-01T10:00:00Z"),
    closeTime: new Date("2025-01-01T12:00:00Z"),
    destinationId: "chute-1",
    deadline: new Date("2025-01-01T13:00:00Z"),
    secondaryDeadline: new Date("2025-01-01T13:25:00Z"),
    deadlineColor: "#9b59b6",
    secondaryDeadlineColor: "#e74c3c",
    hoverData: "Departure: " + new Date("2025-01-01T13:25:00Z").toLocaleString(),
    color: "#3498db",
  },
]);

const destinations = ref<GanttEditorDestination[]>([
  { id: "chute-1", displayName: "Chute 1", active: true, groupId: "allocated" },
  { id: "chute-2", displayName: "Chute 2", active: false, groupId: "allocated" },
  { id: "UNALLOCATED", displayName: "Unallocated", active: true, groupId: "unallocated" },
]);

const destinationGroups = ref<GanttEditorDestinationGroup[]>([
  { id: "allocated", displayName: "Allocated Chutes", heightPortion: 0.8 },
  { id: "unallocated", displayName: "Unallocated", heightPortion: 0.2 },
]);

const activateRulers = ref<GanttEditorRulerMode>("ROW");

const verticalMarkers = ref<GanttEditorVerticalMarker[]>([
  { id: "vm-1", date: new Date("2025-01-01T13:00:00Z"), color: "#16a34a", label: "Cut-off" },
  {
    id: "vm-2",
    date: new Date("2025-01-01T13:30:00Z"),
    color: "#f59e0b",
    label: "Context menu only",
    draggable: false,
    movableByContextMenu: true,
  },
]);

const contextMenuActions = ref<GanttEditorCanvasContextMenuAction[]>([
  { id: "create-flight", label: "Create a flight here" },
]);

function onChangeVerticalMarker(id: string, date: Date) {
  const marker = verticalMarkers.value.find((m) => m.id === id);
  if (marker) marker.date = date;
}

function onContextMenuAction(actionId: string, timestamp: Date, destinationId: string) {
  console.log("context action", actionId, timestamp, destinationId);
}
</script>

<template>
  <div style="height: 100vh; width: 100%;">
    <GanttEditorComponent
      :isReadOnly="false"
      :startTime="startTime"
      :endTime="endTime"
      :slots="slots"
      :destinations="destinations"
      :destinationGroups="destinationGroups"
      :suggestions="[]"
      :markedRegion="null"
      :verticalMarkers="verticalMarkers"
      :contextMenuActions="contextMenuActions"
      :xAxisOptions="{}"
      :activateRulers="activateRulers"
      @onChangeStartAndEndTime="(newStart, newEnd) => console.log('range', newStart, newEnd)"
      @onTopContentPortionChange="(portion, heightPx) => console.log('top-content', portion, heightPx)"
      @onChangeDestinationId="(slotId, destinationId, preview) => console.log('move', slotId, destinationId, preview)"
      @onBulkChangeDestinationId="(slotIds, destinationId, preview) => console.log('bulk-move', slotIds, destinationId, preview)"
      @onCopyToDestinationId="(slotId, destinationId, preview) => console.log('copy', slotId, destinationId, preview)"
      @onBulkCopyToDestinationId="(slotIds, destinationId, preview) => console.log('bulk-copy', slotIds, destinationId, preview)"
      @onMoveSlotOnTimeAxis="(slotId, timeDiffMs, preview) => console.log('move-time', slotId, timeDiffMs, preview)"
      @onBulkMoveSlotsOnTimeAxis="(slotIds, timeDiffMs, preview) => console.log('bulk-move-time', slotIds, timeDiffMs, preview)"
      @onCopySlotOnTimeAxis="(slotId, timeDiffMs, preview) => console.log('copy-time', slotId, timeDiffMs, preview)"
      @onBulkCopySlotsOnTimeAxis="(slotIds, timeDiffMs, preview) => console.log('bulk-copy-time', slotIds, timeDiffMs, preview)"
      @onChangeSlotTime="(slotId, openTime, closeTime) => console.log('resize', slotId, openTime, closeTime)"
      @onSelectionChange="(slotIds) => console.log('selection', slotIds)"
      @onClickOnSlot="(slotId) => console.log('click', slotId)"
      @onHoverOnSlot="(slotId) => console.log('hover', slotId)"
      @onDoubleClickOnSlot="(slotId) => console.log('double-click', slotId)"
      @onContextClickOnSlot="(slotId) => console.log('context', slotId)"
      @onChangeVerticalMarker="onChangeVerticalMarker"
      @onClickVerticalMarker="(id) => console.log('marker-click', id)"
      @onContextMenuAction="onContextMenuAction"
    >
      <template #top-content>
        <div style="padding: 8px 12px;">Optional controls above canvas</div>
      </template>
    </GanttEditorComponent>
  </div>
</template>
```

## Public API

### Props

| Prop | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `startTime` | `Date` | yes | - | Start of visible time range |
| `endTime` | `Date` | yes | - | End of visible time range |
| `slots` | `GanttEditorSlotWithUiAttributes[]` | yes | - | Slot/allocation data |
| `destinations` | `GanttEditorDestination[]` | yes | - | Destination rows |
| `destinationGroups` | `GanttEditorDestinationGroup[]` | yes | - | Destination group layout |
| `suggestions` | `GanttEditorSuggestion[]` | yes | - | Suggestion overlays |
| `activateRulers` | `"ROW" \| "GLOBAL" \| null` | no | `undefined` | Enables resize snap rulers while dragging slot start/end |
| `verticalMarkers` | `GanttEditorVerticalMarker[]` | no | `undefined` | Full-height vertical timeline markers |
| `contextMenuActions` | `GanttEditorCanvasContextMenuAction[]` | no | `undefined` | Extra actions shown on right-click background menu; callback includes clicked timestamp + destination id |
| `markedRegion` | `GanttEditorMarkedRegion \| null` | yes | - | Highlighted time region |
| `isReadOnly` | `boolean` | yes | - | Disables interactive editing |
| `topContentPortion` | `number` | no | `0` | Relative height reserved for the `top-content` slot |
| `xAxisOptions` | `GanttEditorXAxisOptions` | no | `undefined` | Tick format / tick generation customization |
| `helpOverlayTiles` | `HelpOverlayTileDefinition[]` | no | `undefined` | Custom help tiles appended to built-in defaults (same-id custom tiles override defaults) |
| `helpOverlayTileIds` | `string[]` | no | `undefined` | Help tile ids to include from the active tile list (built-in + custom); omit to show all active tiles, pass `[]` to disable help UI entirely |

#### Rulers (`activateRulers`)

- `null` (or omitted): rulers disabled.
- `"ROW"`: snapping only considers slots in the same destination row as the edited slot.
- `"GLOBAL"`: snapping considers all slots in all rows.
- Snap candidates include slot `openTime`, `closeTime`, `deadline`, and `secondaryDeadline`.
- While resizing, the edited edge snaps within a small pixel catchment and shows a ruler line segment to the referenced point.

### Events

Notes:
- `preview` is `true` for transient preview updates and `false` for committed updates.
- All events are emitted with the exact payload order shown below.

| Event | Payload |
| --- | --- |
| `onChangeStartAndEndTime` | `(start: Date, end: Date)` |
| `onTopContentPortionChange` | `(portion: number, heightPx: number)` |
| `onChangeDestinationId` | `(slotId: string, destinationId: string, preview: boolean)` |
| `onBulkChangeDestinationId` | `(slotIds: string[], destinationId: string, preview: boolean)` |
| `onCopyToDestinationId` | `(slotId: string, destinationId: string, preview: boolean)` |
| `onBulkCopyToDestinationId` | `(slotIds: string[], destinationId: string, preview: boolean)` |
| `onMoveSlotOnTimeAxis` | `(slotId: string, timeDiffMs: number, preview: boolean)` |
| `onBulkMoveSlotsOnTimeAxis` | `(slotIds: string[], timeDiffMs: number, preview: boolean)` |
| `onCopySlotOnTimeAxis` | `(slotId: string, timeDiffMs: number, preview: boolean)` |
| `onBulkCopySlotsOnTimeAxis` | `(slotIds: string[], timeDiffMs: number, preview: boolean)` |
| `onChangeSlotTime` | `(slotId: string, openTime: Date, closeTime: Date)` |
| `onSelectionChange` | `(slotIds: string[])` |
| `onClickOnSlot` | `(slotId: string)` |
| `onHoverOnSlot` | `(slotId: string)` |
| `onDoubleClickOnSlot` | `(slotId: string)` |
| `onContextClickOnSlot` | `(slotId: string)` |
| `onChangeVerticalMarker` | `(id: string, date: Date)` |
| `onClickVerticalMarker` | `(id: string)` |
| `onContextMenuAction` | `(actionId: string, timestamp: Date, destinationId: string)` |

### Slots

- `top-content`: optional content rendered above the canvas area.

### Exposed Methods (template ref)

The component exposes methods via `ref`:

```vue
<script setup lang="ts">
import { ref } from "vue";
import GanttEditorComponent from "@pf/gantt-editor-vue-component";

const ganttRef = ref<InstanceType<typeof GanttEditorComponent> | null>(null);

function clear() {
  ganttRef.value?.clearSelection();
}
</script>

<template>
  <GanttEditorComponent ref="ganttRef" />
  <button @click="clear">Clear selection</button>
</template>
```

- `clearSelection()`: clears selected slots.
- `clearClipboard()`: deprecated alias of `clearSelection()`.

## Exported Types

```ts
export type GanttEditorSlot = {
  id: string; // unique id for the slot/allocation
  group: string; // group id (e.g. flightId)
  displayName: string; // label rendered on the slot
  openTime: Date; // slot start
  closeTime: Date; // slot end
  destinationId: string; // destination row id
  additionalData?: string; // optional extra payload
  hoverData?: string; // optional hover tooltip payload
  deadline?: Date; // optional STD marker anchor
  deadlineColor?: string; // overrides default deadline (STD) marker line color
  secondaryDeadline?: Date; // optional ETD marker anchor
  secondaryDeadlineColor?: string; // overrides default secondary (ETD) marker line color
  readOnly?: boolean; // disables edits for this slot
  color?: string; // custom slot fill color
};

export type GanttEditorDestination = {
  id: string; // destination id
  displayName: string; // row label
  active: boolean; // active/inactive state
  groupId: string; // owning destination group id
};

export type GanttEditorDestinationGroup = {
  id: string; // group id
  displayName: string; // group label
  heightPortion: number; // relative vertical size, all groups sum to 1.0
};

export type GanttEditorMarkedRegion = {
  startTime: Date; // region start
  endTime: Date; // region end
  destinationId: string | "multiple"; // target destination or multi-row marker
};

export type GanttEditorSuggestion = {
  slotId: string; // slot the suggestion applies to
  alternativeDestinationId: string; // suggested destination id
  alternativeDestinationDisplayName?: string; // optional suggested destination label
};

export type GanttEditorVerticalMarker = {
  id: string; // stable id used in marker events
  date: Date; // marker time position
  color?: string; // optional marker line color
  label?: string; // optional hover tooltip label
  draggable?: boolean; // when false marker cannot be moved by direct drag
  movableByContextMenu?: boolean; // when false marker is hidden from context-menu move actions
};

export type GanttEditorRulerMode = "ROW" | "GLOBAL" | null;
```

`GanttEditorXAxisOptions`:

```ts
export type GanttEditorXAxisOptions = {
  upper?: {
    tickFormat?: (domainValue: TimeDomainValue) => string; // custom upper-axis label formatter
    ticks?: TimeTickSpec; // custom upper-axis tick strategy
  };
  lower?: {
    tickFormat?: (domainValue: TimeDomainValue) => string; // custom lower-axis label formatter
    ticks?: TimeTickSpec; // custom lower-axis tick strategy
  };
};
```

## Selection and Interaction Shortcuts

- Click the top-right `?` inside the chart to open the in-canvas help overlay.
- The first help tile currently demonstrates background brush selection.
- Drag on canvas background to brush-select multiple slots.
- Cmd/Ctrl + click toggles slot selection.
- Hold Alt while moving selection to copy instead of move.
- Pan timeline horizontally with:
  - mouse middle button drag
  - right mouse button drag
  - horizontal trackpad scroll
- Scroll vertically with mouse wheel / trackpad.
- Zoom using Shift + wheel/trackpad scroll.
- Press Escape to clear selection.

## Vertical Markers

- `verticalMarkers` renders full-height timeline lines.
- Marker must be inside current visible range (`startTime` to `endTime`) to be visible.
- Dragging marker emits `onChangeVerticalMarker(id, date)`; update your state for persistence.
- Clicking marker emits `onClickVerticalMarker(id)`.
- `isReadOnly` disables marker dragging globally.
- `draggable: false` disables direct dragging for one marker.
- `movableByContextMenu: false` excludes one marker from background context-menu move actions.
- These props are independent; e.g. a marker can be `draggable: false` and still `movableByContextMenu: true`.

## Utility Exports

From package root:

- `getSelectionItemDisplayName(item)`
- `getClipboardItemDisplayName(item)` (deprecated, use `getSelectionItemDisplayName`)

