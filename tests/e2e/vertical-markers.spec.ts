import { test, expect } from '@playwright/test';
import { waitForChartLoad } from './helpers';

/** Uses `/small-example` fixed vertical marker color (see `src/pages/small-example.vue`). */
test.describe('Vertical markers', () => {
  test('Renders line and handle with configured color', async ({ page }) => {
    await page.goto('/small-example');
    await waitForChartLoad(page);

    const lines = page.locator('#allocated-gantt-container svg .gantt-vertical-marker-line');
    const handles = page.locator('#allocated-gantt-container svg .gantt-vertical-marker-handle');

    await expect(lines).toHaveCount(1);
    await expect(handles).toHaveCount(1);

    const lineStroke = await lines.getAttribute('stroke');
    const handleFill = await handles.getAttribute('fill');

    expect(lineStroke?.toLowerCase()).toBe('#00ff00');
    expect(handleFill?.toLowerCase()).toBe('#00ff00');
  });

  test('Vertical markers are present in each destination group chart', async ({ page }) => {
    await page.goto('/small-example');
    await waitForChartLoad(page);

    const allocated = page.locator('#allocated-gantt-container svg .gantt-vertical-marker-line');
    const unallocated = page.locator('#unallocated-gantt-container svg .gantt-vertical-marker-line');

    await expect(allocated).toHaveCount(1);
    await expect(unallocated).toHaveCount(1);
  });

  test('Dragging a vertical marker moves the line to a new time', async ({ page }) => {
    await page.goto('/small-example');
    await waitForChartLoad(page);

    const container = page.locator('#allocated-gantt-container');
    const line = container.locator('svg .gantt-vertical-marker-line');
    const hit = container.locator('svg .gantt-vertical-marker-hit');

    const x1Before = parseFloat((await line.getAttribute('x1')) || '');
    expect(Number.isFinite(x1Before)).toBe(true);

    const box = await hit.boundingBox();
    expect(box).not.toBeNull();

    const startX = box!.x + box!.width / 2;
    const startY = box!.y + box!.height / 2;
    const delta = 90;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + delta, startY, { steps: 10 });
    await page.mouse.up();

    await expect
      .poll(async () => {
        const v = parseFloat((await line.getAttribute('x1')) || '');
        return Number.isFinite(v) ? Math.abs(v - x1Before) : 0;
      }, { timeout: 8000 })
      .toBeGreaterThan(25);
  });
});
