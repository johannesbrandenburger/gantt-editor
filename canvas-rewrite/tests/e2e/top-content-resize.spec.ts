import { expect, test, type Page } from "@playwright/test";
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
    await expect(page.getByTestId("clear-clipboard-button")).toBeVisible();
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
});
