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
const STD_COLOR = { r: 155, g: 89, b: 182 };
const ETD_COLOR = { r: 231, g: 76, b: 60 };

function blendOnWhite(color: { r: number; g: number; b: number }, alpha: number): { r: number; g: number; b: number } {
  return {
    r: Math.round(color.r * alpha + 255 * (1 - alpha)),
    g: Math.round(color.g * alpha + 255 * (1 - alpha)),
    b: Math.round(color.b * alpha + 255 * (1 - alpha)),
  };
}

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
    await page.goto("/small-example");
    await waitForCanvasApi(page);

    const state = await getCanvasState<CanvasState>(page);
    expect(state).not.toBeNull();
    if (!state?.layout) {
      throw new Error("Expected test state with layout");
    }

    const slotCenter = await waitForSlotPoint(page, SLOT_ID, "center");
    const stdX = markerCanvasX(state, Date.parse("2025-01-01T13:00:00Z"));
    const etdX = markerCanvasX(state, Date.parse("2025-01-01T13:25:00Z"));

    const expectedStdBlended = blendOnWhite(STD_COLOR, 0.6);
    await expect
      .poll(async () => {
        const stdPixel = await sampleCanvasPixelNearestTo(page, { x: stdX, y: slotCenter.y }, expectedStdBlended);
        return colorDistance(stdPixel, expectedStdBlended);
      }, { timeout: 2000 })
      .toBeLessThan(45);

    await expect
      .poll(async () => {
        const etdPixel = await sampleCanvasPixelNearestTo(page, { x: etdX, y: slotCenter.y }, ETD_COLOR);
        return colorDistance(etdPixel, ETD_COLOR);
      }, { timeout: 2000 })
      .toBeLessThan(35);
  });

  test("STD marker is visibly lighter than ETD marker due reduced opacity", async ({ page }) => {
    await page.goto("/small-example");
    await waitForCanvasApi(page);

    const state = await getCanvasState<CanvasState>(page);
    expect(state).not.toBeNull();
    if (!state?.layout) {
      throw new Error("Expected test state with layout");
    }

    const slotCenter = await waitForSlotPoint(page, SLOT_ID, "center");
    const stdX = markerCanvasX(state, Date.parse("2025-01-01T13:00:00Z"));
    const etdX = markerCanvasX(state, Date.parse("2025-01-01T13:25:00Z"));

    const expectedStdBlended = blendOnWhite(STD_COLOR, 0.6);
    const stdPixel = await sampleCanvasPixelNearestTo(page, { x: stdX, y: slotCenter.y }, expectedStdBlended);
    const etdPixel = await sampleCanvasPixelNearestTo(page, { x: etdX, y: slotCenter.y }, ETD_COLOR);

    const stdLuma = 0.2126 * stdPixel.r + 0.7152 * stdPixel.g + 0.0722 * stdPixel.b;
    const etdLuma = 0.2126 * etdPixel.r + 0.7152 * etdPixel.g + 0.0722 * etdPixel.b;

    expect(stdLuma).toBeGreaterThan(etdLuma);
    expect(colorDistance(etdPixel, ETD_COLOR)).toBeLessThan(35);
    expect(colorDistance(stdPixel, STD_COLOR)).toBeGreaterThan(30);
  });
});
