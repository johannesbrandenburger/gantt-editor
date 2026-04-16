# Gantt Editor Component

Framework-agnostic canvas Gantt editor with Vue, React, and Angular wrappers.

## Install via GitLab Registry

Create a GitLab personal access token with the following requirements:

- Role: `Developer`
- Scope: `read_api`

Create a `.npmrc` file in your project root with the following content, replacing `<GITLAB_ACCESS_TOKEN>` with your token:

```bash
# .npmrc
@pf:registry=https://code.oair.io/api/v4/projects/671/packages/npm/
//code.oair.io/api/v4/projects/671/packages/npm/:_authToken=<GITLAB_ACCESS_TOKEN>
```

Then install the package:

```bash
npm install @pf/gantt-editor-component
```

Token requirements:
- Role: `Developer`
- Scope: `read_api`

## Quick Start By Framework

<details>
<summary>Vue 3</summary>

```vue
<script setup lang="ts">
import { ref } from "vue";
import GanttEditor, {
  type GanttEditorDestination,
  type GanttEditorDestinationGroup,
  type GanttEditorSlot,
} from "@pf/gantt-editor-component/vue";

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
    hoverData: "<strong>LH123</strong><br><em>Gate opens 10:00</em>",
    deadlines: [
      { id: "std", timestamp: new Date("2025-01-01T13:00:00Z").getTime(), color: "#9e9e9e" },
      { id: "etd", timestamp: new Date("2025-01-01T13:25:00Z").getTime(), color: "#1f1f1f" },
    ],
    color: "#3498db",
  },
]);

const destinations = ref<GanttEditorDestination[]>([
  { id: "chute-1", displayName: "Chute 1", active: true, groupId: "allocated" },
  { id: "UNALLOCATED", displayName: "Unallocated", active: true, groupId: "unallocated" },
]);

const destinationGroups = ref<GanttEditorDestinationGroup[]>([
  { id: "allocated", displayName: "Allocated Chutes", heightPortion: 0.8 },
  { id: "unallocated", displayName: "Unallocated Chute", heightPortion: 0.2 },
]);
</script>

<template>
  <div style="height: 100vh; width: 100%;">
    <GanttEditor
      :isReadOnly="false"
      :startTime="startTime"
      :endTime="endTime"
      :slots="slots"
      :destinations="destinations"
      :destinationGroups="destinationGroups"
      :markedRegion="null"
      :suggestions="[]"
      @onChangeDestinationId="(slotId, destinationId, preview) => console.log(slotId, destinationId, preview)"
      @onMoveSlotOnTimeAxis="(slotId, timeDiffMs, preview) => console.log(slotId, timeDiffMs, preview)"
      @onSelectionChange="(slotIds) => console.log(slotIds)"
    />
  </div>
</template>
```

</details>

<details>
<summary>React</summary>

```tsx
import { useMemo, useState } from "react";
import {
  GanttEditor,
  type GanttEditorDestination,
  type GanttEditorDestinationGroup,
  type GanttEditorSlot,
} from "@pf/gantt-editor-component/react";

export function App() {
  const [startTime] = useState(() => new Date("2025-01-01T00:00:00Z"));
  const [endTime] = useState(() => new Date("2025-01-02T00:00:00Z"));

  const slots = useMemo<GanttEditorSlot[]>(
    () => [
      {
        id: "LH123-20250101-F",
        displayName: "LH123 | F",
        group: "LH123",
        openTime: new Date("2025-01-01T10:00:00Z"),
        closeTime: new Date("2025-01-01T12:00:00Z"),
        destinationId: "chute-1",
        hoverData: "<strong>LH123</strong><br><em>Gate opens 10:00</em>",
      },
    ],
    [],
  );

  const destinations = useMemo<GanttEditorDestination[]>(
    () => [{ id: "chute-1", displayName: "Chute 1", active: true, groupId: "allocated" }],
    [],
  );

  const destinationGroups = useMemo<GanttEditorDestinationGroup[]>(
    () => [{ id: "allocated", displayName: "Allocated Chutes", heightPortion: 1 }],
    [],
  );

  return (
    <div style={{ height: "100vh", width: "100%" }}>
      <GanttEditor
        isReadOnly={false}
        startTime={startTime}
        endTime={endTime}
        slots={slots}
        destinations={destinations}
        destinationGroups={destinationGroups}
        markedRegion={null}
        suggestions={[]}
        onChangeDestinationId={(slotId, destinationId, preview) => console.log(slotId, destinationId, preview)}
        onMoveSlotOnTimeAxis={(slotId, timeDiffMs, preview) => console.log(slotId, timeDiffMs, preview)}
        onSelectionChange={(slotIds) => console.log(slotIds)}
      />
    </div>
  );
}
```

</details>

<details>
<summary>Angular</summary>

```ts
import { Component } from "@angular/core";
import {
  GanttEditor,
  type GanttEditorDestination,
  type GanttEditorDestinationGroup,
  type GanttEditorSlot,
} from "@pf/gantt-editor-component/angular";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [GanttEditor],
  template: `
    <div style="height: 100vh; width: 100%;">
      <gantt-editor
        [isReadOnly]="false"
        [startTime]="startTime"
        [endTime]="endTime"
        [slots]="slots"
        [destinations]="destinations"
        [destinationGroups]="destinationGroups"
        [markedRegion]="null"
        [suggestions]="[]"
        (onChangeDestinationId)="onChangeDestinationId($event)"
        (onMoveSlotOnTimeAxis)="onMoveSlotOnTimeAxis($event)"
        (onSelectionChange)="onSelectionChange($event)"
      />
    </div>
  `,
})
export class AppComponent {
  startTime = new Date("2025-01-01T00:00:00Z");
  endTime = new Date("2025-01-02T00:00:00Z");

  slots: GanttEditorSlot[] = [
    {
      id: "LH123-20250101-F",
      displayName: "LH123 | F",
      group: "LH123",
      openTime: new Date("2025-01-01T10:00:00Z"),
      closeTime: new Date("2025-01-01T12:00:00Z"),
      destinationId: "chute-1",
      hoverData: "<strong>LH123</strong><br><em>Gate opens 10:00</em>",
    },
  ];

  destinations: GanttEditorDestination[] = [
    { id: "chute-1", displayName: "Chute 1", active: true, groupId: "allocated" },
  ];

  destinationGroups: GanttEditorDestinationGroup[] = [
    { id: "allocated", displayName: "Allocated Chutes", heightPortion: 1 },
  ];

  onChangeDestinationId([slotId, destinationId, preview]: [string, string, boolean]) {
    console.log(slotId, destinationId, preview);
  }

  onMoveSlotOnTimeAxis([slotId, timeDiffMs, preview]: [string, number, boolean]) {
    console.log(slotId, timeDiffMs, preview);
  }

  onSelectionChange(slotIds: string[]) {
    console.log(slotIds);
  }
}
```

Angular note: multi-value outputs are emitted as tuples in the same order as the Vue/React callback arguments.

</details>

## Shared API

All wrappers expose the same core model and behavior.

### Required Inputs

- `startTime: Date`
- `endTime: Date`
- `slots: GanttEditorSlotWithUiAttributes[]`
- `destinations: GanttEditorDestination[]`
- `destinationGroups: GanttEditorDestinationGroup[]`
- `suggestions: GanttEditorSuggestion[]`
- `markedRegion: GanttEditorMarkedRegion | null`
- `isReadOnly: boolean`

`GanttEditorSlot` supports generic slot deadlines:
- `deadlines?: Array<{ id: string; timestamp: number; color: string }>`
- `hoverData?: string` (tooltip supports plain text and a limited HTML subset: `<strong>`, `<em>`, `<br>`)

### Common Optional Inputs

- `activateRulers: "ROW" | "GLOBAL" | null`
- `verticalMarkers: GanttEditorVerticalMarker[]`
- `contextMenuActions: GanttEditorCanvasContextMenuAction[]`
- `slotContextMenuActions: GanttEditorSlotContextMenuAction[]`
- `topContentPortion: number`
- `xAxisOptions: GanttEditorXAxisOptions`
- `helpOverlayTiles: HelpOverlayTileDefinition[]`
- `helpOverlayTileIds: string[]`
- `features: GanttEditorFeature[]`

### Key Events

- Time range: `onChangeStartAndEndTime(start, end)`
- Destination move/copy (single and bulk): `onChangeDestinationId`, `onBulkChangeDestinationId`, `onCopyToDestinationId`, `onBulkCopyToDestinationId`
- Time-axis move/copy (single and bulk): `onMoveSlotOnTimeAxis`, `onBulkMoveSlotsOnTimeAxis`, `onCopySlotOnTimeAxis`, `onBulkCopySlotsOnTimeAxis`
- Resize: `onChangeSlotTime(slotId, openTime, closeTime)`
- Selection and click interactions: `onSelectionChange`, `onClickOnSlot`, `onHoverOnSlot`, `onDoubleClickOnSlot`, `onContextClickOnSlot`
- Vertical markers: `onChangeVerticalMarker`, `onClickVerticalMarker`
- Canvas context menu action: `onContextMenuAction(actionId, timestamp, destinationId)`
- Slot context menu action: `onSlotContextMenuAction(actionId, slotId)`

## Feature Flags

`features` is an allow-list. Omit it to keep all interactions enabled.

Supported ids:

- `select-slots`
- `brush-select-slots`
- `resize-slot-time`
- `apply-slot-suggestions`
- `collapse-topics`
- `canvas-context-menu`
- `move-vertical-markers`
- `move-vertical-markers-from-context-menu`
- `move-slots-to-destination`
- `bulk-move-slots-to-destination`
- `copy-slots-to-destination`
- `bulk-copy-slots-to-destination`
- `move-slots-on-time-axis`
- `bulk-move-slots-on-time-axis`
- `copy-slots-on-time-axis`
- `bulk-copy-slots-on-time-axis`
- `preview-slots-to-destination`
- `preview-slots-on-time-axis`
- `copy-modifier-alt`
- `time-axis-modifier-shift`

## Exposed Methods

- `clearSelection()`

## Local Development

- Install: `npm install`
- Start demos:
  - `npm run dev:vue`
  - `npm run dev:react`
  - `npm run dev:angular`
- Default dev command: `npm run dev` (Vue demo)
