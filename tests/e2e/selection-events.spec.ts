import { expect, test } from "./coverage-test";
import {
  clearHarnessEvents,
  dispatchCanvasMouseEvent,
  findSlotPoint,
  getHarnessEvents,
  openE2eHarness,
} from "./helpers";

const SLOT_A = "LH123-20250101-F";
const SLOT_B = "OS200-20250101-G";

test.describe("canvas rewrite selection change events", () => {
  test("malformed pointerSelection storage is ignored and selection still works", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("pointerSelection", "{bad-json");
    });

    await openE2eHarness(page, { fixture: "core" });
    await clearHarnessEvents(page);

    const sourcePoint = await findSlotPoint(page, SLOT_A, "center");
    await dispatchCanvasMouseEvent(page, sourcePoint, "click");

    await expect
      .poll(async () => {
        const events = await getHarnessEvents(page);
        const selectionEvents = (events.onSelectionChange ?? []) as Array<{ slotIds?: string[] }>;
        const latest = selectionEvents.at(-1)?.slotIds ?? [];
        return latest;
      })
      .toEqual([SLOT_A]);
  });

  test("emits selected slot ids on select and empty ids on Escape clear", async ({ page }) => {
    await openE2eHarness(page, { fixture: "core" });
    await clearHarnessEvents(page);

    const sourcePoint = await findSlotPoint(page, SLOT_A, "center");
    await dispatchCanvasMouseEvent(page, sourcePoint, "click");

    await expect
      .poll(async () => {
        const events = await getHarnessEvents(page);
        const selectionEvents = (events.onSelectionChange ?? []) as Array<{ slotIds?: string[] }>;
        const latest = selectionEvents.at(-1)?.slotIds ?? [];
        return latest;
      })
      .toEqual([SLOT_A]);

    await page.keyboard.press("Escape");

    await expect
      .poll(async () => {
        const events = await getHarnessEvents(page);
        const selectionEvents = (events.onSelectionChange ?? []) as Array<{ slotIds?: string[] }>;
        const latest = selectionEvents.at(-1)?.slotIds ?? [];
        return latest;
      })
      .toEqual([]);
  });

  test("emits empty selection after moving selected slots to another destination", async ({ page }) => {
    await openE2eHarness(page, { fixture: "core" });
    await clearHarnessEvents(page);

    const sourcePoint = await findSlotPoint(page, SLOT_A, "center");
    const targetPoint = await findSlotPoint(page, SLOT_B, "center");

    await dispatchCanvasMouseEvent(page, sourcePoint, "click");
    await dispatchCanvasMouseEvent(page, targetPoint, "click");

    await expect
      .poll(async () => {
        const events = await getHarnessEvents(page);
        const selectionEvents = (events.onSelectionChange ?? []) as Array<{ slotIds?: string[] }>;
        const latest = selectionEvents.at(-1)?.slotIds ?? [];
        return latest;
      })
      .toEqual([]);
  });
});
