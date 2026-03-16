import type { Topic, ProcessedData, Settings } from './types';
/* 
const areSlotsOverlapping = (slots: {
    openTime: Date, closeTime: Date
}[]): boolean => {
    const sortedSlots = slots.map(s => ({ openTime: s.openTime, closeTime: s.closeTime })).sort((a, b) => a.openTime.getTime() - b.openTime.getTime());
    for (let i = 0; i < sortedSlots.length - 1; i++) {
        if (sortedSlots[i].closeTime.getTime() > sortedSlots[i + 1].openTime.getTime()) {
            return true;
        }
    }
    return false;
}

const areSlotsOverlappingWithDeadlineConsidered = (slots: {
    openTime: Date, closeTime: Date, deadline?: Date
}[]): boolean => {
    const sortedSlots = slots.map(s => ({
        openTime: s.openTime,
        closeTime: s.closeTime,
        deadline: s.deadline
    })).sort((a, b) => a.openTime.getTime() - b.openTime.getTime());
    for (let i = 0; i < sortedSlots.length - 1; i++) {
        let currentCloseTime = sortedSlots[i].deadline || sortedSlots[i].closeTime;
        if (sortedSlots[i].deadline) {
            currentCloseTime = new Date(Math.max(sortedSlots[i].closeTime.getTime(), currentCloseTime.getTime()));
        }
        if (currentCloseTime.getTime() > sortedSlots[i + 1].openTime.getTime()) {
            return true;
        }
    }
    return false;
} */

/**
 * Check if a candidate slot overlaps with any existing slot in the row.
 * This avoids creating a new spread array and re-sorting on every check.
 */
const doesSlotOverlapRow = (existingSlots: { openTime: Date, closeTime: Date }[], candidate: { openTime: Date, closeTime: Date }): boolean => {
    const cOpen = candidate.openTime.getTime();
    const cClose = candidate.closeTime.getTime();
    for (const s of existingSlots) {
        if (s.openTime.getTime() < cClose && s.closeTime.getTime() > cOpen) {
            return true;
        }
    }
    return false;
}

const doesSlotOverlapRowWithDeadline = (existingSlots: { openTime: Date, closeTime: Date, deadline?: Date, secondaryDeadline?: Date }[], candidate: { openTime: Date, closeTime: Date, deadline?: Date, secondaryDeadline?: Date }): boolean => {
    const cOpen = candidate.openTime.getTime();
    let cClose = candidate.closeTime.getTime();
    if (candidate.deadline) {
        cClose = Math.max(cClose, candidate.deadline.getTime());
    }
    if (candidate.secondaryDeadline) {
        cClose = Math.max(cClose, candidate.secondaryDeadline.getTime());
    }
    for (const s of existingSlots) {
        let sClose = s.closeTime.getTime();
        if (s.deadline) {
            sClose = Math.max(sClose, s.deadline.getTime());
        }
        if (s.secondaryDeadline) {
            sClose = Math.max(sClose, s.secondaryDeadline.getTime());
        }
        if (s.openTime.getTime() < cClose && sClose > cOpen) {
            return true;
        }
    }
    return false;
}

export const addSlotToRows = (rows: { name: string, slots: {
    openTime: Date, closeTime: Date, destinationId: string, id: string, deadline?: Date, secondaryDeadline?: Date
    }[], id: string }[], slot: {
        openTime: Date, closeTime: Date, destinationId: string, id: string, deadline?: Date, secondaryDeadline?: Date
    }, topicId: string, compactView: boolean) => {
    let rowFound = false;
    if (compactView) {
        for (const row of rows) {
            if (!doesSlotOverlapRow(row.slots, slot)) {
                row.slots.push(slot);
                rowFound = true;
                break;
            }
        }
    } else {
        for (const row of rows) {
            if (!doesSlotOverlapRowWithDeadline(row.slots, slot)) {
                row.slots.push(slot);
                rowFound = true;
                break;
            }
        }
    }
    if (!rowFound) {
        rows.push({ name: "", slots: [slot], id: topicId + "-" + rows.length });
    }

}

import type { GanttEditorDestination, GanttEditorSlot } from './types';

export function processData(
    data: Array<GanttEditorSlot>,
    destinationData: Array<GanttEditorDestination>,
    startDateTime: Date,
    endDateTime: Date,
    settings: Settings
): ProcessedData {

    let collapsedTopics = JSON.parse(localStorage.getItem("collapsedTopics") || "[]") as string[];
    const enrichedDestinationData = destinationData.map(destination => ({
        ...destination,
        isCollapsed: collapsedTopics.includes(destination.id)
    }));

    let processedData: Topic[] = enrichedDestinationData.map(destination => ({
        name: destination.displayName,
        id: destination.id,
        isCollapsed: destination.isCollapsed,
        rows: [],
        yStart: 0,
        yEnd: 0,
        isInactive: destination.active === false,
        groupId: destination.groupId,
    }));

    processedData.forEach(topic => {
        if (!topic.isCollapsed) {
            const topicSlots = data.filter(sortAllocation => sortAllocation.destinationId === topic.id)
            const topicRows: Array<{ name: string, slots: GanttEditorSlot[], id: string }> = [];
            for (const slot of topicSlots) {
                addSlotToRows(topicRows, slot, topic.id, settings.compactView);
            }
            topic.rows = topicRows;
        } else {
            topic.rows = [{
                id: topic.id + "-collapsed", name: "all", slots: data.map(slot => ({
                    ...slot,
                    flight: slot.group,
                    flightId: slot.group,
                }))
                    .filter(sortAllocation => sortAllocation.destinationId === topic.id)
                    .map(allocation => ({
                        ...allocation,
                    }))
            }];
        }
    });

    // check for conflicting slots (different slots are on the same chute at the same time) -> mark them with .isConflict = true
    // Avoid mutating the original slot objects from props — create shallow copies first
    // Uses sort-based O(n log n) approach instead of O(n^2) pairwise comparison
    processedData.forEach(topic => {
        topic.rows.forEach(row => {
            row.slots = row.slots.map(slot => ({ ...slot }));
        });
        const allSlots = topic.rows.flatMap(row => row.slots);
        // Sort by open time for sweep-line conflict detection
        const sorted = allSlots.slice().sort((a, b) => a.openTime.getTime() - b.openTime.getTime());
        const conflictIds = new Set<string>();
        for (let i = 0; i < sorted.length; i++) {
            for (let j = i + 1; j < sorted.length; j++) {
                // Since sorted by openTime, if sorted[j].openTime >= sorted[i].closeTime
                // then no further slots can overlap with sorted[i]
                if (sorted[j].openTime.getTime() >= sorted[i].closeTime.getTime()) break;
                // Overlapping pair found
                conflictIds.add(sorted[i].id);
                conflictIds.add(sorted[j].id);
            }
        }
        allSlots.forEach(slot => {
            slot.isConflict = conflictIds.has(slot.id);
        });
    });

    // the topic with name "UNALLOCATED" should always be at the top
    processedData = processedData.sort((a, b) => a.id === "UNALLOCATED" ? -1 : b.id === "UNALLOCATED" ? 1 : 0);

    return { processedData_: processedData, processedStartDateTime: startDateTime, processedEndDateTime: endDateTime };
}