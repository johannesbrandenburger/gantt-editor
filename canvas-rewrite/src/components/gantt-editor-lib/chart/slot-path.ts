import type { ScaleTime } from "d3";
import type { GanttEditorSlotWithUiAttributes } from "./types";

export const createSlotPath = (
  slotData: GanttEditorSlotWithUiAttributes,
  startTime: Date,
  endTime: Date,
  y: number,
  height: number,
  xScale: ScaleTime<number, number, never>
) => {
  // Determine the slot boundaries.
  const slotStart = new Date(slotData.openTime);
  const slotEnd = new Date(slotData.closeTime);

  const x1 = 0;
  const x2 = (xScale(slotEnd) as number) - (xScale(slotStart) as number);

  const path = [
    `M ${x1},${0}`,
    `H ${x2}`,
    `V ${0 + height}`,
    `H ${x1}`,
    "Z",
  ];

  return path.join(" ");
};
