import { expect, test, type Page } from "@playwright/test";
import {
  canvasPointToPagePoint,
  getCanvasState,
  getCanvasStateField,
  openE2eHarness,
} from "./helpers";

type PerfCanvasState = {
  margin: { left: number; right: number };
  layout: {
    groups: Array<{ id: string; y: number; h: number; scrollOffset: number }>;
  } | null;
};

type WheelPerfOptions = {
  canvasX: number;
  canvasY: number;
  deltaY: number;
  modifier: "none" | "shift";
  steps: number;
  stepDelayMs: number;
  settleMs: number;
  expectation: "zoom" | "vertical";
};

type WheelPerfResult = {
  fps: number;
  frameCount: number;
};

const IS_CI = !!process.env.CI;
const MIN_ZOOM_FPS = IS_CI ? 30 : 65;
const MIN_VERTICAL_SCROLL_FPS = IS_CI ? 55 : 75;

async function getNavigationPoint(page: Page): Promise<{ x: number; y: number }> {
  const state = await getCanvasState<PerfCanvasState>(page);
  expect(state).not.toBeNull();
  expect(state?.layout).not.toBeNull();

  if (!state?.layout || state.layout.groups.length === 0) {
    throw new Error("Expected at least one chart group in performance fixture");
  }

  return {
    x: state.margin.left + 96,
    y: state.layout.groups[0]!.y + Math.max(12, Math.floor(state.layout.groups[0]!.h * 0.35)),
  };
}

async function measureWheelInteractionFps(
  page: Page,
  options: WheelPerfOptions,
): Promise<WheelPerfResult> {
  await page.mouse.move(options.canvasX, options.canvasY);

  await page.evaluate(() => {
    const w = window as Window & {
      __ganttPerfProbe?: {
        running: boolean;
        rafTimes: number[];
      };
    };
    w.__ganttPerfProbe = { running: true, rafTimes: [] };
    const tick = (ts: number) => {
      const probe = w.__ganttPerfProbe;
      if (!probe) return;
      probe.rafTimes.push(ts);
      if (probe.running) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  if (options.modifier === "shift") {
    await page.keyboard.down("Shift");
  }
  for (let i = 0; i < options.steps; i += 1) {
    await page.mouse.wheel(0, options.deltaY);
    await page.waitForTimeout(options.stepDelayMs);
  }
  if (options.modifier === "shift") {
    await page.keyboard.up("Shift");
  }

  await page.waitForTimeout(options.settleMs);

  return await page.evaluate(() => {
    const w = window as Window & {
      __ganttPerfProbe?: {
        running: boolean;
        rafTimes: number[];
      };
    };
    const probe = w.__ganttPerfProbe;
    if (!probe) {
      return { fps: 0, frameCount: 0 };
    }
    probe.running = false;
    const frameCount = probe.rafTimes.length;
    const durationMs =
      frameCount > 1 ? probe.rafTimes[frameCount - 1]! - probe.rafTimes[0]! : 0;
    const fps = durationMs > 0 ? ((frameCount - 1) * 1000) / durationMs : 0;
    delete w.__ganttPerfProbe;
    return { fps, frameCount };
  });
}

function totalVerticalOffset(state: PerfCanvasState | null): number {
  const groups = state?.layout?.groups ?? [];
  return groups.reduce((sum, group) => sum + group.scrollOffset, 0);
}

test.describe("canvas rewrite performance navigation", () => {
  test.setTimeout(120_000);

  test("keeps interactive frame rate with 50k slots across zoom and vertical navigation", async ({ page }) => {
    const canvas = await openE2eHarness(page, {
      fixture: "performance",
      query: {
        slots: 50_000,
        startTime: "2025-01-01T00:00:00Z",
        endTime: "2025-03-31T23:59:59Z",
      },
    });

    const navCanvasPoint = await getNavigationPoint(page);
    const navPagePoint = await canvasPointToPagePoint(canvas, navCanvasPoint);
    await page.mouse.move(navPagePoint.x, navPagePoint.y);

    const spanBeforeZoom =
      ((await getCanvasStateField<number>(page, "internalEndTimeMs")) ?? 0) -
      ((await getCanvasStateField<number>(page, "internalStartTimeMs")) ?? 0);

    const zoomMetrics = await measureWheelInteractionFps(page, {
      canvasX: navPagePoint.x,
      canvasY: navPagePoint.y,
      deltaY: -140,
      modifier: "shift",
      steps: 42,
      stepDelayMs: 16,
      settleMs: 220,
      expectation: "zoom",
    });

    const spanAfterZoom =
      ((await getCanvasStateField<number>(page, "internalEndTimeMs")) ?? 0) -
      ((await getCanvasStateField<number>(page, "internalStartTimeMs")) ?? 0);

    const offsetBeforeDown = totalVerticalOffset(await getCanvasState<PerfCanvasState>(page));

    const scrollDownMetrics = await measureWheelInteractionFps(page, {
      canvasX: navPagePoint.x,
      canvasY: navPagePoint.y,
      deltaY: 140,
      modifier: "none",
      steps: 42,
      stepDelayMs: 16,
      settleMs: 220,
      expectation: "vertical",
    });

    const offsetAfterDown = totalVerticalOffset(await getCanvasState<PerfCanvasState>(page));

    const offsetBeforeUp = totalVerticalOffset(await getCanvasState<PerfCanvasState>(page));

    const scrollUpMetrics = await measureWheelInteractionFps(page, {
      canvasX: navPagePoint.x,
      canvasY: navPagePoint.y,
      deltaY: -140,
      modifier: "none",
      steps: 42,
      stepDelayMs: 16,
      settleMs: 220,
      expectation: "vertical",
    });

    const offsetAfterUp = totalVerticalOffset(await getCanvasState<PerfCanvasState>(page));

    expect(spanAfterZoom).toBeLessThan(spanBeforeZoom);
    expect(offsetAfterDown).toBeGreaterThan(offsetBeforeDown);
    expect(offsetAfterUp).toBeLessThan(offsetBeforeUp);

    expect(zoomMetrics.frameCount).toBeGreaterThan(20);
    expect(scrollDownMetrics.frameCount).toBeGreaterThan(20);
    expect(scrollUpMetrics.frameCount).toBeGreaterThan(20);

    // log the fps values
    console.log(`Zoom FPS: ${zoomMetrics.fps.toFixed(2)}`);
    console.log(`Scroll Down FPS: ${scrollDownMetrics.fps.toFixed(2)}`);
    console.log(`Scroll Up FPS: ${scrollUpMetrics.fps.toFixed(2)}`);

    expect(zoomMetrics.fps, `zoom fps=${zoomMetrics.fps.toFixed(2)}`).toBeGreaterThan(MIN_ZOOM_FPS);
    expect(
      scrollDownMetrics.fps,
      `scroll-down fps=${scrollDownMetrics.fps.toFixed(2)}`,
    ).toBeGreaterThan(MIN_VERTICAL_SCROLL_FPS);
    expect(scrollUpMetrics.fps, `scroll-up fps=${scrollUpMetrics.fps.toFixed(2)}`).toBeGreaterThan(
      MIN_VERTICAL_SCROLL_FPS,
    );
  });
});
