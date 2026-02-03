import { test, expect } from '@playwright/test';
import { waitForChartLoad, clickSlot, switchToReadOnlyMode } from './helpers';

test.describe('Read-Only Mode', () => {

  test('Toggle read-only mode via button', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    // Find the toggle button
    const toggleButton = page.locator('button:has-text("Mode")');
    await expect(toggleButton).toBeVisible();

    // Initially should be in Editable mode
    await expect(toggleButton).toContainText('Editable');

    // Click to toggle to read-only
    await toggleButton.click();
    await expect(toggleButton).toContainText('Read-Only');

    // Click again to toggle back
    await toggleButton.click();
    await expect(toggleButton).toContainText('Editable');
  });

  test('Slot resizing disabled in read-only mode', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    // Switch to read-only mode
    await switchToReadOnlyMode(page);

    // Try to resize a slot by hovering and dragging
    const slotGroup = page.locator('svg g.slot-group').first();
    const slotBox = await slotGroup.boundingBox();
    expect(slotBox).not.toBeNull();

    // Hover over the slot to make resize handles visible
    await slotGroup.hover();
    await page.waitForTimeout(200);

    // Try to drag the right edge to resize
    const rightEdgeX = slotBox!.x + slotBox!.width - 4;
    const centerY = slotBox!.y + slotBox!.height / 2;

    await page.mouse.move(rightEdgeX, centerY);
    await page.mouse.down();
    await page.mouse.move(rightEdgeX + 50, centerY, { steps: 5 });
    await page.mouse.up();

    // Get the slot width after attempted resize
    const newBox = await slotGroup.boundingBox();
    expect(newBox).not.toBeNull();

    // Width should be unchanged (resize blocked in read-only mode)
    expect(newBox!.width).toBeCloseTo(slotBox!.width, 0);
  });

  test('Slot pinning disabled in read-only mode', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    // Switch to read-only mode
    await switchToReadOnlyMode(page);

    // Try to click on a slot
    await clickSlot(page, 0);

    // Clipboard should not show any items (no pointer-clipboard visible)
    const clipboard = page.locator('.pointer-clipboard');
    // Should either not exist or have no chips
    const isVisible = await clipboard.isVisible().catch(() => false);
    if (isVisible) {
      const chips = await clipboard.locator('.v-chip').count();
      expect(chips).toBe(0);
    }
  });

  test('Clipboard clears when switching to read-only mode', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    // Start in editable mode and click on a slot to add to clipboard
    await clickSlot(page, 0);
    await page.waitForTimeout(100);

    // Move mouse over the chart to show clipboard
    const chartContainer = page.locator('.chart-container');
    await chartContainer.hover();
    await page.waitForTimeout(100);

    // Verify clipboard has items
    const clipboard = page.locator('.pointer-clipboard');
    await expect(clipboard).toBeVisible();
    const chipsBeforeToggle = await clipboard.locator('.v-chip').count();
    expect(chipsBeforeToggle).toBeGreaterThan(0);

    // Switch to read-only mode
    await switchToReadOnlyMode(page);
    await page.waitForTimeout(100);

    // Verify clipboard is empty
    const chipsAfterToggle = await clipboard.locator('.v-chip').count();
    expect(chipsAfterToggle).toBe(0);
  });
});
