import { expect, test, type Page } from "./coverage-test";
import {
  canvasPointToPagePoint,
  clearHarnessEvents,
  dispatchCanvasMouseEvent,
  findSlotPoint,
  getCanvasState,
  getCanvasStateField,
  getHarnessConfig,
  getHarnessEvents,
  mouseDrag,
  openE2eHarness,
} from "./helpers";

type CanvasState = {
  margin: { left: number; right: number };
  layout: {
    canvasCssWidth: number;
    groups: Array<{ id: string; y: number; h: number }>;
  } | null;
};

const DENSE_TARGET_SLOT_ID = "DENSE-0002";

async function brushSelectFirstAllocatedGroup(
  page: Page,
  slots = 80,
): Promise<{ selectedSlotIds: string[]; canvas: Awaited<ReturnType<typeof openE2eHarness>> }> {
  const canvas = await openE2eHarness(page, { fixture: "dense", query: { slots } });
  await page.evaluate(() => localStorage.removeItem("pointerSelection"));

  const state = await getCanvasState<CanvasState>(page);
  expect(state).not.toBeNull();
  expect(state?.layout).not.toBeNull();

  if (!state?.layout) {
    throw new Error("Expected chart layout for brush selection");
  }

  const allocatedGroup = state.layout.groups.find((group) => group.id === "allocated");
  expect(allocatedGroup).toBeDefined();
  if (!allocatedGroup) {
    throw new Error("Expected allocated group to exist");
  }

  const startCanvas = {
    x: state.margin.left + 4,
    y: allocatedGroup.y + 4,
  };
  const endCanvas = {
    x: state.layout.canvasCssWidth - state.margin.right - 4,
    y: allocatedGroup.y + allocatedGroup.h - 4,
  };

  const from = await canvasPointToPagePoint(canvas, startCanvas);
  const to = await canvasPointToPagePoint(canvas, endCanvas);

  await mouseDrag(page, from, to);

  await expect
    .poll(
      async () => ((await getCanvasStateField<string[]>(page, "selectionSlotIds")) ?? []).length,
      { timeout: 2_000 },
    )
    .toBeGreaterThan(1);

  const selectedSlotIds = (await getCanvasStateField<string[]>(page, "selectionSlotIds")) ?? [];
  return { selectedSlotIds, canvas };
}

test.describe("canvas rewrite brush selection", () => {
  test("drag selects multiple slots and persists selection", async ({ page }) => {
    const { selectedSlotIds } = await brushSelectFirstAllocatedGroup(page);

    const selectionFromStorage = await page.evaluate(() => {
      const raw = localStorage.getItem("pointerSelection");
      return raw ? (JSON.parse(raw) as Array<{ id: string }>).map((slot) => slot.id) : [];
    });

    expect(selectedSlotIds.length).toBeGreaterThan(1);
    expect(selectionFromStorage.sort()).toEqual([...selectedSlotIds].sort());
  });

  test("drag in readonly fixture does not select slots", async ({ page }) => {
    const canvas = await openE2eHarness(page, { fixture: "readonly" });
    await page.evaluate(() => localStorage.removeItem("pointerSelection"));

    const slotCenter = await findSlotPoint(page, "LH123-20250101-F", "center");
    const startCanvas = { x: slotCenter.x - 80, y: slotCenter.y - 20 };
    const endCanvas = { x: slotCenter.x + 70, y: slotCenter.y + 20 };
    const from = await canvasPointToPagePoint(canvas, startCanvas);
    const to = await canvasPointToPagePoint(canvas, endCanvas);

    await mouseDrag(page, from, to);

    await expect
      .poll(
        async () => (await getCanvasStateField<string[]>(page, "selectionSlotIds")) ?? [],
        { timeout: 1_500 },
      )
      .toEqual([]);
  });

  test("brush selection followed by click moves selected slots to target destination", async ({ page }) => {
    const { selectedSlotIds } = await brushSelectFirstAllocatedGroup(page);
    await clearHarnessEvents(page);

    const targetPoint = await findSlotPoint(page, DENSE_TARGET_SLOT_ID, "center");

    await dispatchCanvasMouseEvent(page, targetPoint, "click");

    const remainingAfterFirstClick =
      (await getCanvasStateField<string[]>(page, "selectionSlotIds")) ?? [];
    if (remainingAfterFirstClick.length > 0) {
      await dispatchCanvasMouseEvent(page, targetPoint, "click");
    }

    await expect
      .poll(
        async () => (await getCanvasStateField<string[]>(page, "selectionSlotIds")) ?? [],
        { timeout: 2_000 },
      )
      .toEqual([]);

    await expect
      .poll(async () => {
        const events = await getHarnessEvents(page);
        const bulkMoves = (events.onBulkChangeDestinationId ?? []) as Array<{
          slotIds?: string[];
          preview?: boolean;
        }>;
        const committedBulk = bulkMoves.find((event) => event.preview === false);
        const movedSlotIds = [...(committedBulk?.slotIds ?? [])].sort();
        return JSON.stringify(movedSlotIds);
      })
      .toBe(JSON.stringify([...selectedSlotIds].sort()));
  });

  test("Escape clears selected slots", async ({ page }) => {
    const { selectedSlotIds } = await brushSelectFirstAllocatedGroup(page);
    expect(selectedSlotIds.length).toBeGreaterThan(0);

    await page.keyboard.press("Escape");

    await expect
      .poll(
        async () => (await getCanvasStateField<string[]>(page, "selectionSlotIds")) ?? [],
        { timeout: 2_000 },
      )
      .toEqual([]);
  });

  test("Alt toggles copy-mode indicator and destination preview mode", async ({ page }) => {
    const { selectedSlotIds, canvas } = await brushSelectFirstAllocatedGroup(page, 5);
    expect(selectedSlotIds.length).toBeGreaterThan(1);

    const harnessConfig = await getHarnessConfig(page);
    const selectedDestinations = new Set(
      harnessConfig.slots
        .filter((slot) => selectedSlotIds.includes(slot.id))
        .map((slot) => slot.destinationId),
    );
    const previewTarget = harnessConfig.slots.find(
      (slot) => !selectedSlotIds.includes(slot.id) && !selectedDestinations.has(slot.destinationId),
    );
    expect(previewTarget).toBeDefined();
    if (!previewTarget) {
      throw new Error("Expected to find a destination target for preview mode assertion");
    }

    const targetPoint = await findSlotPoint(page, previewTarget.id, "center");
    const targetPagePoint = await canvasPointToPagePoint(canvas, targetPoint);
    await page.mouse.move(targetPagePoint.x, targetPagePoint.y);

    await expect
      .poll(async () => await getCanvasStateField<string | null>(page, "destinationPreviewMode"))
      .toBe("move");

    await page.keyboard.down("Alt");
    await page.mouse.move(targetPagePoint.x + 2, targetPagePoint.y + 2);

    await expect
      .poll(async () => await getCanvasStateField<string | null>(page, "destinationPreviewMode"))
      .toBe("copy");
    await expect
      .poll(async () => await getCanvasStateField<boolean>(page, "altCopyModifierActive"))
      .toBe(true);

    await page.keyboard.up("Alt");
    await page.mouse.move(targetPagePoint.x + 4, targetPagePoint.y + 4);

    await expect
      .poll(async () => await getCanvasStateField<string | null>(page, "destinationPreviewMode"))
      .toBe("move");
    await expect
      .poll(async () => await getCanvasStateField<boolean>(page, "altCopyModifierActive"))
      .toBe(false);
  });

  test("copy cursor appears/disappears without extra mouse movement", async ({ page }) => {
    const { selectedSlotIds, canvas } = await brushSelectFirstAllocatedGroup(page, 5);
    expect(selectedSlotIds.length).toBeGreaterThan(1);

    const harnessConfig = await getHarnessConfig(page);
    const selectedDestinations = new Set(
      harnessConfig.slots
        .filter((slot) => selectedSlotIds.includes(slot.id))
        .map((slot) => slot.destinationId),
    );
    const previewTarget = harnessConfig.slots.find(
      (slot) => !selectedSlotIds.includes(slot.id) && !selectedDestinations.has(slot.destinationId),
    );
    expect(previewTarget).toBeDefined();
    if (!previewTarget) {
      throw new Error("Expected to find a destination target for copy-cursor assertion");
    }

    const targetPoint = await findSlotPoint(page, previewTarget.id, "center");
    const targetPagePoint = await canvasPointToPagePoint(canvas, targetPoint);
    await page.mouse.move(targetPagePoint.x, targetPagePoint.y);

    await expect
      .poll(async () => await getCanvasStateField<string | null>(page, "destinationPreviewMode"))
      .toBe("move");

    await page.keyboard.down("Alt");

    await expect
      .poll(async () => {
        return await canvas.evaluate((node) => (node as HTMLCanvasElement).style.cursor);
      })
      .toBe("copy");
    await expect
      .poll(async () => await getCanvasStateField<string | null>(page, "destinationPreviewMode"))
      .toBe("copy");

    await page.mouse.click(targetPagePoint.x, targetPagePoint.y);

    await expect
      .poll(
        async () => (await getCanvasStateField<string[]>(page, "selectionSlotIds")) ?? [],
        { timeout: 2_000 },
      )
      .toEqual([]);
    await expect
      .poll(async () => {
        return await canvas.evaluate((node) => (node as HTMLCanvasElement).style.cursor);
      })
      .toBe("");

    await page.keyboard.up("Alt");
  });
});
