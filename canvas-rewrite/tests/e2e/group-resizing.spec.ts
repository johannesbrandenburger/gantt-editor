import { expect, test, type Page } from "@playwright/test";
import {
  canvasPointToPagePoint,
  getCanvasState,
  mouseDrag,
  openE2eHarness,
} from "./helpers";

type CanvasState = {
  margin?: { left: number; right: number };
  layout: {
    canvasCssWidth?: number;
    groups: Array<{ id: string; y: number; h: number }>;
  } | null;
};

function getGroupHeightById(state: CanvasState, groupId: string): number {
  const group = state.layout?.groups.find((entry) => entry.id === groupId);
  return group?.h ?? 0;
}

async function findBetweenGroupResizePoint(
  page: Page,
): Promise<{ x: number; y: number }> {
  const point = await page.evaluate(() => {
    const api = (window as Window & {
      __ganttCanvasTestApi?: {
        flush: () => void;
        getState: () => {
          layout: { canvasCssWidth: number; groups: Array<{ y: number; h: number }> } | null;
        };
        probeCanvasPoint: (x: number, y: number) => { chartHitType: string };
      };
    }).__ganttCanvasTestApi;

    api?.flush();
    const state = api?.getState();
    if (!api || !state?.layout || state.layout.groups.length < 2) return null;

    const boundaryY = Math.round(state.layout.groups[0]!.y + state.layout.groups[0]!.h);
    const maxX = Math.max(2, state.layout.canvasCssWidth - 2);
    for (let y = boundaryY - 4; y <= boundaryY + 4; y += 1) {
      for (let x = 2; x <= maxX; x += 4) {
        const probe = api.probeCanvasPoint(x, y);
        if (probe.chartHitType === "betweenResize") {
          return { x, y };
        }
      }
    }

    return null;
  });

  expect(point).not.toBeNull();
  return point as { x: number; y: number };
}

test.describe("canvas rewrite destination group resizing", () => {
  test("dragging the handle between groups changes group heights", async ({ page }) => {
    const canvas = await openE2eHarness(page);

    const before = await getCanvasState<CanvasState>(page);
    expect(before).not.toBeNull();
    expect(before?.layout).not.toBeNull();

    if (!before?.layout || before.layout.groups.length < 2) {
      throw new Error("Expected at least two destination groups in canvas layout");
    }

    const allocatedBefore = getGroupHeightById(before, "allocated");
    const unallocatedBefore = getGroupHeightById(before, "unallocated");

    const resizeHandleCanvasPoint = await findBetweenGroupResizePoint(page);

    const from = await canvasPointToPagePoint(canvas, resizeHandleCanvasPoint);
    const to = { x: from.x, y: from.y - 50 };

    await mouseDrag(page, from, to);

    await expect
      .poll(async () => {
        const after = await getCanvasState<CanvasState>(page);
        const allocatedAfter = getGroupHeightById(after as CanvasState, "allocated");
        const unallocatedAfter = getGroupHeightById(after as CanvasState, "unallocated");
        return allocatedAfter < allocatedBefore && unallocatedAfter > unallocatedBefore;
      })
      .toBe(true);
  });
});
