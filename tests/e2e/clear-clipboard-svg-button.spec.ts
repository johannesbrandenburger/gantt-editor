import { test, expect } from '@playwright/test';
import { waitForChartLoad, clickSlot, setupConsoleLogListener } from './helpers';

test.describe('Clear Clipboard Button in X-Axis', () => {

  test('Clear clipboard button appears when slots are pinned', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    // Initially, no clear clipboard button should exist
    let clearButton = page.locator('svg .clear-clipboard-button');
    expect(await clearButton.count()).toBe(0);

    // Pin a slot
    await clickSlot(page, 0);
    await page.waitForTimeout(500);

    // Now the clear clipboard button should appear in the x-axis SVG
    clearButton = page.locator('svg .clear-clipboard-button');
    expect(await clearButton.count()).toBe(1);
  });

  test('Clicking clear clipboard button clears all pinned slots', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    const logs = setupConsoleLogListener(page);

    // Pin a slot
    await clickSlot(page, 0);
    await page.waitForTimeout(500);

    // Verify slot is pinned
    const copiedBefore = await page.locator('svg path.slot-box.copied').count();
    expect(copiedBefore).toBeGreaterThan(0);

    // Click the clear clipboard button
    const clearButton = page.locator('svg .clear-clipboard-button');
    await expect(clearButton).toBeVisible();
    await clearButton.click();
    await page.waitForTimeout(500);

    // Verify clipboard is cleared
    const copiedAfter = await page.locator('svg path.slot-box.copied').count();
    expect(copiedAfter).toBe(0);

    // Verify the clear button is removed
    expect(await page.locator('svg .clear-clipboard-button').count()).toBe(0);

    // Verify the clearing log
    const hasClearLog = logs.some(log => log.includes('Clearing clipboard'));
    expect(hasClearLog).toBe(true);
  });

  test('Clear clipboard button disappears when clipboard is emptied via ESC', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    // Pin a slot
    await clickSlot(page, 0);
    await page.waitForTimeout(500);

    // Verify clear button exists
    expect(await page.locator('svg .clear-clipboard-button').count()).toBe(1);

    // Press ESC to clear clipboard
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // Clear button should be gone
    expect(await page.locator('svg .clear-clipboard-button').count()).toBe(0);
  });
});
