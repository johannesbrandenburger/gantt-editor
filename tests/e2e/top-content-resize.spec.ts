import { test, expect } from '@playwright/test';
import { waitForChartLoad } from './helpers';

test.describe('Top Content Slot and Resize', () => {

  test('Top content container is rendered with toolbar buttons', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    // The top content container should be visible (topContentPortion = 0.1 in demo)
    const topContent = page.locator('.top-content-container');
    await expect(topContent).toBeVisible();

    // It should contain the toolbar buttons
    const modeButton = page.locator('button:has-text("Mode")');
    await expect(modeButton).toBeVisible();

    const markedRegionButton = page.locator('[data-testid="toggle-marked-region-button"]');
    await expect(markedRegionButton).toBeVisible();

    const clearClipboardButton = page.locator('[data-testid="clear-clipboard-button"]');
    await expect(clearClipboardButton).toBeVisible();
  });

  test('Top content has a resize handle that can be dragged', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    // Get initial top content height
    const topContent = page.locator('.top-content-container');
    const initialBox = await topContent.boundingBox();
    expect(initialBox).not.toBeNull();

    // Find the resize handle (it's the .resize-handle after the top content)
    const resizeHandle = page.locator('.resize-handle').first();
    await expect(resizeHandle).toBeVisible();

    const handleBox = await resizeHandle.boundingBox();
    expect(handleBox).not.toBeNull();

    if (handleBox && initialBox) {
      // Drag the resize handle downward to increase top content height
      await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + 100, { steps: 5 });
      await page.mouse.up();

      await page.waitForTimeout(300);

      // Verify top content grew
      const newBox = await topContent.boundingBox();
      expect(newBox).not.toBeNull();
      if (newBox) {
        expect(newBox.height).toBeGreaterThan(initialBox.height);
      }
    }
  });

  test('Top content can be toggled with T key', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    // Top content should be visible initially
    const topContent = page.locator('.top-content-container');
    await expect(topContent).toBeVisible();

    // Press T to toggle off
    await page.keyboard.press('t');
    await page.waitForTimeout(500);

    // Top content should be hidden (topContentPortion = 0)
    await expect(topContent).not.toBeVisible();

    // Press T to toggle back on
    await page.keyboard.press('t');
    await page.waitForTimeout(500);

    // Top content should be visible again
    await expect(topContent).toBeVisible();
  });
});
