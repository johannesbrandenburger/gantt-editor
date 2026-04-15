import { expect, test, type Page } from "./coverage-test";
import {
  findSlotPoint,
  findTopicTogglePoint,
  getCanvasState,
  getCanvasStateField,
  getHarnessConfig,
  openE2eHarness,
  setHarnessConfig,
} from "./helpers";

type CanvasState = {
  margin: { left: number; right: number };
  internalStartTimeMs: number;
  internalEndTimeMs: number;
  layout: {
    canvasCssWidth: number;
    canvasCssHeight: number;
    groups: Array<{ id: string; y: number; h: number }>;
  } | null;
};

async function findDepartureGapSlotId(page: Page): Promise<string | null> {
  return await page.evaluate(() => {
    const api = (window as Window & {
      __ganttCanvasTestApi?: {
        flush: () => void;
        getState: () => {
          margin: { left: number; right: number };
          layout: { canvasCssWidth: number; canvasCssHeight: number } | null;
        };
        probeCanvasPoint: (
          x: number,
          y: number,
        ) => { departureGapSlotId: string | null };
      };
    }).__ganttCanvasTestApi;

    api?.flush();
    const state = api?.getState();
    if (!api || !state?.layout) return null;

    const minX = state.margin.left + 1;
    const maxX = Math.max(minX, state.layout.canvasCssWidth - state.margin.right - 1);
    const maxY = Math.max(1, state.layout.canvasCssHeight - 1);

    for (let y = 1; y <= maxY; y += 3) {
      for (let x = minX; x <= maxX; x += 3) {
        const slotId = api.probeCanvasPoint(x, y).departureGapSlotId;
        if (slotId) return slotId;
      }
    }

    return null;
  });
}

test.describe("canvas rewrite rendering and display", () => {
  test("component loads and renders chart canvas", async ({ page }) => {
    await openE2eHarness(page, { fixture: "core" });

    const state = await getCanvasState<CanvasState>(page);
    expect(state).not.toBeNull();
    expect(state?.layout).not.toBeNull();
    expect(state?.layout?.canvasCssWidth ?? 0).toBeGreaterThan(0);
    expect(state?.layout?.canvasCssHeight ?? 0).toBeGreaterThan(0);
  });

  test("displays slots that are hit-testable", async ({ page }) => {
    await openE2eHarness(page, { fixture: "core" });

    const slotPoint = await findSlotPoint(page, "LH123-20250101-F", "center");
    expect(slotPoint.x).toBeGreaterThan(0);
    expect(slotPoint.y).toBeGreaterThan(0);
  });

  test("shows destination labels in topic gutter", async ({ page }) => {
    await openE2eHarness(page, { fixture: "core" });

    const topicPoint = await findTopicTogglePoint(page);
    expect(topicPoint.topicId.length).toBeGreaterThan(0);
  });

  test("shows destination groups in layout", async ({ page }) => {
    await openE2eHarness(page, { fixture: "core" });

    const state = await getCanvasState<CanvasState>(page);
    expect(state?.layout?.groups.map((group) => group.id).sort()).toEqual([
      "allocated",
      "unallocated",
    ]);
  });

  test("renders a valid x-axis time window", async ({ page }) => {
    await openE2eHarness(page, { fixture: "core" });

    const startMs = await getCanvasStateField<number>(page, "internalStartTimeMs");
    const endMs = await getCanvasStateField<number>(page, "internalEndTimeMs");

    expect(startMs).not.toBeNull();
    expect(endMs).not.toBeNull();
    expect((endMs as number) - (startMs as number)).toBeGreaterThan(0);
  });

  test("renders departure marker hit regions for slots with deadlines", async ({ page }) => {
    await openE2eHarness(page, { fixture: "core" });

    const departureGapSlotId = await findDepartureGapSlotId(page);
    expect(departureGapSlotId).toBeTruthy();
  });

  test("treats departure marker line as a hit region", async ({ page }) => {
    await openE2eHarness(page, { fixture: "core" });

    const hitOnMarker = await page.evaluate(() => {
      const w = window as Window & {
        __ganttCanvasTestApi?: {
          flush: () => void;
          getState: () => {
            margin: { left: number; right: number };
            internalStartTimeMs: number;
            internalEndTimeMs: number;
            layout: { canvasCssWidth: number; canvasCssHeight: number } | null;
          };
          findSlotPoint: (slotId: string, mode?: "center" | "left-edge" | "right-edge") => { x: number; y: number } | null;
          probeCanvasPoint: (x: number, y: number) => { departureGapSlotId: string | null };
        };
        __ganttE2eHarness?: {
          getConfig: () => {
            slots: Array<{
              id: string;
              deadlines?: Array<{ id: string; timestamp: number }>;
            }>;
          };
        };
      };

      const api = w.__ganttCanvasTestApi;
      const harness = w.__ganttE2eHarness;
      api?.flush();
      const state = api?.getState();
      const config = harness?.getConfig();
      if (!api || !state?.layout || !config?.slots?.length) return null;

      const minTime = state.internalStartTimeMs;
      const maxTime = state.internalEndTimeMs;
      const span = maxTime - minTime;
      const chartWidth = state.layout.canvasCssWidth - state.margin.left - state.margin.right;
      if (span <= 0 || chartWidth <= 0) return null;

      const markerXForTimeMs = (timeMs: number): number =>
        state.margin.left + ((timeMs - minTime) / span) * chartWidth;

      for (const slot of config.slots) {
        const center = api.findSlotPoint(slot.id, "center");
        if (!center) continue;

        const markerCandidates = (slot.deadlines ?? [])
          .map((d) => d.timestamp)
          .filter((timeMs) => Number.isFinite(timeMs) && timeMs >= minTime && timeMs <= maxTime);

        for (const markerTimeMs of markerCandidates) {
          const markerX = markerXForTimeMs(markerTimeMs);
          const slotId = api.probeCanvasPoint(markerX, center.y).departureGapSlotId;
          if (slotId === slot.id) {
            return { slotId, markerX, y: center.y };
          }
        }
      }

      return null;
    });

    expect(hitOnMarker).toBeTruthy();
  });

  test("deadline before slot connects to slot start (not slot end)", async ({ page }) => {
    await openE2eHarness(page, { fixture: "core" });

    const config = await getHarnessConfig(page);
    const slotId = "LH123-20250101-F";
    const targetSlot = config.slots.find((slot) => slot.id === slotId);
    expect(targetSlot).toBeTruthy();

    const openMs = new Date(targetSlot!.openTime as string | Date).getTime();
    const markerMs = openMs - 30 * 60 * 1000;

    await setHarnessConfig(page, {
      slots: config.slots.map((slot) =>
        slot.id === slotId
          ? {
              ...slot,
              deadlines: [{ id: "std", timestamp: markerMs }],
            }
          : slot,
      ),
    });

    const probe = await page.evaluate(({ currentSlotId, currentMarkerMs }) => {
      const w = window as Window & {
        __ganttCanvasTestApi?: {
          flush: () => void;
          getState: () => {
            margin: { left: number; right: number };
            internalStartTimeMs: number;
            internalEndTimeMs: number;
            layout: { canvasCssWidth: number; canvasCssHeight: number } | null;
          };
          findSlotPoint: (
            slotId: string,
            mode?: "center" | "left-edge" | "right-edge",
          ) => { x: number; y: number } | null;
          probeCanvasPoint: (x: number, y: number) => { departureGapSlotId: string | null };
        };
      };

      const api = w.__ganttCanvasTestApi;
      api?.flush();
      const state = api?.getState();
      if (!api || !state?.layout) return null;

      const leftEdge = api.findSlotPoint(currentSlotId, "left-edge");
      const rightEdge = api.findSlotPoint(currentSlotId, "right-edge");
      const center = api.findSlotPoint(currentSlotId, "center");
      if (!leftEdge || !rightEdge || !center) return null;

      const chartWidth = state.layout.canvasCssWidth - state.margin.left - state.margin.right;
      const span = state.internalEndTimeMs - state.internalStartTimeMs;
      if (chartWidth <= 0 || span <= 0) return null;

      const markerX =
        state.margin.left + ((currentMarkerMs - state.internalStartTimeMs) / span) * chartWidth;

      const towardStartX = Math.round((markerX + leftEdge.x) / 2);
      const towardEndX = Math.round((markerX + rightEdge.x) / 2);

      return {
        towardStart: api.probeCanvasPoint(towardStartX, center.y).departureGapSlotId,
        towardEnd: api.probeCanvasPoint(towardEndX, center.y).departureGapSlotId,
      };
    }, { currentSlotId: slotId, currentMarkerMs: markerMs });

    expect(probe).toBeTruthy();
    expect(probe!.towardStart).toBe(slotId);
    expect(probe!.towardEnd).toBeNull();
  });

  test("deadline inside slot has marker hit but no connector corridor", async ({ page }) => {
    await openE2eHarness(page, { fixture: "core" });

    const config = await getHarnessConfig(page);
    const slotId = "LH123-20250101-F";
    const targetSlot = config.slots.find((slot) => slot.id === slotId);
    expect(targetSlot).toBeTruthy();

    const openMs = new Date(targetSlot!.openTime as string | Date).getTime();
    const closeMs = new Date(targetSlot!.closeTime).getTime();
    const markerMs = openMs + Math.round((closeMs - openMs) / 2);

    await setHarnessConfig(page, {
      slots: config.slots.map((slot) =>
        slot.id === slotId
          ? {
              ...slot,
              deadlines: [{ id: "std", timestamp: markerMs }],
            }
          : slot,
      ),
    });

    const probe = await page.evaluate(({ currentSlotId, currentMarkerMs }) => {
      const w = window as Window & {
        __ganttCanvasTestApi?: {
          flush: () => void;
          getState: () => {
            margin: { left: number; right: number };
            internalStartTimeMs: number;
            internalEndTimeMs: number;
            layout: { canvasCssWidth: number; canvasCssHeight: number } | null;
          };
          findSlotPoint: (
            slotId: string,
            mode?: "center" | "left-edge" | "right-edge",
          ) => { x: number; y: number } | null;
          probeCanvasPoint: (x: number, y: number) => { departureGapSlotId: string | null };
        };
      };

      const api = w.__ganttCanvasTestApi;
      api?.flush();
      const state = api?.getState();
      if (!api || !state?.layout) return null;

      const leftEdge = api.findSlotPoint(currentSlotId, "left-edge");
      const rightEdge = api.findSlotPoint(currentSlotId, "right-edge");
      const center = api.findSlotPoint(currentSlotId, "center");
      if (!leftEdge || !rightEdge || !center) return null;

      const chartWidth = state.layout.canvasCssWidth - state.margin.left - state.margin.right;
      const span = state.internalEndTimeMs - state.internalStartTimeMs;
      if (chartWidth <= 0 || span <= 0) return null;

      const markerX =
        state.margin.left + ((currentMarkerMs - state.internalStartTimeMs) / span) * chartWidth;

      const towardLeftX = Math.round((markerX + leftEdge.x) / 2);
      const towardRightX = Math.round((markerX + rightEdge.x) / 2);

      return {
        marker: api.probeCanvasPoint(Math.round(markerX), center.y).departureGapSlotId,
        towardLeft: api.probeCanvasPoint(towardLeftX, center.y).departureGapSlotId,
        towardRight: api.probeCanvasPoint(towardRightX, center.y).departureGapSlotId,
      };
    }, { currentSlotId: slotId, currentMarkerMs: markerMs });

    expect(probe).toBeTruthy();
    expect(probe!.marker).toBe(slotId);
    expect(probe!.towardLeft).toBeNull();
    expect(probe!.towardRight).toBeNull();
  });
});
