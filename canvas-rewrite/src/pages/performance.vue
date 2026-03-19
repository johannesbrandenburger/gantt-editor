<template>
    <div style="height: 100vh; width: 100%; display: flex; flex-direction: column;">
        <!-- Toolbar -->
        <div
            style="color: black; padding: 8px 16px; background: #f5f5f5; border-bottom: 1px solid #ddd; display: flex; gap: 12px; align-items: center; font-size: 14px; flex-shrink: 0;">
            <strong>⚡ Performance Test</strong>
            <span data-testid="total-slot-count">{{ slots.length }} slots</span>
            <span>{{ numberOfDestinations }} destinations</span>
            <button
                @click="toggleLazyRendering"
                data-testid="toggle-lazy-rendering"
                :style="{
                    padding: '6px 14px',
                    borderRadius: '4px',
                    border: '1px solid #ccc',
                    background: lazyRendering ? '#27ae60' : '#e74c3c',
                    color: 'white',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    fontSize: '13px'
                }"
            >
                Lazy Rendering: {{ lazyRendering ? 'ON' : 'OFF' }}
            </button>
        </div>

        <!-- Gantt Editor -->
        <div style="flex: 1; overflow: hidden;">
            <GanttEditorComponent
                :isReadOnly="false"
                :startTime="startTime"
                :endTime="endTime"
                :slots="slots"
                :destinations="destinations"
                :destinationGroups="destinationGroups"
                :suggestions="[]"
                :markedRegion="null"
                :lazyRendering="lazyRendering"
                @onChangeStartAndEndTime="handleChangeStartAndEndTime"
                @onChangeDestinationId="handleChangeDestinationId"
                @onChangeSlotTime="handleChangeSlotTime"
                @onClickOnSlot="() => {}"
                @onHoverOnSlot="() => {}"
                @onDoubleClickOnSlot="() => {}"
                @onContextClickOnSlot="() => {}"
            />
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import type { GanttEditorSlot } from '../components/gantt-editor-lib/chart/types';
import GanttEditorComponent from '../components/GanttEditorComponent.vue';

// Performance test parameters
const numberOfSlots = 2000;
const numberOfDestinations = 50;

// Lazy rendering toggle
const lazyRendering = ref(false);
const toggleLazyRendering = () => {
    lazyRendering.value = !lazyRendering.value;
};

// Time range: today 00:00 - 23:59
const startTime = ref(new Date(new Date().setHours(0, 0, 0, 0)));
const endTime = ref(new Date(new Date().setHours(23, 59, 59, 999)));

// Generate destinations
const destinations = reactive([
    ...Array.from({ length: numberOfDestinations }, (_, i) => ({
        id: `dest-${i}`,
        displayName: `Dest ${i + 1}`,
        active: true,
        groupId: 'allocated',
    })),
    { id: 'UNALLOCATED', displayName: 'UNALLOCATED', active: true, groupId: 'unallocated' },
]);

// Destination groups
const destinationGroups = reactive([
    { id: 'allocated', displayName: 'Allocated', heightPortion: 0.9 },
    { id: 'unallocated', displayName: 'UNALLOCATED', heightPortion: 0.1 },
]);

// Generate many slots
const generateSlots = (count: number): GanttEditorSlot[] => {
    const dayStart = startTime.value.getTime();
    const dayEnd = endTime.value.getTime();
    const dayRange = dayEnd - dayStart;

    return Array.from({ length: count }, (_, index) => {
        const slotStartMs = dayStart + Math.random() * dayRange * 0.8;
        const duration = 30 * 60 * 1000 + Math.random() * 2 * 60 * 60 * 1000; // 30min - 2.5h
        const slotEndMs = Math.min(slotStartMs + duration, dayEnd);

        const destIndex = index % numberOfDestinations;
        const flightNumber = `PF${String(index + 1).padStart(5, '0')}`;

        return {
            id: `${flightNumber}-${index}`,
            displayName: flightNumber,
            group: flightNumber,
            openTime: new Date(slotStartMs),
            closeTime: new Date(slotEndMs),
            destinationId: `dest-${destIndex}`,
            deadline: new Date(slotEndMs + 60 * 60 * 1000),
            hoverData: `🛫 Departure`,
        };
    }).sort((a, b) => a.openTime.getTime() - b.openTime.getTime());
};

const slots = ref<GanttEditorSlot[]>(generateSlots(numberOfSlots));

// Event handlers
const handleChangeStartAndEndTime = (newStartTime: Date, newEndTime: Date) => {
    startTime.value = newStartTime;
    endTime.value = newEndTime;
};

const handleChangeDestinationId = (slotId: string, destinationId: string) => {
    slots.value = slots.value.map(slot =>
        slot.id === slotId ? { ...slot, destinationId } : slot
    );
};

const handleChangeSlotTime = (slotId: string, openTime: Date, closeTime: Date) => {
    const slot = slots.value.find(s => s.id === slotId);
    if (slot) {
        slot.openTime = openTime;
        slot.closeTime = closeTime;
    }
    slots.value = [...slots.value];
};
</script>
