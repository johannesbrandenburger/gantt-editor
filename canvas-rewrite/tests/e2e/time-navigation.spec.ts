import { expect, test, type Page } from "@playwright/test";
import {
  canvasPointToPagePoint,
  clearHarnessEvents,
  getCanvasState,
  getCanvasStateField,
  getHarnessEvents,
  openE2eHarness,
} from "./helpers";

type CanvasState = {
  margin: { left: number; right: number };
  layout: {
    groups: Array<{ id: string; y: number; h: number }>;
  } | null;
};

async function getPanStartPoint(page: Page): Promise<{ x: number; y: number }> {
  const state = await getCanvasState<CanvasState>(page);
  expect(state).not.toBeNull();
  expect(state?.layout).not.toBeNull();

  if (!state?.layout || state.layout.groups.length === 0) {
    throw new Error("Expected chart layout to compute pan test point");
  }

  return {
    x: state.margin.left + 20,
    y: state.layout.groups[0]!.y + Math.max(8, Math.floor(state.layout.groups[0]!.h * 0.2)),
  };
}

test.describe("canvas rewrite time navigation", () => {
  test("pan timeline with right-click drag", async ({ page }) => {
    const canvas = await openE2eHarness(page);
    await clearHarnessEvents(page);

    const beforeStartMs = await getCanvasStateField<number>(page, "internalStartTimeMs");
    const panCanvasPoint = await getPanStartPoint(page);
    const panPagePoint = await canvasPointToPagePoint(canvas, panCanvasPoint);

    await page.mouse.move(panPagePoint.x, panPagePoint.y);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(panPagePoint.x - 120, panPagePoint.y, { steps: 8 });
    await page.mouse.up({ button: "right" });

    await expect
      .poll(async () => await getCanvasStateField<number>(page, "internalStartTimeMs"), {
        timeout: 2_000,
      })
      .not.toBe(beforeStartMs);

    await expect
      .poll(async () => {
        const events = await getHarnessEvents(page);
        return (events.onChangeStartAndEndTime ?? []).length;
      })
      .toBeGreaterThan(0);
  });

  test("pan timeline with Shift+drag", async ({ page }) => {
    const canvas = await openE2eHarness(page);
    await clearHarnessEvents(page);

    const beforeStartMs = await getCanvasStateField<number>(page, "internalStartTimeMs");
    const panCanvasPoint = await getPanStartPoint(page);
    const panPagePoint = await canvasPointToPagePoint(canvas, panCanvasPoint);

    await page.keyboard.down("Shift");
    await page.mouse.move(panPagePoint.x, panPagePoint.y);
    await page.mouse.down();
    await page.mouse.move(panPagePoint.x - 120, panPagePoint.y, { steps: 8 });
    await page.mouse.up();
    await page.keyboard.up("Shift");

    await expect
      .poll(async () => await getCanvasStateField<number>(page, "internalStartTimeMs"), {
        timeout: 2_000,
      })
      .not.toBe(beforeStartMs);

    await expect
      .poll(async () => {
        const events = await getHarnessEvents(page);
        return (events.onChangeStartAndEndTime ?? []).length;
      })
      .toBeGreaterThan(0);
  });

  test("horizontal scroll changes time window", async ({ page }) => {
    const canvas = await openE2eHarness(page);
    await clearHarnessEvents(page);

    const beforeStartMs = await getCanvasStateField<number>(page, "internalStartTimeMs");
    const panCanvasPoint = await getPanStartPoint(page);
    const panPagePoint = await canvasPointToPagePoint(canvas, panCanvasPoint);

    await page.mouse.move(panPagePoint.x, panPagePoint.y);
    await page.mouse.wheel(140, 0);

    await expect
      .poll(async () => await getCanvasStateField<number>(page, "internalStartTimeMs"), {
        timeout: 2_000,
      })
      .not.toBe(beforeStartMs);

    await expect
      .poll(async () => {
        const events = await getHarnessEvents(page);
        return (events.onChangeStartAndEndTime ?? []).length;
      })
      .toBeGreaterThan(0);
  });

  test("zoom in with Shift + wheel decreases visible range", async ({ page }) => {
    const canvas = await openE2eHarness(page);
    await clearHarnessEvents(page);

    const panCanvasPoint = await getPanStartPoint(page);
    const panPagePoint = await canvasPointToPagePoint(canvas, panCanvasPoint);

    const startBefore = await getCanvasStateField<number>(page, "internalStartTimeMs");
    const endBefore = await getCanvasStateField<number>(page, "internalEndTimeMs");
    expect(startBefore).not.toBeNull();
    expect(endBefore).not.toBeNull();
    const spanBefore = (endBefore as number) - (startBefore as number);

    await page.mouse.move(panPagePoint.x, panPagePoint.y);
    await page.keyboard.down("Shift");
    await page.mouse.wheel(0, -220);
    await page.keyboard.up("Shift");

    await expect
      .poll(async () => {
        const start = await getCanvasStateField<number>(page, "internalStartTimeMs");
        const end = await getCanvasStateField<number>(page, "internalEndTimeMs");
        if (start == null || end == null) return null;
        return end - start;
      })
      .toBeLessThan(spanBefore);
  });

  test("zoom out with Shift + wheel increases visible range", async ({ page }) => {
    const canvas = await openE2eHarness(page);
    await clearHarnessEvents(page);

    const panCanvasPoint = await getPanStartPoint(page);
    const panPagePoint = await canvasPointToPagePoint(canvas, panCanvasPoint);

    const startBefore = await getCanvasStateField<number>(page, "internalStartTimeMs");
    const endBefore = await getCanvasStateField<number>(page, "internalEndTimeMs");
    expect(startBefore).not.toBeNull();
    expect(endBefore).not.toBeNull();
    const spanBefore = (endBefore as number) - (startBefore as number);

    await page.mouse.move(panPagePoint.x, panPagePoint.y);
    await page.keyboard.down("Shift");
    await page.mouse.wheel(0, 220);
    await page.keyboard.up("Shift");

    await expect
      .poll(async () => {
        const start = await getCanvasStateField<number>(page, "internalStartTimeMs");
        const end = await getCanvasStateField<number>(page, "internalEndTimeMs");
        if (start == null || end == null) return null;
        return end - start;
      })
      .toBeGreaterThan(spanBefore);
  });
});
