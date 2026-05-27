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

function timeMsForCanvasX(
  x: number,
  state: {
    internalStartTimeMs: number;
    internalEndTimeMs: number;
    margin: { left: number; right: number };
    layout: { canvasCssWidth: number } | null;
  },
): number {
  expect(state.layout).not.toBeNull();
  const chartWidth =
    (state.layout as { canvasCssWidth: number }).canvasCssWidth -
    state.margin.left -
    state.margin.right;
  const ratio = (x - state.margin.left) / chartWidth;
  return state.internalStartTimeMs + (state.internalEndTimeMs - state.internalStartTimeMs) * ratio;
}

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

  test("suppresses hover and updates resize preview time while resizing", async ({ page }) => {
    const canvas = await openE2eHarness(page);
    const beforeCloseTimeMs = await getHarnessSlotCloseTimeMs(page, SLOT_ID);
    expect(beforeCloseTimeMs).not.toBeNull();

    const edgePoint = await findSlotPoint(page, SLOT_ID, "right-edge");
    const edge = await canvasPointToPagePoint(canvas, edgePoint);

    await page.mouse.move(edge.x, edge.y);
    await page.mouse.down();

    const inward = { x: edge.x - 10, y: edge.y };
    await page.mouse.move(inward.x, inward.y, { steps: 6 });

    await expect
      .poll(async () => await getCanvasStateField<boolean>(page, "slotResizeActive"), {
        timeout: 2000,
      })
      .toBe(true);
    await expect
      .poll(async () => await getCanvasStateField<string | null>(page, "hoveredSlotId"), {
        timeout: 2000,
      })
      .toBeNull();

    const previewAfterInward = await getCanvasStateField<number | null>(
      page,
      "resizePreviewEdgeTimeMs",
    );
    expect(previewAfterInward).not.toBeNull();

    const outward = { x: edge.x + 60, y: edge.y };
    await page.mouse.move(outward.x, outward.y, { steps: 10 });

    await expect
      .poll(async () => await getCanvasStateField<string | null>(page, "hoveredSlotId"), {
        timeout: 2000,
      })
      .toBeNull();

    const previewAfterOutward = await getCanvasStateField<number | null>(
      page,
      "resizePreviewEdgeTimeMs",
    );
    expect(previewAfterOutward).not.toBeNull();
    expect(previewAfterOutward).not.toBe(previewAfterInward);

    await page.mouse.up();

    await expect
      .poll(async () => await getCanvasStateField<boolean>(page, "slotResizeActive"), {
        timeout: 2000,
      })
      .toBe(false);

    await expect
      .poll(async () => await getCanvasStateField<number | null>(page, "resizePreviewEdgeTimeMs"), {
        timeout: 2000,
      })
      .toBeNull();

    await expect
      .poll(async () => await getHarnessSlotCloseTimeMs(page, SLOT_ID), { timeout: 2000 })
      .not.toBe(beforeCloseTimeMs);
  });

  test("resize preview edge time follows cursor when drag starts inside handle", async ({ page }) => {
    const canvas = await openE2eHarness(page);
    const state = await getCanvasState<{
      internalStartTimeMs: number;
      internalEndTimeMs: number;
      margin: { left: number; right: number };
      layout: { canvasCssWidth: number } | null;
    }>(page);

    const edgePoint = await findSlotPoint(page, SLOT_ID, "right-edge");
    const grabPoint = { x: edgePoint.x - 3, y: edgePoint.y };
    const targetPoint = { x: edgePoint.x + 60, y: edgePoint.y };
    const from = await canvasPointToPagePoint(canvas, grabPoint);
    const to = await canvasPointToPagePoint(canvas, targetPoint);

    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 10 });

    const previewEdgeTimeMs = await getCanvasStateField<number | null>(
      page,
      "resizePreviewEdgeTimeMs",
    );
    expect(previewEdgeTimeMs).not.toBeNull();
    expect(
      Math.abs((previewEdgeTimeMs as number) - timeMsForCanvasX(targetPoint.x, state)),
    ).toBeLessThanOrEqual(1000);

    await page.mouse.up();
  });

  test("supports brush selection via drag and stores selection", async ({ page }) => {
    const canvas = await openE2eHarness(page);

    await page.evaluate(() => localStorage.removeItem("pointerSelection"));
    const canvasState = await getCanvasState<{
      margin: { left: number; right: number };
      layout: {
        canvasCssWidth: number;
        groups: Array<{ id: string; y: number; h: number }>;
      } | null;
    }>(page);
    expect(canvasState).not.toBeNull();
    if (!canvasState) {
      throw new Error("Expected canvas state to be available");
    }
    const targetGroup =
      canvasState.layout?.groups.find((group) => group.id === "allocated") ??
      canvasState.layout?.groups[0];
    expect(targetGroup).toBeDefined();
    if (!targetGroup || !canvasState.layout) {
      throw new Error("Expected at least one visible group for brush selection");
    }

    const startCanvas = {
      x: canvasState.margin.left + 4,
      y: targetGroup.y + 4,
    };
    const endCanvas = {
      x: canvasState.layout.canvasCssWidth - canvasState.margin.right - 4,
      y: targetGroup.y + targetGroup.h - 4,
    };

    const from = await canvasPointToPagePoint(canvas, startCanvas);
    const to = await canvasPointToPagePoint(canvas, endCanvas);

    await mouseDrag(page, from, to);

    await expect
      .poll(
        async () => ((await getCanvasStateField<string[]>(page, "selectionSlotIds")) ?? []).length,
        { timeout: 2000 },
      )
      .toBeGreaterThan(0);

    const selectedSlotIds = (await getCanvasStateField<string[]>(page, "selectionSlotIds")) ?? [];
    const selectionFromStorage = await page.evaluate(() => {
      const raw = localStorage.getItem("pointerSelection");
      return raw ? (JSON.parse(raw) as Array<{ id: string }>).map((slot) => slot.id) : [];
    });

    expect(selectionFromStorage.sort()).toEqual([...selectedSlotIds].sort());
  });
});
