import { test, expect } from '@playwright/test';
import { waitForChartLoad, setupConsoleLogListener } from './helpers';

test.describe('Time Navigation', () => {

  test('Pan timeline with right-click drag', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    const logs = setupConsoleLogListener(page);

    // Get the gantt container
    const ganttContainer = page.locator('.gantt-container').first();
    const box = await ganttContainer.boundingBox();
    expect(box).not.toBeNull();

    if (box) {
      // Right-click drag
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down({ button: 'right' });
      await page.mouse.move(box.x + box.width / 2 - 100, box.y + box.height / 2);
      await page.mouse.up({ button: 'right' });
    }

    await page.waitForTimeout(300);

    // Check for navigation callback
    const navCallbacks = logs.filter(log => log.includes('Navigated to new time window'));
    expect(navCallbacks.length).toBe(1);
  });

  test('Pan timeline with Shift+drag', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    const logs = setupConsoleLogListener(page);

    // Get the gantt container
    const ganttContainer = page.locator('.gantt-container').first();
    const box = await ganttContainer.boundingBox();
    expect(box).not.toBeNull();

    if (box) {
      // Shift+drag
      await page.keyboard.down('Shift');
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 - 100, box.y + box.height / 2);
      await page.mouse.up();
      await page.keyboard.up('Shift');
    }

    await page.waitForTimeout(300);

    // Check for navigation callback
    const navCallbacks = logs.filter(log => log.includes('Navigated to new time window'));
    expect(navCallbacks.length).toBe(1);
  });

  test('Horizontal scroll changes time window', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    const logs = setupConsoleLogListener(page);

    // Get the gantt container
    const ganttContainer = page.locator('.gantt-container').first();
    const box = await ganttContainer.boundingBox();
    expect(box).not.toBeNull();

    if (box) {
      // Horizontal wheel scroll
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(100, 0); // Horizontal scroll
    }

    await page.waitForTimeout(500);

    // Check for navigation callback
    const navCallbacks = logs.filter(log => log.includes('Navigated to new time window'));
    expect(navCallbacks.length).toBe(1);
  });

  test('Zoom in with scroll wheel + Shift', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    const logs = setupConsoleLogListener(page);

    // Get the gantt container
    const ganttContainer = page.locator('.gantt-container').first();
    const box = await ganttContainer.boundingBox();

    const firstSlotWidth = await page.locator('svg path.slot-box').nth(1).boundingBox().then(b => b?.width || 0);
    expect(firstSlotWidth).toBeGreaterThan(0);

    if (box) {
      // Shift + vertical scroll for zoom
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.keyboard.down('Shift');
      await page.mouse.wheel(0, -300); // Vertical scroll with Shift
      await page.keyboard.up('Shift');
    }

    await page.waitForTimeout(500);

    // Check for navigation callback (zoom changes time window)
    const navCallbacks = logs.filter(log => log.includes('Navigated to new time window'));
    expect(navCallbacks.length).toBe(1);

    const zoomedSlotWidth = await page.locator('svg path.slot-box').nth(1).boundingBox().then(b => b?.width || 0);
    expect(zoomedSlotWidth).toBeGreaterThan(firstSlotWidth);
  });
  
  test('Zoom out with scroll wheel + Shift', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    const logs = setupConsoleLogListener(page);

    // Get the gantt container
    const ganttContainer = page.locator('.gantt-container').first();
    const box = await ganttContainer.boundingBox();

    const firstSlotWidth = await page.locator('svg path.slot-box').nth(1).boundingBox().then(b => b?.width || 0);
    expect(firstSlotWidth).toBeGreaterThan(0);

    if (box) {
      // Shift + vertical scroll for zoom
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.keyboard.down('Shift');
      await page.mouse.wheel(0, 300); // Vertical scroll with Shift
      await page.keyboard.up('Shift');
    }

    await page.waitForTimeout(500);

    // Check for navigation callback (zoom changes time window)
    const navCallbacks = logs.filter(log => log.includes('Navigated to new time window'));
    expect(navCallbacks.length).toBe(1);

    const zoomedSlotWidth = await page.locator('svg path.slot-box').nth(1).boundingBox().then(b => b?.width || 0);
    expect(zoomedSlotWidth).toBeGreaterThan(0);
    expect(zoomedSlotWidth).toBeLessThan(firstSlotWidth);
  });

});
