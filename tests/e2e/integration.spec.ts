import { expect, test } from "@playwright/test";
import {
  canvasPointToPagePoint,
  clearHarnessEvents,
  dispatchCanvasMouseEvent,
  findSlotPoint,
  getCanvasState,
  getCanvasStateField,
  getHarnessConfig,
  getHarnessEvents,
  getHarnessSlotCloseTimeMs,
  mouseDrag,
  openE2eHarness,
} from "./helpers";

const SLOT_A = "LH123-20250101-F";
const SLOT_B = "OS200-20250101-G";

type CanvasState = {
  margin: { left: number; right: number };
  internalStartTimeMs: number;
  internalEndTimeMs: number;
  layout: {
    canvasCssWidth: number;
    groups: Array<{ id: string; y: number; h: number }>;
  } | null;
};

test.describe("canvas rewrite integration workflows", () => {
  test("full workflow: pin slot then paste to different destination", async ({ page }) => {
    await openE2eHarness(page);
    await clearHarnessEvents(page);

    const sourcePoint = await findSlotPoint(page, SLOT_A, "center");
    await dispatchCanvasMouseEvent(page, sourcePoint, "click");

    await expect
      .poll(
        async () => (await getCanvasStateField<string[]>(page, "selectionSlotIds")) ?? [],
        { timeout: 2_000 },
      )
      .toEqual([SLOT_A]);

    const targetDestination = (await getHarnessConfig(page)).slots.find((slot) => slot.id === SLOT_B)?.destinationId;
    expect(targetDestination).toBeTruthy();

    const targetPoint = await findSlotPoint(page, SLOT_B, "center");
    await dispatchCanvasMouseEvent(page, targetPoint, "click");

    await expect
      .poll(
        async () => (await getCanvasStateField<string[]>(page, "selectionSlotIds")) ?? [],
        { timeout: 2_000 },
      )
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

  test("resizing multiple slots updates close times", async ({ page }) => {
    const canvas = await openE2eHarness(page);

    const slotIds = [SLOT_A, SLOT_B];
    let successfulResizes = 0;

    for (const slotId of slotIds) {
      const beforeCloseMs = await getHarnessSlotCloseTimeMs(page, slotId);
      expect(beforeCloseMs).not.toBeNull();

      const edgePoint = await findSlotPoint(page, slotId, "right-edge");
      const from = await canvasPointToPagePoint(canvas, edgePoint);
      const to = { x: from.x + 70, y: from.y };

      await mouseDrag(page, from, to);

      await expect
        .poll(async () => await getHarnessSlotCloseTimeMs(page, slotId), { timeout: 2_000 })
        .not.toBe(beforeCloseMs);

      successfulResizes += 1;
    }

    expect(successfulResizes).toBe(slotIds.length);
  });

  test("read-only mode blocks pin and resize edits", async ({ page }) => {
    const canvas = await openE2eHarness(page, { fixture: "readonly" });

    const slotCenter = await findSlotPoint(page, SLOT_A, "center");
    await dispatchCanvasMouseEvent(page, slotCenter, "click");

    await expect
      .poll(
        async () => (await getCanvasStateField<string[]>(page, "selectionSlotIds")) ?? [],
        { timeout: 2_000 },
      )
      .toEqual([]);

    const beforeCloseMs = await getHarnessSlotCloseTimeMs(page, SLOT_A);
    expect(beforeCloseMs).not.toBeNull();

    const from = await canvasPointToPagePoint(canvas, slotCenter);
    const to = { x: from.x + 80, y: from.y };
    await mouseDrag(page, from, to);

    await expect
      .poll(async () => await getHarnessSlotCloseTimeMs(page, SLOT_A), { timeout: 2_000 })
      .toBe(beforeCloseMs);
  });

  test("pan and zoom workflow keeps chart interactive", async ({ page }) => {
    const canvas = await openE2eHarness(page);

    const before = await getCanvasState<CanvasState>(page);
    expect(before).not.toBeNull();
    expect(before?.layout).not.toBeNull();
    if (!before?.layout || before.layout.groups.length === 0) {
      throw new Error("Expected canvas layout for pan/zoom test");
    }

    const panCanvasPoint = {
      x: before.margin.left + 40,
      y: before.layout.groups[0]!.y + Math.max(10, Math.floor(before.layout.groups[0]!.h * 0.25)),
    };
    const panPagePoint = await canvasPointToPagePoint(canvas, panCanvasPoint);

    await page.mouse.move(panPagePoint.x, panPagePoint.y);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(panPagePoint.x - 160, panPagePoint.y, { steps: 8 });
    await page.mouse.up({ button: "right" });

    await expect
      .poll(async () => await getCanvasStateField<number>(page, "internalStartTimeMs"), { timeout: 2_000 })
      .not.toBe(before.internalStartTimeMs);

    const spanBeforeZoom = before.internalEndTimeMs - before.internalStartTimeMs;

    await page.mouse.move(panPagePoint.x, panPagePoint.y);
    await page.keyboard.down("Shift");
    await page.mouse.wheel(0, -120);
    await page.keyboard.up("Shift");

    await expect
      .poll(async () => {
        const start = await getCanvasStateField<number>(page, "internalStartTimeMs");
        const end = await getCanvasStateField<number>(page, "internalEndTimeMs");
        if (start == null || end == null) return null;
        return end - start;
      })
      .toBeLessThan(spanBeforeZoom);

    const slotPointAfterZoom = await findSlotPoint(page, SLOT_A, "center");
    expect(slotPointAfterZoom.x).toBeGreaterThan(0);
    expect(slotPointAfterZoom.y).toBeGreaterThan(0);
  });
});
