import { expect, test, type Page, type TestInfo } from "./coverage-test";
import {
  canvasPointToPagePoint,
  dispatchCanvasMouseEvent,
  findSlotPoint,
  getCanvasStateField,
  getHarnessConfig,
  getHarnessEvents,
  mouseDrag,
  openE2eHarness,
} from "./helpers";

const SOURCE_SLOT_ID = "LH123-20250101-F";
const TARGET_SLOT_ID = "OS200-20250101-G";
const DENSE_HOVER_SLOT_ID = "DENSE-0002";

async function brushSelectDenseFixture(page: Page, slots = 5): Promise<string[]> {
  const canvas = await openE2eHarness(page, { fixture: "dense", query: { slots } });
  await page.evaluate(() => localStorage.removeItem("pointerSelection"));

  const state = await page.evaluate(() => {
    const api = (window as Window & {
      __ganttCanvasTestApi?: {
        flush: () => void;
        getState: () => {
          margin?: { left: number; right: number };
          layout?: { canvasCssWidth: number; groups: Array<{ id: string; y: number; h: number }> | null } | null;
        };
      };
    }).__ganttCanvasTestApi;
    api?.flush();
    return api?.getState() ?? null;
  });

  const margin = state?.margin;
  const layout = state?.layout;
  const allocated = layout?.groups?.find((group) => group.id === "allocated");
  if (!margin || !layout || !allocated) {
    throw new Error("Expected dense fixture layout for brush selection");
  }

  const dragFrom = await canvasPointToPagePoint(canvas, {
    x: margin.left + 4,
    y: allocated.y + 4,
  });
  const dragTo = await canvasPointToPagePoint(canvas, {
    x: layout.canvasCssWidth - margin.right - 4,
    y: allocated.y + allocated.h - 4,
  });

  await page.keyboard.down("ControlOrMeta");
  await mouseDrag(page, dragFrom, dragTo);
  await page.keyboard.up("ControlOrMeta");

  await expect
    .poll(
      async () => ((await getCanvasStateField<string[]>(page, "selectionSlotIds")) ?? []).length,
      { timeout: 2_000 },
    )
    .toBeGreaterThan(2);

  return (await getCanvasStateField<string[]>(page, "selectionSlotIds")) ?? [];
}

async function attachScreenshot(
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<void> {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path });
  await testInfo.attach(name, {
    path,
    contentType: "image/png",
  });
}

test.describe("canvas rewrite selection preview behavior", () => {
  test("selection preview visibility signal follows pointer enter/leave", async ({ page }) => {
    const canvas = await openE2eHarness(page);

    const sourcePoint = await findSlotPoint(page, SOURCE_SLOT_ID, "center");
    await dispatchCanvasMouseEvent(page, sourcePoint, "click");

    await expect
      .poll(
        async () => (await getCanvasStateField<string[]>(page, "selectionSlotIds")) ?? [],
        { timeout: 2_000 },
      )
      .toContain(SOURCE_SLOT_ID);

    const sourcePagePoint = await canvasPointToPagePoint(canvas, sourcePoint);
    await page.mouse.move(sourcePagePoint.x, sourcePagePoint.y);

    await expect
      .poll(async () => await getCanvasStateField<boolean>(page, "pointerInChart"), { timeout: 2_000 })
      .toBe(true);

    await page.evaluate(() => {
      const container = document.querySelector(".chart-container");
      container?.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
    });

    await expect
      .poll(async () => await getCanvasStateField<boolean>(page, "pointerInChart"), { timeout: 2_000 })
      .toBe(false);
  });

  test("Meta/Ctrl click on an already pinned slot unpins it", async ({ page }) => {
    await openE2eHarness(page);

    const sourcePoint = await findSlotPoint(page, SOURCE_SLOT_ID, "center");
    await dispatchCanvasMouseEvent(page, sourcePoint, "click");

    await expect
      .poll(
        async () => (await getCanvasStateField<string[]>(page, "selectionSlotIds")) ?? [],
        { timeout: 2_000 },
      )
      .toEqual([SOURCE_SLOT_ID]);

    await dispatchCanvasMouseEvent(page, sourcePoint, "click", { ctrlKey: true });

    await expect
      .poll(
        async () => (await getCanvasStateField<string[]>(page, "selectionSlotIds")) ?? [],
        { timeout: 2_000 },
      )
      .toEqual([]);
  });

  test("clicking another slot with selected items moves and clears selection", async ({ page }) => {
    await openE2eHarness(page);

    const sourcePoint = await findSlotPoint(page, SOURCE_SLOT_ID, "center");
    await dispatchCanvasMouseEvent(page, sourcePoint, "click");

    await expect
      .poll(
        async () => (await getCanvasStateField<string[]>(page, "selectionSlotIds")) ?? [],
        { timeout: 2_000 },
      )
      .toEqual([SOURCE_SLOT_ID]);

    const before = await getHarnessConfig(page);
    const targetDestination = before.slots.find((slot) => slot.id === TARGET_SLOT_ID)?.destinationId;
    expect(targetDestination).toBeTruthy();

    const targetPoint = await findSlotPoint(page, TARGET_SLOT_ID, "center");
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
        const committed = moves.find((event) => event.slotId === SOURCE_SLOT_ID && event.preview === false);
        return committed ?? null;
      })
      .toEqual({
        slotId: SOURCE_SLOT_ID,
        destinationId: targetDestination,
        preview: false,
      });
  });

  test("selection payload keeps slot display names", async ({ page }) => {
    await openE2eHarness(page);

    const sourcePoint = await findSlotPoint(page, SOURCE_SLOT_ID, "center");
    await dispatchCanvasMouseEvent(page, sourcePoint, "click");

    await expect
      .poll(
        async () => {
          const items = await page.evaluate(() => {
            const raw = localStorage.getItem("pointerSelection");
            return raw ? (JSON.parse(raw) as Array<{ id: string; displayName?: string }>) : [];
          });
          return items.length;
        },
        { timeout: 2_000 },
      )
      .toBeGreaterThan(0);

    const selectionItems = await page.evaluate(() => {
      const raw = localStorage.getItem("pointerSelection");
      return raw ? (JSON.parse(raw) as Array<{ id: string; displayName?: string }>) : [];
    });

    expect(selectionItems[0]?.id).toBe(SOURCE_SLOT_ID);
    expect(selectionItems[0]?.displayName).toContain("LH123");
  });

  test("hovering another destination shows embedded animated preview for selected slots", async ({ page }, testInfo) => {
    const selectedSlotIds = await brushSelectDenseFixture(page);
    expect(selectedSlotIds.length).toBeGreaterThan(2);

    const before = await getHarnessConfig(page);
    const targetDestination = before.slots.find((slot) => slot.id === DENSE_HOVER_SLOT_ID)?.destinationId;
    expect(targetDestination).toBeTruthy();
    const expectedPreviewSourceSlotIds = before.slots
      .filter((slot) => selectedSlotIds.includes(slot.id) && slot.destinationId !== targetDestination)
      .map((slot) => slot.id)
      .sort();

    const targetPoint = await findSlotPoint(page, DENSE_HOVER_SLOT_ID, "center");
    const canvas = page.locator("canvas.chart-canvas").first();
    const targetPagePoint = await canvasPointToPagePoint(canvas, targetPoint);
    await page.mouse.move(targetPagePoint.x, targetPagePoint.y);

    await expect
      .poll(async () => await getCanvasStateField<string | null>(page, "destinationPreviewTopicId"), {
        timeout: 2_000,
      })
      .toBe(targetDestination ?? null);

    await expect
      .poll(async () => {
        const ids = (await getCanvasStateField<string[]>(page, "destinationPreviewSourceSlotIds")) ?? [];
        return [...ids].sort().join(",");
      })
      .toBe(expectedPreviewSourceSlotIds.join(","));

    await attachScreenshot(page, testInfo, "destination-preview-hovered-row");

    await page.evaluate(() => {
      const container = document.querySelector(".chart-container");
      container?.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
    });

    await expect
      .poll(async () => await getCanvasStateField<string | null>(page, "destinationPreviewTopicId"), {
        timeout: 2_000,
      })
      .toBeNull();
    await expect
      .poll(async () => (await getCanvasStateField<string[]>(page, "destinationPreviewSourceSlotIds")) ?? [], {
        timeout: 2_000,
      })
      .toEqual([]);

    await attachScreenshot(page, testInfo, "destination-preview-cleared");
  });

  test("Alt copy preview includes selected slots already in hovered destination", async ({ page }) => {
    const selectedSlotIds = await brushSelectDenseFixture(page);
    expect(selectedSlotIds.length).toBeGreaterThan(2);

    const before = await getHarnessConfig(page);
    const selectedSlots = before.slots.filter((slot) => selectedSlotIds.includes(slot.id));
    expect(selectedSlots.length).toBeGreaterThan(2);

    const selectedByDestination = new Map<string, string[]>();
    selectedSlots.forEach((slot) => {
      const existing = selectedByDestination.get(slot.destinationId) ?? [];
      existing.push(slot.id);
      selectedByDestination.set(slot.destinationId, existing);
    });

    const targetDestination = Array.from(selectedByDestination.keys()).find((destinationId) => {
      const inDestination = selectedByDestination.get(destinationId) ?? [];
      return inDestination.length > 0 && inDestination.length < selectedSlotIds.length;
    });
    expect(targetDestination).toBeTruthy();
    if (!targetDestination) {
      throw new Error("Expected selected slots across multiple destinations for Alt copy preview assertion");
    }

    const hoverSlotId =
      before.slots.find(
        (slot) => slot.destinationId === targetDestination && !selectedSlotIds.includes(slot.id),
      )?.id ??
      selectedByDestination.get(targetDestination)?.[0];
    expect(hoverSlotId).toBeTruthy();
    if (!hoverSlotId) {
      throw new Error("Expected a slot in hovered destination for Alt copy preview assertion");
    }

    const movePreviewSourceSlotIds = [...selectedSlotIds]
      .filter((slotId) => !((selectedByDestination.get(targetDestination) ?? []).includes(slotId)))
      .sort();
    const copyPreviewSourceSlotIds = [...selectedSlotIds].sort();

    const targetPoint = await findSlotPoint(page, hoverSlotId, "center");
    const canvas = page.locator("canvas.chart-canvas").first();
    const targetPagePoint = await canvasPointToPagePoint(canvas, targetPoint);
    await page.mouse.move(targetPagePoint.x, targetPagePoint.y);

    await expect
      .poll(async () => await getCanvasStateField<string | null>(page, "destinationPreviewTopicId"), {
        timeout: 2_000,
      })
      .toBe(targetDestination);

    await expect
      .poll(async () => {
        const ids = (await getCanvasStateField<string[]>(page, "destinationPreviewSourceSlotIds")) ?? [];
        return [...ids].sort().join(",");
      })
      .toBe(movePreviewSourceSlotIds.join(","));

    await page.keyboard.down("Alt");
    await page.mouse.move(targetPagePoint.x + 2, targetPagePoint.y + 2);

    await expect
      .poll(async () => await getCanvasStateField<string | null>(page, "destinationPreviewMode"), {
        timeout: 2_000,
      })
      .toBe("copy");

    await expect
      .poll(async () => {
        const ids = (await getCanvasStateField<string[]>(page, "destinationPreviewSourceSlotIds")) ?? [];
        return [...ids].sort().join(",");
      })
      .toBe(copyPreviewSourceSlotIds.join(","));

    await page.keyboard.up("Alt");
  });

  test("hovering back to source destination keeps transition while preview slots disappear", async ({ page }) => {
    await openE2eHarness(page);

    const before = await getHarnessConfig(page);
    const sourceDestination = before.slots.find((slot) => slot.id === SOURCE_SLOT_ID)?.destinationId;
    const targetDestination = before.slots.find((slot) => slot.id === TARGET_SLOT_ID)?.destinationId;
    expect(sourceDestination).toBeTruthy();
    expect(targetDestination).toBeTruthy();
    expect(sourceDestination).not.toBe(targetDestination);

    const sourcePoint = await findSlotPoint(page, SOURCE_SLOT_ID, "center");
    await dispatchCanvasMouseEvent(page, sourcePoint, "click");

    const targetPoint = await findSlotPoint(page, TARGET_SLOT_ID, "center");
    const canvas = page.locator("canvas.chart-canvas").first();
    const targetPagePoint = await canvasPointToPagePoint(canvas, targetPoint);
    await page.mouse.move(targetPagePoint.x, targetPagePoint.y);

    await expect
      .poll(async () => await getCanvasStateField<string | null>(page, "destinationPreviewTopicId"), {
        timeout: 2_000,
      })
      .toBe(targetDestination ?? null);

    const sourcePagePoint = await canvasPointToPagePoint(canvas, sourcePoint);
    await page.mouse.move(sourcePagePoint.x, sourcePagePoint.y);

    // No preview slots are eligible in this destination, but transition should still run briefly.
    await expect
      .poll(
        async () => {
          const topicId = await getCanvasStateField<string | null>(page, "destinationPreviewTopicId");
          const sourceIds =
            (await getCanvasStateField<string[]>(page, "destinationPreviewSourceSlotIds")) ?? [];
          return { topicId, sourceCount: sourceIds.length };
        },
        { timeout: 2_000 },
      )
      .toEqual({
        topicId: sourceDestination ?? null,
        sourceCount: 0,
      });

    await expect
      .poll(async () => await getCanvasStateField<string | null>(page, "destinationPreviewTopicId"), {
        timeout: 2_000,
      })
      .toBeNull();
  });
});
