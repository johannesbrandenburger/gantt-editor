import { expect, test, type Page } from "@playwright/test";
import { openE2eHarness } from "./helpers";

type Pixel = { r: number; g: number; b: number; a: number };

async function sampleWeekdayLinePixel(page: Page, dayIso: string): Promise<Pixel | null> {
  return await page.evaluate((targetDayIso) => {
    const canvas = document.querySelector("canvas.chart-canvas") as HTMLCanvasElement | null;
    const api = (window as Window & {
      __ganttCanvasTestApi?: {
        flush: () => void;
        getState: () => {
          margin: { left: number; right: number };
          internalStartTimeMs: number;
          internalEndTimeMs: number;
          layout: {
            canvasCssWidth: number;
            axisRect: { y: number; h: number };
          } | null;
        };
      };
    }).__ganttCanvasTestApi;

    api?.flush();
    const state = api?.getState();
    if (!canvas || !state?.layout) return null;

    const targetMs = new Date(targetDayIso).getTime();
    const startMs = state.internalStartTimeMs;
    const endMs = state.internalEndTimeMs;
    const spanMs = endMs - startMs;
    if (spanMs <= 0) return null;

    const chartWidth = state.layout.canvasCssWidth - state.margin.left - state.margin.right;
    if (chartWidth <= 0) return null;

    const ratio = (targetMs - startMs) / spanMs;
    const x = Math.round(state.margin.left + ratio * chartWidth);
    const y = Math.round(state.layout.axisRect.y + state.layout.axisRect.h + 14);

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const px = ctx.getImageData(x, y, 1, 1).data;
    return { r: px[0] ?? 0, g: px[1] ?? 0, b: px[2] ?? 0, a: px[3] ?? 0 };
  }, dayIso);
}

function isGreenish(pixel: Pixel): boolean {
  return pixel.g > pixel.r + 8 && pixel.g > pixel.b + 8;
}

test.describe("canvas rewrite weekday lines", () => {
  test("weekday boundary lines are rendered for ranges shorter than 14 days", async ({ page }) => {
    await openE2eHarness(page, {
      fixture: "core",
      query: {
        startTime: "2025-01-01T00:00:00Z",
        endTime: "2025-01-03T00:00:00Z",
      },
    });

    const pixel = await sampleWeekdayLinePixel(page, "2025-01-02T00:00:00Z");
    expect(pixel).not.toBeNull();
    expect(isGreenish(pixel as Pixel)).toBe(true);
  });

  test("weekday boundary lines are not rendered for ranges of 14 days or more", async ({ page }) => {
    await openE2eHarness(page, {
      fixture: "core",
      query: {
        startTime: "2025-01-01T00:00:00Z",
        endTime: "2025-01-16T00:00:00Z",
      },
    });

    const pixel = await sampleWeekdayLinePixel(page, "2025-01-08T00:00:00Z");
    expect(pixel).not.toBeNull();
    expect(isGreenish(pixel as Pixel)).toBe(false);
  });

  test.skip(
    "weekday labels display day names",
    "Skipping: weekday label text is rasterized on canvas and not directly introspectable via deterministic DOM/test API selectors.",
  );
});
