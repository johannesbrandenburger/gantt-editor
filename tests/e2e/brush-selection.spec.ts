import { test, expect } from '@playwright/test';
import { waitForChartLoad, setupConsoleLogListener, switchToReadOnlyMode } from './helpers';

test.describe('Brush Selection (Meta/Ctrl + Drag)', () => {

  test('Meta/Ctrl + drag selects multiple slots within the brush rectangle', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    const logs = setupConsoleLogListener(page);

    // Get the first gantt container to find a region with slots
    const ganttContainer = page.locator('#allocated-gantt-container svg').first();
    const containerBox = await ganttContainer.boundingBox();
    expect(containerBox).not.toBeNull();

    // Count initial copied slots (should be 0)
    const initialCopiedCount = await page.locator('svg path.slot-box.copied').count();
    expect(initialCopiedCount).toBe(0);

    // Hold Meta key to bring brush to front, then drag a selection rectangle
    await page.keyboard.down('Meta');
    await page.waitForTimeout(200);

    if (containerBox) {
      // Draw a large brush rectangle to capture multiple slots
      const startX = containerBox.x + 200;
      const startY = containerBox.y + 10;
      const endX = containerBox.x + containerBox.width - 100;
      const endY = containerBox.y + 200;

      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(endX, endY, { steps: 10 });
      await page.mouse.up();
    }

    await page.keyboard.up('Meta');
    await page.waitForTimeout(500);

    // Verify that some slots were selected (marked as copied)
    const copiedSlots = await page.locator('svg path.slot-box.copied').count();
    expect(copiedSlots).toBeGreaterThan(0);

    // Verify the "Selected something" console log was triggered
    const hasSelectionLog = logs.some(log => log.includes('Selected something'));
    expect(hasSelectionLog).toBe(true);

    // Verify clipboard shows chips for the selected slots
    await page.mouse.move(400, 300);
    const clipboard = page.locator('.pointer-clipboard');
    await expect(clipboard).toBeVisible({ timeout: 2000 });

    const chips = clipboard.locator('.v-chip');
    const chipCount = await chips.count();
    expect(chipCount).toBe(copiedSlots);
  });

  test('Brush selection in read-only mode does not select any slots', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    // Switch to read-only mode
    await switchToReadOnlyMode(page);

    const logs = setupConsoleLogListener(page);

    // Get the container
    const ganttContainer = page.locator('#allocated-gantt-container svg').first();
    const containerBox = await ganttContainer.boundingBox();
    expect(containerBox).not.toBeNull();

    // Hold Meta key and drag to select
    await page.keyboard.down('Meta');
    await page.waitForTimeout(200);

    if (containerBox) {
      const startX = containerBox.x + 200;
      const startY = containerBox.y + 10;
      const endX = containerBox.x + containerBox.width - 100;
      const endY = containerBox.y + 200;

      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(endX, endY, { steps: 10 });
      await page.mouse.up();
    }

    await page.keyboard.up('Meta');
    await page.waitForTimeout(500);

    // No slots should be copied in read-only mode
    const copiedSlots = await page.locator('svg path.slot-box.copied').count();
    expect(copiedSlots).toBe(0);
  });

  test('Brush selection can be followed by paste to move all selected slots', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    const logs = setupConsoleLogListener(page);

    // Get the container
    const ganttContainer = page.locator('#allocated-gantt-container svg').first();
    const containerBox = await ganttContainer.boundingBox();
    expect(containerBox).not.toBeNull();

    // Hold Meta key and drag to select a small area to capture at least 1 slot
    await page.keyboard.down('Meta');
    await page.waitForTimeout(200);

    if (containerBox) {
      const startX = containerBox.x + 200;
      const startY = containerBox.y + 10;
      const endX = containerBox.x + containerBox.width - 100;
      const endY = containerBox.y + 100;

      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(endX, endY, { steps: 10 });
      await page.mouse.up();
    }

    await page.keyboard.up('Meta');
    await page.waitForTimeout(500);

    const copiedSlots = await page.locator('svg path.slot-box.copied').count();

    // Only proceed if we selected at least one slot
    if (copiedSlots > 0) {
      // To paste, we click on a slot in a different destination (not Ctrl/Meta).
      // When the clipboard is non-empty, clicking a slot triggers moveClipboardToTopic.
      // First, scroll down to find a slot group that's in a different destination area
      // We need to find a slot that's visible and not already copied
      const allSlots = page.locator('svg g.slot-group');
      const allSlotCount = await allSlots.count();

      // Find a slot that is NOT copied (i.e., in a different destination)
      let targetSlotIndex = -1;
      for (let i = allSlotCount - 1; i >= 0; i--) {
        const slotBox = await allSlots.nth(i).locator('path.slot-box').first();
        const isCopied = await slotBox.evaluate(el => el.classList.contains('copied'));
        if (!isCopied) {
          const box = await allSlots.nth(i).boundingBox();
          if (box && box.y > 0 && box.y < 800) {
            targetSlotIndex = i;
            break;
          }
        }
      }

      expect(targetSlotIndex).toBeGreaterThanOrEqual(0);

      // Click the target slot (without Ctrl) to trigger paste
      await allSlots.nth(targetSlotIndex).click();
      await page.waitForTimeout(1000);

      // Verify move callbacks were triggered
      const moveLogs = logs.filter(log => log.includes('Moved slot to different destination'));
      expect(moveLogs.length).toBe(copiedSlots);

      // Clipboard should be cleared after paste
      const remainingCopied = await page.locator('svg path.slot-box.copied').count();
      expect(remainingCopied).toBe(0);
    }
  });

  test('ESC clears brush-selected slots from clipboard', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    // Get the container
    const ganttContainer = page.locator('#allocated-gantt-container svg').first();
    const containerBox = await ganttContainer.boundingBox();
    expect(containerBox).not.toBeNull();

    // Hold Meta key and drag to select
    await page.keyboard.down('Meta');
    await page.waitForTimeout(200);

    if (containerBox) {
      const startX = containerBox.x + 200;
      const startY = containerBox.y + 10;
      const endX = containerBox.x + containerBox.width - 100;
      const endY = containerBox.y + 200;

      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(endX, endY, { steps: 10 });
      await page.mouse.up();
    }

    await page.keyboard.up('Meta');
    await page.waitForTimeout(500);

    // Verify some slots are selected
    const copiedBefore = await page.locator('svg path.slot-box.copied').count();
    expect(copiedBefore).toBeGreaterThan(0);

    // Press ESC to clear
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    // Verify all slots are deselected
    const copiedAfter = await page.locator('svg path.slot-box.copied').count();
    expect(copiedAfter).toBe(0);
  });
});
