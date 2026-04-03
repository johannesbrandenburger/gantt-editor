import { expect, test, type Page } from "@playwright/test";
import { findSlotPoint, getHarnessConfig, openE2eHarness } from "./helpers";

async function collectTopicIds(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const api = (window as Window & {
      __ganttCanvasTestApi?: {
        flush: () => void;
        getState: () => {
          layout: { canvasCssHeight: number } | null;
          margin: { left: number };
        };
        probeCanvasPoint: (x: number, y: number) => { topicId: string | null };
      };
    }).__ganttCanvasTestApi;

    api?.flush();
    const state = api?.getState();
    if (!api || !state?.layout) return [];

    const x = Math.max(1, Math.floor(state.margin.left - 8));
    const maxY = Math.max(1, state.layout.canvasCssHeight - 1);
    const seen = new Set<string>();

    for (let y = 1; y <= maxY; y += 2) {
      const topicId = api.probeCanvasPoint(x, y).topicId;
      if (topicId) {
        seen.add(topicId);
      }
    }

    return Array.from(seen.values()).sort();
  });
}

test.describe("canvas rewrite slot text and topic labels", () => {
  test("fixture slots expose display names for rendered bars", async ({ page }) => {
    await openE2eHarness(page, { fixture: "core" });

    const slotDisplayNames = (await getHarnessConfig(page)).slots
      .map((slot) => slot.displayName ?? "")
      .filter((name) => name.length > 0);

    expect(slotDisplayNames.length).toBeGreaterThan(0);
    expect(slotDisplayNames.some((name) => name.includes("LH123"))).toBe(true);
  });

  test("topic label gutter includes the UNALLOCATED destination", async ({ page }) => {
    await openE2eHarness(page, { fixture: "core" });

    const topicIds = await collectTopicIds(page);
    expect(topicIds).toContain("UNALLOCATED");
  });

  test("unallocated destination has renderable slot content", async ({ page }) => {
    await openE2eHarness(page, { fixture: "core" });

    const point = await findSlotPoint(page, "AA300-20250101-U", "center");
    expect(point.x).toBeGreaterThan(0);
    expect(point.y).toBeGreaterThan(0);
  });

  test("slot names are listed below each topic label", async () => {
    test.skip(
      true,
      "Skipping: canvas text layout is rasterized and not directly inspectable via deterministic DOM/test API selectors.",
    );
  });
});
