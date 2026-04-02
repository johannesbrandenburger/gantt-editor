import { expect, test } from "@playwright/test";
import {
  clearHarnessEvents,
  dispatchCanvasMouseEvent,
  findSuggestionPoint,
  getHarnessConfig,
  getHarnessEvents,
  openE2eHarness,
  setHarnessConfig,
} from "./helpers";

const SLOT_ID = "SUGGEST-100";

test.describe("canvas rewrite suggestions", () => {
  test("suggestion marker is rendered and hit-testable", async ({ page }) => {
    await openE2eHarness(page, { fixture: "suggestions" });

    const point = await findSuggestionPoint(page, SLOT_ID);
    expect(point.x).toBeGreaterThan(0);
    expect(point.y).toBeGreaterThan(0);
  });

  test("clicking a suggestion applies destination change with preview flag", async ({ page }) => {
    await openE2eHarness(page, { fixture: "suggestions" });
    await clearHarnessEvents(page);

    const point = await findSuggestionPoint(page, SLOT_ID);
    await dispatchCanvasMouseEvent(page, point, "click");

    await expect
      .poll(async () => {
        const events = await getHarnessEvents(page);
        const changes = (events.onChangeDestinationId ?? []) as Array<{
          slotId?: string;
          destinationId?: string;
          preview?: boolean;
        }>;
        return changes.at(-1) ?? null;
      })
      .toEqual({ slotId: SLOT_ID, destinationId: "chute-3", preview: true });
  });

  test("applied suggestion updates slot destination in harness config", async ({ page }) => {
    await openE2eHarness(page, { fixture: "suggestions" });

    const destinationBefore = (await getHarnessConfig(page)).slots.find((slot) => slot.id === SLOT_ID)?.destinationId;
    expect(destinationBefore).toBe("chute-1");

    const point = await findSuggestionPoint(page, SLOT_ID);
    await dispatchCanvasMouseEvent(page, point, "click");

    await expect
      .poll(async () => (await getHarnessConfig(page)).slots.find((slot) => slot.id === SLOT_ID)?.destinationId)
      .toBe("chute-3");
  });

  test("sequential suggestion updates use latest suggestion target", async ({ page }) => {
    await openE2eHarness(page, { fixture: "suggestions" });
    await clearHarnessEvents(page);

    const firstPoint = await findSuggestionPoint(page, SLOT_ID);
    await dispatchCanvasMouseEvent(page, firstPoint, "click");

    await expect
      .poll(async () => (await getHarnessConfig(page)).slots.find((slot) => slot.id === SLOT_ID)?.destinationId)
      .toBe("chute-3");

    await setHarnessConfig(page, {
      suggestions: [{ slotId: SLOT_ID, alternativeDestinationId: "chute-2" }],
    });

    const secondPoint = await findSuggestionPoint(page, SLOT_ID);
    await dispatchCanvasMouseEvent(page, secondPoint, "click");

    await expect
      .poll(async () => (await getHarnessConfig(page)).slots.find((slot) => slot.id === SLOT_ID)?.destinationId)
      .toBe("chute-2");

    await expect
      .poll(async () => {
        const events = await getHarnessEvents(page);
        const previews = (events.onChangeDestinationId ?? []) as Array<{
          slotId?: string;
          destinationId?: string;
          preview?: boolean;
        }>;
        return previews
          .filter((item) => item.slotId === SLOT_ID && item.preview === true)
          .map((item) => item.destinationId);
      })
      .toEqual(["chute-3", "chute-2"]);
  });

  test("read-only mode prevents applying suggestions", async ({ page }) => {
    await openE2eHarness(page, {
      fixture: "suggestions",
      query: { readOnly: true },
    });
    await clearHarnessEvents(page);

    const point = await findSuggestionPoint(page, SLOT_ID);
    await dispatchCanvasMouseEvent(page, point, "click");

    await expect
      .poll(async () => {
        const slot = (await getHarnessConfig(page)).slots.find((item) => item.id === SLOT_ID);
        return slot?.destinationId ?? null;
      })
      .toBe("chute-1");

    await expect
      .poll(async () => {
        const events = await getHarnessEvents(page);
        return (events.onChangeDestinationId ?? []).length;
      })
      .toBe(0);
  });

  test.skip(
    "suggestion tooltip and hover-size visuals",
    "Skipping: tooltip and icon-size animation are canvas raster effects not exposed through deterministic DOM/test API selectors.",
  );
});
