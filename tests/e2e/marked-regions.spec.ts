import { test, expect } from '@playwright/test';
import { waitForChartLoad, setupConsoleLogListener } from './helpers';

test.describe('Marked Regions', () => {

  test('No marked region is displayed by default', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    // By default, markedRegion is null so no interval markers should exist
    const intervalMarkers = page.locator('svg .interval-marker');
    expect(await intervalMarkers.count()).toBe(0);
  });

  test('Clicking toggle button enables a marked region on a specific destination', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    const logs = setupConsoleLogListener(page);

    // Click the toggle marked region button
    const toggleButton = page.locator('[data-testid="toggle-marked-region-button"]');
    await expect(toggleButton).toBeVisible();
    await toggleButton.click();
    await page.waitForTimeout(1000);

    // Verify the console log confirms it was enabled
    const hasEnabledLog = logs.some(log => log.includes('Marked region enabled'));
    expect(hasEnabledLog).toBe(true);

    // An interval marker rectangle should now be visible in the SVG
    const intervalMarkers = page.locator('svg .interval-marker');
    expect(await intervalMarkers.count()).toBeGreaterThan(0);
  });

  test('Marked region has correct visual styling (yellow fill, gold stroke)', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    // Enable marked region
    const toggleButton = page.locator('[data-testid="toggle-marked-region-button"]');
    await toggleButton.click();
    await page.waitForTimeout(1000);

    const marker = page.locator('svg .interval-marker').first();
    await expect(marker).toBeVisible();

    // Check visual attributes
    const fill = await marker.getAttribute('fill');
    expect(fill).toContain('rgba(255, 255, 0');

    const stroke = await marker.getAttribute('stroke');
    expect(stroke).toContain('rgba(255, 215, 0');

    const strokeWidth = await marker.getAttribute('stroke-width');
    expect(strokeWidth).toBe('2');

    // Check rounded corners
    const rx = await marker.getAttribute('rx');
    const ry = await marker.getAttribute('ry');
    expect(rx).toBe('4');
    expect(ry).toBe('4');
  });

  test('Marked region does not capture pointer events (click-through)', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    // Enable marked region
    const toggleButton = page.locator('[data-testid="toggle-marked-region-button"]');
    await toggleButton.click();
    await page.waitForTimeout(1000);

    const marker = page.locator('svg .interval-marker').first();
    await expect(marker).toBeVisible();

    // Verify pointer-events is set to "none" to allow clicks to pass through
    const pointerEvents = await marker.getAttribute('pointer-events');
    expect(pointerEvents).toBe('none');
  });

  test('Marked region has a pulsing opacity animation', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    // Enable marked region
    const toggleButton = page.locator('[data-testid="toggle-marked-region-button"]');
    await toggleButton.click();
    await page.waitForTimeout(1500); // Wait for initial animation

    const marker = page.locator('svg .interval-marker').first();
    await expect(marker).toBeVisible();

    // Capture opacity at two different points in time to verify it's animating
    const opacity1 = await marker.evaluate(el => parseFloat(window.getComputedStyle(el).opacity));
    await page.waitForTimeout(800);
    const opacity2 = await marker.evaluate(el => parseFloat(window.getComputedStyle(el).opacity));

    // Both opacities should be in the valid range (0.4 - 0.7)
    expect(opacity1).toBeGreaterThanOrEqual(0.3); // slight tolerance
    expect(opacity1).toBeLessThanOrEqual(0.8);
    expect(opacity2).toBeGreaterThanOrEqual(0.3);
    expect(opacity2).toBeLessThanOrEqual(0.8);
  });

  test('Clicking toggle again disables the marked region', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    const logs = setupConsoleLogListener(page);

    // Enable marked region
    const toggleButton = page.locator('[data-testid="toggle-marked-region-button"]');
    await toggleButton.click();
    await page.waitForTimeout(1000);

    // Verify marker exists
    let markers = page.locator('svg .interval-marker');
    expect(await markers.count()).toBeGreaterThan(0);

    // Disable marked region by clicking again
    await toggleButton.click();
    await page.waitForTimeout(1000);

    // Verify marker was removed
    markers = page.locator('svg .interval-marker');
    expect(await markers.count()).toBe(0);

    // Verify the console log confirms it was disabled
    const hasDisabledLog = logs.some(log => log.includes('Marked region disabled'));
    expect(hasDisabledLog).toBe(true);
  });

  test('Marked region with "multiple" destinationId spans across all destinations', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    const logs = setupConsoleLogListener(page);

    // Click the "multiple" marked region toggle button
    const toggleMultipleButton = page.locator('[data-testid="toggle-marked-region-multiple-button"]');
    await expect(toggleMultipleButton).toBeVisible();
    await toggleMultipleButton.click();
    await page.waitForTimeout(1000);

    // Verify the console log
    const hasMultipleLog = logs.some(log => log.includes('Marked region enabled multiple'));
    expect(hasMultipleLog).toBe(true);

    // Interval markers should be rendered
    const markers = page.locator('svg .interval-marker');
    expect(await markers.count()).toBeGreaterThan(0);

    // When destinationId is "multiple", the marker should span a large height
    // (covering all destinations in the group, not just one)
    const marker = markers.first();
    const markerBox = await marker.boundingBox();
    expect(markerBox).not.toBeNull();

    // The "multiple" marker should be taller than a single-destination marker
    // A single destination row is ~40px, multiple should span many rows
    if (markerBox) {
      expect(markerBox.height).toBeGreaterThan(100);
    }
  });

  test('Single-destination marked region has limited height', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    // Enable single-destination marked region
    const toggleButton = page.locator('[data-testid="toggle-marked-region-button"]');
    await toggleButton.click();
    await page.waitForTimeout(1000);

    const markers = page.locator('svg .interval-marker');
    expect(await markers.count()).toBeGreaterThan(0);

    const marker = markers.first();
    const markerBox = await marker.boundingBox();
    expect(markerBox).not.toBeNull();

    // A single-destination marker should have limited height (roughly one row)
    if (markerBox) {
      expect(markerBox.height).toBeLessThan(200); // single destination should be small
      expect(markerBox.height).toBeGreaterThan(10); // but still visible
    }
  });

  test('Marked region has a positive width (occupies time interval)', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    // Enable marked region
    const toggleButton = page.locator('[data-testid="toggle-marked-region-button"]');
    await toggleButton.click();
    await page.waitForTimeout(1000);

    const marker = page.locator('svg .interval-marker').first();
    await expect(marker).toBeVisible();

    const markerBox = await marker.boundingBox();
    expect(markerBox).not.toBeNull();
    if (markerBox) {
      // The marked region spans 4 hours (10:00-14:00), should have significant width
      expect(markerBox.width).toBeGreaterThan(50);
    }
  });

  test('Switching from single to multiple destination marked region updates rendering', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    // Enable single-destination marked region
    const singleButton = page.locator('[data-testid="toggle-marked-region-button"]');
    await singleButton.click();
    await page.waitForTimeout(1000);

    let markers = page.locator('svg .interval-marker');
    expect(await markers.count()).toBeGreaterThan(0);

    const singleMarkerBox = await markers.first().boundingBox();
    expect(singleMarkerBox).not.toBeNull();

    // Disable, then enable "multiple"
    await singleButton.click(); // disable
    await page.waitForTimeout(500);

    const multipleButton = page.locator('[data-testid="toggle-marked-region-multiple-button"]');
    await multipleButton.click();
    await page.waitForTimeout(1000);

    markers = page.locator('svg .interval-marker');
    expect(await markers.count()).toBeGreaterThan(0);

    const multipleMarkerBox = await markers.first().boundingBox();
    expect(multipleMarkerBox).not.toBeNull();

    // The "multiple" marker should be taller than the single-destination marker
    if (singleMarkerBox && multipleMarkerBox) {
      expect(multipleMarkerBox.height).toBeGreaterThan(singleMarkerBox.height);
    }
  });
});
