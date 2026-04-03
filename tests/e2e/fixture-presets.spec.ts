import { expect, test } from "@playwright/test";
import {
  clearHarnessEvents,
  dispatchCanvasMouseEvent,
  findSuggestionPoint,
  findTopicTogglePoint,
  findVerticalMarkerPoint,
  getHarnessConfig,
  getHarnessEvents,
  openE2eHarness,
} from "./helpers";

test.describe("canvas rewrite fixture presets", () => {
  test("markers fixture emits vertical marker click event", async ({ page }) => {
    await openE2eHarness(page, { fixture: "markers" });
    await clearHarnessEvents(page);

    const markerPoint = await findVerticalMarkerPoint(page, "m-std");
    await dispatchCanvasMouseEvent(page, markerPoint, "click");

    await expect
      .poll(async () => {
        const events = await getHarnessEvents(page);
        const clicks = (events.onClickVerticalMarker ?? []) as Array<{ id?: string }>;
        return clicks.map((event) => event.id ?? "");
      })
      .toContain("m-std");
  });

  test("suggestions fixture applies destination change on click", async ({ page }) => {
    await openE2eHarness(page, { fixture: "suggestions" });

    const before = await getHarnessConfig(page);
    const beforeDestination = before.slots.find((slot) => slot.id === "SUGGEST-100")?.destinationId;
    expect(beforeDestination).toBe("chute-1");

    const suggestionPoint = await findSuggestionPoint(page, "SUGGEST-100");
    await dispatchCanvasMouseEvent(page, suggestionPoint, "click");

    await expect
      .poll(async () => {
        const config = await getHarnessConfig(page);
        return config.slots.find((slot) => slot.id === "SUGGEST-100")?.destinationId ?? null;
      })
      .toBe("chute-3");
  });

  test("topic-collapse fixture toggles collapsedTopics in localStorage", async ({ page }) => {
    await openE2eHarness(page, { fixture: "topic-collapse" });
    await page.evaluate(() => localStorage.removeItem("collapsedTopics"));

    const target = await findTopicTogglePoint(page);
    await dispatchCanvasMouseEvent(page, { x: target.x, y: target.y }, "click");

    await expect
      .poll(async () =>
        await page.evaluate(() => {
          const raw = localStorage.getItem("collapsedTopics");
          return raw ? (JSON.parse(raw) as string[]) : [];
        }),
      )
      .toContain(target.topicId);
  });
});
