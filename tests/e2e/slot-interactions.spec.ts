import { test, expect } from '@playwright/test';
import { waitForChartLoad, clickSlot, getFirstSlot, setupConsoleLogListener } from './helpers';

test.describe('Slot Interactions', () => {

  test('Click on slot emits onClickOnSlot event', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    const logs = setupConsoleLogListener(page);

    // Click on a slot
    await clickSlot(page, 0);

    // Wait for event
    await page.waitForTimeout(500);

    // Check console for the callback log
    const hasClickCallback = logs.some(log => log.includes('Opening details for slot'));
    expect(hasClickCallback).toBe(true);
  });

  test('Hover on slot emits onHoverOnSlot event (after delay)', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    const logs = setupConsoleLogListener(page);

    // Hover on a slot
    const slot = await getFirstSlot(page);
    await slot.hover();

    // Wait for hover delay (500ms in the component)
    await page.waitForTimeout(700);

    // Check console for the callback log
    const hasHoverCallback = logs.some(log => log.includes('Hovering on slot'));
    expect(hasHoverCallback).toBe(true);
  });

  test('Double-click on slot emits onDoubleClickOnSlot event', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    const logs = setupConsoleLogListener(page);

    // Double-click on a slot
    const slot = await getFirstSlot(page);
    await slot.dblclick();

    await page.waitForTimeout(300);

    // Check console for the callback log
    const hasDoubleClickCallback = logs.some(log => log.includes('Double clicked on slot'));
    expect(hasDoubleClickCallback).toBe(true);
  });

  test('Right-click on slot emits onContextClickOnSlot event', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    const logs = setupConsoleLogListener(page);

    // Right-click on a slot
    const slot = await getFirstSlot(page);
    await slot.click({ button: 'right' });

    await page.waitForTimeout(300);

    // Check console for the callback log
    const hasContextClickCallback = logs.some(log => log.includes('Right clicked on slot'));
    expect(hasContextClickCallback).toBe(true);
  });
});
