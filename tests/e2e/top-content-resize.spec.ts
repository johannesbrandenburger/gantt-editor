import { expect, test, type Page } from "./coverage-test";
import { waitForCanvasApi } from "./helpers";

async function openMainPage(page: Page): Promise<void> {
  await page.goto("/");
  await waitForCanvasApi(page);
}

test.describe("canvas rewrite top content and resize", () => {
  test("top content container renders with toolbar buttons", async ({ page }) => {
    await openMainPage(page);

    await expect(page.locator(".top-content-container")).toBeVisible();
    await expect(page.getByRole("button", { name: /Editable Mode|Read-Only Mode/ })).toBeVisible();
    await expect(page.getByTestId("toggle-marked-region-button")).toBeVisible();
    await expect(page.getByTestId("clear-selection-button")).toBeVisible();
  });

  test("top content can be resized by dragging the top resize band", async ({ page }) => {
    await openMainPage(page);

    const topContent = page.locator(".top-content-container");
    const initialBox = await topContent.boundingBox();
    expect(initialBox).not.toBeNull();

    if (!initialBox) {
      throw new Error("Expected top content container to be measurable");
    }

    const dragX = initialBox.x + Math.max(30, Math.floor(initialBox.width * 0.3));
    const dragStartY = initialBox.y + initialBox.height + 1;

    await page.mouse.move(dragX, dragStartY);
    await page.mouse.down();
    await page.mouse.move(dragX, dragStartY + 80, { steps: 10 });
    await page.mouse.up();

    await expect
      .poll(async () => {
        const box = await topContent.boundingBox();
        return box?.height ?? 0;
      })
      .toBeGreaterThan(initialBox.height + 20);
  });

  test("top content can be toggled with the T key", async ({ page }) => {
    await openMainPage(page);

    const topContent = page.locator(".top-content-container");
    await expect(topContent).toBeVisible();

    await page.keyboard.press("t");
    await expect(topContent).toBeHidden();

    await page.keyboard.press("t");
    await expect(topContent).toBeVisible();
  });

  test("dimension demo time-only resize keeps row height and changes slot ratio", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium-vue", "dimension demo is only available in the Vue app");

    await page.setViewportSize({ width: 1000, height: 700 });
    await page.goto("/dimension-demo");
    await waitForCanvasApi(page);

    const before = await page.evaluate(() => {
      const api = (window as Window & { __ganttCanvasTestApi?: { flush: () => void; getState: () => {
        layout?: { canvasCssWidth: number } | null;
        rowHeight?: number;
        slotReferenceAspectRatio?: number;
      } } }).__ganttCanvasTestApi;
      api?.flush();
      const state = api?.getState();
      return {
        canvasCssWidth: state?.layout?.canvasCssWidth ?? 0,
        rowHeight: state?.rowHeight ?? 0,
        ratio: state?.slotReferenceAspectRatio ?? 0,
      };
    });

    await page.getByRole("button", { name: "Resize: full scale" }).click();
    await expect(page.getByRole("button", { name: "Resize: time only" })).toBeVisible();

    await page.setViewportSize({ width: 1400, height: 700 });
    await expect
      .poll(async () => {
        return await page.evaluate(() => {
          const api = (window as Window & { __ganttCanvasTestApi?: { flush: () => void; getState: () => {
            layout?: { canvasCssWidth: number } | null;
          } } }).__ganttCanvasTestApi;
          api?.flush();
          const state = api?.getState();
          return state?.layout?.canvasCssWidth ?? 0;
        });
      })
      .toBeGreaterThan(before.canvasCssWidth);

    const after = await page.evaluate(() => {
      const api = (window as Window & { __ganttCanvasTestApi?: { flush: () => void; getState: () => {
        layout?: { canvasCssWidth: number } | null;
        rowHeight?: number;
        slotReferenceAspectRatio?: number;
      } } }).__ganttCanvasTestApi;
      api?.flush();
      const state = api?.getState();
      return {
        canvasCssWidth: state?.layout?.canvasCssWidth ?? 0,
        rowHeight: state?.rowHeight ?? 0,
        ratio: state?.slotReferenceAspectRatio ?? 0,
      };
    });

    expect(after.canvasCssWidth).toBeGreaterThan(before.canvasCssWidth);
    expect(after.rowHeight).toBeCloseTo(before.rowHeight, 4);
    expect(after.ratio).toBeGreaterThan(before.ratio);
  });
});
