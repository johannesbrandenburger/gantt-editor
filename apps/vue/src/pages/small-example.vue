<script setup lang="ts">
import GanttEditor from 'gantt-editor/vue';
</script>
<template>
    <!--
        Example usage of a gantt chart editor component
        - here it is used for sort allocation planning of flights
        - but it can be used for any kind of time based planning (gate allocation, lounge usage, etc.)
        - time on the x-axis
        - destinations (e.g. sortation chutes) on the y-axis
        - slots (e.g. flights) are rendered as bars
        - slots can be resized at its ends and moved by pin and paste
    -->
    <div style="height: 100vh; width: 100%; margin: 0 auto;">
        <GanttEditor
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
                    destinationId: 'chute-1', // destination/chute id
                    deadlines: [ // generic slot deadlines (supports any amount)
                      { id: 'std', timestamp: new Date('2025-01-01T13:00:00Z').getTime(), color: '#9e9e9e' },
                      { id: 'etd', timestamp: new Date('2025-01-01T13:25:00Z').getTime(), color: '#1f1f1f' }
                    ],
                    hoverData: '🛫 Departure: ' + (new Date('2025-01-01T13:25:00Z')).toLocaleString(),
                    color: '#3498db', // color for the allocation bar
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
            @onBulkChangeDestinationId="(slotIds, newDestinationId) => console.log(`onBulkChangeDestinationId(${slotIds.join(',')}, ${newDestinationId})`)"
            @onCopyToDestinationId="(slotId, newDestinationId) => console.log(`onCopyToDestinationId(${slotId}, ${newDestinationId})`)"
            @onBulkCopyToDestinationId="(slotIds, newDestinationId) => console.log(`onBulkCopyToDestinationId(${slotIds.join(',')}, ${newDestinationId})`)"
            @onMoveSlotOnTimeAxis="(slotId, timeDiff) => console.log(`onMoveSlotOnTimeAxis(${slotId}, ${timeDiff})`)"
            @onBulkMoveSlotsOnTimeAxis="(slotIds, timeDiff) => console.log(`onBulkMoveSlotsOnTimeAxis(${slotIds.join(',')}, ${timeDiff})`)"
            @onCopySlotOnTimeAxis="(slotId, timeDiff) => console.log(`onCopySlotOnTimeAxis(${slotId}, ${timeDiff})`)"
            @onBulkCopySlotsOnTimeAxis="(slotIds, timeDiff) => console.log(`onBulkCopySlotsOnTimeAxis(${slotIds.join(',')}, ${timeDiff})`)"
            @onChangeSlotTime="(slotId, newOpenTime, newCloseTime) => console.log(`onChangeSlotTime(${slotId}, ${newOpenTime}, ${newCloseTime})`)"
            @onClickOnSlot="(slotId) => console.log(`onClickOnSlot(${slotId})`)"
            @onHoverOnSlot="(slotId) => console.log(`onHoverOnSlot(${slotId})`)"
            @onDoubleClickOnSlot="(slotId) => console.log(`onDoubleClickOnSlot(${slotId})`)"
            @onContextClickOnSlot="(slotId) => console.log(`onContextClickOnSlot(${slotId})`)"
        />
    </div>
</template>
