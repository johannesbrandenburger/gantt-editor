import { test, expect } from '@playwright/test';
import { waitForChartLoad, clickSlot, setupConsoleLogListener } from './helpers';

test.describe('Clipboard Preview and Floating UI', () => {

  test('Floating clipboard follows cursor position', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    // Pin a slot
    await clickSlot(page, 0);
    await page.waitForTimeout(300);

    // Move mouse to specific position in chart area
    const chartContainer = page.locator('.chart-container');
    const chartBox = await chartContainer.boundingBox();
    expect(chartBox).not.toBeNull();

    if (chartBox) {
      const targetX = chartBox.x + 300;
      const targetY = chartBox.y + 150;
      await page.mouse.move(targetX, targetY);
      await page.waitForTimeout(200);

      // Verify clipboard is visible
      const clipboard = page.locator('.pointer-clipboard');
      await expect(clipboard).toBeVisible();

      // The clipboard should be positioned near the cursor (offset by 15px)
      const clipboardBox = await clipboard.boundingBox();
      expect(clipboardBox).not.toBeNull();
      if (clipboardBox) {
        // Allow some tolerance for the 15px offset
        expect(clipboardBox.x).toBeGreaterThan(targetX - 5);
        expect(clipboardBox.x).toBeLessThan(targetX + 30);
      }
    }
  });

  test('Floating clipboard hides when mouse leaves chart container', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    // Pin a slot
    await clickSlot(page, 0);
    await page.waitForTimeout(300);

    // Move mouse inside chart to show clipboard
    const chartContainer = page.locator('.chart-container');
    const chartBox = await chartContainer.boundingBox();
    expect(chartBox).not.toBeNull();

    if (chartBox) {
      // Hover inside the chart container
      await page.mouse.move(chartBox.x + chartBox.width / 2, chartBox.y + chartBox.height / 2);
      await page.waitForTimeout(200);

      const clipboard = page.locator('.pointer-clipboard');
      await expect(clipboard).toBeVisible();

      // Move mouse clearly below the chart container to trigger mouseleave
      await page.mouse.move(chartBox.x + chartBox.width / 2, chartBox.y + chartBox.height + 100);
      await page.waitForTimeout(300);

      // Clipboard uses v-if so it should be removed from DOM
      await expect(clipboard).not.toBeVisible();
    }
  });

  test('Hovering over a different destination shows preview slots', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    // Pin a slot to clipboard
    await clickSlot(page, 0);
    await expect(page.locator('svg path.slot-box.copied')).toHaveCount(1);

    const clipboard = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('pointerClipboard') || '[]') as Array<{ destinationId: string }>;
    });
    expect(clipboard.length).toBeGreaterThan(0);
    const sourceDestinationId = clipboard[0].destinationId;

    // Find a topic area with a destination id different from the pinned slot destination
    const topicAreas = page.locator('svg .topic-area');
    const topicCount = await topicAreas.count();
    let targetIndex = -1;
    for (let i = 0; i < topicCount; i++) {
      const topicId = await topicAreas.nth(i).evaluate(el => (el as any).__data__?.id as string | undefined);
      if (topicId && topicId !== sourceDestinationId) {
        targetIndex = i;
        break;
      }
    }
    expect(targetIndex).toBeGreaterThanOrEqual(0);

    const targetArea = topicAreas.nth(targetIndex);
    const targetBox = await targetArea.boundingBox();
    expect(targetBox).not.toBeNull();
    if (targetBox) {
      // Move within the topic-area's left label zone to avoid slot overlays intercepting events.
      await page.mouse.move(targetBox.x + 20, targetBox.y + targetBox.height / 2);
    }

    const previewSlots = page.locator('svg path.slot-box[fill*="diagonal-stripe-2"]');
    await expect.poll(async () => await previewSlots.count()).toBeGreaterThan(0);
  });

  test('Toggle pin: clicking a pinned slot with Ctrl unpins it', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    // Pin first slot
    await clickSlot(page, 0);
    await page.waitForTimeout(300);

    // Verify it's pinned
    let copiedSlots = await page.locator('svg path.slot-box.copied').count();
    expect(copiedSlots).toBe(1);

    // Ctrl+click the same slot to unpin it
    const slots = page.locator('svg g.slot-group');
    await slots.nth(0).click({ modifiers: ['Meta'] });
    await page.waitForTimeout(300);

    // The slot should be unpinned
    copiedSlots = await page.locator('svg path.slot-box.copied').count();
    expect(copiedSlots).toBe(0);
  });

  test('Clicking slot when clipboard has items pastes to that slot destination', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    const logs = setupConsoleLogListener(page);

    // Pin first slot
    await clickSlot(page, 0);
    await page.waitForTimeout(300);

    // Verify it's pinned
    const copiedBefore = await page.locator('svg path.slot-box.copied').count();
    expect(copiedBefore).toBe(1);

    // Click on a different slot (without Ctrl/Meta) - this should paste to that slot's destination
    const slots = page.locator('svg g.slot-group');
    await slots.nth(5).click();
    await page.waitForTimeout(500);

    // The clipboard should be cleared (paste happened)
    const copiedAfter = await page.locator('svg path.slot-box.copied').count();
    expect(copiedAfter).toBe(0);

    // Verify move callback was triggered
    const hasMoveCallback = logs.some(log => log.includes('Moved slot to different destination'));
    expect(hasMoveCallback).toBe(true);
  });

  test('Clipboard displays correct slot display names in chips', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    // Pin first slot
    await clickSlot(page, 0);
    await page.waitForTimeout(300);

    // Move mouse into chart
    await page.mouse.move(400, 300);

    // Get clipboard chip text
    const clipboard = page.locator('.pointer-clipboard');
    await expect(clipboard).toBeVisible({ timeout: 2000 });

    const chips = clipboard.locator('.v-chip');
    expect(await chips.count()).toBe(1);

    // Chip should contain a slot display name (FL followed by a number)
    const chipText = await chips.first().textContent();
    expect(chipText).toMatch(/FL\d+/);
  });
});
