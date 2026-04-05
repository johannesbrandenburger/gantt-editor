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
