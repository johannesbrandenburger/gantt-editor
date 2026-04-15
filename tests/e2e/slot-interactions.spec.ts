import { expect, test } from "./coverage-test";
import {
  canvasPointToPagePoint,
  clearHarnessEvents,
  dispatchCanvasMouseEvent,
  findSlotPoint,
  getCanvasStateField,
  getHarnessEvents,
  getHarnessSlotCloseTimeMs,
  mouseDrag,
  openE2eHarness,
} from "./helpers";

const SLOT_ID = "LH123-20250101-F";
const SLOT_C = "AA300-20250101-U";

async function seedSelection(page: Parameters<typeof openE2eHarness>[0], slotIds: string[]) {
  await page.evaluate((ids) => {
    const harness = (window as Window & {
      __ganttE2eHarness?: { getConfig: () => { slots: Array<Record<string, unknown>> } };
    }).__ganttE2eHarness;
    const config = harness?.getConfig();
    const slots = config?.slots ?? [];
    const selected = slots.filter((slot) => ids.includes(String(slot.id)));
    localStorage.setItem("pointerSelection", JSON.stringify(selected));
  }, slotIds);
}

test.describe("canvas rewrite slot interactions", () => {
  test("click on slot emits onClickOnSlot event", async ({ page }) => {
    await openE2eHarness(page);
    await clearHarnessEvents(page);

    const slotCenter = await findSlotPoint(page, SLOT_ID, "center");
    await dispatchCanvasMouseEvent(page, slotCenter, "click");

    await expect
      .poll(async () => {
        const events = await getHarnessEvents(page);
        const clicks = (events.onClickOnSlot ?? []) as Array<{ slotId?: string }>;
        return clicks.at(-1)?.slotId ?? null;
      })
      .toBe(SLOT_ID);
  });

  test("click on slot updates canvas test state lastClickedSlotId", async ({ page }) => {
    await openE2eHarness(page);
    await clearHarnessEvents(page);

    const slotCenter = await findSlotPoint(page, SLOT_ID, "center");
    await dispatchCanvasMouseEvent(page, slotCenter, "click");

    await expect.poll(async () => await getCanvasStateField<string | null>(page, "lastClickedSlotId")).toBe(SLOT_ID);
  });

  test("double-click on slot emits onDoubleClickOnSlot event", async ({ page }) => {
    await openE2eHarness(page);
    await clearHarnessEvents(page);

    const slotCenter = await findSlotPoint(page, SLOT_ID, "center");
    await dispatchCanvasMouseEvent(page, slotCenter, "dblclick");

    await expect
      .poll(async () => {
        const events = await getHarnessEvents(page);
        const doubles = (events.onDoubleClickOnSlot ?? []) as Array<{ slotId?: string }>;
        return doubles.at(-1)?.slotId ?? null;
      })
      .toBe(SLOT_ID);
  });

  test("browser double-click suppresses second single-click event", async ({ page }) => {
    const canvas = await openE2eHarness(page);
    await clearHarnessEvents(page);

    const slotCenter = await findSlotPoint(page, SLOT_ID, "center");
    const pagePoint = await canvasPointToPagePoint(canvas, slotCenter);
    await page.mouse.dblclick(pagePoint.x, pagePoint.y);

    await expect
      .poll(async () => {
        const events = await getHarnessEvents(page);
        const clicks = (events.onClickOnSlot ?? []) as Array<{ slotId?: string }>;
        return clicks.filter((event) => event.slotId === SLOT_ID).length;
      })
      .toBeLessThan(2);

    await expect
      .poll(async () => {
        const events = await getHarnessEvents(page);
        const doubles = (events.onDoubleClickOnSlot ?? []) as Array<{ slotId?: string }>;
        return doubles.filter((event) => event.slotId === SLOT_ID).length;
      })
      .toBe(1);
  });

  test("double-click works for selected slot without destination move event", async ({ page }) => {
    const canvas = await openE2eHarness(page);
    await seedSelection(page, [SLOT_ID, SLOT_C]);
    await clearHarnessEvents(page);

    const slotCenter = await findSlotPoint(page, SLOT_ID, "center");
    const pagePoint = await canvasPointToPagePoint(canvas, slotCenter);
    await page.mouse.dblclick(pagePoint.x, pagePoint.y);

    await expect
      .poll(async () => {
        const events = await getHarnessEvents(page);
        const doubles = (events.onDoubleClickOnSlot ?? []) as Array<{ slotId?: string }>;
        return doubles.at(-1)?.slotId ?? null;
      })
      .toBe(SLOT_ID);

    await expect
      .poll(async () => {
        const events = await getHarnessEvents(page);
        const singleMoves = (events.onChangeDestinationId ?? []) as Array<{ preview?: boolean }>;
        const bulkMoves = (events.onBulkChangeDestinationId ?? []) as Array<{ preview?: boolean }>;
        const committedSingles = singleMoves.filter((event) => event.preview === false).length;
        const committedBulks = bulkMoves.filter((event) => event.preview === false).length;
        return committedSingles + committedBulks;
      })
      .toBe(0);
  });

  test("right-click on slot emits onContextClickOnSlot event", async ({ page }) => {
    await openE2eHarness(page);
    await clearHarnessEvents(page);

    const slotCenter = await findSlotPoint(page, SLOT_ID, "center");
    await dispatchCanvasMouseEvent(page, slotCenter, "contextmenu");

    await expect
      .poll(async () => {
        const events = await getHarnessEvents(page);
        const contexts = (events.onContextClickOnSlot ?? []) as Array<{ slotId?: string }>;
        return contexts.at(-1)?.slotId ?? null;
      })
      .toBe(SLOT_ID);
  });

  test("resizing right handle works when slot start is off-screen to the left", async ({ page }) => {
    const canvas = await openE2eHarness(page, {
      fixture: "core",
      query: {
        startTime: "2025-01-01T11:20:00Z",
        endTime: "2025-01-01T14:20:00Z",
      },
    });
    await clearHarnessEvents(page);

    const closeBefore = await getHarnessSlotCloseTimeMs(page, SLOT_ID);
    expect(closeBefore).not.toBeNull();

    const rightEdge = await findSlotPoint(page, SLOT_ID, "right-edge");
    const from = await canvasPointToPagePoint(canvas, rightEdge);
    const to = { x: from.x + 40, y: from.y };

    await mouseDrag(page, from, to);

    await expect
      .poll(async () => await getHarnessSlotCloseTimeMs(page, SLOT_ID), { timeout: 2_000 })
      .not.toBe(closeBefore);

    await expect
      .poll(async () => {
        const events = await getHarnessEvents(page);
        const resizes = (events.onChangeSlotTime ?? []) as Array<{ slotId?: string }>;
        return resizes.filter((item) => item.slotId === SLOT_ID).length;
      })
      .toBe(1);
  });
});
