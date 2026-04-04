import { expect, test } from "@playwright/test";
import {
  clearHarnessEvents,
  dispatchCanvasMouseEvent,
  findSlotPoint,
  getCanvasStateField,
  getHarnessConfig,
  getHarnessEvents,
  openE2eHarness,
} from "./helpers";

const SLOT_A = "LH123-20250101-F";
const SLOT_B = "OS200-20250101-G";
const SLOT_C = "AA300-20250101-U";

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
        const copies = (events.onCopyDestinationId ?? []) as Array<{
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
        const bulkCopies = (events.onBulkCopyDestinationId ?? []) as Array<{
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
});
