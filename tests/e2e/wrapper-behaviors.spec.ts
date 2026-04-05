import { expect, test } from "./coverage-test";
import {
  canvasPointToPagePoint,
  callHarnessClearClipboard,
  clearHarnessEvents,
  dispatchCanvasMouseEvent,
  findSlotPoint,
  getCanvasState,
  getCanvasStateField,
  getHarnessEvents,
  inspectHarnessExposedApi,
  openE2eHarness,
  setHarnessGanttMounted,
  waitForCanvasApi,
} from "./helpers";

const SLOT_ID = "LH123-20250101-F";
const SLOT_B = "OS200-20250101-G";
const DAY_IN_MS = 24 * 60 * 60 * 1000;

async function pointForDayOffset(page: Parameters<typeof openE2eHarness>[0], dayOffset: number) {
  const state = await getCanvasState<{
    internalStartTimeMs: number;
    internalEndTimeMs: number;
    margin: { left: number; right: number };
    layout: {
      canvasCssWidth: number;
      groups: Array<{ id: string; y: number; h: number }>;
    } | null;
  }>(page);

  expect(state?.layout).not.toBeNull();

  const baseDay = new Date("2025-01-01T00:00:00Z").getTime();
  const targetMs = baseDay + dayOffset * DAY_IN_MS + 12 * 60 * 60 * 1000;
  const chartWidth = state!.layout!.canvasCssWidth - state!.margin.left - state!.margin.right;
  const spanMs = state!.internalEndTimeMs - state!.internalStartTimeMs;
  const ratio = Math.max(0, Math.min(1, (targetMs - state!.internalStartTimeMs) / spanMs));
  const x = state!.margin.left + ratio * chartWidth;

  const firstGroup = state!.layout!.groups[0];
  expect(firstGroup).toBeTruthy();
  return { x, y: firstGroup.y + firstGroup.h / 2 };
}

async function seedSelection(page: Parameters<typeof openE2eHarness>[0], slotIds: string[]) {
  await page.evaluate(async (ids) => {
    const harness = (window as Window & {
      __ganttE2eHarness?: { getConfig: () => { slots: Array<Record<string, unknown>> } };
    }).__ganttE2eHarness;
    const config = harness?.getConfig();
    const slots = config?.slots ?? [];
    const selected = slots.filter((slot) => ids.includes(String(slot.id)));
    localStorage.setItem("pointerSelection", JSON.stringify(selected));
  }, slotIds);
}

test.describe("canvas rewrite wrapper behaviors", () => {
  test("canvas mouseleave clears pointerInChart state", async ({ page }) => {
    const canvas = await openE2eHarness(page);

    const slotCenter = await findSlotPoint(page, SLOT_ID, "center");
    const pagePoint = await canvasPointToPagePoint(canvas, slotCenter);
    await page.mouse.move(1, 1);
    await page.mouse.move(pagePoint.x, pagePoint.y, { steps: 12 });

    await expect
      .poll(async () => await getCanvasStateField<boolean | null>(page, "pointerInChart"), {
        timeout: 2_000,
      })
      .toBe(true);

    await page.evaluate(() => {
      const canvasEl = document.querySelector("canvas.chart-canvas") as HTMLCanvasElement | null;
      canvasEl?.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true, cancelable: true }));
    });

    await expect
      .poll(async () => await getCanvasStateField<boolean | null>(page, "pointerInChart"), {
        timeout: 2_000,
      })
      .toBe(false);
  });

  test("clearClipboard alias clears selected slots", async ({ page }) => {
    await openE2eHarness(page);

    const slotCenter = await findSlotPoint(page, SLOT_ID, "center");
    await dispatchCanvasMouseEvent(page, slotCenter, "click");

    await expect
      .poll(async () => ((await getCanvasStateField<string[]>(page, "selectionSlotIds")) ?? []).length, {
        timeout: 2_000,
      })
      .toBeGreaterThan(0);

    await expect(await callHarnessClearClipboard(page)).toBe(true);

    await expect
      .poll(async () => (await getCanvasStateField<string[]>(page, "selectionSlotIds")) ?? [], {
        timeout: 2_000,
      })
      .toEqual([]);
  });

  test("defineExpose ganttCanvasTestApi methods are callable", async ({ page }) => {
    await openE2eHarness(page);

    await expect
      .poll(async () => await inspectHarnessExposedApi(page, SLOT_ID), {
        timeout: 2_000,
      })
      .toEqual({
        hasApi: true,
        hasLayout: true,
        probeSlotId: SLOT_ID,
        foundSlotPoint: true,
      });
  });

  test("unmount removes global test API and remount restores it", async ({ page }) => {
    await openE2eHarness(page);

    await expect(page.locator("canvas.chart-canvas")).toHaveCount(1);
    await page.waitForFunction(() => !!(window as Window & { __ganttCanvasTestApi?: unknown }).__ganttCanvasTestApi);

    await expect(await setHarnessGanttMounted(page, false)).toBe(false);

    await expect(page.locator("canvas.chart-canvas")).toHaveCount(0);
    await page.waitForFunction(() => !(window as Window & { __ganttCanvasTestApi?: unknown }).__ganttCanvasTestApi);

    await expect(await setHarnessGanttMounted(page, true)).toBe(true);

    await expect(page.locator("canvas.chart-canvas")).toHaveCount(1);
    await waitForCanvasApi(page);
    await page.waitForFunction(() => !!(window as Window & { __ganttCanvasTestApi?: unknown }).__ganttCanvasTestApi);
  });

  test("Shift + click with multi-selection emits onBulkMoveSlotsOnTimeAxis", async ({ page }) => {
    await openE2eHarness(page, {
      fixture: "core",
      query: {
        startTime: "2025-01-01T00:00:00Z",
        endTime: "2025-01-03T00:00:00Z",
      },
    });
    await clearHarnessEvents(page);

    await seedSelection(page, [SLOT_ID, SLOT_B]);

    const nextDayPoint = await pointForDayOffset(page, 1);
    await dispatchCanvasMouseEvent(page, nextDayPoint, "click", { shiftKey: true });

    await expect
      .poll(async () => {
        const events = await getHarnessEvents(page);
        const bulkMoves = (events.onBulkMoveSlotsOnTimeAxis ?? []) as Array<{
          slotIds?: string[];
          timeDiffMs?: number;
          preview?: boolean;
        }>;
        const committed = bulkMoves.find((event) => event.preview === false) ?? null;
        if (!committed) return null;
        return {
          slotIds: [...(committed.slotIds ?? [])].sort(),
          timeDiffMs: committed.timeDiffMs ?? null,
          preview: committed.preview ?? null,
        };
      })
      .toEqual({
        slotIds: [SLOT_ID, SLOT_B].sort(),
        timeDiffMs: DAY_IN_MS,
        preview: false,
      });
  });

  test("Shift + Alt + click with one selection emits onCopySlotOnTimeAxis", async ({ page }) => {
    await openE2eHarness(page, {
      fixture: "core",
      query: {
        startTime: "2025-01-01T00:00:00Z",
        endTime: "2025-01-03T00:00:00Z",
      },
    });
    await clearHarnessEvents(page);

    await seedSelection(page, [SLOT_ID]);

    const nextDayPoint = await pointForDayOffset(page, 1);
    await dispatchCanvasMouseEvent(page, nextDayPoint, "click", { shiftKey: true, altKey: true });

    await expect
      .poll(async () => {
        const events = await getHarnessEvents(page);
        const copies = (events.onCopySlotOnTimeAxis ?? []) as Array<{
          slotId?: string;
          timeDiffMs?: number;
          preview?: boolean;
        }>;
        return copies.find((event) => event.preview === false) ?? null;
      })
      .toEqual({ slotId: SLOT_ID, timeDiffMs: DAY_IN_MS, preview: false });
  });
});
