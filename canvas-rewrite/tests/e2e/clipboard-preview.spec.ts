import { expect, test } from "@playwright/test";
import {
  canvasPointToPagePoint,
  dispatchCanvasMouseEvent,
  findSlotPoint,
  getCanvasStateField,
  getHarnessConfig,
  getHarnessEvents,
  openE2eHarness,
} from "./helpers";

const SOURCE_SLOT_ID = "LH123-20250101-F";
const TARGET_SLOT_ID = "OS200-20250101-G";

test.describe("canvas rewrite clipboard preview behavior", () => {
  test("clipboard preview visibility signal follows pointer enter/leave", async ({ page }) => {
    const canvas = await openE2eHarness(page);

    const sourcePoint = await findSlotPoint(page, SOURCE_SLOT_ID, "center");
    await dispatchCanvasMouseEvent(page, sourcePoint, "click");

    await expect
      .poll(
        async () => (await getCanvasStateField<string[]>(page, "clipboardSlotIds")) ?? [],
        { timeout: 2_000 },
      )
      .toContain(SOURCE_SLOT_ID);

    const sourcePagePoint = await canvasPointToPagePoint(canvas, sourcePoint);
    await page.mouse.move(sourcePagePoint.x, sourcePagePoint.y);

    await expect
      .poll(async () => await getCanvasStateField<boolean>(page, "pointerInChart"), { timeout: 2_000 })
      .toBe(true);

    await page.evaluate(() => {
      const container = document.querySelector(".chart-container");
      container?.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
    });

    await expect
      .poll(async () => await getCanvasStateField<boolean>(page, "pointerInChart"), { timeout: 2_000 })
      .toBe(false);
  });

  test("Meta/Ctrl click on an already pinned slot unpins it", async ({ page }) => {
    await openE2eHarness(page);

    const sourcePoint = await findSlotPoint(page, SOURCE_SLOT_ID, "center");
    await dispatchCanvasMouseEvent(page, sourcePoint, "click");

    await expect
      .poll(
        async () => (await getCanvasStateField<string[]>(page, "clipboardSlotIds")) ?? [],
        { timeout: 2_000 },
      )
      .toEqual([SOURCE_SLOT_ID]);

    await dispatchCanvasMouseEvent(page, sourcePoint, "click", { ctrlKey: true });

    await expect
      .poll(
        async () => (await getCanvasStateField<string[]>(page, "clipboardSlotIds")) ?? [],
        { timeout: 2_000 },
      )
      .toEqual([]);
  });

  test("clicking another slot with clipboard items moves and clears clipboard", async ({ page }) => {
    await openE2eHarness(page);

    const sourcePoint = await findSlotPoint(page, SOURCE_SLOT_ID, "center");
    await dispatchCanvasMouseEvent(page, sourcePoint, "click");

    await expect
      .poll(
        async () => (await getCanvasStateField<string[]>(page, "clipboardSlotIds")) ?? [],
        { timeout: 2_000 },
      )
      .toEqual([SOURCE_SLOT_ID]);

    const before = await getHarnessConfig(page);
    const targetDestination = before.slots.find((slot) => slot.id === TARGET_SLOT_ID)?.destinationId;
    expect(targetDestination).toBeTruthy();

    const targetPoint = await findSlotPoint(page, TARGET_SLOT_ID, "center");
    await dispatchCanvasMouseEvent(page, targetPoint, "click");

    await expect
      .poll(
        async () => (await getCanvasStateField<string[]>(page, "clipboardSlotIds")) ?? [],
        { timeout: 2_000 },
      )
      .toEqual([]);

    await expect
      .poll(async () => {
        const events = await getHarnessEvents(page);
        const moves = (events.onChangeDestinationId ?? []) as Array<{
          slotId?: string;
          destinationId?: string;
          preview?: boolean;
        }>;
        const committed = moves.find((event) => event.slotId === SOURCE_SLOT_ID && event.preview === false);
        return committed ?? null;
      })
      .toEqual({
        slotId: SOURCE_SLOT_ID,
        destinationId: targetDestination,
        preview: false,
      });
  });

  test("clipboard payload keeps slot display names", async ({ page }) => {
    await openE2eHarness(page);

    const sourcePoint = await findSlotPoint(page, SOURCE_SLOT_ID, "center");
    await dispatchCanvasMouseEvent(page, sourcePoint, "click");

    await expect
      .poll(
        async () => {
          const items = await page.evaluate(() => {
            const raw = localStorage.getItem("pointerClipboard");
            return raw ? (JSON.parse(raw) as Array<{ id: string; displayName?: string }>) : [];
          });
          return items.length;
        },
        { timeout: 2_000 },
      )
      .toBeGreaterThan(0);

    const clipboardItems = await page.evaluate(() => {
      const raw = localStorage.getItem("pointerClipboard");
      return raw ? (JSON.parse(raw) as Array<{ id: string; displayName?: string }>) : [];
    });

    expect(clipboardItems[0]?.id).toBe(SOURCE_SLOT_ID);
    expect(clipboardItems[0]?.displayName).toContain("LH123");
  });
});
