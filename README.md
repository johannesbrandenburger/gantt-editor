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
import GanttEditorComponent from '@/components/GanttEditorComponent.vue'; // adjust the path to your project structure
// OR:
import GanttEditorComponent from '@pf/gantt-editor-vue-component'; // if you installed the package from the registry
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
                    deadline: new Date('2025-01-01T13:00:00Z'), // departure time of the flight
                    deadlineHoverData: '🛫 Departure: ' + (new Date('2025-01-01T13:00:00Z')).toLocaleString(), // shows the user the exact departure time on hover
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

- the input parameters have the following types (defined in `gantt-editor-lib/types.ts`):
```typescript
export type GanttEditorSlot = {
  id: string, // unique id for the allocation (e.g. flightnumber + criteria)
  group: string, // group id (e.g. flight number)
  displayName: string, // display name for the allocation
  openTime: Date, // start time of service window
  closeTime: Date, // end time of service window
  destinationId: string, // destination/chute id it is allocated to
  deadline?: Date, // departure time of the flight
  deadlineHoverData?: string, // shows the user the exact departure time on hover
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
