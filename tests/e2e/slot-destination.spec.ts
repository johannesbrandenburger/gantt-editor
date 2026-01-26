import { test, expect } from '@playwright/test';
import { waitForChartLoad, clickSlot, setupConsoleLogListener } from './helpers';


test.describe('Slot Destination Change (Pin & Paste)', () => {

  test('Click on slot pins it to clipboard', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    // Click on a slot to pin it
    await clickSlot(page, 0);

    // Move mouse to trigger clipboard display
    await page.mouse.move(400, 300);

    // Check for clipboard indicator
    const clipboard = page.locator('.pointer-clipboard');
    await expect(clipboard).toBeVisible({ timeout: 2000 });

    // Should have at least one chip
    const chips = clipboard.locator('.v-chip');
    expect(await chips.count()).toBeGreaterThan(0);
  });

  test('Click on destination pastes pinned slot', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    const logs = setupConsoleLogListener(page);

    // First, pin a slot
    await clickSlot(page, 0);
    await page.waitForTimeout(300);

    // Verify slot is pinned
    const copiedSlot = page.locator('svg path.slot-box.copied');
    await expect(copiedSlot.first()).toBeVisible();

    // Find a different topic area to paste into (use click position in different row)
    const topicAreas = page.locator('svg .topic-area');
    const areaCount = await topicAreas.count();

    // Click on a topic area that's different from where the slot was
    const targetArea = topicAreas.nth(2);
    const targetBox = await targetArea.boundingBox();
    expect(targetBox).not.toBeNull();

    if (targetBox) {
      // Click in the center of the target area
      await page.mouse.click(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
      await page.waitForTimeout(500);
    }

    // Check console for the move callback log OR check that clipboard was cleared (paste happened)
    const hasMoveCallback = logs.some(log =>
      log.includes('Moved slot to different destination')
    );

    // If move happened, the slot should no longer be in copied state
    const stillCopied = await page.locator('svg path.slot-box.copied').count();
    expect(hasMoveCallback).toBe(true);
    expect(stillCopied).toBe(0);
  });

  test('Clear clipboard with ESC key', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    // First, pin a slot
    await clickSlot(page, 0);
    await page.waitForTimeout(300);

    // Verify slot is copied
    let copiedSlots = page.locator('svg path.slot-box.copied');
    const copiedCount = await copiedSlots.count();
    expect(copiedCount).toBeGreaterThan(0);

    // Press ESC to clear clipboard
    await page.keyboard.press('Escape');

    await page.waitForTimeout(400);

    // Verify clipboard is cleared (slots no longer marked as copied)
    copiedSlots = page.locator('svg path.slot-box.copied');
    expect(await copiedSlots.count()).toBe(0);
  });

  test('Multi-select slots with Ctrl/Cmd click', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    const logs = setupConsoleLogListener(page);

    // Click first slot
    await clickSlot(page, 0);
    await page.waitForTimeout(100);

    // Ctrl+click on second slot
    const slots = page.locator('svg g.slot-group');
    await slots.nth(1).click({ modifiers: ['Meta'] }); // Use Meta for macOS

    await page.waitForTimeout(200);

    // Move mouse to show clipboard
    await page.mouse.move(400, 300);

    // Check clipboard has multiple items
    const clipboard = page.locator('.pointer-clipboard');
    await expect(clipboard).toBeVisible({ timeout: 2000 });

    const chips = clipboard.locator('.v-chip');
    expect(await chips.count()).toBe(2);

    // paste the multi-selected slots
    const targetArea = page.locator('svg .topic-area').nth(2);
    const targetBox = await targetArea.boundingBox();
    expect(targetBox).not.toBeNull();

    if (targetBox) {
      // Click in the center of the target area
      await page.mouse.click(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
      await page.waitForTimeout(500);
    }

    // Verify clipboard is cleared after paste
    expect(await chips.count()).toBe(0);

    // Verify 2 move callbacks in logs
    const moveLogs = logs.filter(log =>
      log.includes('Moved slot to different destination')
    );
    expect(moveLogs.length).toBe(2);
  });
});
