import { test, expect } from '@playwright/test';

test('Gantt editor loads and displays interactive controls', async ({ page }) => {
  // Navigate to the main page
  await page.goto('/');

  // Wait for the Gantt editor component to be visible
  await page.waitForSelector('svg', { timeout: 5000 });

  // Check that SVGs (gantt chart) are present
  const svgs = page.locator('svg');
  await expect(svgs.first()).toBeVisible();

  // Verify that the gantt chart contains slot paths (bars representing scheduled items)
  const slotPaths = page.locator('svg path.slot-box');
  const count = await slotPaths.count();
  expect(count).toBeGreaterThan(0);
});
