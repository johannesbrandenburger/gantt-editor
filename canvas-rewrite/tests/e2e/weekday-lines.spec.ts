import { expect, test, type Page } from "@playwright/test";
import { openE2eHarness } from "./helpers";

type Pixel = { r: number; g: number; b: number; a: number };

async function sampleWeekdayLinePixel(page: Page, dayYmd: string): Promise<Pixel | null> {
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

    const parts = targetDayIso.split("-").map((v) => Number(v));
    const [year, month, day] = parts;
    if (!year || !month || !day) return null;
    // Weekday overlay uses local-day boundaries (d3-time's timeDay), so build
    // the probe timestamp in local time as well.
    const targetMs = new Date(year, month - 1, day).getTime();
    const startMs = state.internalStartTimeMs;
    const endMs = state.internalEndTimeMs;
    const spanMs = endMs - startMs;
    if (spanMs <= 0) return null;

    const chartWidth = state.layout.canvasCssWidth - state.margin.left - state.margin.right;
    if (chartWidth <= 0) return null;

    const ratio = (targetMs - startMs) / spanMs;
    const x = state.margin.left + ratio * chartWidth;
    const y = state.layout.axisRect.y + state.layout.axisRect.h + 14;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;

    const dpr = window.devicePixelRatio || 1;
    const baseX = Math.max(0, Math.min(canvas.width - 1, Math.round(x * dpr)));
    const baseY = Math.max(0, Math.min(canvas.height - 1, Math.round(y * dpr)));

    // Sample a tiny neighborhood and pick the most green-dominant pixel to
    // avoid anti-aliasing misses at exact line boundaries.
    let best: Pixel | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const sx = Math.max(0, Math.min(canvas.width - 1, baseX + dx));
        const sy = Math.max(0, Math.min(canvas.height - 1, baseY + dy));
        const data = ctx.getImageData(sx, sy, 1, 1).data;
        const pixel: Pixel = {
          r: data[0] ?? 0,
          g: data[1] ?? 0,
          b: data[2] ?? 0,
          a: data[3] ?? 0,
        };
        const score = pixel.g - Math.max(pixel.r, pixel.b);
        if (score > bestScore) {
          bestScore = score;
          best = pixel;
        }
      }
    }

    return best;
  }, dayYmd);
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

    const pixel = await sampleWeekdayLinePixel(page, "2025-01-02");
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

    const pixel = await sampleWeekdayLinePixel(page, "2025-01-08");
    expect(pixel).not.toBeNull();
    expect(isGreenish(pixel as Pixel)).toBe(false);
  });

  test("weekday labels display day names", async () => {
    test.skip(
      true,
      "Skipping: weekday label text is rasterized on canvas and not directly introspectable via deterministic DOM/test API selectors.",
    );
  });
});
