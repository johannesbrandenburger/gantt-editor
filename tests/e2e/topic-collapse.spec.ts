import { test, expect } from '@playwright/test';
import { waitForChartLoad } from './helpers';

/**
 * Helper: click in the label area of a topic-area rect.
 * The topic-area rect extends from x=-200 (margin.left) to the full chart width.
 * The collapse handler fires when d3.pointer(event)[0] < 0, i.e. when the click
 * lands in the left margin area. We click near the left edge of the topic-area
 * bounding box to land in that margin zone.
 */
async function clickTopicLabel(page: import('@playwright/test').Page, index: number) {
  const topicAreas = page.locator('svg .topic-area');
  const area = topicAreas.nth(index);
  const box = await area.boundingBox();
  expect(box).not.toBeNull();
  if (box) {
    // Click near the left edge of the topic-area rect (within the label/margin zone)
    await page.mouse.click(box.x + 20, box.y + 10);
  }
}

test.describe('Topic Collapse/Expand', () => {

  test.beforeEach(async ({ page }) => {
    // Clear any previously collapsed topics from localStorage
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.removeItem('collapsedTopics');
    });
    await page.reload();
    await waitForChartLoad(page);
  });

  test('Clicking on a topic label collapses the destination', async ({ page }) => {
    // Find a topic label
    const topicLabels = page.locator('svg .topic-label');
    const labelCount = await topicLabels.count();
    expect(labelCount).toBeGreaterThan(0);

    // Get the first topic label text - it should end with ▼ (expanded)
    const firstLabel = topicLabels.first();
    const labelText = await firstLabel.textContent();
    expect(labelText).toContain('▼');

    // Click in the label area of the first topic-area to trigger collapse
    await clickTopicLabel(page, 0);
    await page.waitForTimeout(500);

    // After collapse, the label should show ► instead of ▼
    const updatedLabel = page.locator('svg .topic-label').first();
    const updatedText = await updatedLabel.textContent();
    expect(updatedText).toContain('►');
  });

  test('Clicking collapsed topic label expands it again', async ({ page }) => {
    // Click in the label area to collapse first topic
    await clickTopicLabel(page, 0);
    await page.waitForTimeout(500);

    // Verify it's collapsed
    let labelText = await page.locator('svg .topic-label').first().textContent();
    expect(labelText).toContain('►');

    // Click again to expand
    await clickTopicLabel(page, 0);
    await page.waitForTimeout(500);

    // Verify it's expanded again
    labelText = await page.locator('svg .topic-label').first().textContent();
    expect(labelText).toContain('▼');
  });

  test('Collapsed topic renders slots with reduced opacity', async ({ page }) => {
    // Collapse the first topic
    await clickTopicLabel(page, 0);
    await page.waitForTimeout(500);

    // Check that slot opacity is reduced for collapsed topics
    // Collapsed slots should have fill-opacity of 0.4
    const collapsedSlots = page.locator('svg path.slot-box');
    const slotCount = await collapsedSlots.count();

    // Find at least one slot with 0.4 opacity
    let foundReducedOpacity = false;
    for (let i = 0; i < Math.min(slotCount, 50); i++) {
      const opacity = await collapsedSlots.nth(i).getAttribute('fill-opacity');
      if (opacity === '0.4') {
        foundReducedOpacity = true;
        break;
      }
    }
    expect(foundReducedOpacity).toBe(true);
  });

  test('Collapse state persists in localStorage', async ({ page }) => {
    // Collapse a topic
    await clickTopicLabel(page, 0);
    await page.waitForTimeout(500);

    // Check localStorage
    const collapsedTopics = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('collapsedTopics') || '[]');
    });
    expect(collapsedTopics.length).toBeGreaterThan(0);

    // Expand it back
    await clickTopicLabel(page, 0);
    await page.waitForTimeout(500);

    // Check localStorage again - should be empty or not contain the topic
    const collapsedTopicsAfter = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('collapsedTopics') || '[]');
    });
    expect(collapsedTopicsAfter.length).toBe(collapsedTopics.length - 1);
  });
});
