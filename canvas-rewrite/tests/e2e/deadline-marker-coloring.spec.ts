import { expect, test } from "@playwright/test";
import { findSlotPoint, getCanvasState, waitForCanvasApi } from "./helpers";

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

async function sampleCanvasPixel(page: Parameters<typeof test>[0]["page"], point: { x: number; y: number }): Promise<Rgba> {
  return await page.evaluate(({ x, y }) => {
    const canvas = document.querySelector("canvas.chart-canvas") as HTMLCanvasElement | null;
    if (!canvas) {
      throw new Error("Expected chart canvas to exist");
    }

    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      throw new Error("Expected 2d context");
    }

    const dpr = window.devicePixelRatio || 1;
    const pixelX = Math.max(0, Math.min(canvas.width - 1, Math.round(x * dpr)));
    const pixelY = Math.max(0, Math.min(canvas.height - 1, Math.round(y * dpr)));
    const data = context.getImageData(pixelX, pixelY, 1, 1).data;

    return {
      r: data[0] ?? 0,
      g: data[1] ?? 0,
      b: data[2] ?? 0,
      a: data[3] ?? 0,
    };
  }, point);
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

    const slotCenter = await findSlotPoint(page, SLOT_ID, "center");
    const stdX = markerCanvasX(state, Date.parse("2025-01-01T13:00:00Z"));
    const etdX = markerCanvasX(state, Date.parse("2025-01-01T13:25:00Z"));

    const stdPixel = await sampleCanvasPixel(page, { x: stdX, y: slotCenter.y });
    const etdPixel = await sampleCanvasPixel(page, { x: etdX, y: slotCenter.y });

    const expectedStdBlended = blendOnWhite(STD_COLOR, 0.6);
    expect(colorDistance(stdPixel, expectedStdBlended)).toBeLessThan(45);
    expect(colorDistance(etdPixel, ETD_COLOR)).toBeLessThan(35);
  });

  test("STD marker is visibly lighter than ETD marker due reduced opacity", async ({ page }) => {
    await page.goto("/small-example");
    await waitForCanvasApi(page);

    const state = await getCanvasState<CanvasState>(page);
    expect(state).not.toBeNull();
    if (!state?.layout) {
      throw new Error("Expected test state with layout");
    }

    const slotCenter = await findSlotPoint(page, SLOT_ID, "center");
    const stdX = markerCanvasX(state, Date.parse("2025-01-01T13:00:00Z"));
    const etdX = markerCanvasX(state, Date.parse("2025-01-01T13:25:00Z"));

    const stdPixel = await sampleCanvasPixel(page, { x: stdX, y: slotCenter.y });
    const etdPixel = await sampleCanvasPixel(page, { x: etdX, y: slotCenter.y });

    const stdLuma = 0.2126 * stdPixel.r + 0.7152 * stdPixel.g + 0.0722 * stdPixel.b;
    const etdLuma = 0.2126 * etdPixel.r + 0.7152 * etdPixel.g + 0.0722 * etdPixel.b;

    expect(stdLuma).toBeGreaterThan(etdLuma);
    expect(colorDistance(etdPixel, ETD_COLOR)).toBeLessThan(35);
    expect(colorDistance(stdPixel, STD_COLOR)).toBeGreaterThan(30);
  });
});
