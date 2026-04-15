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
        <GanttEditorComponent
            ref="ganttEditorRef"
            :isReadOnly="isReadOnly"
            :startTime="startTime"
            :endTime="endTime"
            :slots="slots"
            :destinations="destinations"
            :destinationGroups="destinationGroups"
            :suggestions="suggestions"
            :verticalMarkers="verticalMarkers"
            :contextMenuActions="contextMenuActions"
            :markedRegion="markedRegion"
            :activate-rulers="'GLOBAL'"
            :slot-context-menu-actions="[
                { id: 'delete', label: 'Delete Slot' },
            ]"
            @onChangeStartAndEndTime="handleChangeStartAndEndTime"
            @onChangeDestinationId="handleChangeDestinationId"
            @onBulkChangeDestinationId="handleBulkChangeDestinationId"
            @onCopyToDestinationId="handleCopyDestinationId"
            @onBulkCopyToDestinationId="handleBulkCopyDestinationId"
            @onMoveSlotOnTimeAxis="handleMoveSlotOnTimeAxis"
            @onBulkMoveSlotsOnTimeAxis="handleBulkMoveSlotsOnTimeAxis"
            @onCopySlotOnTimeAxis="handleCopySlotOnTimeAxis"
            @onBulkCopySlotsOnTimeAxis="handleBulkCopySlotsOnTimeAxis"
            @onChangeSlotTime="handleChangeSlotTime"
            @onClickOnSlot="handleClickOnSlot"
            @onHoverOnSlot="handleHoverOnSlot"
            @onDoubleClickOnSlot="handleDoubleClickOnSlot"
            @onContextClickOnSlot="handleContextClickOnSlot"
            @onSelectionChange="handleSelectionChange"
            @onChangeVerticalMarker="handleChangeVerticalMarker"
            @onClickVerticalMarker="handleClickVerticalMarker"
            @onContextMenuAction="handleCanvasContextMenuAction"
            :topContentPortion="topContentPortion"
            @onTopContentPortionChange="(newPortion: number, newHeight: number) => topContentPortion = newPortion"
        >
            <template
                #top-content
                v-if="topContentPortion > 0"
            >
                <div
                    style="padding: 10px; background: #f5f5f5; border-bottom: 1px solid #ddd; flex-shrink: 0; display: flex; align-items: center; gap: 10px; height: 100%;">
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
                    <button
                        @click="toggleMarkedRegion"
                        data-testid="toggle-marked-region-button"
                        :style="{
                            padding: '8px 16px',
                            borderRadius: '4px',
                            border: '1px solid #ccc',
                            background: markedRegion ? '#e67e22' : '#95a5a6',
                            color: 'white',
                            cursor: 'pointer',
                            fontWeight: 'bold'
                        }"
                    >
                        🔲 {{ markedRegion ? 'Disable' : 'Enable' }} Marked Region
                    </button>
                    <button
                        @click="toggleMarkedRegionMultiple"
                        data-testid="toggle-marked-region-multiple-button"
                        :style="{
                            padding: '8px 16px',
                            borderRadius: '4px',
                            border: '1px solid #ccc',
                            background: markedRegion ? '#e67e22' : '#95a5a6',
                            color: 'white',
                            cursor: 'pointer',
                            fontWeight: 'bold'
                        }"
                    >
                        🔲 {{ markedRegion ? 'Disable' : 'Enable' }} Marked Region (Multiple)
                    </button>
                    <button
                        @click="handleClearSelection"
                        data-testid="clear-selection-button"
                        :style="{
                            padding: '8px 16px',
                            borderRadius: '4px',
                            border: '1px solid #ccc',
                            background: '#3498db',
                            color: 'white',
                            cursor: 'pointer',
                            fontWeight: 'bold'
                        }"
                    >
                        🗑️ Clear Selection
                    </button>
                    <button
                        @click="handleDeleteSelection"
                        data-testid="delete-selection-button"
                        :disabled="selectedSlotIds.length === 0"
                        :style="{
                            padding: '8px 16px',
                            borderRadius: '4px',
                            border: '1px solid #ccc',
                            background: selectedSlotIds.length > 0 ? '#c0392b' : '#95a5a6',
                            color: 'white',
                            cursor: selectedSlotIds.length > 0 ? 'pointer' : 'not-allowed',
                            fontWeight: 'bold'
                        }"
                    >
                        ❌ Delete Selection ({{ selectedSlotIds.length }})
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
            </template>
        </GanttEditorComponent>
    </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue';
import type {
    GanttEditorCanvasContextMenuAction,
    GanttEditorSlot,
    GanttEditorVerticalMarker,
} from '@/components/gantt-editor-lib/chart/types';
import GanttEditorComponent from '@/vue/GanttEditorComponent.vue';
import { timeHour, type TimeDomainValue } from '@/components/gantt-editor-lib/chart/time_scale';

const upperAxisFormatter = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
});
const lowerAxisFormatter = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
});

const formatUpperAxisTick = (domainValue: TimeDomainValue): string => {
    const dateValue = domainValue instanceof Date ? domainValue : new Date(domainValue as number);
    return upperAxisFormatter.format(dateValue);
};

const formatLowerAxisTick = (domainValue: TimeDomainValue): string => {
    const dateValue = domainValue instanceof Date ? domainValue : new Date(domainValue as number);
    return lowerAxisFormatter.format(dateValue);
};

// Ref to the Gantt Editor component for programmatic access
const ganttEditorRef = ref<InstanceType<typeof GanttEditorComponent> | null>(null);

const topContentPortion = ref(0.1); // 20% of total height for top content
const onWindowKeydown = (event: KeyboardEvent) => {
    if (event.key === 't') {
        // toggle top content visibility
        topContentPortion.value = topContentPortion.value === 0 ? 0.1 : 0;
    }
};

onMounted(() => {
    window.addEventListener('keydown', onWindowKeydown);
});

onBeforeUnmount(() => {
    window.removeEventListener('keydown', onWindowKeydown);
    if (eventMessageTimeout !== null) {
        clearTimeout(eventMessageTimeout);
        eventMessageTimeout = null;
    }
});

// Configurable parameters
const numberOfSlots = ref(100);
const numberOfDestinations = ref(20);

// Define reactive state
const startTime = ref(new Date(new Date().setHours(0, 0, 0, 0))); // today at 00:00
const endTime = ref(new Date(new Date().setHours(23, 59, 59, 999))); // today at 23:59
const isReadOnly = ref(false);
const eventMessage = ref('');
const lastHoveredSlotId = ref<string | null>(null);
const selectedSlotIds = ref<string[]>([]);
let eventMessageTimeout: ReturnType<typeof setTimeout> | null = null;

// Function to show event message with auto-clear
const showEventMessage = (message: string, duration = 3000) => {
    eventMessage.value = message;
    if (eventMessageTimeout !== null) {
        clearTimeout(eventMessageTimeout);
    }
    eventMessageTimeout = setTimeout(() => {
        eventMessage.value = '';
        eventMessageTimeout = null;
    }, duration);
};

const handleSelectionChange = (slotIds: string[]) => {
    selectedSlotIds.value = slotIds;
};

// Function to programmatically clear the selection via the component ref
const handleClearSelection = () => {
    if (ganttEditorRef.value) {
        ganttEditorRef.value.clearSelection();
        showEventMessage('🗑️ Selection cleared programmatically');
    }
};

const handleDeleteSelection = () => {
    if (selectedSlotIds.value.length === 0) return;
    const selectedIds = new Set(selectedSlotIds.value);
    slots.value = slots.value.filter((slot) => !selectedIds.has(slot.id));
    handleClearSelection();
    showEventMessage(`❌ Deleted ${selectedIds.size} selected slot(s)`);
};

// Function to generate random time within the day
const generateRandomTime = (dayStart: Date, dayEnd: Date): Date => {
    const start = dayStart.getTime();
    const end = dayEnd.getTime();
    return new Date(start + Math.random() * (end - start));
};

// Function to generate slots
const generateSlots = (count: number) => {
    const dayStart = new Date(startTime.value);
    const dayEnd = new Date(endTime.value);
    const mockColors = ['#738732', '#ffcd50', '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57', '#ff9ff3', '#54a0ff', '#5f27cd'];

    const unallocatedSlots =  Array.from({ length: count }, (_, index) => {
        const slotStart = generateRandomTime(dayStart, dayEnd);
        const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000 + Math.random() * 2 * 60 * 60 * 1000); // 60 minutes to 3 hours duration

        // Ensure slot doesn't exceed day end
        if (slotEnd > dayEnd) {
            slotEnd.setTime(dayEnd.getTime());
        }

        const destinationIndex = 0;
        const flightNumber = `FL${String(index + 1).padStart(4, '0')}`;

        const departureTime = new Date(slotEnd.getTime() + 60 * 60 * 1000); // 1 hour after close time

        // Demo scenarios for departure anchors:
        // - deadlines[0] is STD (scheduled departure)
        // - deadlines[1] is ETD (estimated departure)
        // - ETD can be before or after STD
        // - every 7th slot uses the same timestamp to verify overlap behavior
        // - every 8th slot uses custom deadline colors
        const stdTimestamp = departureTime.getTime();
        let etdTimestamp = departureTime.getTime() + 20 * 60 * 1000; // ETD after STD (default)
        let scenario = "ETD after STD";

        if (index % 5 === 0) {
            etdTimestamp = departureTime.getTime() + 35 * 60 * 1000;
            scenario = "ETD delayed (after STD)";
        }

        if (index % 6 === 0) {
            etdTimestamp = departureTime.getTime() - 15 * 60 * 1000;
            scenario = "ETD advanced (before STD)";
        }

        if (index % 7 === 0) {
            etdTimestamp = departureTime.getTime();
            scenario = "ETD equals STD";
        }

        const hoverData = `<strong>Flight ${flightNumber}</strong>:<br> 🛫 Departure: ${new Date(etdTimestamp).toLocaleString()}`;
        const stdColor = index % 8 === 0 ? '#e67e22' : '#9e9e9e';
        const etdColor = index % 8 === 0 ? '#27ae60' : '#1f1f1f';

        return {
            id: `${flightNumber}-${index}`,
            displayName: flightNumber,
            group: flightNumber,
            openTime: slotStart,
            closeTime: slotEnd,
            hoverData,
            deadlines: [
                { id: 'std', timestamp: stdTimestamp, color: stdColor },
                { id: 'etd', timestamp: etdTimestamp, color: etdColor },
            ],
            // color: mockColors[index % mockColors.length], // leave color generation to the component
        };
    });

    // allocate in order of opentime
    const allocatedSlots: GanttEditorSlot[] = unallocatedSlots
        .sort((a, b) => a.openTime.getTime() - b.openTime.getTime())
        .map((slot, index) => ({
            ...slot,
            destinationId: `mup-${(index % numberOfDestinations.value) + 1}`, // distribute across destinations (IDs start at 1)
        }));

    // A few fixed slots on the UNALLOCATED chute so the bottom group is visibly populated in the demo
    const spanMs = dayEnd.getTime() - dayStart.getTime();
    const unallocatedDemo = (
        offsets: Array<{ t: number; durationMin: number; name: string; id: string }>,
    ): GanttEditorSlot[] =>
        offsets.map(({ t, durationMin, name, id }) => {
            const openTime = new Date(dayStart.getTime() + spanMs * t);
            let closeTime = new Date(openTime.getTime() + durationMin * 60 * 1000);
            if (closeTime > dayEnd) closeTime = new Date(dayEnd.getTime());
            return {
                id,
                displayName: name,
                group: id,
                openTime,
                closeTime,
                destinationId: 'UNALLOCATED',
                hoverData: `${name} — unallocated demo`,
            };
        });

    const unallocatedDemoSlots = unallocatedDemo([
        { t: 0.12, durationMin: 75, name: 'UA-9001', id: 'ua-demo-1' },
        { t: 0.35, durationMin: 60, name: 'UA-9002', id: 'ua-demo-2' },
        { t: 0.52, durationMin: 90, name: 'UA-9003', id: 'ua-demo-3' },
        { t: 0.74, durationMin: 50, name: 'UA-9004', id: 'ua-demo-4' },
    ]);

    return [...allocatedSlots, ...unallocatedDemoSlots].sort(
        (a, b) => a.openTime.getTime() - b.openTime.getTime(),
    );
};

// Slots (main data)
const slots = ref<GanttEditorSlot[]>(generateSlots(numberOfSlots.value));

// Destinations - 20 destinations in allocated group
const destinations = reactive([
    ...Array.from({ length: numberOfDestinations.value }, (_, i) => ({
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

// Suggestions: suggest moving the first 3 slots to alternative destinations
const suggestions = computed(() => {
    return slots.value.slice(0, 3).map((slot, i) => {
        // Find a different destination for the suggestion
        const currentDestIndex = parseInt(slot.destinationId.replace('mup-', ''), 10);
        const altDestIndex = ((currentDestIndex || 1) % numberOfDestinations.value) + 1;
        return {
            slotId: slot.id,
            alternativeDestinationId: `mup-${altDestIndex}`,
            alternativeDestinationDisplayName: `MUP ${altDestIndex}`,
        };
    });
});

// Single demo marker so the index page can test marker interactions and context-menu movement.
const verticalMarkers = ref<GanttEditorVerticalMarker[]>([
    {
        id: 'demo-marker-cuttoff',
        label: 'Operational Cutoff',
        date: new Date(new Date().setHours(11, 0, 0, 0)),
        color: '#e74c3c',
        draggable: false,
        movableByContextMenu: true,
    },
    {
        id: 'demo-marker-test',
        label: 'Test',
        date: new Date(new Date().setHours(12, 0, 0, 0)),
        color: '#3498db',
        draggable: true,
        movableByContextMenu: false,
    },
]);

const contextMenuActions = ref<GanttEditorCanvasContextMenuAction[]>([
    { id: 'create-flight', label: 'Create a flight here' },
]);

// Marked region state (toggleable for testing)
const markedRegion = ref<{ startTime: Date; endTime: Date; destinationId: string | 'multiple' } | null>(null);

const toggleMarkedRegion = () => {
    if (markedRegion.value) {
        markedRegion.value = null;
        console.log('Marked region disabled');
        showEventMessage('🔲 Marked region disabled');
    } else {
        // Mark the middle 4 hours of the day on the first destination
        const regionStart = new Date(startTime.value);
        regionStart.setHours(10, 0, 0, 0);
        const regionEnd = new Date(startTime.value);
        regionEnd.setHours(14, 0, 0, 0);
        markedRegion.value = {
            startTime: regionStart,
            endTime: regionEnd,
            destinationId: 'mup-1',
        };
        console.log('Marked region enabled', markedRegion.value);
        showEventMessage('🔲 Marked region enabled on MUP 1 (10:00-14:00)');
    }
};

const toggleMarkedRegionMultiple = () => {
    if (markedRegion.value) {
        markedRegion.value = null;
        console.log('Marked region disabled');
        showEventMessage('🔲 Marked region disabled');
    } else {
        const regionStart = new Date(startTime.value);
        regionStart.setHours(10, 0, 0, 0);
        const regionEnd = new Date(startTime.value);
        regionEnd.setHours(14, 0, 0, 0);
        markedRegion.value = {
            startTime: regionStart,
            endTime: regionEnd,
            destinationId: 'multiple',
        };
        console.log('Marked region enabled multiple', markedRegion.value);
        showEventMessage('🔲 Marked region (multiple) enabled (10:00-14:00)');
    }
};

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

const handleChangeDestinationId = (slotId: string, destinationId: string, wasSuggestion?: boolean) => {
    if (wasSuggestion) {
        console.log('Callback: Applied suggestion for slot', slotId, 'to', destinationId);
        showEventMessage(`💡 Applied suggestion: ${slotId} → ${destinationId}`);
    }
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

const handleBulkChangeDestinationId = (slotIds: string[], destinationId: string, wasSuggestion?: boolean) => {
    if (wasSuggestion) {
        console.log('Callback: Applied bulk suggestion for slots', slotIds, 'to', destinationId);
    }

    const movedSlotIds = new Set(slotIds);
    let movedCount = 0;
    slots.value = slots.value.map((slot) => {
        if (!movedSlotIds.has(slot.id) || slot.readOnly) {
            return slot;
        }
        movedCount += 1;
        return { ...slot, destinationId };
    });

    console.log('Callback: Bulk moved slots to different destination', slotIds, destinationId);
    if (movedCount > 0) {
        showEventMessage(`📦 Moved ${movedCount} slots to ${destinationId}`);
    }
};

const buildCopiedSlot = (slot: GanttEditorSlot, destinationId: string): GanttEditorSlot => {
    let copyIndex = 1;
    let nextId = `${slot.id}-copy-${copyIndex}`;
    const existingIds = new Set(slots.value.map((item) => item.id));
    while (existingIds.has(nextId)) {
        copyIndex += 1;
        nextId = `${slot.id}-copy-${copyIndex}`;
    }

    return {
        ...slot,
        id: nextId,
        group: nextId,
        destinationId,
    };
};

const shiftDeadlinesByMs = (
    deadlines: GanttEditorSlot["deadlines"] | undefined,
    timeDiffMs: number,
): GanttEditorSlot["deadlines"] | undefined =>
    deadlines?.map((deadline) => ({ ...deadline, timestamp: deadline.timestamp + timeDiffMs }));

const buildCopiedSlotOnTimeAxis = (slot: GanttEditorSlot, timeDiffMs: number): GanttEditorSlot => {
    let copyIndex = 1;
    let nextId = `${slot.id}-time-copy-${copyIndex}`;
    const existingIds = new Set(slots.value.map((item) => item.id));
    while (existingIds.has(nextId)) {
        copyIndex += 1;
        nextId = `${slot.id}-time-copy-${copyIndex}`;
    }

    return {
        ...slot,
        id: nextId,
        group: nextId,
        openTime: new Date(slot.openTime.getTime() + timeDiffMs),
        closeTime: new Date(slot.closeTime.getTime() + timeDiffMs),
        deadlines: shiftDeadlinesByMs(slot.deadlines, timeDiffMs),
    };
};

const handleCopyDestinationId = (slotId: string, destinationId: string) => {
    const source = slots.value.find((slot) => slot.id === slotId);
    if (!source || source.readOnly) return;
    slots.value = [...slots.value, buildCopiedSlot(source, destinationId)];
    showEventMessage(`📋 Copied ${slotId} to ${destinationId}`);
};

const handleBulkCopyDestinationId = (slotIds: string[], destinationId: string) => {
    const slotIdsToCopy = new Set(slotIds);
    const sources = slots.value.filter((slot) => slotIdsToCopy.has(slot.id) && !slot.readOnly);
    if (sources.length === 0) return;
    const copiedSlots = sources.map((slot) => buildCopiedSlot(slot, destinationId));
    slots.value = [...slots.value, ...copiedSlots];
    showEventMessage(`📋 Copied ${copiedSlots.length} slots to ${destinationId}`);
};

const handleMoveSlotOnTimeAxis = (slotId: string, timeDiffMs: number) => {
    if (timeDiffMs === 0) return;
    slots.value = slots.value.map((slot) =>
        slot.id === slotId && !slot.readOnly
            ? {
                ...slot,
                openTime: new Date(slot.openTime.getTime() + timeDiffMs),
                closeTime: new Date(slot.closeTime.getTime() + timeDiffMs),
                deadlines: shiftDeadlinesByMs(slot.deadlines, timeDiffMs),
            }
            : slot,
    );
    showEventMessage(`↔️ Shifted ${slotId} by ${timeDiffMs / (24 * 60 * 60 * 1000)} day(s)`);
};

const handleBulkMoveSlotsOnTimeAxis = (slotIds: string[], timeDiffMs: number) => {
    if (timeDiffMs === 0) return;
    const ids = new Set(slotIds);
    let movedCount = 0;
    slots.value = slots.value.map((slot) => {
        if (!ids.has(slot.id) || slot.readOnly) {
            return slot;
        }
        movedCount += 1;
        return {
            ...slot,
            openTime: new Date(slot.openTime.getTime() + timeDiffMs),
            closeTime: new Date(slot.closeTime.getTime() + timeDiffMs),
            deadlines: shiftDeadlinesByMs(slot.deadlines, timeDiffMs),
        };
    });
    if (movedCount > 0) {
        showEventMessage(`↔️ Shifted ${movedCount} slot(s) by ${timeDiffMs / (24 * 60 * 60 * 1000)} day(s)`);
    }
};

const handleCopySlotOnTimeAxis = (slotId: string, timeDiffMs: number) => {
    if (timeDiffMs === 0) return;
    const source = slots.value.find((slot) => slot.id === slotId);
    if (!source || source.readOnly) return;
    slots.value = [...slots.value, buildCopiedSlotOnTimeAxis(source, timeDiffMs)];
    showEventMessage(`📋 Copied ${slotId} by ${timeDiffMs / (24 * 60 * 60 * 1000)} day(s)`);
};

const handleBulkCopySlotsOnTimeAxis = (slotIds: string[], timeDiffMs: number) => {
    if (timeDiffMs === 0) return;
    const slotIdsToCopy = new Set(slotIds);
    const sources = slots.value.filter((slot) => slotIdsToCopy.has(slot.id) && !slot.readOnly);
    if (sources.length === 0) return;
    const copiedSlots = sources.map((slot) => buildCopiedSlotOnTimeAxis(slot, timeDiffMs));
    slots.value = [...slots.value, ...copiedSlots];
    showEventMessage(`📋 Copied ${copiedSlots.length} slot(s) by ${timeDiffMs / (24 * 60 * 60 * 1000)} day(s)`);
};

const handleChangeSlotTime = (slotId: string, openTime: Date, closeTime: Date) => {
    console.log('Callback: Edited slots time window', slotId, openTime, closeTime);
    const slotToUpdate = slots.value.find(slot => slot.id === slotId);
    if (slotToUpdate && !slotToUpdate.readOnly) {
        slotToUpdate.openTime = openTime;
        slotToUpdate.closeTime = closeTime;
        showEventMessage(`⏰ Resized ${slotId} (${openTime.toLocaleTimeString()} - ${closeTime.toLocaleTimeString()})`);
    }
    slots.value = [...slots.value]; // Trigger reactivity
};

const handleClickOnSlot = (slotId: string) => {
    console.log('Callback: Opening details for slot', slotId);
    showEventMessage(`👆 Clicked on ${slotId}`);
};

const handleHoverOnSlot = (slotId: string) => {
    if (slotId === lastHoveredSlotId.value) return;
    lastHoveredSlotId.value = slotId;
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

const handleChangeVerticalMarker = (markerId: string, date: Date) => {
    verticalMarkers.value = verticalMarkers.value.map((marker) =>
        marker.id === markerId
            ? { ...marker, date }
            : marker,
    );
    showEventMessage(`📍 Moved marker ${markerId} to ${date.toLocaleTimeString()}`);
};

const handleClickVerticalMarker = (markerId: string) => {
    showEventMessage(`📌 Clicked marker ${markerId}`);
};

const handleCanvasContextMenuAction = (actionId: string, timestamp: Date, destinationId: string) => {
    if (actionId !== 'create-flight') return;

    const destinationExists = destinations.some((destination) => destination.id === destinationId);
    if (!destinationExists) return;

    const serial = String(slots.value.length + 1).padStart(4, '0');
    const slotId = `NEW-${serial}`;
    const openTime = new Date(timestamp);
    const closeTime = new Date(openTime.getTime() + 60 * 60 * 1000);

    slots.value = [
        ...slots.value,
        {
            id: slotId,
            displayName: slotId,
            group: slotId,
            openTime,
            closeTime,
            destinationId,
        },
    ];

    showEventMessage(`➕ Created ${slotId} at ${destinationId}`);
};

const handleSlotContextMenuAction = (actionId: string, slotId: string) => {
    if (actionId === 'delete') {
        const slotToDelete = slots.value.find(slot => slot.id === slotId);
        if (slotToDelete && !slotToDelete.readOnly) {
            slots.value = slots.value.filter(slot => slot.id !== slotId);
            showEventMessage(`❌ Deleted ${slotId}`);
        }
    }
};
</script>

<style scoped>
@keyframes fadeIn {
    from {
        opacity: 0;
        transform: translateY(-5px);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}
</style>
