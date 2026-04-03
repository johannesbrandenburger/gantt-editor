import { expect, test, type Page } from "@playwright/test";
import {
  canvasPointToPagePoint,
  clearHarnessEvents,
  findSlotPoint,
  getHarnessEvents,
  getHarnessSlotCloseTimeMs,
  getHarnessSlotOpenTimeMs,
  mouseDrag,
  openE2eHarness,
} from "./helpers";

const SLOT_ID = "OS200-20250101-G";

async function dragSlotEdge(
  page: Page,
  mode: "left-edge" | "right-edge",
  deltaX: number,
): Promise<void> {
  const canvas = page.locator("canvas.chart-canvas").first();

  const edge = await findSlotPoint(page, SLOT_ID, mode);
  const from = await canvasPointToPagePoint(canvas, edge);
  const to = { x: from.x + deltaX, y: from.y };

  await mouseDrag(page, from, to);
}

test.describe("canvas rewrite slot time editing", () => {
  test("dragging left handle right moves openTime later", async ({ page }) => {
    await openE2eHarness(page, { fixture: "core" });
    await clearHarnessEvents(page);

    const openBefore = await getHarnessSlotOpenTimeMs(page, SLOT_ID);
    expect(openBefore).not.toBeNull();

    await dragSlotEdge(page, "left-edge", 40);

    await expect
      .poll(async () => await getHarnessSlotOpenTimeMs(page, SLOT_ID), { timeout: 2_000 })
      .toBeGreaterThan(openBefore as number);

    await expect
      .poll(async () => {
        const events = await getHarnessEvents(page);
        return (events.onChangeSlotTime ?? []).length;
      })
      .toBe(1);
  });

  test("dragging right handle right moves closeTime later", async ({ page }) => {
    await openE2eHarness(page, { fixture: "core" });
    await clearHarnessEvents(page);

    const closeBefore = await getHarnessSlotCloseTimeMs(page, SLOT_ID);
    expect(closeBefore).not.toBeNull();

    await dragSlotEdge(page, "right-edge", 40);

    await expect
      .poll(async () => await getHarnessSlotCloseTimeMs(page, SLOT_ID), { timeout: 2_000 })
      .toBeGreaterThan(closeBefore as number);

    await expect
      .poll(async () => {
        const events = await getHarnessEvents(page);
        return (events.onChangeSlotTime ?? []).length;
      })
      .toBe(1);
  });

  test("dragging left handle left moves openTime earlier", async ({ page }) => {
    await openE2eHarness(page, { fixture: "core" });
    await clearHarnessEvents(page);

    const openBefore = await getHarnessSlotOpenTimeMs(page, SLOT_ID);
    expect(openBefore).not.toBeNull();

    await dragSlotEdge(page, "left-edge", -40);

    await expect
      .poll(async () => await getHarnessSlotOpenTimeMs(page, SLOT_ID), { timeout: 2_000 })
      .toBeLessThan(openBefore as number);

    await expect
      .poll(async () => {
        const events = await getHarnessEvents(page);
        return (events.onChangeSlotTime ?? []).length;
      })
      .toBe(1);
  });

  test("dragging right handle left moves closeTime earlier", async ({ page }) => {
    await openE2eHarness(page, { fixture: "core" });
    await clearHarnessEvents(page);

    const closeBefore = await getHarnessSlotCloseTimeMs(page, SLOT_ID);
    expect(closeBefore).not.toBeNull();

    await dragSlotEdge(page, "right-edge", -40);

    await expect
      .poll(async () => await getHarnessSlotCloseTimeMs(page, SLOT_ID), { timeout: 2_000 })
      .toBeLessThan(closeBefore as number);

    await expect
      .poll(async () => {
        const events = await getHarnessEvents(page);
        return (events.onChangeSlotTime ?? []).length;
      })
      .toBe(1);
  });
});
