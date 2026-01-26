import { test, expect } from '@playwright/test';
import { waitForChartLoad, setupConsoleLogListener } from './helpers';


test.describe('Slot Time Editing', () => {

  test('Resize slot from left handle (drag right to decrease width)', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    const logs = setupConsoleLogListener(page);

    // select the second slot (first might be capped)
    const slotGroup = page.locator('svg g.slot-group').nth(1);
    const leftHandle = slotGroup.locator('.slot-resize-handle-left');

    // Hover to make handle visible
    await slotGroup.hover();
    await page.waitForTimeout(100);
    const slotWidth = (await slotGroup.boundingBox())?.width;
    expect(slotWidth).not.toBeNull();

    // Drag left handle
    const handleBox = await leftHandle.boundingBox();
    expect(handleBox).not.toBeNull();
    if (handleBox) {
      await page.mouse.move(handleBox.x + 2, handleBox.y + handleBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(handleBox.x + 30, handleBox.y + handleBox.height / 2);
      await page.mouse.up();
    }

    // Wait for update
    await page.waitForTimeout(300);

    // Check that slot width decreased by approximately 30 pixels
    const newSlotWidth = (await slotGroup.boundingBox())?.width;
    expect(newSlotWidth).not.toBeNull();
    const widthDiff = slotWidth! - newSlotWidth!;
    expect(widthDiff).toBeGreaterThan(25);
    expect(widthDiff).toBeLessThan(35);

    // Check console for the callback log
    const resizeCallbacks = logs.filter(log => log.includes('Edited slots time window'));
    expect(resizeCallbacks.length).toBe(1);
  });

  test('Resize slot from right handle (drag right to increase width)', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    const logs = setupConsoleLogListener(page);

    // select the second slot (first might me capped)
    const slotGroup = page.locator('svg g.slot-group').nth(1);
    const rightHandle = slotGroup.locator('.slot-resize-handle-right');

    // Hover to make handle visible
    await slotGroup.hover();
    await page.waitForTimeout(100);
    const slotWidth = (await slotGroup.boundingBox())?.width;
    expect(slotWidth).not.toBeNull();

    // Drag right handle to the right
    const handleBox = await rightHandle.boundingBox();
    expect(handleBox).not.toBeNull();
    if (handleBox) {
      await page.mouse.move(handleBox.x + 2, handleBox.y + handleBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(handleBox.x + 30, handleBox.y + handleBox.height / 2);
      await page.mouse.up();
    }

    // Wait for update
    await page.waitForTimeout(300);

    // Check that slot width increased by approximately 30 pixels
    const newSlotWidth = (await slotGroup.boundingBox())?.width;
    expect(newSlotWidth).not.toBeNull();
    const widthDiff = newSlotWidth! - slotWidth!;
    expect(widthDiff).toBeGreaterThan(25);
    expect(widthDiff).toBeLessThan(35);

    // Check console for the callback log
    const resizeCallbacks = logs.filter(log => log.includes('Edited slots time window'));
    expect(resizeCallbacks.length).toBe(1);
  });

  test('Resize slot from left handle (drag left to increase width)', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    const logs = setupConsoleLogListener(page);

    // select the second slot (first might me capped)
    const slotGroup = page.locator('svg g.slot-group').nth(1);
    const leftHandle = slotGroup.locator('.slot-resize-handle-left');

    // Hover to make handle visible
    await slotGroup.hover();
    await page.waitForTimeout(100);
    const slotWidth = (await slotGroup.boundingBox())?.width;
    expect(slotWidth).not.toBeNull();

    // Drag left handle to the left
    const handleBox = await leftHandle.boundingBox();
    expect(handleBox).not.toBeNull();
    if (handleBox) {
      await page.mouse.move(handleBox.x + 2, handleBox.y + handleBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(handleBox.x - 30, handleBox.y + handleBox.height / 2);
      await page.mouse.up();
    }

    // Wait for update
    await page.waitForTimeout(300);

    // Check that slot width increased by approximately 30 pixels
    const newSlotWidth = (await slotGroup.boundingBox())?.width;
    expect(newSlotWidth).not.toBeNull();
    const widthDiff = newSlotWidth! - slotWidth!;
    expect(widthDiff).toBeGreaterThan(25);
    expect(widthDiff).toBeLessThan(35);

    // Check console for the callback log
    const resizeCallbacks = logs.filter(log => log.includes('Edited slots time window'));
    expect(resizeCallbacks.length).toBe(1);
  });

  test('Resize slot from right handle (drag left to decrease width)', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    const logs = setupConsoleLogListener(page);

    // select the second slot (first might me capped)
    const slotGroup = page.locator('svg g.slot-group').nth(1);
    const rightHandle = slotGroup.locator('.slot-resize-handle-right');

    // Hover to make handle visible
    await slotGroup.hover();
    await page.waitForTimeout(100);
    const slotWidth = (await slotGroup.boundingBox())?.width;
    expect(slotWidth).not.toBeNull();

    // Drag right handle to the left
    const handleBox = await rightHandle.boundingBox();
    expect(handleBox).not.toBeNull();
    if (handleBox) {
      await page.mouse.move(handleBox.x + 2, handleBox.y + handleBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(handleBox.x - 30, handleBox.y + handleBox.height / 2);
      await page.mouse.up();
    }

    // Wait for update
    await page.waitForTimeout(300);

    // Check that slot width decreased by approximately 30 pixels
    const newSlotWidth = (await slotGroup.boundingBox())?.width;
    expect(newSlotWidth).not.toBeNull();
    const widthDiff = slotWidth! - newSlotWidth!;
    expect(widthDiff).toBeGreaterThan(25);
    expect(widthDiff).toBeLessThan(35);

    // Check console for the callback log
    const resizeCallbacks = logs.filter(log => log.includes('Edited slots time window'));
    expect(resizeCallbacks.length).toBe(1);
  });

});
