import { test, expect } from '@playwright/test';
import { waitForChartLoad, setupConsoleLogListener } from './helpers';

test.describe('Suggestions', () => {

  test('Suggestion buttons (💡) are rendered for slots with suggestions', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    // The demo page generates suggestions for the first 3 slots
    // Suggestion buttons are rendered as SVG text elements with class "suggestion-button"
    const suggestionButtons = page.locator('svg .suggestion-button');
    const count = await suggestionButtons.count();
    expect(count).toBeGreaterThan(0);

    // Verify the buttons display the 💡 emoji
    const firstButton = suggestionButtons.first();
    const text = await firstButton.textContent();
    expect(text).toBe('💡');
  });

  test('Hovering a suggestion button shows a tooltip', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    // Get the first suggestion button
    const suggestionButtons = page.locator('svg .suggestion-button');
    await expect(suggestionButtons.first()).toBeVisible();

    // Hover over the first suggestion button
    await suggestionButtons.first().hover();
    await page.waitForTimeout(300);

    // The tooltip should become visible with text about moving to alternative destination
    const tooltip = page.locator('.suggestion-tooltip');
    await expect(tooltip).toBeVisible();

    const tooltipText = await tooltip.textContent();
    expect(tooltipText).toContain('Move to alternative destination');
  });

  test('Suggestion button grows on hover', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    const suggestionButton = page.locator('svg .suggestion-button').first();
    await expect(suggestionButton).toBeVisible();

    // Check initial font size
    const initialFontSize = await suggestionButton.getAttribute('font-size');
    expect(initialFontSize).toBe('18px');

    // Hover to trigger size change
    await suggestionButton.hover();
    await page.waitForTimeout(300);

    // Font size should increase to 30px on hover
    const hoveredFontSize = await suggestionButton.getAttribute('font-size');
    expect(hoveredFontSize).toBe('30px');
  });

  test('Tooltip hides when mouse leaves suggestion button', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    const suggestionButton = page.locator('svg .suggestion-button').first();
    await expect(suggestionButton).toBeVisible();

    // Hover to show tooltip
    await suggestionButton.hover();
    await page.waitForTimeout(300);

    const tooltip = page.locator('.suggestion-tooltip');
    await expect(tooltip).toBeVisible();

    // Move mouse away from the suggestion button
    await page.mouse.move(0, 0);
    await page.waitForTimeout(300);

    // Tooltip should be hidden
    const visibility = await tooltip.evaluate(el => el.style.visibility);
    expect(visibility).toBe('hidden');
  });

  test('Clicking a suggestion button applies the suggestion', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    const logs = setupConsoleLogListener(page);

    // Get suggestion buttons before clicking
    const suggestionButtons = page.locator('svg .suggestion-button');
    const initialCount = await suggestionButtons.count();
    expect(initialCount).toBeGreaterThan(0);

    // Click the first suggestion button
    await suggestionButtons.first().click();
    await page.waitForTimeout(1000);

    // Verify the suggestion was applied via console log
    const hasSuggestionCallback = logs.some(log => log.includes('Applied suggestion for slot'));
    expect(hasSuggestionCallback).toBe(true);

    // After applying, the destination change callback should also fire
    const hasDestinationChange = logs.some(log => log.includes('Moved slot to different destination'));
    expect(hasDestinationChange).toBe(true);
  });

  test('Applied suggestion moves the slot to the alternative destination', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    const logs = setupConsoleLogListener(page);

    // Get suggestion buttons
    const suggestionButtons = page.locator('svg .suggestion-button');
    const countBefore = await suggestionButtons.count();
    expect(countBefore).toBeGreaterThan(0);

    // Click the first suggestion
    await suggestionButtons.first().click();
    await page.waitForTimeout(1000);

    // After applying a suggestion, the destination change callback should include
    // the alternative destination id, confirming the slot was actually moved
    const suggestionAppliedLog = logs.find(log => log.includes('Applied suggestion for slot'));
    expect(suggestionAppliedLog).toBeTruthy();

    // The move callback should also contain the new destination (mup-X)
    const moveLog = logs.find(log => log.includes('Moved slot to different destination'));
    expect(moveLog).toBeTruthy();
    expect(moveLog).toContain('mup-');
  });

  test('Suggestion tooltip follows mouse position', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    const suggestionButton = page.locator('svg .suggestion-button').first();
    await expect(suggestionButton).toBeVisible();

    // Hover to show tooltip
    const buttonBox = await suggestionButton.boundingBox();
    expect(buttonBox).not.toBeNull();

    if (buttonBox) {
      // Move to the button
      await page.mouse.move(buttonBox.x + buttonBox.width / 2, buttonBox.y + buttonBox.height / 2);
      await page.waitForTimeout(300);

      const tooltip = page.locator('.suggestion-tooltip');
      await expect(tooltip).toBeVisible();

      // Move mouse slightly while still on the button
      await page.mouse.move(buttonBox.x + buttonBox.width / 2 + 5, buttonBox.y + buttonBox.height / 2 + 5);
      await page.waitForTimeout(100);

      // Tooltip should still be visible and positioned
      await expect(tooltip).toBeVisible();
      const tooltipBox = await tooltip.boundingBox();
      expect(tooltipBox).not.toBeNull();
    }
  });

  test('Suggestion button font-size resets after mouse leaves', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    const suggestionButton = page.locator('svg .suggestion-button').first();
    await expect(suggestionButton).toBeVisible();

    // Hover to increase size
    await suggestionButton.hover();
    await page.waitForTimeout(300);
    expect(await suggestionButton.getAttribute('font-size')).toBe('30px');

    // Move mouse away
    await page.mouse.move(0, 0);
    await page.waitForTimeout(300);

    // Font size should return to 18px
    const resetFontSize = await suggestionButton.getAttribute('font-size');
    expect(resetFontSize).toBe('18px');
  });

  test('Applying two suggestions sequentially moves each slot to its correct destination', async ({ page }) => {
    await page.goto('/');
    await waitForChartLoad(page);

    const logs = setupConsoleLogListener(page);

    // --- First suggestion ---

    const firstButton = page.locator('svg .suggestion-button').first();
    await expect(firstButton).toBeVisible();

    // Click to apply the first suggestion
    await firstButton.click();
    await page.waitForTimeout(1500);

    // Extract slotId and destination from the "Applied suggestion" log
    // Log format: "Callback: Applied suggestion for slot <slotId> to <destId>"
    const firstApplyLog = logs.find(log => log.includes('Applied suggestion for slot'));
    expect(firstApplyLog).toBeTruthy();
    const firstSlotId = firstApplyLog!.match(/Applied suggestion for slot (\S+)/)?.[1];
    const firstDestId = firstApplyLog!.split(' to ').pop()!.trim();
    expect(firstSlotId).toBeTruthy();
    expect(firstDestId).toMatch(/^mup-\d+$/);

    // Verify the actual move callback confirms the same slot+destination pair
    const firstMoveLog = logs.find(log =>
      log.includes('Moved slot to different destination') &&
      log.includes(firstSlotId!) &&
      log.includes(firstDestId)
    );
    expect(firstMoveLog).toBeTruthy();

    // Clear logs to isolate the second suggestion's events
    logs.length = 0;

    // Move mouse away to reset hover state, then wait for full re-render
    await page.mouse.move(0, 0);
    await page.waitForTimeout(500);

    // --- Second suggestion ---

    // After applying the first suggestion the chart re-renders with updated suggestions.
    // The same slot may appear again (with a new target destination) or a different slot.
    const secondButton = page.locator('svg .suggestion-button').first();
    await expect(secondButton).toBeVisible();

    // Click to apply the second suggestion
    await secondButton.click();
    await page.waitForTimeout(1500);

    // Extract slotId and destination from the second "Applied suggestion" log
    const secondApplyLog = logs.find(log => log.includes('Applied suggestion for slot'));
    expect(secondApplyLog).toBeTruthy();
    const secondSlotId = secondApplyLog!.match(/Applied suggestion for slot (\S+)/)?.[1];
    const secondDestId = secondApplyLog!.split(' to ').pop()!.trim();
    expect(secondSlotId).toBeTruthy();
    expect(secondDestId).toMatch(/^mup-\d+$/);

    // Verify the actual move callback confirms the same slot+destination pair
    const secondMoveLog = logs.find(log =>
      log.includes('Moved slot to different destination') &&
      log.includes(secondSlotId!) &&
      log.includes(secondDestId)
    );
    expect(secondMoveLog).toBeTruthy();

    // --- Cross-validation: suggestions must not get mixed up ---

    // If the same slot received both suggestions (moved twice), the second destination
    // MUST differ from the first — it should advance further, not re-apply the stale
    // first suggestion. This directly catches the reported bug where the d3 event handler
    // closure holds stale suggestion data after re-render.
    if (secondSlotId === firstSlotId) {
      expect(secondDestId).not.toBe(firstDestId);
    }

    // After both suggestions, exactly one "Applied suggestion" event should exist in the
    // second batch of logs (each click should trigger exactly one move)
    const allApplyLogs = logs.filter(log => log.includes('Applied suggestion for slot'));
    expect(allApplyLogs.length).toBe(1);
  });
});
