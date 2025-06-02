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
    <div style="height: 100vh; width: 100%; margin: 0 auto; display: flex; flex-direction: column;">
        <div style="padding: 10px; background: #f5f5f5; border-bottom: 1px solid #ddd; flex-shrink: 0; display: flex; align-items: center; gap: 10px;">
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
            <div 
                v-if="eventMessage"
                :style="{
                    padding: '6px 12px',
                    backgroundColor: '#333',
                    color: 'white',
                    borderRadius: '4px',
                    fontSize: '14px',
                    maxWidth: '300px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    animation: 'fadeIn 0.3s ease-in-out'
                }"
            >
                {{ eventMessage }}
            </div>
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
                @onHoverOnSlot="handleHoverOnSlot"
                @onDoubleClickOnSlot="handleDoubleClickOnSlot"
                @onContextClickOnSlot="handleContextClickOnSlot"
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
const eventMessage = ref('');

// Function to show event message with auto-clear
const showEventMessage = (message: string, duration = 3000) => {
    eventMessage.value = message;
    setTimeout(() => {
        eventMessage.value = '';
    }, duration);
};

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
    showEventMessage(`🔄 Switched to ${isReadOnly.value ? 'Read-Only' : 'Editable'} mode`);
};

const handleChangeStartAndEndTime = (newStartTime: Date, newEndTime: Date) => {
    console.log('Callback: Navigated to new time window', newStartTime, newEndTime);
    startTime.value = newStartTime;
    endTime.value = newEndTime;
    showEventMessage(`📅 Time window: ${newStartTime.toLocaleDateString()} - ${newEndTime.toLocaleDateString()}`);
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
        showEventMessage(`📦 Moved ${slotId} to ${destinationId}`);
    }
};

const handleChangeSlotTime = (slotId: string, openTime: Date, closeTime: Date) => {
    console.log('Callback: Edited slots time window', slotId, openTime, closeTime);
    const slotToUpdate = slots.value.find(slot => slot.id === slotId);
    if (slotToUpdate && !slotToUpdate.readOnly) {
        slotToUpdate.openTime = openTime;
        slotToUpdate.closeTime = closeTime;
        showEventMessage(`⏰ Resized ${slotId} (${openTime.toLocaleTimeString()} - ${closeTime.toLocaleTimeString()})`);
    }
};

const handleClickOnSlot = (slotId: string) => {
    console.log('Callback: Opening details for slot', slotId);
    showEventMessage(`👆 Clicked on ${slotId}`);
};

const handleHoverOnSlot = (slotId: string) => {
    console.log('Callback: Hovering on slot', slotId);
    showEventMessage(`🖱️ Hovering on ${slotId}`, 2000);
};

const handleDoubleClickOnSlot = (slotId: string) => {
    console.log('Callback: Double clicked on slot', slotId);
    showEventMessage(`🖱️🖱️ Double clicked on ${slotId}`);
};

const handleContextClickOnSlot = (slotId: string) => {
    console.log('Callback: Right clicked on slot', slotId);
    showEventMessage(`🖱️ Right clicked on ${slotId}`);
};
</script>

<style scoped>
@keyframes fadeIn {
    from { opacity: 0; transform: translateY(-5px); }
    to { opacity: 1; transform: translateY(0); }
}
</style>