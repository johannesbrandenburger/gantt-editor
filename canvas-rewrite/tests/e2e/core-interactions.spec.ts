import { expect, test } from "@playwright/test";
import {
  canvasPointToPagePoint,
  dispatchCanvasMouseEvent,
  findSlotPoint,
  mouseDrag,
  openE2eHarness,
} from "./helpers";

const SLOT_ID = "LH123-20250101-F";

test.describe("canvas rewrite core interactions", () => {
  test("supports click, double click, and context click on a slot", async ({ page }) => {
    await openE2eHarness(page);
    const slotCenter = await findSlotPoint(page, SLOT_ID, "center");

    await dispatchCanvasMouseEvent(page, slotCenter, "click");
    await dispatchCanvasMouseEvent(page, slotCenter, "dblclick");
    await dispatchCanvasMouseEvent(page, slotCenter, "contextmenu");

    await expect
      .poll(
        async () =>
          await page.evaluate(() => {
            const api = (window as Window & {
              __ganttCanvasTestApi?: {
                flush: () => void;
                getState: () => { lastClickedSlotId: string | null };
              };
            }).__ganttCanvasTestApi;
            api?.flush();
            return api?.getState().lastClickedSlotId ?? null;
          }),
        { timeout: 2000 },
      )
      .toBe(SLOT_ID);
    await expect
      .poll(
        async () =>
          await page.evaluate(() => {
            const api = (window as Window & {
              __ganttCanvasTestApi?: {
                flush: () => void;
                getState: () => { lastDoubleClickedSlotId: string | null };
              };
            }).__ganttCanvasTestApi;
            api?.flush();
            return api?.getState().lastDoubleClickedSlotId ?? null;
          }),
        { timeout: 2000 },
      )
      .toBe(SLOT_ID);
    await expect
      .poll(
        async () =>
          await page.evaluate(() => {
            const api = (window as Window & {
              __ganttCanvasTestApi?: {
                flush: () => void;
                getState: () => { lastContextClickedSlotId: string | null };
              };
            }).__ganttCanvasTestApi;
            api?.flush();
            return api?.getState().lastContextClickedSlotId ?? null;
          }),
        { timeout: 2000 },
      )
      .toBe(SLOT_ID);
  });

  test("supports resizing a slot edge with drag", async ({ page }) => {
    const canvas = await openE2eHarness(page);
    const beforeCloseTimeMs = await page.evaluate((slotId) => {
      const harness = (window as Window & {
        __ganttE2eHarness?: {
          getConfig: () => { slots: Array<{ id: string; closeTime: Date | string }> };
        };
      }).__ganttE2eHarness;
      const slot = harness?.getConfig().slots.find((item) => item.id === slotId);
      return slot ? new Date(slot.closeTime).getTime() : null;
    }, SLOT_ID);
    expect(beforeCloseTimeMs).not.toBeNull();

    const edgePoint = await findSlotPoint(page, SLOT_ID, "right-edge");
    const from = await canvasPointToPagePoint(canvas, edgePoint);
    const to = { x: from.x + 70, y: from.y };

    await mouseDrag(page, from, to);

    await expect
      .poll(
        async () =>
          await page.evaluate((slotId) => {
            const harness = (window as Window & {
              __ganttE2eHarness?: {
                getConfig: () => { slots: Array<{ id: string; closeTime: Date | string }> };
              };
            }).__ganttE2eHarness;
            const slot = harness?.getConfig().slots.find((item) => item.id === slotId);
            return slot ? new Date(slot.closeTime).getTime() : null;
          }, SLOT_ID),
        { timeout: 2000 },
      )
      .not.toBe(beforeCloseTimeMs);
  });

  test("supports brush selection via Meta drag and stores clipboard", async ({ page }) => {
    const canvas = await openE2eHarness(page);

    const state = await page.evaluate(() => {
      const api = (window as Window & {
        __ganttCanvasTestApi?: {
          flush: () => void;
          getState: () => { margin: { left: number }; rowHeight: number; layout: unknown };
        };
      }).__ganttCanvasTestApi;
      localStorage.removeItem("pointerClipboard");
      api?.flush();
      return api?.getState() ?? null;
    });
    expect(state).not.toBeNull();

    const center = await findSlotPoint(page, SLOT_ID, "center");
    const startCanvas = {
      x: Math.max((state as { margin: { left: number } }).margin.left + 12, center.x - 320),
      y: Math.max(40, center.y - Math.max(18, (state as { rowHeight: number }).rowHeight * 0.35)),
    };
    const endCanvas = { x: center.x + 45, y: center.y + 14 };

    const from = await canvasPointToPagePoint(canvas, startCanvas);
    const to = await canvasPointToPagePoint(canvas, endCanvas);

    await page.keyboard.down("ControlOrMeta");
    await mouseDrag(page, from, to);
    await page.keyboard.up("ControlOrMeta");

    await expect
      .poll(
        async () =>
          await page.evaluate(() => {
            const api = (window as Window & {
              __ganttCanvasTestApi?: {
                flush: () => void;
                getState: () => { clipboardSlotIds: string[] };
              };
            }).__ganttCanvasTestApi;
            api?.flush();
            return api?.getState().clipboardSlotIds ?? [];
          }),
        { timeout: 2000 },
      )
      .toContain(SLOT_ID);
  });
});
