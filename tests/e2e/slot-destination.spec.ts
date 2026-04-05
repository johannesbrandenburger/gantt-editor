import { expect, test } from "./coverage-test";
import {
  getCanvasState,
  clearHarnessEvents,
  dispatchCanvasMouseEvent,
  findSlotPoint,
  getCanvasStateField,
  getHarnessConfig,
  getHarnessEvents,
  openE2eHarness,
  setHarnessConfig,
} from "./helpers";

const SLOT_A = "LH123-20250101-F";
const SLOT_B = "OS200-20250101-G";
const SLOT_C = "AA300-20250101-U";
const DAY_IN_MS = 24 * 60 * 60 * 1000;

async function pointForDayOffset(page: Parameters<typeof openE2eHarness>[0], dayOffset: number) {
  const state = await getCanvasState<{
    internalStartTimeMs: number;
    internalEndTimeMs: number;
    margin: { left: number; right: number };
    layout: {
      canvasCssWidth: number;
      groups: Array<{ id: string; y: number; h: number }>;
    } | null;
  }>(page);

  expect(state?.layout).not.toBeNull();

  const baseDay = new Date("2025-01-01T00:00:00Z").getTime();
  const targetMs = baseDay + dayOffset * DAY_IN_MS + 12 * 60 * 60 * 1000;
  const chartWidth = state!.layout!.canvasCssWidth - state!.margin.left - state!.margin.right;
  const spanMs = state!.internalEndTimeMs - state!.internalStartTimeMs;
  const ratio = Math.max(0, Math.min(1, (targetMs - state!.internalStartTimeMs) / spanMs));
  const x = state!.margin.left + ratio * chartWidth;

  const firstGroup = state!.layout!.groups[0];
  expect(firstGroup).toBeTruthy();
  return { x, y: firstGroup.y + firstGroup.h / 2 };
}

async function seedSelection(page: Parameters<typeof openE2eHarness>[0], slotIds: string[]) {
  await page.evaluate(async (ids) => {
    const harness = (window as Window & {
      __ganttE2eHarness?: { getConfig: () => { slots: Array<Record<string, unknown>> } };
    }).__ganttE2eHarness;
    const config = harness?.getConfig();
    const slots = config?.slots ?? [];
    const selected = slots.filter((slot) => ids.includes(String(slot.id)));
    localStorage.setItem("pointerSelection", JSON.stringify(selected));
  }, slotIds);
}

test.describe("canvas rewrite slot destination change", () => {
  test("clicking a slot pins it to the selection", async ({ page }) => {
    await openE2eHarness(page, { fixture: "core" });

    const point = await findSlotPoint(page, SLOT_A, "center");
    await dispatchCanvasMouseEvent(page, point, "click");

    await expect
      .poll(async () => (await getCanvasStateField<string[]>(page, "selectionSlotIds")) ?? [], {
        timeout: 2_000,
      })
      .toEqual([SLOT_A]);
  });

  test("clicking a destination slot pastes pinned slot and clears selection", async ({ page }) => {
    await openE2eHarness(page, { fixture: "core" });
    await clearHarnessEvents(page);

    const sourcePoint = await findSlotPoint(page, SLOT_A, "center");
    await dispatchCanvasMouseEvent(page, sourcePoint, "click");

    await expect
      .poll(async () => (await getCanvasStateField<string[]>(page, "selectionSlotIds")) ?? [], {
        timeout: 2_000,
      })
      .toEqual([SLOT_A]);

    const targetDestination = (await getHarnessConfig(page)).slots.find((slot) => slot.id === SLOT_B)?.destinationId;
    expect(targetDestination).toBeTruthy();

    const targetPoint = await findSlotPoint(page, SLOT_B, "center");
    await dispatchCanvasMouseEvent(page, targetPoint, "click");

    await expect
      .poll(async () => (await getCanvasStateField<string[]>(page, "selectionSlotIds")) ?? [], {
        timeout: 2_000,
      })
      .toEqual([]);

    await expect
      .poll(async () => {
        const events = await getHarnessEvents(page);
        const moves = (events.onChangeDestinationId ?? []) as Array<{
          slotId?: string;
          destinationId?: string;
          preview?: boolean;
        }>;
        return moves.find((event) => event.slotId === SLOT_A && event.preview === false) ?? null;
      })
      .toEqual({ slotId: SLOT_A, destinationId: targetDestination, preview: false });
  });

  test("Escape clears the selection", async ({ page }) => {
    await openE2eHarness(page, { fixture: "core" });

    const sourcePoint = await findSlotPoint(page, SLOT_A, "center");
    await dispatchCanvasMouseEvent(page, sourcePoint, "click");

    await expect
      .poll(async () => (await getCanvasStateField<string[]>(page, "selectionSlotIds")) ?? [], {
        timeout: 2_000,
      })
      .toEqual([SLOT_A]);

    await page.keyboard.press("Escape");

    await expect
      .poll(async () => (await getCanvasStateField<string[]>(page, "selectionSlotIds")) ?? [], {
        timeout: 2_000,
      })
      .toEqual([]);
  });

  test("Meta/Ctrl click supports multi-select and emits one bulk destination change", async ({ page }) => {
    await openE2eHarness(page, { fixture: "core" });
    await clearHarnessEvents(page);

    const first = await findSlotPoint(page, SLOT_A, "center");
    const second = await findSlotPoint(page, SLOT_B, "center");

    await dispatchCanvasMouseEvent(page, first, "click");
    await dispatchCanvasMouseEvent(page, second, "click", { metaKey: true, ctrlKey: true });

    await expect
      .poll(
        async () => ((await getCanvasStateField<string[]>(page, "selectionSlotIds")) ?? []).sort(),
        { timeout: 2_000 },
      )
      .toEqual([SLOT_A, SLOT_B]);

    const targetDestination = (await getHarnessConfig(page)).slots.find((slot) => slot.id === SLOT_C)?.destinationId;
    expect(targetDestination).toBeTruthy();

    const target = await findSlotPoint(page, SLOT_C, "center");
    await dispatchCanvasMouseEvent(page, target, "click");

    await expect
      .poll(async () => (await getCanvasStateField<string[]>(page, "selectionSlotIds")) ?? [], {
        timeout: 2_000,
      })
      .toEqual([]);

    await expect
      .poll(async () => {
        const events = await getHarnessEvents(page);
        const bulkMoves = (events.onBulkChangeDestinationId ?? []) as Array<{
          slotIds?: string[];
          destinationId?: string;
          preview?: boolean;
        }>;
        const committedBulk = bulkMoves.find(
          (event) => event.preview === false && event.destinationId === targetDestination,
        );
        const slotIds = [...(committedBulk?.slotIds ?? [])].sort();
        return slotIds;
      })
      .toEqual([SLOT_A, SLOT_B]);

    await expect
      .poll(async () => {
        const events = await getHarnessEvents(page);
        const singleMoves = (events.onChangeDestinationId ?? []) as Array<{ slotId?: string; preview?: boolean }>;
        const committedSingles = singleMoves.filter((event) => event.preview === false);
        return committedSingles.length;
      })
      .toBe(0);
  });

  test("Alt + click pastes selected slot as copy and emits copy event", async ({ page }) => {
    await openE2eHarness(page, { fixture: "core" });
    await clearHarnessEvents(page);

    const before = await getHarnessConfig(page);
    const beforeCount = before.slots.length;

    const sourcePoint = await findSlotPoint(page, SLOT_A, "center");
    await dispatchCanvasMouseEvent(page, sourcePoint, "click");

    const targetDestination = before.slots.find((slot) => slot.id === SLOT_B)?.destinationId;
    expect(targetDestination).toBeTruthy();

    const targetPoint = await findSlotPoint(page, SLOT_B, "center");
    await dispatchCanvasMouseEvent(page, targetPoint, "click", { altKey: true });

    await expect
      .poll(async () => (await getCanvasStateField<string[]>(page, "selectionSlotIds")) ?? [], {
        timeout: 2_000,
      })
      .toEqual([]);

    await expect
      .poll(async () => {
        const events = await getHarnessEvents(page);
        const copies = (events.onCopyToDestinationId ?? []) as Array<{
          slotId?: string;
          destinationId?: string;
          preview?: boolean;
        }>;
        return copies.find((event) => event.slotId === SLOT_A && event.preview === false) ?? null;
      })
      .toEqual({ slotId: SLOT_A, destinationId: targetDestination, preview: false });

    await expect
      .poll(async () => {
        const events = await getHarnessEvents(page);
        const moves = (events.onChangeDestinationId ?? []) as Array<{ preview?: boolean }>;
        return moves.filter((event) => event.preview === false).length;
      })
      .toBe(0);

    await expect
      .poll(async () => (await getHarnessConfig(page)).slots.length)
      .toBe(beforeCount + 1);
  });

  test("Alt + click with multi-select emits one bulk copy event", async ({ page }) => {
    await openE2eHarness(page, { fixture: "core" });
    await clearHarnessEvents(page);

    const before = await getHarnessConfig(page);
    const beforeCount = before.slots.length;

    const first = await findSlotPoint(page, SLOT_A, "center");
    const second = await findSlotPoint(page, SLOT_B, "center");

    await dispatchCanvasMouseEvent(page, first, "click");
    await dispatchCanvasMouseEvent(page, second, "click", { metaKey: true, ctrlKey: true });

    const targetDestination = before.slots.find((slot) => slot.id === SLOT_C)?.destinationId;
    expect(targetDestination).toBeTruthy();

    const target = await findSlotPoint(page, SLOT_C, "center");
    await dispatchCanvasMouseEvent(page, target, "click", { altKey: true });

    await expect
      .poll(async () => {
        const events = await getHarnessEvents(page);
        const bulkCopies = (events.onBulkCopyToDestinationId ?? []) as Array<{
          slotIds?: string[];
          destinationId?: string;
          preview?: boolean;
        }>;
        const committed = bulkCopies.find(
          (event) => event.preview === false && event.destinationId === targetDestination,
        );
        return [...(committed?.slotIds ?? [])].sort();
      })
      .toEqual([SLOT_A, SLOT_B]);

    await expect
      .poll(async () => {
        const events = await getHarnessEvents(page);
        const moves = (events.onBulkChangeDestinationId ?? []) as Array<{ preview?: boolean }>;
        return moves.filter((event) => event.preview === false).length;
      })
      .toBe(0);

    await expect
      .poll(async () => (await getHarnessConfig(page)).slots.length)
      .toBe(beforeCount + 2);
  });

  test("seeded mixed selection excludes read-only slots from committed move", async ({ page }) => {
    await openE2eHarness(page, { fixture: "core" });
    await clearHarnessEvents(page);

    const configured = await setHarnessConfig(page, {
      slots: (await getHarnessConfig(page)).slots.map((slot) =>
        slot.id === SLOT_B ? { ...slot, readOnly: true } : slot,
      ),
    });

    const readOnlyBefore = configured.slots.find((slot) => slot.id === SLOT_B);
    expect(readOnlyBefore?.destinationId).toBe("chute-2");

    await seedSelection(page, [SLOT_A, SLOT_B]);

    const targetPoint = await findSlotPoint(page, SLOT_C, "center");
    await dispatchCanvasMouseEvent(page, targetPoint, "click");

    await expect
      .poll(async () => {
        const events = await getHarnessEvents(page);
        const singles = (events.onChangeDestinationId ?? []) as Array<{
          slotId?: string;
          destinationId?: string;
          preview?: boolean;
        }>;
        return singles.find((event) => event.preview === false) ?? null;
      })
      .toEqual({ slotId: SLOT_A, destinationId: "UNALLOCATED", preview: false });

    await expect
      .poll(async () => {
        const events = await getHarnessEvents(page);
        return (events.onBulkChangeDestinationId ?? []).length;
      })
      .toBe(0);

    await expect
      .poll(async () => {
        const slots = (await getHarnessConfig(page)).slots;
        const moved = slots.find((slot) => slot.id === SLOT_A)?.destinationId ?? null;
        const readOnly = slots.find((slot) => slot.id === SLOT_B)?.destinationId ?? null;
        return { moved, readOnly };
      })
      .toEqual({ moved: "UNALLOCATED", readOnly: "chute-2" });
  });

  test("repeated Alt + click copy keeps generated copy IDs unique", async ({ page }) => {
    await openE2eHarness(page, { fixture: "core" });

    const sourcePoint = await findSlotPoint(page, SLOT_A, "center");
    const targetPoint = await findSlotPoint(page, SLOT_B, "center");

    await dispatchCanvasMouseEvent(page, sourcePoint, "click");
    await dispatchCanvasMouseEvent(page, targetPoint, "click", { altKey: true });

    await dispatchCanvasMouseEvent(page, sourcePoint, "click");
    await dispatchCanvasMouseEvent(page, targetPoint, "click", { altKey: true });

    await expect
      .poll(async () => {
        const copiedIds = (await getHarnessConfig(page)).slots
          .map((slot) => slot.id)
          .filter((id) => id.startsWith(`${SLOT_A}__copy__`))
          .sort();
        return copiedIds;
      })
      .toEqual([`${SLOT_A}__copy__1`, `${SLOT_A}__copy__2`]);
  });

  test("Shift + click on same day does not trigger time-axis move/copy", async ({ page }) => {
    await openE2eHarness(page, {
      fixture: "core",
      query: {
        startTime: "2025-01-01T00:00:00Z",
        endTime: "2025-01-03T00:00:00Z",
      },
    });
    await clearHarnessEvents(page);

    await seedSelection(page, [SLOT_A]);

    const sameDayPoint = await pointForDayOffset(page, 0);
    await dispatchCanvasMouseEvent(page, sameDayPoint, "click", { shiftKey: true });

    await expect
      .poll(async () => {
        const events = await getHarnessEvents(page);
        return {
          move: (events.onMoveSlotOnTimeAxis ?? []).length,
          bulkMove: (events.onBulkMoveSlotsOnTimeAxis ?? []).length,
          copy: (events.onCopySlotOnTimeAxis ?? []).length,
          bulkCopy: (events.onBulkCopySlotsOnTimeAxis ?? []).length,
        };
      })
      .toEqual({ move: 0, bulkMove: 0, copy: 0, bulkCopy: 0 });
  });

  test("Shift + click on next day moves slot by +24h and shifts deadlines", async ({ page }) => {
    await openE2eHarness(page, {
      fixture: "core",
      query: {
        startTime: "2025-01-01T00:00:00Z",
        endTime: "2025-01-03T00:00:00Z",
      },
    });
    await clearHarnessEvents(page);

    const before = await getHarnessConfig(page);
    const beforeSlot = before.slots.find((slot) => slot.id === SLOT_A) as
      | {
          openTime: string;
          closeTime: string;
          deadline?: string;
          secondaryDeadline?: string;
        }
      | undefined;
    expect(beforeSlot).toBeTruthy();

    await seedSelection(page, [SLOT_A]);

    const nextDayPoint = await pointForDayOffset(page, 1);
    await dispatchCanvasMouseEvent(page, nextDayPoint, "click", { shiftKey: true });

    await expect
      .poll(async () => {
        const events = await getHarnessEvents(page);
        const moves = (events.onMoveSlotOnTimeAxis ?? []) as Array<{
          slotId?: string;
          timeDiffMs?: number;
          preview?: boolean;
        }>;
        return moves.find((event) => event.slotId === SLOT_A && event.preview === false) ?? null;
      })
      .toEqual({ slotId: SLOT_A, timeDiffMs: DAY_IN_MS, preview: false });

    await expect
      .poll(async () => (await getCanvasStateField<string[]>(page, "selectionSlotIds")) ?? [], {
        timeout: 2_000,
      })
      .toEqual([]);

    await expect
      .poll(async () => {
        const slot = (await getHarnessConfig(page)).slots.find((item) => item.id === SLOT_A) as
          | {
              openTime: string;
              closeTime: string;
              deadline?: string;
              secondaryDeadline?: string;
            }
          | undefined;
        return {
          open: slot ? new Date(slot.openTime).getTime() : null,
          close: slot ? new Date(slot.closeTime).getTime() : null,
          deadline: slot?.deadline ? new Date(slot.deadline).getTime() : null,
          secondaryDeadline: slot?.secondaryDeadline
            ? new Date(slot.secondaryDeadline).getTime()
            : null,
        };
      })
      .toEqual({
        open: new Date(beforeSlot!.openTime).getTime() + DAY_IN_MS,
        close: new Date(beforeSlot!.closeTime).getTime() + DAY_IN_MS,
        deadline: beforeSlot!.deadline ? new Date(beforeSlot!.deadline).getTime() + DAY_IN_MS : null,
        secondaryDeadline: beforeSlot!.secondaryDeadline
          ? new Date(beforeSlot!.secondaryDeadline).getTime() + DAY_IN_MS
          : null,
      });
  });

  test("Shift + Alt + click on next day copies selected slots on time axis", async ({ page }) => {
    await openE2eHarness(page, {
      fixture: "core",
      query: {
        startTime: "2025-01-01T00:00:00Z",
        endTime: "2025-01-03T00:00:00Z",
      },
    });
    await clearHarnessEvents(page);

    const beforeCount = (await getHarnessConfig(page)).slots.length;
    await seedSelection(page, [SLOT_A, SLOT_B]);

    const nextDayPoint = await pointForDayOffset(page, 1);
    await dispatchCanvasMouseEvent(page, nextDayPoint, "click", { shiftKey: true, altKey: true });

    await expect
      .poll(async () => {
        const events = await getHarnessEvents(page);
        const copies = (events.onBulkCopySlotsOnTimeAxis ?? []) as Array<{
          slotIds?: string[];
          timeDiffMs?: number;
          preview?: boolean;
        }>;
        const committed = copies.find((item) => item.preview === false);
        return {
          slotIds: [...(committed?.slotIds ?? [])].sort(),
          timeDiffMs: committed?.timeDiffMs ?? null,
        };
      })
      .toEqual({
        slotIds: [SLOT_A, SLOT_B],
        timeDiffMs: DAY_IN_MS,
      });

    await expect
      .poll(async () => {
        const events = await getHarnessEvents(page);
        return (events.onBulkMoveSlotsOnTimeAxis ?? []).length;
      })
      .toBe(0);

    await expect
      .poll(async () => (await getHarnessConfig(page)).slots.length)
      .toBe(beforeCount + 2);
  });

  test("Shift + Alt + click with multi-select emits bulk time-axis copy", async ({ page }) => {
    await openE2eHarness(page, {
      fixture: "core",
      query: {
        startTime: "2025-01-01T00:00:00Z",
        endTime: "2025-01-03T00:00:00Z",
      },
    });
    await clearHarnessEvents(page);

    const before = await getHarnessConfig(page);
    const beforeCount = before.slots.length;

    await seedSelection(page, [SLOT_A, SLOT_B]);

    const nextDayPoint = await pointForDayOffset(page, 1);
    await dispatchCanvasMouseEvent(page, nextDayPoint, "click", { shiftKey: true, altKey: true });

    await expect
      .poll(async () => {
        const events = await getHarnessEvents(page);
        const bulkCopies = (events.onBulkCopySlotsOnTimeAxis ?? []) as Array<{
          slotIds?: string[];
          timeDiffMs?: number;
          preview?: boolean;
        }>;
        const committed = bulkCopies.find((event) => event.preview === false);
        return {
          slotIds: [...(committed?.slotIds ?? [])].sort(),
          timeDiffMs: committed?.timeDiffMs ?? null,
        };
      })
      .toEqual({ slotIds: [SLOT_A, SLOT_B], timeDiffMs: DAY_IN_MS });

    await expect
      .poll(async () => (await getHarnessConfig(page)).slots.length)
      .toBe(beforeCount + 2);
  });
});
