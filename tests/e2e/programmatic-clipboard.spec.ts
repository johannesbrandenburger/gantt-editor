import { expect, test, type Page } from "@playwright/test";
import { dispatchCanvasMouseEvent, getCanvasStateField, waitForCanvasApi } from "./helpers";

async function openMainPage(page: Page): Promise<void> {
  await page.goto("/");
  await waitForCanvasApi(page);
}

async function findAnySlotPoint(page: Page): Promise<{ x: number; y: number; slotId: string }> {
  const point = await page.evaluate(() => {
    const api = (window as Window & {
      __ganttCanvasTestApi?: {
        flush: () => void;
        getState: () => {
          margin: { left: number; right: number };
          layout: { canvasCssWidth: number; canvasCssHeight: number } | null;
        };
        probeCanvasPoint: (x: number, y: number) => { slotId: string | null };
      };
    }).__ganttCanvasTestApi;

    api?.flush();
    const state = api?.getState();
    if (!api || !state?.layout) return null;

    const minX = Math.max(1, state.margin.left + 1);
    const maxX = Math.max(minX, state.layout.canvasCssWidth - state.margin.right - 1);
    const maxY = Math.max(1, state.layout.canvasCssHeight - 1);

    for (let y = 1; y <= maxY; y += 2) {
      for (let x = minX; x <= maxX; x += 2) {
        const probe = api.probeCanvasPoint(x, y);
        if (probe.slotId) {
          return { x, y, slotId: probe.slotId };
        }
      }
    }

    return null;
  });

  expect(point).not.toBeNull();
  return point as { x: number; y: number; slotId: string };
}

test.describe("canvas rewrite programmatic selection clear", () => {
  test("clear selection button removes pinned slots", async ({ page }) => {
    await openMainPage(page);

    const slotPoint = await findAnySlotPoint(page);
    await dispatchCanvasMouseEvent(page, slotPoint, "click");

    await expect
      .poll(
        async () => ((await getCanvasStateField<string[]>(page, "selectionSlotIds")) ?? []).length,
        { timeout: 2_000 },
      )
      .toBeGreaterThan(0);

    await page.getByTestId("clear-selection-button").click();

    await expect
      .poll(
        async () => (await getCanvasStateField<string[]>(page, "selectionSlotIds")) ?? [],
        { timeout: 2_000 },
      )
      .toEqual([]);
  });

  test("selection can be used again after programmatic clear", async ({ page }) => {
    await openMainPage(page);

    const slotPoint = await findAnySlotPoint(page);
    await dispatchCanvasMouseEvent(page, slotPoint, "click");

    await expect
      .poll(
        async () => ((await getCanvasStateField<string[]>(page, "selectionSlotIds")) ?? []).length,
        { timeout: 2_000 },
      )
      .toBeGreaterThan(0);

    await page.getByTestId("clear-selection-button").click();
    await expect
      .poll(
        async () => (await getCanvasStateField<string[]>(page, "selectionSlotIds")) ?? [],
        { timeout: 2_000 },
      )
      .toEqual([]);

    await dispatchCanvasMouseEvent(page, slotPoint, "click");
    await expect
      .poll(
        async () => ((await getCanvasStateField<string[]>(page, "selectionSlotIds")) ?? []).length,
        { timeout: 2_000 },
      )
      .toBeGreaterThan(0);
  });

  test("event message is shown when selection is cleared programmatically", async ({ page }) => {
    await openMainPage(page);

    const slotPoint = await findAnySlotPoint(page);
    await dispatchCanvasMouseEvent(page, slotPoint, "click");

    await page.getByTestId("clear-selection-button").click();

    await expect(page.getByText("Selection cleared programmatically", { exact: false })).toBeVisible({
      timeout: 2_000,
    });
  });

  test("delete selection button removes selected slots from parent state", async ({ page }) => {
    await openMainPage(page);

    const slotPoint = await findAnySlotPoint(page);
    await dispatchCanvasMouseEvent(page, slotPoint, "click");

    await expect
      .poll(
        async () => ((await getCanvasStateField<string[]>(page, "selectionSlotIds")) ?? []).length,
        { timeout: 2_000 },
      )
      .toBeGreaterThan(0);

    await page.getByTestId("delete-selection-button").click();

    await expect
      .poll(
        async () => (await getCanvasStateField<string[]>(page, "selectionSlotIds")) ?? [],
        { timeout: 2_000 },
      )
      .toEqual([]);

    await expect(page.getByText("Deleted", { exact: false })).toBeVisible({ timeout: 2_000 });
  });
});
