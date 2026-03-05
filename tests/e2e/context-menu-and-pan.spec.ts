import { test, expect } from '@playwright/test';
import { waitForChartLoad, setupConsoleLogListener } from './helpers';

test.describe('Context Menu Suppression and Pan Edge Cases', () => {

  test('Right-click on chart area does not open browser context menu', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    // Set up a listener on the document to capture the contextmenu event
    // and check if it was prevented by D3's handler on the chart group
    await page.evaluate(() => {
      (window as any).__contextMenuPrevented = null;
      document.addEventListener('contextmenu', (e) => {
        (window as any).__contextMenuPrevented = e.defaultPrevented;
      }, { once: true });
    });

    // Right-click on the chart area using Playwright (targets the actual D3 chart group)
    const ganttContainer = page.locator('.gantt-container').first();
    const box = await ganttContainer.boundingBox();
    expect(box).not.toBeNull();

    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
      await page.waitForTimeout(200);
    }

    // Check that the contextmenu event was prevented by the D3 handler
    const wasPrevented = await page.evaluate(() => (window as any).__contextMenuPrevented);
    expect(wasPrevented).toBe(true);
  });

  test('Right-click without moving does not trigger pan callback', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    const logs = setupConsoleLogListener(page);

    // Right-click on the chart without moving the mouse
    const ganttContainer = page.locator('.gantt-container').first();
    const box = await ganttContainer.boundingBox();
    expect(box).not.toBeNull();

    if (box) {
      const clickX = box.x + box.width / 2;
      const clickY = box.y + box.height / 2;

      // Move to position first
      await page.mouse.move(clickX, clickY);
      await page.waitForTimeout(100);

      // Right-click and immediately release without moving
      await page.mouse.down({ button: 'right' });
      await page.waitForTimeout(100);
      await page.mouse.up({ button: 'right' });

      await page.waitForTimeout(500);
    }

    // Verify no navigation callback was triggered
    const hasNavigationCallback = logs.some(log => log.includes('Navigated to new time window'));
    expect(hasNavigationCallback).toBe(false);
  });

  test('Right-click with mouse movement triggers pan callback', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    const logs = setupConsoleLogListener(page);

    const ganttContainer = page.locator('.gantt-container').first();
    const box = await ganttContainer.boundingBox();
    expect(box).not.toBeNull();

    if (box) {
      const startX = box.x + box.width / 2;
      const startY = box.y + box.height / 2;

      // Right-click and drag
      await page.mouse.move(startX, startY);
      await page.mouse.down({ button: 'right' });
      await page.mouse.move(startX - 100, startY, { steps: 5 });
      await page.mouse.up({ button: 'right' });

      await page.waitForTimeout(500);
    }

    // Verify navigation callback was triggered
    const hasNavigationCallback = logs.some(log => log.includes('Navigated to new time window'));
    expect(hasNavigationCallback).toBe(true);
  });
});
