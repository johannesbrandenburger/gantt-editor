import { test, expect } from '@playwright/test';
import { waitForChartLoad, clickSlot, getFirstSlot, setupConsoleLogListener } from './helpers';

test.describe('Slot Interactions', () => {

  test('Click on slot emits onClickOnSlot event', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    const logs = setupConsoleLogListener(page);

    // Click on a slot
    await clickSlot(page, 0);

    // Wait for event
    await page.waitForTimeout(500);

    // Check console for the callback log
    const hasClickCallback = logs.some(log => log.includes('Opening details for slot'));
    expect(hasClickCallback).toBe(true);
  });

  test('Hover on slot emits onHoverOnSlot event (after delay)', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    const logs = setupConsoleLogListener(page);

    // Hover on a slot
    const slot = await getFirstSlot(page);
    await slot.hover();

    // Wait for hover delay (500ms in the component)
    await page.waitForTimeout(700);

    // Check console for the callback log
    const hasHoverCallback = logs.some(log => log.includes('Hovering on slot'));
    expect(hasHoverCallback).toBe(true);
  });

  test('Double-click on slot emits onDoubleClickOnSlot event', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    const logs = setupConsoleLogListener(page);

    // Double-click on a slot
    const slot = await getFirstSlot(page);
    await slot.dblclick();

    await page.waitForTimeout(300);

    // Check console for the callback log
    const hasDoubleClickCallback = logs.some(log => log.includes('Double clicked on slot'));
    expect(hasDoubleClickCallback).toBe(true);
  });

  test('Right-click on slot emits onContextClickOnSlot event', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    const logs = setupConsoleLogListener(page);

    // Right-click on a slot
    const slot = await getFirstSlot(page);
    await slot.click({ button: 'right' });

    await page.waitForTimeout(300);

    // Check console for the callback log
    const hasContextClickCallback = logs.some(log => log.includes('Right clicked on slot'));
    expect(hasContextClickCallback).toBe(true);
  });

  test('Resize right handle of slot whose start time is off-screen to the left', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    const logs = setupConsoleLogListener(page);

    const ganttContainer = page.locator('.gantt-container').first();
    const chartBox = await ganttContainer.boundingBox();
    expect(chartBox).not.toBeNull();

    // The chart SVG has a left margin of 200px for topic labels. The timeline
    // content starts at chartBox.x + 200. Slots that are "off-screen to the left"
    // have their screen x less than that content left edge.
    const chartContentLeft = chartBox!.x + 200;

    // Measure the first slot before panning
    const firstSlot = page.locator('svg g.slot-group').first();
    const firstSlotBox = await firstSlot.boundingBox();
    expect(firstSlotBox).not.toBeNull();

    // Pan forward so the content left edge ends up 75% into the first slot.
    // (slot.x is already in screen coordinates, incorporating the 200px SVG margin.)
    const panAmount = (firstSlotBox!.x - chartContentLeft) + firstSlotBox!.width * 0.75;
    const pivotX = chartBox!.x + chartBox!.width / 2;
    const pivotY = chartBox!.y + chartBox!.height / 2;
    await page.mouse.move(pivotX, pivotY);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(pivotX - panAmount, pivotY);
    await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(300);

    // Verify that the width of the slot is less than before, confirming it was panned partially off-screen
    const firstSlotBoxAfterPan = await firstSlot.boundingBox();
    expect(firstSlotBoxAfterPan).not.toBeNull();
    expect(firstSlotBoxAfterPan!.width).toBeLessThan(firstSlotBox!.width * 0.3);

    const rightHandle = firstSlot.locator('.slot-resize-handle-right');

    await firstSlot.hover();
    await page.waitForTimeout(100);

    const handleBox = await rightHandle.boundingBox();
    expect(handleBox).not.toBeNull();

    // Record the slot's visible width before the drag
    const slotBoxBeforeResize = await firstSlot.boundingBox();
    expect(slotBoxBeforeResize).not.toBeNull();

    await page.mouse.move(handleBox!.x + 2, handleBox!.y + handleBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleBox!.x + 30, handleBox!.y + handleBox!.height / 2);
    await page.mouse.up();

    await page.waitForTimeout(300);

    // Verify the resize callback was fired — this is the regression case
    const resizeCallbacks = logs.filter(log => log.includes('Edited slots time window'));
    expect(resizeCallbacks.length).toBe(1);

    // Verify the slot visually grew by approximately 30 pixels
    const slotBoxAfterResize = await firstSlot.boundingBox();
    expect(slotBoxAfterResize).not.toBeNull();
    const widthDiff = slotBoxAfterResize!.width - slotBoxBeforeResize!.width;
    expect(widthDiff).toBeGreaterThan(25);
    expect(widthDiff).toBeLessThan(35);
  });
});
