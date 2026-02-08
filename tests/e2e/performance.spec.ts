import { test, expect, type Page } from '@playwright/test';

async function waitForPerformancePageLoad(page: Page) {
    await page.waitForSelector('svg', { timeout: 30000 });
    await page.waitForSelector('svg path.slot-box', { timeout: 30000 });
    await page.waitForSelector('svg .topic-area', { timeout: 30000 });
    await page.waitForTimeout(2000); // Extra wait for stability with large dataset
}

test.describe('Lazy Rendering Performance', () => {

    test('Lazy rendering renders fewer DOM elements than full rendering', async ({ page }) => {
        await page.goto('/performance');
        await waitForPerformancePageLoad(page);

        // Verify lazy rendering is OFF by default
        const lazyAttr = await page.locator('.chart-container').getAttribute('data-lazy-rendering');
        expect(lazyAttr).toBe('false');

        // Count rendered slot elements with lazy rendering OFF (all slots rendered)
        const fullSlotCount = await page.locator('svg path.slot-box').count();

        // Read total slot count from the page
        const totalText = await page.locator('[data-testid="total-slot-count"]').textContent();
        const totalSlotCount = parseInt(totalText?.replace(/[^0-9]/g, '') || '0');
        expect(totalSlotCount).toBeGreaterThanOrEqual(2000);

        // Toggle lazy rendering ON
        await page.click('[data-testid="toggle-lazy-rendering"]');
        await page.waitForTimeout(3000); // Wait for re-render with lazy filtering

        // Verify lazy rendering is now ON
        const lazyAttrOn = await page.locator('.chart-container').getAttribute('data-lazy-rendering');
        expect(lazyAttrOn).toBe('true');

        // Count rendered slot elements with lazy rendering ON — should be fewer
        const lazySlotCount = await page.locator('svg path.slot-box').count();
        expect(lazySlotCount).toBeGreaterThan(0);
        expect(lazySlotCount).toBeLessThan(fullSlotCount);

        console.log(`Full rendering: ${fullSlotCount} / ${totalSlotCount} slots rendered`);
        console.log(`Lazy rendering: ${lazySlotCount} / ${totalSlotCount} slots rendered`);
    });

    test('Timeline navigation is faster with lazy rendering enabled', async ({ page }) => {
        await page.goto('/performance');
        await waitForPerformancePageLoad(page);

        // --- Measure with lazy rendering OFF (default) ---
        const fullTime = await page.evaluate(async () => {
            // Find the chart group element where D3's wheel handler is attached
            const chartGroup = document.querySelector('.gantt-container svg g[class$="-group"]');
            if (!chartGroup) throw new Error('No chart group found');

            const iterations = 15;
            const start = performance.now();
            for (let i = 0; i < iterations; i++) {
                chartGroup.dispatchEvent(new WheelEvent('wheel', {
                    deltaX: 50,
                    deltaY: 0,
                    bubbles: true,
                    cancelable: true,
                }));
                // Wait for next frame to allow rendering to complete
                await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
            }
            // Wait for any pending timeouts/animations
            await new Promise<void>(resolve => setTimeout(resolve, 300));
            return performance.now() - start;
        });

        // --- Toggle lazy rendering ON ---
        await page.click('[data-testid="toggle-lazy-rendering"]');
        await page.waitForTimeout(3000); // Wait for re-render with lazy filtering

        // --- Measure with lazy rendering ON ---
        const lazyTime = await page.evaluate(async () => {
            const chartGroup = document.querySelector('.gantt-container svg g[class$="-group"]');
            if (!chartGroup) throw new Error('No chart group found');

            const iterations = 15;
            const start = performance.now();
            for (let i = 0; i < iterations; i++) {
                chartGroup.dispatchEvent(new WheelEvent('wheel', {
                    deltaX: 50,
                    deltaY: 0,
                    bubbles: true,
                    cancelable: true,
                }));
                // Wait for next frame to allow rendering to complete
                await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
            }
            await new Promise<void>(resolve => setTimeout(resolve, 300));
            return performance.now() - start;
        });

        console.log(`Full rendering timeline nav: ${fullTime.toFixed(0)}ms`);
        console.log(`Lazy rendering timeline nav: ${lazyTime.toFixed(0)}ms`);

        // Lazy rendering should be meaningfully faster
        expect(lazyTime).toBeLessThan(fullTime);
    });
});
