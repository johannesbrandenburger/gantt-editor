import { expect, test, type Page } from "./coverage-test";
import {
  canvasPointToPagePoint,
  clearHarnessEvents,
  findSlotPoint,
  getCanvasStateField,
  getHarnessEvents,
  getHarnessSlotCloseTimeMs,
  getHarnessSlotOpenTimeMs,
  mouseDrag,
  openE2eHarness,
  setHarnessConfig,
} from "./helpers";

const SLOT_ID = "OS200-20250101-G";
const ISO_DAY = "2025-01-01";

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

  test("ROW rulers do not snap to slots from other destinations", async ({ page }) => {
    await openE2eHarness(page, { fixture: "core" });
    await setHarnessConfig(page, {
      startTime: new Date(`${ISO_DAY}T00:00:00Z`),
      endTime: new Date(`${ISO_DAY}T06:00:00Z`),
      activateRulers: "ROW",
      slots: [
        {
          id: SLOT_ID,
          displayName: "Target",
          destinationId: "chute-2",
          openTime: new Date(`${ISO_DAY}T01:00:00Z`),
          closeTime: new Date(`${ISO_DAY}T02:00:00Z`),
          group: "TARGET",
        },
        {
          id: "GLOBAL-REF",
          displayName: "Global Ref",
          destinationId: "chute-1",
          openTime: new Date(`${ISO_DAY}T03:00:00Z`),
          closeTime: new Date(`${ISO_DAY}T03:30:00Z`),
          group: "GLOBAL-REF",
        },
      ],
    });
    await clearHarnessEvents(page);

    const canvas = page.locator("canvas.chart-canvas").first();
    const targetRightEdge = await findSlotPoint(page, SLOT_ID, "right-edge");
    const globalRefLeftEdge = await findSlotPoint(page, "GLOBAL-REF", "left-edge");

    const from = await canvasPointToPagePoint(canvas, targetRightEdge);
    const to = await canvasPointToPagePoint(canvas, {
      x: globalRefLeftEdge.x - 2,
      y: targetRightEdge.y,
    });

    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 12 });

    const ruler = await getCanvasStateField<Record<string, unknown> | null>(page, "resizeRuler");
    expect(ruler).toBeNull();

    await page.mouse.up();

    const closeAfter = await getHarnessSlotCloseTimeMs(page, SLOT_ID);
    expect(closeAfter).not.toBeNull();
    const globalRefOpenMs = new Date(`${ISO_DAY}T03:00:00Z`).getTime();
    expect(closeAfter).not.toBe(globalRefOpenMs);
  });

  test("GLOBAL rulers snap and expose active ruler lock while dragging", async ({ page }) => {
    await openE2eHarness(page, { fixture: "core" });
    await setHarnessConfig(page, {
      startTime: new Date(`${ISO_DAY}T00:00:00Z`),
      endTime: new Date(`${ISO_DAY}T06:00:00Z`),
      activateRulers: "GLOBAL",
      slots: [
        {
          id: SLOT_ID,
          displayName: "Target",
          destinationId: "chute-2",
          openTime: new Date(`${ISO_DAY}T01:00:00Z`),
          closeTime: new Date(`${ISO_DAY}T02:00:00Z`),
          group: "TARGET",
        },
        {
          id: "GLOBAL-REF",
          displayName: "Global Ref",
          destinationId: "chute-1",
          openTime: new Date(`${ISO_DAY}T03:00:00Z`),
          closeTime: new Date(`${ISO_DAY}T03:30:00Z`),
          group: "GLOBAL-REF",
        },
      ],
    });
    await clearHarnessEvents(page);

    const canvas = page.locator("canvas.chart-canvas").first();
    const targetRightEdge = await findSlotPoint(page, SLOT_ID, "right-edge");
    const globalRefLeftEdge = await findSlotPoint(page, "GLOBAL-REF", "left-edge");

    const from = await canvasPointToPagePoint(canvas, targetRightEdge);
    const to = await canvasPointToPagePoint(canvas, {
      x: globalRefLeftEdge.x - 2,
      y: targetRightEdge.y,
    });

    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 12 });

    await expect
      .poll(async () => {
        const state = await getCanvasStateField<Record<string, unknown> | null>(
          page,
          "resizeRuler",
        );
        return !!state;
      })
      .toBe(true);

    const ruler = await getCanvasStateField<
      { kinds?: string[]; snappedTimeMs?: number } | null
    >(page, "resizeRuler");
    expect(ruler).not.toBeNull();
    expect(ruler?.kinds ?? []).toContain("openTime");

    await page.mouse.up();

    const closeAfter = await getHarnessSlotCloseTimeMs(page, SLOT_ID);
    expect(closeAfter).not.toBeNull();
    const globalRefOpenMs = new Date(`${ISO_DAY}T03:00:00Z`).getTime();
    expect(Math.abs((closeAfter as number) - globalRefOpenMs)).toBeLessThanOrEqual(1000);
  });
});
