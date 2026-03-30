import type { GanttEditorSlotWithUiAttributes } from "./chart/types";

function mapSlotStateToColor(state: string): string | undefined {
  const colors: Record<string, string> = {
    "unallocated": "#b1b1b1",
    "not-opened": "#738732",
    "opened": "#ffcd50",
    "conflict": "#c34673",
    "inactive": "#b1b1b1",
  };
  return colors[state];
}

export function mapSlotToStateColor(slot: GanttEditorSlotWithUiAttributes): string | undefined {
  if (slot.destinationId === "UNALLOCATED") {
    return mapSlotStateToColor("unallocated");
  }
  if (slot.isConflict) {
    return mapSlotStateToColor("conflict");
  }
  const currentTime = Date.now();
  const openTime = new Date(slot.openTime).getTime();
  if (currentTime > openTime) {
    return mapSlotStateToColor("opened");
  }
  return mapSlotStateToColor("not-opened");
}
