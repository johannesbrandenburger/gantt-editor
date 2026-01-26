import { test, expect } from '@playwright/test';
import { waitForChartLoad } from './helpers';

test.describe('Destination Group Resizing', () => {

  test('Resize handle between groups changes height portions', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    // Get the gantt containers
    const allocatedContainer = page.locator('#allocated-gantt-container');
    const unallocatedContainer = page.locator('#unallocated-gantt-container');

    const initialAllocatedHeight = await allocatedContainer.boundingBox().then(box => box?.height || 0);
    const initialUnallocatedHeight = await unallocatedContainer.boundingBox().then(box => box?.height || 0);

    // Find the resize handle between the two groups (second resize handle)
    const resizeHandles = page.locator('.resize-handle');
    const handleCount = await resizeHandles.count();

    // The second resize handle is between the gantt groups
    if (handleCount >= 2) {
      const resizeHandle = resizeHandles.nth(1);
      const handleBox = await resizeHandle.boundingBox();

      if (handleBox) {
        // Drag resize handle up to make unallocated bigger
        await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + 1);
        await page.mouse.down();
        await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y - 50);
        await page.mouse.up();
      }
    }

    await page.waitForTimeout(300);

    // Verify heights changed
    const newAllocatedHeight = await allocatedContainer.boundingBox().then(box => box?.height || 0);
    const newUnallocatedHeight = await unallocatedContainer.boundingBox().then(box => box?.height || 0);

    // Allocated should be smaller, unallocated should be larger
    expect(newAllocatedHeight).toBeLessThan(initialAllocatedHeight);
    expect(newUnallocatedHeight).toBeGreaterThan(initialUnallocatedHeight);
  });
});
