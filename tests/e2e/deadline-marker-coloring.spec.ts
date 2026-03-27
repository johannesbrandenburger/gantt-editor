import { test, expect } from '@playwright/test';
import { waitForChartLoad } from './helpers';

/** Uses `/small-example` fixed `deadlineColor` / `secondaryDeadlineColor` (see `src/pages/small-example.vue`). */
test.describe('Deadline marker coloring', () => {
  test('STD and ETD endlines use deadlineColor and secondaryDeadlineColor', async ({ page }) => {
    await page.goto('/small-example');
    await waitForChartLoad(page);

    const endlines = page.locator('svg .departure-marker-endline');
    await expect(endlines).toHaveCount(2);

    const stdFill = await endlines.nth(0).getAttribute('fill');
    const etdFill = await endlines.nth(1).getAttribute('fill');

    expect(stdFill?.toLowerCase()).toBe('#9b59b6');
    expect(etdFill?.toLowerCase()).toBe('#e74c3c');
  });

  test('STD marker uses reduced opacity when STD and ETD differ', async ({ page }) => {
    await page.goto('/small-example');
    await waitForChartLoad(page);

    const endlines = page.locator('svg .departure-marker-endline');
    await expect(endlines).toHaveCount(2);

    const stdOpacity = await endlines.nth(0).getAttribute('opacity');
    const etdOpacity = await endlines.nth(1).getAttribute('opacity');

    expect(stdOpacity).toBe('0.6');
    expect(etdOpacity).toBe('1');
  });
});
