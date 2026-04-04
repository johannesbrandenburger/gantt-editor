import type { GanttEditorSlot, GanttEditorSlotWithUiAttributes } from "./types";

export function readSelectionFromStorage(
  selectionStorageKey: string,
  legacyClipboardStorageKey: string,
): GanttEditorSlot[] {
  const storedData =
    localStorage.getItem(selectionStorageKey) ?? localStorage.getItem(legacyClipboardStorageKey);
  if (!storedData) return [];
  try {
    const parsed = JSON.parse(storedData) as GanttEditorSlot[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (error) {
    console.error("Error parsing selection content:", error);
    return [];
  }
}

export function writeSelectionToStorage(
  items: GanttEditorSlot[],
  selectionStorageKey: string,
  legacyClipboardStorageKey: string,
): void {
  localStorage.setItem(selectionStorageKey, JSON.stringify(items));
  localStorage.removeItem(legacyClipboardStorageKey);
}

export function applyCopiedFlagsFromSelection(
  slots: GanttEditorSlotWithUiAttributes[],
  selection: GanttEditorSlot[],
): void {
  const copiedIds = new Set(selection.map((slot) => slot.id));
  for (const slot of slots) {
    slot.isCopied = copiedIds.has(slot.id);
  }
}

export function slotSnapshotForSelection(slot: GanttEditorSlotWithUiAttributes): GanttEditorSlot {
  return {
    ...slot,
    openTime: new Date(slot.openTime),
    closeTime: new Date(slot.closeTime),
    deadline: slot.deadline ? new Date(slot.deadline) : undefined,
    secondaryDeadline: slot.secondaryDeadline ? new Date(slot.secondaryDeadline) : undefined,
  };
}