<template>
    <!--
        Example usage of a gantt chart editor component
        - here it is used for sort allocation planning of flights
        - but it can be used for any kind of time based planning (gate allocation, lounge usage, etc.)
        - time on the x-axis
        - destinations (e.g. sortation chutes) on the y-axis
        - slots (e.g. flights) are rendered as bars
        - slots can be resized at its ends and moved by pin and paste

        TODO:
        - Documentation
        - Single click to select one slot
        - Control + click to select multiple slots
        - Right-Click and double click events handled by parent component
          (`onClickOnSlot` and `onDoubleClickOnSlot`)
        - Departure time (deadline) is always rendered as black vertical line connected with the slot by a dashed line
        - Flights as a list on the left side on destination level
    -->
    <div style="height: 100vh; width: 100%; margin: 0 auto; display: flex; flex-direction: column;">
        <div style="padding: 10px; background: #f5f5f5; border-bottom: 1px solid #ddd; flex-shrink: 0;">
            <button 
                @click="toggleReadOnly"
                :style="{
                    padding: '8px 16px',
                    borderRadius: '4px',
                    border: '1px solid #ccc',
                    background: isReadOnly ? '#e74c3c' : '#27ae60',
                    color: 'white',
                    cursor: 'pointer',
                    fontWeight: 'bold'
                }"
            >
                {{ isReadOnly ? '🔒 Read-Only Mode' : '✏️ Editable Mode' }}
            </button>
            <span style="margin-left: 10px; color: #666;">
                {{ isReadOnly ? 'Slots cannot be moved or resized' : 'Slots can be moved and resized' }}
            </span>
        </div>
        
        <div style="flex: 1; overflow: hidden;">
            <GanttEditorComponent
                :isReadOnly="isReadOnly"
                :startTime="startTime"
                :endTime="endTime"
                :slots="slots"
                :destinations="destinations"
                :destinationGroups="destinationGroups"
                :suggestions="suggestions"
                :markedRegions="markedRegions"
                @onChangeStartAndEndTime="handleChangeStartAndEndTime"
                @onChangeDestinationId="handleChangeDestinationId"
                @onChangeSlotTime="handleChangeSlotTime"
                @onClickOnSlot="handleClickOnSlot"
            />
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import type { GanttEditorSlot } from '../components/gantt-editor-lib/chart/types';

// Configurable parameters
const numberOfSlots = ref(100);

// Define reactive state
const startTime = ref(new Date('2025-01-01T00:00:00Z'));
const endTime = ref(new Date('2025-01-02T00:00:00Z'));
const isReadOnly = ref(false);

// Function to generate random time within the day
const generateRandomTime = (dayStart: Date, dayEnd: Date): Date => {
    const start = dayStart.getTime();
    const end = dayEnd.getTime();
    return new Date(start + Math.random() * (end - start));
};

// Function to generate slots
const generateSlots = (count: number) => {
    const dayStart = new Date('2025-01-01T00:00:00Z');
    const dayEnd = new Date('2025-01-01T23:59:59Z');
    const colors = ['#738732', '#ffcd50', '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57', '#ff9ff3', '#54a0ff', '#5f27cd'];
    
    return Array.from({ length: count }, (_, index) => {
        const slotStart = generateRandomTime(dayStart, dayEnd);
        const slotEnd = new Date(slotStart.getTime() + Math.random() * 3 * 60 * 60 * 1000); // Random duration up to 3 hours
        
        // Ensure slot doesn't exceed day end
        if (slotEnd > dayEnd) {
            slotEnd.setTime(dayEnd.getTime());
        }
        
        const destinationIndex = Math.floor(Math.random() * 20) + 1;
        const flightNumber = `FL${String(index + 1).padStart(4, '0')}`;
        
        const departureTime = new Date(slotEnd.getTime() + 60 * 60 * 1000); // 1 hour after close time

        return {
            id: `${flightNumber}-${index}`,
            displayName: flightNumber,
            group: flightNumber,
            openTime: slotStart,
            closeTime: slotEnd,
            destinationId: `mup-${destinationIndex}`,
            hoverData: `Flight ${flightNumber}: Auto-generated slot`,
            deadline: departureTime,
            deadlineHoverData: '🛫 Departure: ' + departureTime.toLocaleString(),
            color: colors[index % colors.length],
        };
    });
};

// Slots (main data)
const slots = ref<GanttEditorSlot[]>(generateSlots(numberOfSlots.value));

// Destinations - 20 destinations in allocated group
const destinations = reactive([
    ...Array.from({ length: 20 }, (_, i) => ({
        id: `mup-${i + 1}`,
        displayName: `MUP ${i + 1}`,
        active: true,
        groupId: 'allocated'
    })),
    { id: 'UNALLOCATED', displayName: 'UNALLOCATED', active: true, groupId: 'unallocated' },
]);

// Destination groups
const destinationGroups = reactive([
    { id: 'allocated', displayName: 'Allocated', heightPortion: 0.9 },
    { id: 'unallocated', displayName: 'UNALLOCATED', heightPortion: 0.1 },
]);

// Suggestions - empty for generated data
const suggestions = reactive([]);

// Marked regions - empty for generated data
const markedRegions = reactive([]);

// Event handlers that mutate state
const toggleReadOnly = () => {
    isReadOnly.value = !isReadOnly.value;
    console.log('Toggle read-only mode:', isReadOnly.value);
};

const handleChangeStartAndEndTime = (newStartTime: Date, newEndTime: Date) => {
    console.log('Callback: Navigated to new time window', newStartTime, newEndTime);
    startTime.value = newStartTime;
    endTime.value = newEndTime;
};

const handleChangeDestinationId = (slotId: string, destinationId: string) => {
    console.log('Callback: Moved slot to different destination', slotId, destinationId);
    const slotIndex = slots.value.findIndex(slot => slot.id === slotId);
    if (slotIndex !== -1 && !slots.value[slotIndex].readOnly) {
        // Create a new copy of the array with the modified object
        slots.value = slots.value.map((slot, index) => 
            index === slotIndex && !slot.readOnly 
                ? { ...slot, destinationId } 
                : slot
        );
    }
};

const handleChangeSlotTime = (slotId: string, openTime: Date, closeTime: Date) => {
    console.log('Callback: Edited slots time window', slotId, openTime, closeTime);
    const slotToUpdate = slots.value.find(slot => slot.id === slotId);
    if (slotToUpdate && !slotToUpdate.readOnly) {
        slotToUpdate.openTime = openTime;
        slotToUpdate.closeTime = closeTime;
    }
};

const handleClickOnSlot = (slotId: string) => {
    console.log('Callback: Opening details for slot', slotId);
    
};
</script>