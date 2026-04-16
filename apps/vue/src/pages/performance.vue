<template>
    <div style="height: 100vh; width: 100%; display: flex; flex-direction: column;">
        <!-- Toolbar -->
        <div
            style="color: black; padding: 8px 16px; background: #f5f5f5; border-bottom: 1px solid #ddd; display: flex; gap: 12px; align-items: center; font-size: 14px; flex-wrap: wrap; flex-shrink: 0;">
            <strong>⚡ Performance Test</strong>
            <label
                style="display: inline-flex; align-items: center; gap: 6px;"
            >
                Slots
                <input
                    v-model.number="numberOfSlots"
                    type="number"
                    min="1"
                    data-testid="perf-slot-count"
                    style="width: 5.5rem; padding: 4px 6px; border: 1px solid #ccc; border-radius: 4px; color: black;"
                    @change="applyConfiguration"
                    @keyup.enter="applyConfiguration"
                />
            </label>
            <label
                style="display: inline-flex; align-items: center; gap: 6px;"
            >
                Days
                <input
                    v-model.number="numberOfDays"
                    type="number"
                    min="1"
                    data-testid="perf-days"
                    style="width: 3.5rem; padding: 4px 6px; border: 1px solid #ccc; border-radius: 4px; color: black;"
                    @change="applyConfiguration"
                    @keyup.enter="applyConfiguration"
                />
            </label>
            <label
                style="display: inline-flex; align-items: center; gap: 6px;"
            >
                Destinations
                <input
                    v-model.number="numberOfDestinations"
                    type="number"
                    min="1"
                    data-testid="perf-destinations"
                    style="width: 4rem; padding: 4px 6px; border: 1px solid #ccc; border-radius: 4px; color: black;"
                    @change="applyConfiguration"
                    @keyup.enter="applyConfiguration"
                />
            </label>
            <span data-testid="total-slot-count">{{ slots.length }} slots</span>
            <span>{{ effectiveDays }} days</span>
            <span>{{ effectiveDestinations }} destinations</span>
        </div>

        <!-- Gantt Editor -->
        <div style="flex: 1; overflow: hidden;">
            <GanttEditor
                :isReadOnly="false"
                :startTime="startTime"
                :endTime="endTime"
                :slots="slots"
                :destinations="destinations"
                :destinationGroups="destinationGroups"
                :suggestions="[]"
                :markedRegion="null"
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
                @onClickOnSlot="() => {}"
                @onHoverOnSlot="() => {}"
                @onDoubleClickOnSlot="() => {}"
                @onContextClickOnSlot="() => {}"
            />
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue';
import type { GanttEditorSlot } from '@/components/gantt-editor-lib/chart/types';
import GanttEditor from '@/vue/GanttEditor.vue';

const DEFAULT_SLOTS = 10_000;
const DEFAULT_DAYS = 7;
const DEFAULT_DESTINATIONS = 50;

const numberOfSlots = ref(DEFAULT_SLOTS);
const numberOfDays = ref(DEFAULT_DAYS);
const numberOfDestinations = ref(DEFAULT_DESTINATIONS);

function clampPositiveInt(value: unknown, fallback: number): number {
    const n = Math.floor(Number(value));
    if (!Number.isFinite(n) || n < 1) {
        return fallback;
    }
    return n;
}

const effectiveDays = computed(() => clampPositiveInt(numberOfDays.value, DEFAULT_DAYS));
const effectiveDestinations = computed(() =>
    clampPositiveInt(numberOfDestinations.value, DEFAULT_DESTINATIONS)
);

function createTimeRange(days: number): { start: Date; end: Date } {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + days - 1);
    end.setHours(23, 59, 59, 999);
    return { start, end };
}

function buildDestinations(count: number) {
    return [
        ...Array.from({ length: count }, (_, i) => ({
            id: `dest-${i}`,
            displayName: `Dest ${i + 1}`,
            active: true,
            groupId: 'allocated',
        })),
        { id: 'UNALLOCATED', displayName: 'UNALLOCATED', active: true, groupId: 'unallocated' },
    ];
}

const startTime = ref(new Date());
const endTime = ref(new Date());

const destinations = reactive<ReturnType<typeof buildDestinations>>(buildDestinations(DEFAULT_DESTINATIONS));

const destinationGroups = reactive([
    { id: 'allocated', displayName: 'Allocated', heightPortion: 0.9 },
    { id: 'unallocated', displayName: 'UNALLOCATED', heightPortion: 0.1 },
]);

const generateSlots = (count: number, rangeStart: Date, rangeEnd: Date, destCount: number): GanttEditorSlot[] => {
    const rangeStartMs = rangeStart.getTime();
    const rangeEndMs = rangeEnd.getTime();
    const rangeMs = rangeEndMs - rangeStartMs;

    return Array.from({ length: count }, (_, index) => {
        const slotStartMs = rangeStartMs + Math.random() * rangeMs * 0.8;
        const duration = 30 * 60 * 1000 + Math.random() * 2 * 60 * 60 * 1000; // 30min - 2.5h
        const slotEndMs = Math.min(slotStartMs + duration, rangeEndMs);

        const destIndex = index % destCount;
        const flightNumber = `PF${String(index + 1).padStart(5, '0')}`;

        return {
            id: `${flightNumber}-${index}`,
            displayName: flightNumber,
            group: flightNumber,
            openTime: new Date(slotStartMs),
            closeTime: new Date(slotEndMs),
            destinationId: `dest-${destIndex}`,
            deadlines: [{ id: 'std', timestamp: slotEndMs + 60 * 60 * 1000, color: '#1f1f1f' }],
            hoverData: `🛫 Departure`,
        };
    }).sort((a, b) => a.openTime.getTime() - b.openTime.getTime());
};

const slots = ref<GanttEditorSlot[]>([]);

function applyConfiguration() {
    const nSlots = clampPositiveInt(numberOfSlots.value, DEFAULT_SLOTS);
    const nDays = clampPositiveInt(numberOfDays.value, DEFAULT_DAYS);
    const nDests = clampPositiveInt(numberOfDestinations.value, DEFAULT_DESTINATIONS);

    numberOfSlots.value = nSlots;
    numberOfDays.value = nDays;
    numberOfDestinations.value = nDests;

    const { start, end } = createTimeRange(nDays);
    startTime.value = start;
    endTime.value = end;

    const nextDestinations = buildDestinations(nDests);
    destinations.splice(0, destinations.length, ...nextDestinations);

    slots.value = generateSlots(nSlots, start, end, nDests);
}

applyConfiguration();

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

const handleBulkChangeDestinationId = (slotIds: string[], destinationId: string) => {
    const movedSlotIds = new Set(slotIds);
    slots.value = slots.value.map(slot =>
        movedSlotIds.has(slot.id) ? { ...slot, destinationId } : slot
    );
};

const copyIdCounters = new Map<string, number>();

const reserveCopyId = (slotId: string, existingIds: Set<string>): string => {
    let nextCounter = copyIdCounters.get(slotId) ?? 1;
    let nextId = `${slotId}-copy-${nextCounter}`;
    while (existingIds.has(nextId)) {
        nextCounter += 1;
        nextId = `${slotId}-copy-${nextCounter}`;
    }
    copyIdCounters.set(slotId, nextCounter + 1);
    existingIds.add(nextId);
    return nextId;
};

const buildCopiedSlot = (
    source: GanttEditorSlot,
    nextId: string,
    overrides: Partial<GanttEditorSlot> = {},
): GanttEditorSlot => ({
    ...source,
    id: nextId,
    group: nextId,
    ...overrides,
});

const handleCopyDestinationId = (slotId: string, destinationId: string) => {
    const source = slots.value.find((slot) => slot.id === slotId);
    if (!source) return;
    const existingIds = new Set(slots.value.map((slot) => slot.id));
    const nextId = reserveCopyId(source.id, existingIds);
    slots.value = [
        ...slots.value,
        buildCopiedSlot(source, nextId, { destinationId }),
    ];
};

const handleBulkCopyDestinationId = (slotIds: string[], destinationId: string) => {
    const slotIdsToCopy = new Set(slotIds);
    const existingIds = new Set(slots.value.map((slot) => slot.id));
    const copiedSlots = slots.value
        .filter((slot) => slotIdsToCopy.has(slot.id))
        .map((slot) => {
            const nextId = reserveCopyId(slot.id, existingIds);
            return buildCopiedSlot(slot, nextId, { destinationId });
        });
    if (copiedSlots.length === 0) return;
    slots.value = [...slots.value, ...copiedSlots];
};

const handleChangeSlotTime = (slotId: string, openTime: Date, closeTime: Date) => {
    const slot = slots.value.find(s => s.id === slotId);
    if (slot) {
        slot.openTime = openTime;
        slot.closeTime = closeTime;
    }
    slots.value = [...slots.value];
};

const shiftDeadlinesByMs = (
    deadlines: GanttEditorSlot["deadlines"] | undefined,
    timeDiffMs: number,
): GanttEditorSlot["deadlines"] | undefined =>
    deadlines?.map((deadline) => ({ ...deadline, timestamp: deadline.timestamp + timeDiffMs }));

const handleMoveSlotOnTimeAxis = (slotId: string, timeDiffMs: number) => {
    if (timeDiffMs === 0) return;
    slots.value = slots.value.map((slot) =>
        slot.id === slotId
            ? {
                ...slot,
                openTime: new Date(slot.openTime.getTime() + timeDiffMs),
                closeTime: new Date(slot.closeTime.getTime() + timeDiffMs),
                deadlines: shiftDeadlinesByMs(slot.deadlines, timeDiffMs),
            }
            : slot
    );
};

const handleBulkMoveSlotsOnTimeAxis = (slotIds: string[], timeDiffMs: number) => {
    if (timeDiffMs === 0) return;
    const slotIdSet = new Set(slotIds);
    slots.value = slots.value.map((slot) =>
        slotIdSet.has(slot.id)
            ? {
                ...slot,
                openTime: new Date(slot.openTime.getTime() + timeDiffMs),
                closeTime: new Date(slot.closeTime.getTime() + timeDiffMs),
                deadlines: shiftDeadlinesByMs(slot.deadlines, timeDiffMs),
            }
            : slot
    );
};

const handleCopySlotOnTimeAxis = (slotId: string, timeDiffMs: number) => {
    if (timeDiffMs === 0) return;
    const source = slots.value.find((slot) => slot.id === slotId);
    if (!source) return;
    const existingIds = new Set(slots.value.map((slot) => slot.id));
    const nextId = reserveCopyId(source.id, existingIds);
    slots.value = [
        ...slots.value,
        buildCopiedSlot(source, nextId, {
            openTime: new Date(source.openTime.getTime() + timeDiffMs),
            closeTime: new Date(source.closeTime.getTime() + timeDiffMs),
            deadlines: shiftDeadlinesByMs(source.deadlines, timeDiffMs),
        }),
    ];
};

const handleBulkCopySlotsOnTimeAxis = (slotIds: string[], timeDiffMs: number) => {
    if (timeDiffMs === 0) return;
    const slotIdsToCopy = new Set(slotIds);
    const existingIds = new Set(slots.value.map((slot) => slot.id));
    const copiedSlots = slots.value
        .filter((slot) => slotIdsToCopy.has(slot.id))
        .map((slot) => {
            const nextId = reserveCopyId(slot.id, existingIds);
            return buildCopiedSlot(slot, nextId, {
                openTime: new Date(slot.openTime.getTime() + timeDiffMs),
                closeTime: new Date(slot.closeTime.getTime() + timeDiffMs),
                deadlines: shiftDeadlinesByMs(slot.deadlines, timeDiffMs),
            });
        });
    if (copiedSlots.length === 0) return;
    slots.value = [...slots.value, ...copiedSlots];
};
</script>
