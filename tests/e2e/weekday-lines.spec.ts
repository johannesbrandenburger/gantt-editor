import { test, expect } from '@playwright/test';
import { waitForChartLoad, setupConsoleLogListener } from './helpers';

test.describe('Weekday Lines and Labels', () => {

  test('Weekday lines are rendered when time range spans multiple days', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    // The default view is today (1 day) which is < 14 days, so weekday overlay should show
    // However, if we zoom out to span multiple days, we should see weekday lines at midnight boundaries
    const ganttContainer = page.locator('.gantt-container').first();
    const box = await ganttContainer.boundingBox();

    if (box) {
      // Zoom out to see more days (Shift+scroll down)
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.keyboard.down('Shift');
      await page.mouse.wheel(0, 300); // Zoom out significantly
      await page.mouse.wheel(0, 300); // Zoom out more
      await page.keyboard.up('Shift');

      await page.waitForTimeout(1000);
    }

    // Check for weekday line elements
    const weekdayLines = page.locator('svg .weekday-line');
    const lineCount = await weekdayLines.count();
    expect(lineCount).toBeGreaterThan(0);

    // Weekday lines should have green stroke
    const firstLine = weekdayLines.first();
    const stroke = await firstLine.getAttribute('stroke');
    expect(stroke).toBe('#008000');
  });

  test('Weekday labels display day names', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    const ganttContainer = page.locator('.gantt-container').first();
    const box = await ganttContainer.boundingBox();

    if (box) {
      // Zoom out to see multiple days
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.keyboard.down('Shift');
      await page.mouse.wheel(0, 300);
      await page.mouse.wheel(0, 300);
      await page.keyboard.up('Shift');

      await page.waitForTimeout(1000);
    }

    // Check for weekday label elements
    const weekdayLabels = page.locator('svg .weekday-label');
    const labelCount = await weekdayLabels.count();
    expect(labelCount).toBeGreaterThan(0);

    // Labels should contain valid day names
    const validDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const firstLabelText = await weekdayLabels.first().textContent();
    expect(firstLabelText).not.toBeNull();
    expect(validDays).toContain(firstLabelText!.trim());
  });
});
