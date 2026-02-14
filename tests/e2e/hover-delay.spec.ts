import { test, expect } from '@playwright/test';
import { waitForChartLoad, getFirstSlot, setupConsoleLogListener } from './helpers';

test.describe('Hover Delay Mechanism', () => {

  test('Hover for less than 500ms does not emit onHoverOnSlot', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    const logs = setupConsoleLogListener(page);

    // Hover on a slot briefly (200ms)
    const slot = await getFirstSlot(page);
    await slot.hover();
    await page.waitForTimeout(200);

    // Move away before 500ms delay triggers
    await page.mouse.move(0, 0);
    await page.waitForTimeout(400);

    // Verify no hover callback was emitted
    const hasHoverCallback = logs.some(log => log.includes('Hovering on slot'));
    expect(hasHoverCallback).toBe(false);
  });

  test('Hover for more than 500ms emits onHoverOnSlot', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    const logs = setupConsoleLogListener(page);

    // Hover on a slot for longer than 500ms
    const slot = await getFirstSlot(page);
    await slot.hover();
    await page.waitForTimeout(700);

    // Verify hover callback was emitted
    const hasHoverCallback = logs.some(log => log.includes('Hovering on slot'));
    expect(hasHoverCallback).toBe(true);
  });

  test('Moving between slots resets the hover timer', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    const logs = setupConsoleLogListener(page);

    const slots = page.locator('svg g.slot-group');

    // Hover on first slot for 300ms (under threshold)
    await slots.nth(0).hover();
    await page.waitForTimeout(300);

    // Move to second slot - timer should reset
    await slots.nth(1).hover();
    await page.waitForTimeout(300);

    // Total time is 600ms but timer should have reset, so no hover event for slot 0
    // and not enough time on slot 1 yet
    const hoverLogs = logs.filter(log => log.includes('Hovering on slot'));
    expect(hoverLogs.length).toBe(0);

    // Wait for the remaining time on slot 1
    await page.waitForTimeout(300);

    // Now slot 1 should have triggered
    const hoverLogsAfter = logs.filter(log => log.includes('Hovering on slot'));
    expect(hoverLogsAfter.length).toBe(1);
  });
});
