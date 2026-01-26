import { expect, type Page } from '@playwright/test';

/**
 * Shared helper functions for Gantt Editor E2E tests
 */

export async function waitForChartLoad(page: Page) {
  await page.waitForSelector('svg', { timeout: 10000 });
  await page.waitForSelector('svg path.slot-box', { timeout: 10000 });
  await page.waitForSelector('svg .topic-area', { timeout: 10000 });
  await page.waitForTimeout(1000); // Extra wait for stability
}

export async function getSlotCount(page: Page): Promise<number> {
  return page.locator('svg path.slot-box').count();
}

export async function getFirstSlot(page: Page) {
  return page.locator('svg g.slot-group').first();
}

export async function clickSlot(page: Page, index = 0) {
  const slots = page.locator('svg g.slot-group');
  await slots.nth(index).click();
}

export function setupConsoleLogListener(page: Page): string[] {
  const logs: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'log') {
      logs.push(msg.text());
    }
  });
  return logs;
}

export async function switchToReadOnlyMode(page: Page) {
  const toggleButton = page.locator('button:has-text("Mode")');
  await toggleButton.click();
  await expect(toggleButton).toContainText('Read-Only');
}

export async function switchToEditableMode(page: Page) {
  const toggleButton = page.locator('button:has-text("Mode")');
  const buttonText = await toggleButton.textContent();
  if (buttonText?.includes('Read-Only')) {
    await toggleButton.click();
  }
  await expect(toggleButton).toContainText('Editable');
}
