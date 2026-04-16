import { expect, test, type Page } from "./coverage-test";
import { getCanvasState, waitForCanvasApi, waitForSlotPoint } from "./helpers";

type CanvasState = {
  margin: { left: number; right: number };
  internalStartTimeMs: number;
  internalEndTimeMs: number;
  layout: { canvasCssWidth: number } | null;
};

type Rgba = { r: number; g: number; b: number; a: number };

const SLOT_ID = "LH123-20250101-F";
const STD_COLOR = { r: 158, g: 158, b: 158 };
const ETD_COLOR = { r: 31, g: 31, b: 31 };

function colorDistance(actual: Rgba, expected: { r: number; g: number; b: number }): number {
  const dr = actual.r - expected.r;
  const dg = actual.g - expected.g;
  const db = actual.b - expected.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * Sample a tiny neighborhood (same strategy as weekday-lines.spec.ts) and pick the pixel
 * closest to `targetRgb` so we land on solid line interior instead of anti-aliased edges.
 */
async function sampleCanvasPixelNearestTo(
  page: Page,
  point: { x: number; y: number },
  targetRgb: { r: number; g: number; b: number },
): Promise<Rgba> {
  return await page.evaluate(
    ({ x, y, target }: { x: number; y: number; target: { r: number; g: number; b: number } }) => {
      const canvas = document.querySelector("canvas.chart-canvas") as HTMLCanvasElement | null;
      if (!canvas) {
        throw new Error("Expected chart canvas to exist");
      }

      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        throw new Error("Expected 2d context");
      }

      const dpr = window.devicePixelRatio || 1;
      const baseX = Math.max(0, Math.min(canvas.width - 1, Math.round(x * dpr)));
      const baseY = Math.max(0, Math.min(canvas.height - 1, Math.round(y * dpr)));

      const dist = (r: number, g: number, b: number) => {
        const dr = r - target.r;
        const dg = g - target.g;
        const db = b - target.b;
        return Math.sqrt(dr * dr + dg * dg + db * db);
      };

      let best = { r: 0, g: 0, b: 0, a: 0 };
      let bestD = Number.POSITIVE_INFINITY;

      // Slightly wider on x than weekday-lines: deadline strokes are vertical 2px bars.
      for (let dx = -2; dx <= 2; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
          const sx = Math.max(0, Math.min(canvas.width - 1, baseX + dx));
          const sy = Math.max(0, Math.min(canvas.height - 1, baseY + dy));
          const data = ctx.getImageData(sx, sy, 1, 1).data;
          const r = data[0] ?? 0;
          const g = data[1] ?? 0;
          const b = data[2] ?? 0;
          const a = data[3] ?? 0;
          const d = dist(r, g, b);
          if (d < bestD) {
            bestD = d;
            best = { r, g, b, a };
          }
        }
      }

      return best;
    },
    { ...point, target: targetRgb },
  );
}

function markerCanvasX(state: CanvasState, markerDateMs: number): number {
  if (!state.layout) {
    throw new Error("Expected canvas layout in test state");
  }

  const chartWidth = state.layout.canvasCssWidth - state.margin.left - state.margin.right;
  const ratio =
    (markerDateMs - state.internalStartTimeMs) / (state.internalEndTimeMs - state.internalStartTimeMs);
  return state.margin.left + ratio * chartWidth;
}

test.describe("canvas rewrite deadline marker coloring", () => {
  test("STD and ETD endlines use configured deadline colors", async ({ page }) => {
    await page.goto("/e2e-harness");
    await waitForCanvasApi(page);

    const state = await getCanvasState<CanvasState>(page);
    expect(state).not.toBeNull();
    if (!state?.layout) {
      throw new Error("Expected test state with layout");
    }

    const slotCenter = await waitForSlotPoint(page, SLOT_ID, "center");
    const stdX = markerCanvasX(state, Date.parse("2025-01-01T13:00:00Z"));
    const etdX = markerCanvasX(state, Date.parse("2025-01-01T13:25:00Z"));

    await expect
      .poll(async () => {
        const stdPixel = await sampleCanvasPixelNearestTo(page, { x: stdX, y: slotCenter.y }, STD_COLOR);
        return colorDistance(stdPixel, STD_COLOR);
      }, { timeout: 2000 })
      .toBeLessThan(35);

    await expect
      .poll(async () => {
        const etdPixel = await sampleCanvasPixelNearestTo(page, { x: etdX, y: slotCenter.y }, ETD_COLOR);
        return colorDistance(etdPixel, ETD_COLOR);
      }, { timeout: 2000 })
      .toBeLessThan(35);
  });

  test("STD marker keeps configured color without opacity blending", async ({ page }) => {
    await page.goto("/e2e-harness");
    await waitForCanvasApi(page);

    const state = await getCanvasState<CanvasState>(page);
    expect(state).not.toBeNull();
    if (!state?.layout) {
      throw new Error("Expected test state with layout");
    }

    const slotCenter = await waitForSlotPoint(page, SLOT_ID, "center");
    const stdX = markerCanvasX(state, Date.parse("2025-01-01T13:00:00Z"));
    const etdX = markerCanvasX(state, Date.parse("2025-01-01T13:25:00Z"));

    const stdPixel = await sampleCanvasPixelNearestTo(page, { x: stdX, y: slotCenter.y }, STD_COLOR);
    const etdPixel = await sampleCanvasPixelNearestTo(page, { x: etdX, y: slotCenter.y }, ETD_COLOR);

    expect(colorDistance(etdPixel, ETD_COLOR)).toBeLessThan(35);
    expect(colorDistance(stdPixel, STD_COLOR)).toBeLessThan(35);
  });
});
