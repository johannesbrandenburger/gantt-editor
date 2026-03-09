import { test, expect } from '@playwright/test';
import { waitForChartLoad } from './helpers';

test.describe('Flight Number Highlight', () => {
  test('Clicking a flight number on the left highlights the corresponding flight in the Gantt', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    const flightLabels = page.locator('svg .topic-slot-name');
    const labelCount = await flightLabels.count();
    expect(labelCount).toBeGreaterThan(0);

    const firstLabel = flightLabels.first();
    const selectedFlightNumber = ((await firstLabel.textContent()) || '').trim();
    expect(selectedFlightNumber).toMatch(/^FL\d{4}$/);

    const matchingSlotGroup = page.locator('svg g.slot-group', {
      has: page.locator('.slot-text div', { hasText: selectedFlightNumber }),
    }).first();

    await expect(matchingSlotGroup).toBeVisible();
    const matchingSlotBox = matchingSlotGroup.locator('path.slot-box');

    const classBefore = (await matchingSlotBox.getAttribute('class')) || '';
    expect(classBefore).not.toContain('highlighted-from-label');

    const labelBox = await firstLabel.boundingBox();
    expect(labelBox).not.toBeNull();
    if (labelBox) {
      await page.mouse.click(labelBox.x + labelBox.width / 2, labelBox.y + labelBox.height / 2);
    }

    await page.waitForTimeout(400);

    const classAfterFirstClick = (await matchingSlotBox.getAttribute('class')) || '';
    expect(classAfterFirstClick).toContain('highlighted-from-label');

    // Clicking the same label again toggles the highlight off.
    if (labelBox) {
      await page.mouse.click(labelBox.x + labelBox.width / 2, labelBox.y + labelBox.height / 2);
    }

    await page.waitForTimeout(400);

    const classAfterSecondClick = (await matchingSlotBox.getAttribute('class')) || '';
    expect(classAfterSecondClick).not.toContain('highlighted-from-label');
  });
});
