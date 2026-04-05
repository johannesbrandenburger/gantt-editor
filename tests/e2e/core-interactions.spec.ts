import { expect, test } from "./coverage-test";
import {
  canvasPointToPagePoint,
  dispatchCanvasMouseEvent,
  findSlotPoint,
  getCanvasState,
  getCanvasStateField,
  getHarnessSlotCloseTimeMs,
  mouseDrag,
  openE2eHarness,
} from "./helpers";

const SLOT_ID = "LH123-20250101-F";

test.describe("canvas rewrite core interactions", () => {
  test("supports click, double click, and context click on a slot", async ({ page }) => {
    await openE2eHarness(page);
    const slotCenter = await findSlotPoint(page, SLOT_ID, "center");

    await dispatchCanvasMouseEvent(page, slotCenter, "click");
    await dispatchCanvasMouseEvent(page, slotCenter, "dblclick");
    await dispatchCanvasMouseEvent(page, slotCenter, "contextmenu");

    await expect
      .poll(
        async () => await getCanvasStateField<string | null>(page, "lastClickedSlotId"),
        { timeout: 2000 },
      )
      .toBe(SLOT_ID);
    await expect
      .poll(
        async () => await getCanvasStateField<string | null>(page, "lastDoubleClickedSlotId"),
        { timeout: 2000 },
      )
      .toBe(SLOT_ID);
    await expect
      .poll(
        async () => await getCanvasStateField<string | null>(page, "lastContextClickedSlotId"),
        { timeout: 2000 },
      )
      .toBe(SLOT_ID);
  });

  test("supports resizing a slot edge with drag", async ({ page }) => {
    const canvas = await openE2eHarness(page);
    const beforeCloseTimeMs = await getHarnessSlotCloseTimeMs(page, SLOT_ID);
    expect(beforeCloseTimeMs).not.toBeNull();

    const edgePoint = await findSlotPoint(page, SLOT_ID, "right-edge");
    const from = await canvasPointToPagePoint(canvas, edgePoint);
    const to = { x: from.x + 70, y: from.y };

    await mouseDrag(page, from, to);

    await expect
      .poll(
        async () => await getHarnessSlotCloseTimeMs(page, SLOT_ID),
        { timeout: 2000 },
      )
      .not.toBe(beforeCloseTimeMs);
  });

  test("supports brush selection via drag and stores selection", async ({ page }) => {
    const canvas = await openE2eHarness(page);

    await page.evaluate(() => localStorage.removeItem("pointerSelection"));
    const canvasState = await getCanvasState<{ margin: { left: number }; rowHeight: number }>(page);
    expect(canvasState).not.toBeNull();
    if (!canvasState) {
      throw new Error("Expected canvas state to be available");
    }

    const center = await findSlotPoint(page, SLOT_ID, "center");
    const startCanvas = {
      x: Math.max(canvasState.margin.left + 12, center.x - 320),
      y: Math.max(40, center.y - Math.max(18, canvasState.rowHeight * 0.35)),
    };
    const endCanvas = { x: center.x + 45, y: center.y + 14 };

    const from = await canvasPointToPagePoint(canvas, startCanvas);
    const to = await canvasPointToPagePoint(canvas, endCanvas);

    await mouseDrag(page, from, to);

    await expect
      .poll(
        async () => (await getCanvasStateField<string[]>(page, "selectionSlotIds")) ?? [],
        { timeout: 2000 },
      )
      .toContain(SLOT_ID);
  });
});
