import { expect, test, type Page } from "./coverage-test";
import { getCanvasState, getHarnessConfig, openE2eHarness } from "./helpers";

type CanvasState = {
  margin: { left: number; right: number };
  internalStartTimeMs: number;
  internalEndTimeMs: number;
  layout: {
    canvasCssWidth: number;
    groups: Array<{ id: string; y: number; h: number }>;
  } | null;
};

type Rgba = { r: number; g: number; b: number; a: number };

function timeToCanvasX(state: CanvasState, dateMs: number): number {
  if (!state.layout) {
    throw new Error("Expected layout in canvas state");
  }
  const chartWidth = state.layout.canvasCssWidth - state.margin.left - state.margin.right;
  const ratio = (dateMs - state.internalStartTimeMs) / (state.internalEndTimeMs - state.internalStartTimeMs);
  return state.margin.left + ratio * chartWidth;
}

async function sampleCanvasPixel(
  page: Page,
  point: { x: number; y: number },
): Promise<Rgba> {
  return await page.evaluate(({ x, y }: { x: number; y: number }) => {
    const canvas = document.querySelector("canvas.chart-canvas") as HTMLCanvasElement | null;
    if (!canvas) throw new Error("Expected chart canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Expected 2d context");

    const dpr = window.devicePixelRatio || 1;
    const pixelX = Math.max(0, Math.min(canvas.width - 1, Math.round(x * dpr)));
    const pixelY = Math.max(0, Math.min(canvas.height - 1, Math.round(y * dpr)));
    const data = context.getImageData(pixelX, pixelY, 1, 1).data;

    return { r: data[0] ?? 0, g: data[1] ?? 0, b: data[2] ?? 0, a: data[3] ?? 0 };
  }, point);
}

async function findTopicProbePoint(
  page: Page,
  topicId: string,
): Promise<{ x: number; y: number }> {
  const point = await page.evaluate((targetTopicId: string) => {
    const api = (window as Window & {
      __ganttCanvasTestApi?: {
        flush: () => void;
        getState: () => {
          margin: { left: number; right: number };
          layout: { canvasCssWidth: number; canvasCssHeight: number } | null;
        };
        probeCanvasPoint: (x: number, y: number) => { topicId: string | null };
      };
    }).__ganttCanvasTestApi;

    api?.flush();
    const state = api?.getState();
    if (!api || !state?.layout) return null;

    const maxY = Math.max(1, state.layout.canvasCssHeight - 2);
    const x = Math.max(2, Math.floor(state.margin.left * 0.5));

    for (let y = 2; y <= maxY; y += 2) {
      const probe = api.probeCanvasPoint(x, y);
      if (probe.topicId === targetTopicId) {
        return { x, y };
      }
    }

    return null;
  }, topicId);

  expect(point, `Expected probe point for topic ${topicId}`).not.toBeNull();
  return point as { x: number; y: number };
}

test.describe("canvas rewrite marked regions", () => {
  test("core fixture has no marked region by default", async ({ page }) => {
    await openE2eHarness(page, { fixture: "core" });

    const config = await getHarnessConfig(page);
    expect(config.markedRegion ?? null).toBeNull();
  });

  test("multiple-destination marked region tints first group only", async ({ page }) => {
    await openE2eHarness(page, { fixture: "markers" });

    const state = await getCanvasState<CanvasState>(page);
    expect(state).not.toBeNull();
    expect(state?.layout).not.toBeNull();
    if (!state?.layout || state.layout.groups.length < 2) {
      throw new Error("Expected at least two groups for marked region test");
    }

    const x = timeToCanvasX(state, Date.parse("2025-01-01T11:30:00Z"));
    const firstGroupY = state.layout.groups[0]!.y + 3;
    const secondGroupY = state.layout.groups[1]!.y + 3;

    const firstPixel = await sampleCanvasPixel(page, { x, y: firstGroupY });
    const secondPixel = await sampleCanvasPixel(page, { x, y: secondGroupY });

    expect(firstPixel.g).toBeGreaterThanOrEqual(secondPixel.g);
    expect(firstPixel.b).toBeLessThan(secondPixel.b);
  });

  test("single-destination marked region affects only the target destination", async ({ page }) => {
    const customData = {
      markedRegion: {
        startTime: "2025-01-01T10:00:00.000Z",
        endTime: "2025-01-01T14:00:00.000Z",
        destinationId: "chute-2",
      },
    };

    await openE2eHarness(page, {
      fixture: "core",
      query: { data: JSON.stringify(customData) },
    });

    const state = await getCanvasState<CanvasState>(page);
    expect(state).not.toBeNull();
    expect(state?.layout).not.toBeNull();
    if (!state?.layout) {
      throw new Error("Expected layout for single-destination marked region test");
    }

    const x = timeToCanvasX(state, Date.parse("2025-01-01T11:00:00Z"));
    const chute1Point = await findTopicProbePoint(page, "chute-1");
    const chute2Point = await findTopicProbePoint(page, "chute-2");

    const chute1Pixel = await sampleCanvasPixel(page, { x, y: chute1Point.y });
    const chute2Pixel = await sampleCanvasPixel(page, { x, y: chute2Point.y });

    expect(chute2Pixel.b).toBeLessThan(chute1Pixel.b);
    expect(chute2Pixel.g).toBeGreaterThanOrEqual(chute1Pixel.g);
  });
});
