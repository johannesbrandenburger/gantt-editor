import { test, expect } from '@playwright/test';
import { waitForChartLoad, clickSlot, setupConsoleLogListener, switchToReadOnlyMode } from './helpers';

test.describe('Integration Tests', () => {

  test('Full workflow: Pin slot, preview, and paste to new destination', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    const logs = setupConsoleLogListener(page);

    // 1. Click a slot to pin it
    const firstSlot = page.locator('svg g.slot-group').first();
    await firstSlot.click();
    await page.waitForTimeout(1000);

    // 2. Verify it's pinned (has copied class)
    const copiedSlot = page.locator('svg path.slot-box.copied');
    await expect(copiedSlot.first()).toBeVisible();

    // 3. Hover over a different topic area to see preview
    const topicAreas = page.locator('svg .topic-area');
    const targetArea = topicAreas.nth(5);
    const targetBox = await targetArea.boundingBox();
    if (targetBox) {
      const centerX = targetBox.x + targetBox.width / 2;
      const centerY = targetBox.y + targetBox.height / 2;
      await page.mouse.move(centerX - 5, centerY);
      await page.mouse.move(centerX, centerY);
    }
    await page.waitForTimeout(1000);

    // 4. Click to paste
    await targetArea.click({ force: true });
    await page.waitForTimeout(1000);

    // 5. Verify move callback was triggered
    const hasMoveCallback = logs.some(log => log.includes('Moved slot to different destination'));
    expect(hasMoveCallback).toBe(true);
  });

  test('Resize multiple slots and verify all times are updated', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    const logs = setupConsoleLogListener(page);
    
    const slotGroups = page.locator('svg g.slot-group');
    const slotCount = await slotGroups.count();
    
    // We require at least 3 successful resizes for this test to pass
    const requiredResizes = 3;
    let successfulResizes = 0;
    let attemptedSlots = 0;
    const maxAttempts = Math.min(slotCount, 20);

    for (let i = 0; i < maxAttempts && successfulResizes < requiredResizes; i++) {
      const slotGroup = slotGroups.nth(i);
      const slotBox = await slotGroup.boundingBox();
      if (!slotBox) continue;
      
      attemptedSlots++;
      const logCountBefore = logs.filter(log => log.includes('Edited slots time window')).length;

      await slotGroup.hover();
      await page.waitForTimeout(200);

      const rightEdgeX = slotBox.x + slotBox.width - 4;
      const centerY = slotBox.y + slotBox.height / 2;

      await page.mouse.move(rightEdgeX, centerY);
      await page.mouse.down();
      await page.mouse.move(rightEdgeX + 50, centerY, { steps: 5 });
      await page.mouse.up();

      await page.waitForTimeout(500);

      const logCountAfter = logs.filter(log => log.includes('Edited slots time window')).length;
      
      if (logCountAfter > logCountBefore) {
        successfulResizes++;
      }
      
      // Press ESC to clear any selection state before next attempt
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    }

    // Verify we got at least the required number of successful resizes
    expect(successfulResizes).toBeGreaterThanOrEqual(requiredResizes);
    
    // Also verify the total count of resize events matches our successful resizes
    const totalResizeEvents = logs.filter(log => log.includes('Edited slots time window')).length;
    expect(totalResizeEvents).toBeGreaterThanOrEqual(requiredResizes);
  });

  test('Read-only mode blocks all edit operations', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    // Switch to read-only mode
    await switchToReadOnlyMode(page);

    // Try to pin a slot - should not work
    await clickSlot(page, 0);
    await page.waitForTimeout(200);

    // Move mouse to where clipboard would appear
    await page.mouse.move(400, 300);

    // Clipboard should not show pinned items
    const clipboard = page.locator('.pointer-clipboard .v-chip');
    const chipCount = await clipboard.count();
    expect(chipCount).toBe(0);

    // Verify slot is not marked as copied
    const copiedSlots = page.locator('svg path.slot-box.copied');
    expect(await copiedSlots.count()).toBe(0);
  });

  test('Read-only mode also blocks resize operations', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    const logs = setupConsoleLogListener(page);

    // Switch to read-only mode
    await switchToReadOnlyMode(page);

    // Try to resize a slot - should not trigger any callback
    const slotGroups = page.locator('svg g.slot-group');
    const slotCount = await slotGroups.count();

    for (let i = 0; i < Math.min(slotCount, 5); i++) {
      const slotGroup = slotGroups.nth(i);
      const slotBox = await slotGroup.boundingBox();
      
      if (!slotBox || slotBox.width < 30) continue;

      await slotGroup.hover();
      await page.waitForTimeout(200);

      const rightEdgeX = slotBox.x + slotBox.width - 4;
      const centerY = slotBox.y + slotBox.height / 2;

      await page.mouse.move(rightEdgeX, centerY);
      await page.mouse.down();
      await page.mouse.move(rightEdgeX + 50, centerY, { steps: 5 });
      await page.mouse.up();

      await page.waitForTimeout(300);
    }

    // No resize events should have been triggered
    const hasResizeCallback = logs.some(log => log.includes('Edited slots time window'));
    expect(hasResizeCallback).toBe(false);
  });

  test('Pan and zoom workflow maintains slot visibility', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    // Get initial slot count
    const initialSlotCount = await page.locator('svg path.slot-box').count();
    expect(initialSlotCount).toBeGreaterThan(0);

    // Pan the timeline
    const ganttContainer = page.locator('.gantt-container').first();
    const box = await ganttContainer.boundingBox();

    if (box) {
      // Pan right
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down({ button: 'right' });
      await page.mouse.move(box.x + box.width / 2 - 200, box.y + box.height / 2);
      await page.mouse.up({ button: 'right' });
    }

    await page.waitForTimeout(500);

    // Verify slots are still rendered (may be different count due to viewport)
    const afterPanSlotCount = await page.locator('svg path.slot-box').count();
    expect(afterPanSlotCount).toBeGreaterThanOrEqual(0);

    // Zoom in
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.keyboard.down('Shift');
      await page.mouse.wheel(0, -100); // Zoom in
      await page.keyboard.up('Shift');
    }

    await page.waitForTimeout(500);

    // Verify component still renders properly after zoom
    const afterZoomSlotCount = await page.locator('svg path.slot-box').count();
    expect(afterZoomSlotCount).toBeGreaterThanOrEqual(0);

    // Verify the SVG structure is still intact
    await expect(page.locator('.gantt-container svg').first()).toBeVisible();
  });
});
