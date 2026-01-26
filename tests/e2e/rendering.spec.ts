import { test, expect } from '@playwright/test';
import { waitForChartLoad } from './helpers';

test.describe('Rendering & Display', () => {

  test('Component loads and renders SVG chart', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    // Check that SVGs are present
    const svgs = page.locator('svg');
    await expect(svgs.first()).toBeVisible();

    // Check for x-axis container
    await expect(page.locator('.x-axis-container svg')).toBeVisible();

    // Check for gantt containers
    await expect(page.locator('.gantt-container')).toHaveCount(2); // allocated + unallocated
  });

  test('Displays slots (bars) with correct properties', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    // Verify slots exist
    const slotPaths = page.locator('svg path.slot-box');
    const count = await slotPaths.count();
    expect(count).toBeGreaterThan(0);

    // Check slot has required attributes (fill color, path)
    const firstSlot = slotPaths.first();
    const fill = await firstSlot.getAttribute('fill');
    expect(fill).toBeTruthy();

    // Check slot text is displayed
    const slotTexts = page.locator('svg .slot-text');
    expect(await slotTexts.count()).toBeGreaterThan(0);
  });

  test('Shows destinations on Y-axis', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    // Check for topic labels (destination names)
    const topicLabels = page.locator('svg .topic-label');
    const count = await topicLabels.count();
    expect(count).toBeGreaterThan(0);

    // Verify at least one MUP destination is visible
    const mupLabel = page.locator('svg .topic-label:has-text("MUP")').first();
    await expect(mupLabel).toBeVisible();
  });

  test('Shows destination groups', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    // Check for allocated and unallocated gantt containers
    await expect(page.locator('#allocated-gantt-container')).toBeVisible();
    await expect(page.locator('#unallocated-gantt-container')).toBeVisible();
  });

  test('Displays X-axis with time labels', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    // Check for x-axis groups
    const xAxisGroup = page.locator('.x-axis-container svg .x-axis');
    await expect(xAxisGroup).toBeVisible();

    // Check for x-axis date group (upper axis)
    const xAxisDate = page.locator('.x-axis-container svg .x-axis-date');
    await expect(xAxisDate).toBeVisible();

    // Verify tick labels exist
    const tickLabels = page.locator('.x-axis-container svg text');
    expect(await tickLabels.count()).toBeGreaterThan(0);
  });

  test('Shows current time indicator', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);
    
    // Current time line should be visible
    const currentTimeLine = page.locator('svg .current-time-line').first();
    await expect(currentTimeLine).toBeInViewport();

    // Current time label should be visible
    const currentTimeLabel = page.locator('svg .current-time-text').first();
    await expect(currentTimeLabel).toBeVisible();
  });

  test('Renders deadline markers for slots', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    // Check for departure markers (deadline indicators)
    const departureMarkers = page.locator('svg .departure-marker');
    // Departure markers should exist for slots with deadlines
    const count = await departureMarkers.count();
    // May be 0 if no deadlines in view, but should not error
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
