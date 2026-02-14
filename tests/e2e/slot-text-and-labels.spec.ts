import { test, expect } from '@playwright/test';
import { waitForChartLoad } from './helpers';

test.describe('Slot Text, Topic Labels, and Slot Name Lists', () => {

  test('Slot bars display their displayName as text', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    // Check that slot text elements exist and contain flight numbers
    const slotTexts = page.locator('svg .slot-text div');
    const textCount = await slotTexts.count();
    expect(textCount).toBeGreaterThan(0);

    // Verify at least one slot text matches the FL#### pattern
    let foundFlightNumber = false;
    for (let i = 0; i < Math.min(textCount, 10); i++) {
      const text = await slotTexts.nth(i).textContent();
      if (text && /FL\d+/.test(text)) {
        foundFlightNumber = true;
        break;
      }
    }
    expect(foundFlightNumber).toBe(true);
  });

  test('Topic labels show destination names', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    const topicLabels = page.locator('svg .topic-label');
    const labelCount = await topicLabels.count();
    expect(labelCount).toBeGreaterThan(0);

    // All labels should end with ▼ (expanded state) and contain "MUP" or "UNALLOCATED"
    let foundMup = false;
    for (let i = 0; i < labelCount; i++) {
      const text = await topicLabels.nth(i).textContent();
      if (text && text.includes('MUP')) {
        foundMup = true;
        expect(text).toContain('▼');
        break;
      }
    }
    expect(foundMup).toBe(true);
  });

  test('Slot names are listed below each topic label', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    // Check for topic-slot-names elements
    const slotNameLabels = page.locator('svg .topic-slot-names');
    const count = await slotNameLabels.count();
    expect(count).toBeGreaterThan(0);

    // At least one should have visible content with flight numbers
    let foundSlotNames = false;
    for (let i = 0; i < Math.min(count, 10); i++) {
      const content = await slotNameLabels.nth(i).locator('div').textContent();
      if (content && content.includes('FL')) {
        foundSlotNames = true;
        break;
      }
    }
    expect(foundSlotNames).toBe(true);
  });

  test('UNALLOCATED topic label exists in the chart', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    // Check that UNALLOCATED appears in the unallocated gantt container
    const unallocatedContainer = page.locator('#unallocated-gantt-container');
    await expect(unallocatedContainer).toBeVisible();

    const unallocatedLabel = unallocatedContainer.locator('.topic-label');
    const count = await unallocatedLabel.count();
    expect(count).toBeGreaterThan(0);

    let foundUnallocated = false;
    for (let i = 0; i < count; i++) {
      const text = await unallocatedLabel.nth(i).textContent();
      if (text && text.includes('UNALLOCATED')) {
        foundUnallocated = true;
        break;
      }
    }
    expect(foundUnallocated).toBe(true);
  });
});
