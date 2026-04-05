import { expect, test, type Page } from "./coverage-test";
import {
  dispatchCanvasMouseEvent,
  findTopicTogglePoint,
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

  test("collapsed topic renders slots with reduced opacity", async () => {
    test.skip(
      true,
      "Skipping: slot opacity is rasterized in canvas and not directly introspectable via deterministic DOM/test API selectors.",
    );
  });
});
