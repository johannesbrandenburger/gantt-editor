import type { Page } from "@playwright/test";
import { expect, test } from "./coverage-test";
import {
  clearHarnessEvents,
  dispatchCanvasMouseEvent,
  findSlotPoint,
  findTopicTogglePoint,
  getHarnessConfig,
  getHarnessEvents,
  openE2eHarness,
  waitForCanvasApi,
} from "./helpers";

async function getCollapsedTopics(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const raw = localStorage.getItem("collapsedTopics");
    return raw ? (JSON.parse(raw) as string[]) : [];
  });
}

test.describe("canvas rewrite topic collapse", () => {
  test("clicking topic label area collapses destination", async ({ page }) => {
    await openE2eHarness(page, { fixture: "topic-collapse" });

    const togglePoint = await findTopicTogglePoint(page);
    await dispatchCanvasMouseEvent(page, { x: togglePoint.x, y: togglePoint.y }, "click");

    await expect
      .poll(async () => await getCollapsedTopics(page))
      .toContain(togglePoint.topicId);
  });

  test("clicking collapsed topic label expands destination", async ({ page }) => {
    await openE2eHarness(page, { fixture: "topic-collapse" });

    const togglePoint = await findTopicTogglePoint(page);
    await dispatchCanvasMouseEvent(page, { x: togglePoint.x, y: togglePoint.y }, "click");
    await expect.poll(async () => await getCollapsedTopics(page)).toContain(togglePoint.topicId);

    await dispatchCanvasMouseEvent(page, { x: togglePoint.x, y: togglePoint.y }, "click");

    await expect
      .poll(async () => await getCollapsedTopics(page))
      .not.toContain(togglePoint.topicId);
  });

  test("collapse state persists across reload", async ({ page }) => {
    await openE2eHarness(page, { fixture: "topic-collapse" });

    const togglePoint = await findTopicTogglePoint(page);
    await dispatchCanvasMouseEvent(page, { x: togglePoint.x, y: togglePoint.y }, "click");

    await expect.poll(async () => await getCollapsedTopics(page)).toContain(togglePoint.topicId);

    await page.reload();
    await waitForCanvasApi(page);

    await expect.poll(async () => await getCollapsedTopics(page)).toContain(togglePoint.topicId);
  });

  test("malformed collapsedTopics localStorage does not break render and can be recovered", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("collapsedTopics", "{not-json");
    });

    await openE2eHarness(page, { fixture: "topic-collapse" });

    const togglePoint = await findTopicTogglePoint(page);
    await dispatchCanvasMouseEvent(page, { x: togglePoint.x, y: togglePoint.y }, "click");

    await expect
      .poll(async () => await getCollapsedTopics(page))
      .toContain(togglePoint.topicId);
  });

  test("collapsed topic still allows deterministic slot hit-testing and clicks", async ({ page }) => {
    await openE2eHarness(page, { fixture: "topic-collapse" });
    await clearHarnessEvents(page);

    const togglePoint = await findTopicTogglePoint(page);
    await dispatchCanvasMouseEvent(page, { x: togglePoint.x, y: togglePoint.y }, "click");

    await expect.poll(async () => await getCollapsedTopics(page)).toContain(togglePoint.topicId);

    await expect
      .poll(async () => {
        const config = await getHarnessConfig(page);
        return config.slots.find((slot) => slot.destinationId === togglePoint.topicId)?.id ?? null;
      })
      .not.toBeNull();

    const collapsedSlotId = (await getHarnessConfig(page)).slots.find(
      (slot) => slot.destinationId === togglePoint.topicId,
    )?.id;
    expect(collapsedSlotId).not.toBeNull();

    const slotCenter = await findSlotPoint(page, collapsedSlotId as string, "center");
    await dispatchCanvasMouseEvent(page, slotCenter, "click");

    await expect
      .poll(async () => {
        const events = await getHarnessEvents(page);
        const clicks = (events.onClickOnSlot ?? []) as Array<{ slotId?: string }>;
        return clicks.at(-1)?.slotId ?? null;
      })
      .toBe(collapsedSlotId as string);
  });
});
