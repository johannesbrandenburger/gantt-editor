import type { Topic, ProcessedData, Settings } from './types';

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
        const currentCloseTime = sortedSlots[i].deadline || sortedSlots[i].closeTime;
        if (currentCloseTime.getTime() > sortedSlots[i + 1].openTime.getTime()) {
            return true;
        }
    }
    return false;
}

export const addSlotToRows = (rows: { name: string, slots: {
    openTime: Date, closeTime: Date, destinationId: string, id: string
    }[], id: string }[], slot: {
        openTime: Date, closeTime: Date, destinationId: string, id: string
    }, topicId: string, compactView: boolean) => {
    let rowFound = false;
    if (compactView) {
        for (const row of rows) {
            if (!areSlotsOverlapping([...row.slots, slot])) {
                row.slots.push(slot);
                rowFound = true;
                break;
            }
        }
    } else {
        for (const row of rows) {
            if (!areSlotsOverlappingWithDeadlineConsidered([...row.slots, slot])) {
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
    // console.time("update-chart: check for conflicting slots");
    processedData.forEach(topic => {
        const allSlots = topic.rows.flatMap(row => row.slots);
        allSlots.forEach(slot => {
            slot.isConflict = allSlots.some(s => (
                s.id !== slot.id &&
                s.destinationId === slot.destinationId &&
                s.openTime.getTime() < slot.closeTime.getTime() &&
                s.closeTime.getTime() > slot.openTime.getTime()
            ));
        });
    });

    // the topic with name "UNALLOCATED" should always be at the top
    processedData = processedData.sort((a, b) => a.id === "UNALLOCATED" ? -1 : b.id === "UNALLOCATED" ? 1 : 0);

    return { processedData_: processedData, processedStartDateTime: startDateTime, processedEndDateTime: endDateTime };
}