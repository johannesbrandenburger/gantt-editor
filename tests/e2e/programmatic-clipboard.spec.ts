import { test, expect } from '@playwright/test';
import { waitForChartLoad, clickSlot, setupConsoleLogListener } from './helpers';

test.describe('Programmatic Clipboard Clear', () => {

  test('Clear clipboard programmatically via button', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    const logs = setupConsoleLogListener(page);

    // First, pin a slot to the clipboard
    await clickSlot(page, 0);
    await page.waitForTimeout(300);

    // Verify slot is copied (has the 'copied' class)
    let copiedSlots = page.locator('svg path.slot-box.copied');
    const copiedCount = await copiedSlots.count();
    expect(copiedCount).toBeGreaterThan(0);

    // Verify clipboard indicator is visible when moving the mouse
    await page.mouse.move(400, 300);
    const clipboard = page.locator('.pointer-clipboard');
    await expect(clipboard).toBeVisible({ timeout: 2000 });

    // Click the "Clear Clipboard" button to programmatically clear the clipboard
    const clearClipboardButton = page.locator('[data-testid="clear-clipboard-button"]');
    await expect(clearClipboardButton).toBeVisible();
    await clearClipboardButton.click();

    await page.waitForTimeout(400);

    // Verify clipboard is cleared (slots no longer marked as copied)
    copiedSlots = page.locator('svg path.slot-box.copied');
    expect(await copiedSlots.count()).toBe(0);

    // Verify that the console log was called
    const hasLogMessage = logs.some(log =>
      log.includes('Clearing clipboard programmatically')
    );
    expect(hasLogMessage).toBe(true);
  });

  test('Clear clipboard button works when slot is selected', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    // Select first slot
    await clickSlot(page, 0);
    await page.waitForTimeout(200);

    // Verify at least one slot is copied
    let copiedSlots = page.locator('svg path.slot-box.copied');
    const copiedCount = await copiedSlots.count();
    expect(copiedCount).toBeGreaterThanOrEqual(1);

    // Click the "Clear Clipboard" button
    const clearClipboardButton = page.locator('[data-testid="clear-clipboard-button"]');
    await clearClipboardButton.click();

    await page.waitForTimeout(400);

    // Verify all slots are cleared
    copiedSlots = page.locator('svg path.slot-box.copied');
    expect(await copiedSlots.count()).toBe(0);

    // Verify we can select another slot after clearing (clipboard is functional)
    await clickSlot(page, 1);
    await page.waitForTimeout(200);
    
    copiedSlots = page.locator('svg path.slot-box.copied');
    expect(await copiedSlots.count()).toBeGreaterThanOrEqual(1);
  });

  test('Event message shows when clipboard is cleared', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    // Pin a slot
    await clickSlot(page, 0);
    await page.waitForTimeout(300);

    // Click the "Clear Clipboard" button
    const clearClipboardButton = page.locator('[data-testid="clear-clipboard-button"]');
    await clearClipboardButton.click();

    // Check that the event message appears
    const eventMessage = page.locator('text=Clipboard cleared programmatically');
    await expect(eventMessage).toBeVisible({ timeout: 2000 });
  });
});
