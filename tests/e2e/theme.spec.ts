import { expect, test, type Page } from "./coverage-test";
import { openE2eHarness } from "./helpers";

async function axisPixel(page: Page) {
  return page.locator("canvas.chart-canvas").evaluate((canvas: HTMLCanvasElement) => {
    // The left margin of the time axis is clear of ticks and labels.
    const ctx = canvas.getContext("2d")!;
    return Array.from(ctx.getImageData(1, 1, 1, 1).data);
  });
}

test("omitting theme renders a light canvas on a dark device", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await openE2eHarness(page, { fixture: "core" });
  await expect.poll(() => axisPixel(page)).toEqual([245, 245, 245, 255]);
  await page.emulateMedia({ colorScheme: "light" });
  await expect.poll(() => axisPixel(page)).toEqual([245, 245, 245, 255]);
});

test("the demo theme selector overrides and restores the system preference", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-vue", "The theme selector is in the Vue demo");
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  const selector = page.getByRole("combobox", { name: "Theme", exact: true });
  const chart = page.locator(".chart-container");
  await expect(selector).toHaveValue("light");
  await selector.selectOption("dark");
  await expect(chart).toHaveCSS("color-scheme", "dark");
  await page.emulateMedia({ colorScheme: "dark" });
  await selector.selectOption("light");
  await expect(chart).toHaveCSS("color-scheme", "light");
  await selector.selectOption("system");
  await expect(chart).toHaveCSS("color-scheme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(chart).toHaveCSS("color-scheme", "light");
});
