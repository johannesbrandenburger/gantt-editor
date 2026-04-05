import { expect, test, type Page } from "./coverage-test";
import {
  canvasPointToPagePoint,
  dispatchCanvasMouseEvent,
  findSlotPoint,
  getCanvasStateField,
  getHarnessSlotCloseTimeMs,
  mouseDrag,
  openE2eHarness,
  setHarnessConfig,
} from "./helpers";

const SLOT_ID = "LH123-20250101-F";

async function findSlotEdgePointOrNull(
  page: Page,
  slotId: string,
): Promise<{ x: number; y: number } | null> {
  return await page.evaluate((currentSlotId) => {
    const api = (window as Window & {
      __ganttCanvasTestApi?: {
        flush: () => void;
        findSlotPoint: (
          slotId: string,
          mode?: "center" | "left-edge" | "right-edge",
        ) => { x: number; y: number } | null;
      };
    }).__ganttCanvasTestApi;

    api?.flush();
    return api?.findSlotPoint(currentSlotId, "right-edge") ?? null;
  }, slotId);
}

test.describe("canvas rewrite read-only mode", () => {
  test("toggle read-only mode blocks and restores slot pinning", async ({ page }) => {
    await openE2eHarness(page, { fixture: "core" });

    const slotCenter = await findSlotPoint(page, SLOT_ID, "center");
    await dispatchCanvasMouseEvent(page, slotCenter, "click");

    await expect
      .poll(async () => (await getCanvasStateField<string[]>(page, "selectionSlotIds")) ?? [], {
        timeout: 2_000,
      })
      .toContain(SLOT_ID);

    await setHarnessConfig(page, { isReadOnly: true });

    await expect
      .poll(async () => (await getCanvasStateField<string[]>(page, "selectionSlotIds")) ?? [], {
        timeout: 2_000,
      })
      .toEqual([]);

    await dispatchCanvasMouseEvent(page, slotCenter, "click");
    await expect
      .poll(async () => (await getCanvasStateField<string[]>(page, "selectionSlotIds")) ?? [], {
        timeout: 2_000,
      })
      .toEqual([]);

    await setHarnessConfig(page, { isReadOnly: false });
    await dispatchCanvasMouseEvent(page, slotCenter, "click");

    await expect
      .poll(async () => (await getCanvasStateField<string[]>(page, "selectionSlotIds")) ?? [], {
        timeout: 2_000,
      })
      .toContain(SLOT_ID);
  });

  test("slot resizing is disabled in read-only mode", async ({ page }) => {
    const canvas = await openE2eHarness(page, { fixture: "core" });

    const edgeWhileEditable = await findSlotEdgePointOrNull(page, SLOT_ID);
    expect(edgeWhileEditable).not.toBeNull();

    const closeTimeBefore = await getHarnessSlotCloseTimeMs(page, SLOT_ID);
    expect(closeTimeBefore).not.toBeNull();

    await setHarnessConfig(page, { isReadOnly: true });

    const edgeWhileReadonly = await findSlotEdgePointOrNull(page, SLOT_ID);
    expect(edgeWhileReadonly).toBeNull();

    const slotCenter = await findSlotPoint(page, SLOT_ID, "center");
    const from = await canvasPointToPagePoint(canvas, slotCenter);
    const to = { x: from.x + 90, y: from.y };
    await mouseDrag(page, from, to);

    await expect
      .poll(async () => await getHarnessSlotCloseTimeMs(page, SLOT_ID), { timeout: 2_000 })
      .toBe(closeTimeBefore);
  });

  test("slot pinning is disabled in read-only fixture", async ({ page }) => {
    await openE2eHarness(page, { fixture: "readonly" });

    const slotCenter = await findSlotPoint(page, SLOT_ID, "center");
    await dispatchCanvasMouseEvent(page, slotCenter, "click");

    await expect
      .poll(async () => (await getCanvasStateField<string[]>(page, "selectionSlotIds")) ?? [], {
        timeout: 2_000,
      })
      .toEqual([]);
  });

  test("selection clears when switching to read-only mode", async ({ page }) => {
    await openE2eHarness(page, { fixture: "core" });

    const slotCenter = await findSlotPoint(page, SLOT_ID, "center");
    await dispatchCanvasMouseEvent(page, slotCenter, "click");

    await expect
      .poll(async () => (await getCanvasStateField<string[]>(page, "selectionSlotIds")) ?? [], {
        timeout: 2_000,
      })
      .toContain(SLOT_ID);

    await setHarnessConfig(page, { isReadOnly: true });

    await expect
      .poll(async () => (await getCanvasStateField<string[]>(page, "selectionSlotIds")) ?? [], {
        timeout: 2_000,
      })
      .toEqual([]);
  });
});
