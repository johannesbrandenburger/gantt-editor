import { expect, test, type Page } from "./coverage-test";
import {
  canvasPointToPagePoint,
  clearHarnessEvents,
  getCanvasState,
  getCanvasStateField,
  getHarnessEvents,
  openE2eHarness,
} from "./helpers";

type CanvasState = {
  rowHeight: number;
  internalStartTimeMs: number;
  internalEndTimeMs: number;
  margin: { left: number; right: number };
  slotReferenceAspectRatio: number;
  layout: {
    axisRect: { y: number; h: number };
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

    await expect
      .poll(async () => await getCanvasStateField<boolean>(page, "contextMenuOpen"))
      .toBe(false);
  });

  test("pan timeline with Shift+drag", async ({ page }) => {
    const canvas = await openE2eHarness(page);
    await clearHarnessEvents(page);

    const beforeStartMs = await getCanvasStateField<number>(page, "internalStartTimeMs");
    const beforeSelection = await getCanvasStateField<string[]>(page, "selectionSlotIds");
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

    await expect
      .poll(async () => await getCanvasStateField<string[]>(page, "selectionSlotIds"))
      .toEqual(beforeSelection ?? []);
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

  test("zooming chart body preserves slot aspect ratio by changing row height", async ({ page }) => {
    const canvas = await openE2eHarness(page);
    await clearHarnessEvents(page);

    const before = await getCanvasState<CanvasState>(page);
    expect(before).not.toBeNull();
    expect(before?.layout).not.toBeNull();
    const chartPoint = await getPanStartPoint(page);
    const pagePoint = await canvasPointToPagePoint(canvas, chartPoint);
    const spanBefore = before!.internalEndTimeMs - before!.internalStartTimeMs;

    await page.mouse.move(pagePoint.x, pagePoint.y);
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

    const rowHeightAfter = await getCanvasStateField<number>(page, "rowHeight");
    expect(rowHeightAfter).not.toBeNull();
    expect(rowHeightAfter).toBeGreaterThan(before!.rowHeight);
  });

  test("zooming x-axis changes time width without changing slot height", async ({ page }) => {
    const canvas = await openE2eHarness(page);
    await clearHarnessEvents(page);

    const before = await getCanvasState<CanvasState>(page);
    expect(before).not.toBeNull();
    expect(before?.layout).not.toBeNull();
    if (!before?.layout) {
      throw new Error("Expected chart layout to compute axis zoom point");
    }
    const axisCanvasPoint = {
      x: before.margin.left + 20,
      y: before.layout.axisRect.y + before.layout.axisRect.h / 2,
    };
    const axisPagePoint = await canvasPointToPagePoint(canvas, axisCanvasPoint);
    const spanBefore = before.internalEndTimeMs - before.internalStartTimeMs;

    await page.mouse.move(axisPagePoint.x, axisPagePoint.y);
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

    const rowHeightAfter = await getCanvasStateField<number>(page, "rowHeight");
    expect(rowHeightAfter).toBe(before.rowHeight);
  });

  test("chart body zoom preserves ratio established by prior x-axis zoom", async ({ page }) => {
    const canvas = await openE2eHarness(page);
    await clearHarnessEvents(page);

    const before = await getCanvasState<CanvasState>(page);
    expect(before).not.toBeNull();
    expect(before?.layout).not.toBeNull();
    if (!before?.layout) {
      throw new Error("Expected chart layout to compute zoom points");
    }

    const axisCanvasPoint = {
      x: before.margin.left + 20,
      y: before.layout.axisRect.y + before.layout.axisRect.h / 2,
    };
    const chartCanvasPoint = {
      x: before.margin.left + 40,
      y: before.layout.groups[0]!.y + Math.max(8, Math.floor(before.layout.groups[0]!.h * 0.2)),
    };
    const axisPagePoint = await canvasPointToPagePoint(canvas, axisCanvasPoint);
    const chartPagePoint = await canvasPointToPagePoint(canvas, chartCanvasPoint);

    await page.mouse.move(axisPagePoint.x, axisPagePoint.y);
    await page.keyboard.down("Shift");
    await page.mouse.wheel(0, -220);
    await page.keyboard.up("Shift");

    await expect
      .poll(async () => {
        const state = await getCanvasState<CanvasState>(page);
        if (!state) return null;
        return state.internalEndTimeMs - state.internalStartTimeMs;
      })
      .toBeLessThan(before.internalEndTimeMs - before.internalStartTimeMs);

    const afterAxis = await getCanvasState<CanvasState>(page);
    expect(afterAxis).not.toBeNull();
    expect(afterAxis!.rowHeight).toBe(before.rowHeight);
    const axisRatio = afterAxis!.slotReferenceAspectRatio;

    await page.mouse.move(chartPagePoint.x, chartPagePoint.y);
    await page.keyboard.down("Shift");
    await page.mouse.wheel(0, -220);
    await page.keyboard.up("Shift");

    await expect
      .poll(async () => {
        const state = await getCanvasState<CanvasState>(page);
        if (!state) return null;
        return state.internalEndTimeMs - state.internalStartTimeMs;
      })
      .toBeLessThan(afterAxis!.internalEndTimeMs - afterAxis!.internalStartTimeMs);

    const afterChart = await getCanvasState<CanvasState>(page);
    expect(afterChart).not.toBeNull();
    expect(afterChart!.rowHeight).toBeGreaterThan(afterAxis!.rowHeight);
    expect(afterChart!.slotReferenceAspectRatio).toBeCloseTo(axisRatio, 3);
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
