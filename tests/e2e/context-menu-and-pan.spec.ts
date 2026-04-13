import { expect, test, type Page } from "./coverage-test";
import {
  clickCanvasContextMenuItem,
  canvasPointToPagePoint,
  clearHarnessEvents,
  dispatchCanvasMouseEvent,
  findEmptyChartBackgroundPoint,
  findSlotPoint,
  findVerticalMarkerPoint,
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
    throw new Error("Expected chart layout groups to compute pan test point");
  }

  return {
    x: state.margin.left + 4,
    y: state.layout.groups[0]!.y + Math.max(8, Math.floor(state.layout.groups[0]!.h * 0.2)),
  };
}

test.describe("canvas rewrite context menu and pan", () => {
  test("right click on canvas prevents default context menu", async ({ page }) => {
    const canvas = await openE2eHarness(page);
    const panStartPoint = await getPanStartPoint(page);
    const pagePoint = await canvasPointToPagePoint(canvas, panStartPoint);

    await page.evaluate(() => {
      (window as Window & { __contextMenuPrevented?: boolean | null }).__contextMenuPrevented = null;
      document.addEventListener(
        "contextmenu",
        (event) => {
          (window as Window & { __contextMenuPrevented?: boolean }).__contextMenuPrevented =
            event.defaultPrevented;
        },
        { once: true, capture: false },
      );
    });

    await page.mouse.click(pagePoint.x, pagePoint.y, { button: "right" });

    await expect
      .poll(
        async () =>
          await page.evaluate(
            () => (window as Window & { __contextMenuPrevented?: boolean | null }).__contextMenuPrevented,
          ),
        { timeout: 2_000 },
      )
      .toBe(true);
  });

  test("right click without drag does not commit pan callback", async ({ page }) => {
    const canvas = await openE2eHarness(page);
    await clearHarnessEvents(page);

    const beforeStartMs = await getCanvasStateField<number>(page, "internalStartTimeMs");
    const panStartPoint = await getPanStartPoint(page);
    const pagePoint = await canvasPointToPagePoint(canvas, panStartPoint);

    await page.mouse.move(pagePoint.x, pagePoint.y);
    await page.mouse.down({ button: "right" });
    await page.mouse.up({ button: "right" });

    await expect
      .poll(async () => {
        const events = await getHarnessEvents(page);
        return (events.onChangeStartAndEndTime ?? []).length;
      })
      .toBe(0);

    await expect
      .poll(async () => await getCanvasStateField<number>(page, "internalStartTimeMs"), {
        timeout: 2_000,
      })
      .toBe(beforeStartMs);
  });

  test("right click on empty chart background opens canvas context menu", async ({ page }) => {
    await openE2eHarness(page, { fixture: "markers" });
    await clearHarnessEvents(page);

    const backgroundPoint = await findEmptyChartBackgroundPoint(page);
    await dispatchCanvasMouseEvent(page, backgroundPoint, "contextmenu");

    await expect
      .poll(async () => await getCanvasStateField<boolean>(page, "contextMenuOpen"))
      .toBe(true);

    await expect
      .poll(async () => {
        const events = await getHarnessEvents(page);
        return (events.onContextClickOnSlot ?? []).length;
      })
      .toBe(0);
  });

  test("right click on slot keeps slot context callback and does not open background menu", async ({ page }) => {
    await openE2eHarness(page, { fixture: "core" });
    await clearHarnessEvents(page);

    const slotPoint = await findSlotPoint(page, "LH123-20250101-F");
    await dispatchCanvasMouseEvent(page, slotPoint, "contextmenu");

    await expect
      .poll(async () => {
        const events = await getHarnessEvents(page);
        const contextEvents = (events.onContextClickOnSlot ?? []) as Array<{ slotId?: string }>;
        return contextEvents.at(-1)?.slotId ?? null;
      })
      .toBe("LH123-20250101-F");

    await expect
      .poll(async () => await getCanvasStateField<boolean>(page, "contextMenuOpen"))
      .toBe(false);
  });

  test("right click on a vertical marker does not open background context menu", async ({ page }) => {
    await openE2eHarness(page, { fixture: "markers" });

    const markerPoint = await findVerticalMarkerPoint(page, "m-std");
    await dispatchCanvasMouseEvent(page, markerPoint, "contextmenu");

    await expect
      .poll(async () => await getCanvasStateField<boolean>(page, "contextMenuOpen"))
      .toBe(false);
  });

  test("custom context-menu action notifies parent with timestamp and destination id", async ({ page }) => {
    await openE2eHarness(page, { fixture: "markers" });
    await clearHarnessEvents(page);

    const backgroundPoint = await findEmptyChartBackgroundPoint(page);
    const destinationIdAtClick = await page.evaluate(({ x, y }) => {
      const api = (window as Window & {
        __ganttCanvasTestApi?: { probeCanvasPoint: (px: number, py: number) => { topicId: string | null } };
      }).__ganttCanvasTestApi;
      return api?.probeCanvasPoint(x, y).topicId ?? null;
    }, backgroundPoint);
    expect(destinationIdAtClick).toBeTruthy();

    await dispatchCanvasMouseEvent(page, backgroundPoint, "contextmenu");
    await clickCanvasContextMenuItem(page, "Create a flight here");

    await expect
      .poll(async () => {
        const events = await getHarnessEvents(page);
        const actionEvents = (events.onContextMenuAction ?? []) as Array<{
          actionId?: string;
          destinationId?: string;
          timestamp?: string;
        }>;
        const last = actionEvents.at(-1);
        return {
          actionId: last?.actionId ?? null,
          destinationId: last?.destinationId ?? null,
          hasTimestamp: !!last?.timestamp,
        };
      })
      .toEqual({
        actionId: "create-flight",
        destinationId: destinationIdAtClick,
        hasTimestamp: true,
      });
  });

  test("right click drag commits pan callback and shifts internal time range", async ({ page }) => {
    const canvas = await openE2eHarness(page);
    await clearHarnessEvents(page);

    const beforeStartMs = await getCanvasStateField<number>(page, "internalStartTimeMs");
    const panStartPoint = await getPanStartPoint(page);
    const pagePoint = await canvasPointToPagePoint(canvas, panStartPoint);

    await page.mouse.move(pagePoint.x, pagePoint.y);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(pagePoint.x - 120, pagePoint.y, { steps: 8 });
    await page.mouse.up({ button: "right" });

    await expect
      .poll(async () => {
        const events = await getHarnessEvents(page);
        return (events.onChangeStartAndEndTime ?? []).length;
      })
      .toBeGreaterThan(0);

    await expect
      .poll(async () => await getCanvasStateField<number>(page, "internalStartTimeMs"), {
        timeout: 2_000,
      })
      .not.toBe(beforeStartMs);
  });
});
