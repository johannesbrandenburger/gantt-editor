# Gantt Editor Vue Component

## Install via Gitlab Package Registry

- create a `.npmrc` file in your project root with the following content:
```bash
@pf:registry=https://code.oair.io/api/v4/projects/671/packages/npm/
//code.oair.io/api/v4/projects/671/packages/npm/:_authToken=${GITLAP_ACCESS_TOKEN}
```
- create a Gitlab access token [here](https://code.oair.io/pf/products/bagiq/hlc-ui-components/gantt-editor-vue-component/-/settings/access_tokens) (see [Gitlab Docs](https://docs.gitlab.com/user/packages/npm_registry/#authenticate-to-the-package-registry))
  - Role: Developer
  - Scopes: `read_api`

- run the following command to install the package:
```bash
GITLAP_ACCESS_TOKEN=<your-gitlab-access-token> npm install @pf/gantt-editor-vue-component@latest
```
  - run the same command to update the package later on

## Install Manually

- install d3 
```bash
npm install d3; npm install --save-dev @types/d3
```

- copy needed files to your project
```bash
- src/components/
    - GanttEditorComponent.vue
    - gantt-editor-lib/*
```

## Usage Example

- use as in `src/pages/index.vue` (generates variable number of allocations)
- or as in this small example (easier to understand)
```vue
<script setup lang="ts">
import { ref } from 'vue';
import GanttEditorComponent from '@/components/GanttEditorComponent.vue'; // adjust the path to your project structure
// OR:
import GanttEditorComponent from '@pf/gantt-editor-vue-component'; // if you installed the package from the registry
import type { GanttEditorVerticalMarker } from '@pf/gantt-editor-vue-component';
// manual copy: import type { GanttEditorVerticalMarker } from '@/components/gantt-editor-lib/chart/types';

const verticalMarkers = ref<GanttEditorVerticalMarker[]>([
    { id: 'vm-1', date: new Date('2025-01-01T13:00:00Z'), color: '#16a34a', label: 'Cut-off' },
]);

function onChangeVerticalMarker(id: string, date: Date) {
    const m = verticalMarkers.value.find((x) => x.id === id);
    if (m) m.date = date; // persist drag so the line stays put after re-render
}
</script>
<template>
    <div style="height: 100vh; width: 100%; margin: 0 auto;">
        <GanttEditorComponent
            :isReadOnly="false"
            :startTime="new Date('2025-01-01T00:00:00Z')"
            :endTime="new Date('2025-01-02T00:00:00Z')"
            :slots="[
                { 
                    id: 'LH123-20250101-F', // unique id for the allocation (e.g. flightnumber + criteria)
                    displayName: 'LH123 | F', // display name for the allocation
                    group: 'LH123', // group id (e.g. flight number)
                    openTime: new Date('2025-01-01T10:00:00Z'), // start time of service window
                    closeTime: new Date('2025-01-01T12:00:00Z'), // end time of service window
                    destinationId: 'chute-1', // destination/chute id it is allocated to
                    deadline: new Date('2025-01-01T13:00:00Z'), // STD (scheduled departure) marker anchor
                    secondaryDeadline: new Date('2025-01-01T13:25:00Z'), // optional ETD marker (estimated departure)
                    deadlineColor: '#9b59b6', // optional: color of the STD marker (defaults apply if omitted)
                    secondaryDeadlineColor: '#e74c3c', // optional: color of the ETD marker
                    hoverData: '🛫 Departure: ' + (new Date('2025-01-01T13:25:00Z')).toLocaleString(), // custom text/html shown in the shared hover popup
                    color: '#3498db', // color for the allocation bar, should show the status of the allocation
                },
                // ...
            ]"
            :destinations="[
                // the groupId of a destination is always allocated except of dummy chutes like unallocated
                { id: 'chute-1', displayName: 'Chute 1', active: true, groupId: 'allocated' },
                { id: 'chute-2', displayName: 'Chute 2', active: false, groupId: 'allocated' },
                { id: 'chute-3', displayName: 'Chute 3', active: true, groupId: 'allocated' },
                { id: 'UNALLOCATED', displayName: 'Unallocated', active: true, groupId: 'unallocated' }, // dummy chute for unallocated slots
                // ...
            ]"
            :destinationGroups="[
                { id: 'allocated', displayName: 'Allocated Chutes', heightPortion: 0.8 }, // group for allocated chutes
                { id: 'unallocated', displayName: 'Unallocated Chute', heightPortion: 0.2 } // group for dummy unallocated chute
            ]"
            :markedRegion="null /* optional marked region to highlight a specific time range */"
            :suggestions="[
                // optional suggestions for the user to see and apply
            ]"

            :verticalMarkers="verticalMarkers"
            @onChangeVerticalMarker="onChangeVerticalMarker"
            @onClickVerticalMarker="(id) => console.log('vertical marker click', id)"

            @onChangeStartAndEndTime="(newStartTime, newEndTime) => console.log(`onChangeStartAndEndTime(${newStartTime}, ${newEndTime})`)"
            @onChangeDestinationId="(slotId, newDestinationId) => console.log(`onChangeDestinationId(${slotId}, ${newDestinationId})`)"
            @onChangeSlotTime="(slotId, newOpenTime, newCloseTime) => console.log(`onChangeSlotTime(${slotId}, ${newOpenTime}, ${newCloseTime})`)"
            @onClickOnSlot="(slotId) => console.log(`onClickOnSlot(${slotId})`)"
            @onHoverOnSlot="(slotId) => console.log(`onHoverOnSlot(${slotId})`)"
            @onDoubleClickOnSlot="(slotId) => console.log(`onDoubleClickOnSlot(${slotId})`)"
            @onContextClickOnSlot="(slotId) => console.log(`onContextClickOnSlot(${slotId})`)"
            :x-axis-options="{
              // optional x-axis options to customize the axis ticks and formats
            }"
        />
    </div>
</template>
```

- the input parameters have the following types (see `src/components/gantt-editor-lib/chart/types.ts`):
```typescript
export type GanttEditorSlot = {
  id: string, // unique id for the allocation (e.g. flightnumber + criteria)
  group: string, // group id (e.g. flight number)
  displayName: string, // display name for the allocation
  openTime: Date, // start time of service window
  closeTime: Date, // end time of service window
  destinationId: string, // destination/chute id it is allocated to
  deadline?: Date, // STD (scheduled departure) anchor for the first marker line
  deadlineColor?: string, // optional stroke color for the STD marker (default: dark gray; dimmed when ETD differs)
  secondaryDeadline?: Date, // optional ETD anchor (second marker when both are set)
  secondaryDeadlineColor?: string, // optional stroke color for the ETD marker (default: dark gray)
  hoverData?: string, // custom text/html shown in the shared hover popup
  readOnly?: boolean, // disable editing of the slot (no resize, no drag)
  color?: string // color for the allocation bar, should show the status of the allocation (if not set, the a state color is computed (see `src/components/gantt-editor-lib/helpers.ts: mapSlotToStateColor`))
};
export type GanttEditorDestination = {
  id: string, // unique id for the destination/chute
  displayName: string, // display name for the destination/chute
  active: boolean, // whether the destination/chute is active or not (if there is a problem -> inactive)
  groupId: string // group id the destination/chute belongs to (e.g. allocated, unallocated)
};
export type GanttEditorDestinationGroup = {
  id: string, // unique id for the destination group
  displayName: string, // display name for the destination group
  heightPortion: number // height portion of the group in the gantt editor (0.0 - 1.0) NOTE: the sum of all height portions must be 1.0
};
export type GanttEditorMarkedRegion = {
  startTime: Date, // start time of the marked region
  endTime: Date, // end time of the marked region
  destinationId: string | "multiple" // destination/chute id where the marked region is displayed (y-axis), "multiple" if it is not bound to a specific destination
};
export type GanttEditorSuggestion = {
  slotId: string, // slot id the suggestion is for
  alternativeDestinationId: string, // alternative destination/chute id the suggestion is for
  alternativeDestinationDisplayName?: string, // optional display name for the alternative destination/chute
};
export type GanttEditorVerticalMarker = {
  id: string, // stable id for the marker (used in events)
  date: Date, // time position on the x-axis
  color?: string, // line color (default: green)
  label?: string, // optional text for the hover tooltip
  draggable?: boolean, // default true when the chart is not read-only; set false to lock position
};
export type GanttEditorXAxisOptions = {
  upper?: {
    tickFormat?: (domainValue: Date | d3.NumberValue) => string;
    ticks?: d3.TimeInterval;
  };
  lower?: {
    tickFormat?: (domainValue: Date | d3.NumberValue) => string;
    ticks?: d3.TimeInterval;
  };
};
```

## Shortcuts

- holding cmd/ctrl and **dragging** lets the user **select multiple slots** (brush selection)
- to **move on the timeline** (horizontal scroll)
  - drag with mousewheel pressed
  - drag with right click pressed
  - drag with shift key pressed
  - simple horizontal scroll (e.g. on a trackpad, currently only supported in chrome-based browsers) 
- to **move up and down** (vertical scroll)
  - simple vertical scroll (mousewheel/trackpad)
- cmd/ctrl + click on **multiple slots selects** them one at a time
- **zoom in and out** by shift + scroll (mousewheel/trackpad)
- **clear selection** by pressing escape

## Exposed Methods

The component exposes methods that can be called programmatically via a template ref:

```vue
<script setup lang="ts">
import { ref } from 'vue';
import GanttEditorComponent from '@pf/gantt-editor-vue-component';

const ganttEditorRef = ref<InstanceType<typeof GanttEditorComponent> | null>(null);

// Clear the selection programmatically
const handleClearSelection = () => {
  ganttEditorRef.value?.clearSelection();
};
</script>
<template>
  <GanttEditorComponent ref="ganttEditorRef" ... />
  <button @click="handleClearSelection">Clear Selection</button>
</template>
```

### Available Methods

- `clearSelection()`: Clears all selected slots programmatically. This is useful when you need to reset selection state from external controls or based on application logic.
- `clearClipboard()` (deprecated): Backward-compatible alias for `clearSelection()`.


## Vertical markers

- Optional prop **`verticalMarkers`**: draw one or more **full-height vertical lines** in every destination group (same time axis as slots).
- A marker is shown only while its `date` lies inside the current visible time range (`startTime`–`endTime`); panning or zooming updates visibility automatically.
- **Interaction:** drag horizontally on the line (or its wide hit area) to move it in time; **click** fires `onClickVerticalMarker`. While dragging, **`onChangeVerticalMarker`** emits `(id, newDate)` — update your reactive copy of `verticalMarkers` (as in the example above) so the new time persists after re-render.
- **`isReadOnly`** disables dragging; **`draggable: false`** on a single marker locks that line only.
