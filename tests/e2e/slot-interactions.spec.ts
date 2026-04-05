import { expect, test } from "@playwright/test";
import {
  canvasPointToPagePoint,
  clearHarnessEvents,
  dispatchCanvasMouseEvent,
  findSlotPoint,
  getHarnessEvents,
  getHarnessSlotCloseTimeMs,
  mouseDrag,
  openE2eHarness,
} from "./helpers";

const SLOT_ID = "LH123-20250101-F";

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

  test("hover on slot updates hovered slot state", async () => {
    test.skip(
      true,
      "Skipping: hover callbacks/state are currently not deterministically observable in headless harness runs.",
    );
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
