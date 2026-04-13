import { expect, test, type Page } from "./coverage-test";
import {
  canvasPointToPagePoint,
  clearHarnessEvents,
  clickCanvasContextMenuItem,
  dispatchCanvasMouseEvent,
  findEmptyChartBackgroundPoint,
  findSlotPoint,
  findSuggestionPoint,
  findTopicTogglePoint,
  findVerticalMarkerPoint,
  getCanvasState,
  getCanvasStateField,
  getHarnessConfig,
  getHarnessEvents,
  mouseDrag,
  openE2eHarness,
} from "./helpers";

type Feature =
  | "select-slots"
  | "brush-select-slots"
  | "resize-slot-time"
  | "apply-slot-suggestions"
  | "collapse-topics"
  | "canvas-context-menu"
  | "move-vertical-markers"
  | "move-vertical-markers-from-context-menu"
  | "move-slots-to-destination"
  | "bulk-move-slots-to-destination"
  | "copy-slots-to-destination"
  | "bulk-copy-slots-to-destination"
  | "move-slots-on-time-axis"
  | "bulk-move-slots-on-time-axis"
  | "copy-slots-on-time-axis"
  | "bulk-copy-slots-on-time-axis"
  | "preview-slots-to-destination"
  | "preview-slots-on-time-axis"
  | "copy-modifier-alt"
  | "time-axis-modifier-shift";

type FeatureCase = {
  feature: Feature;
  fixture?: "core" | "dense" | "readonly" | "markers" | "suggestions" | "topic-collapse" | "performance";
  query?: Record<string, string | number | boolean | null | undefined>;
  minimalOnFeatures: Feature[];
  assertBehavior: (page: Page, enabled: boolean) => Promise<void>;
};

const SOURCE_SLOT_ID = "LH123-20250101-F";
const SECOND_SLOT_ID = "OS200-20250101-G";
const THIRD_SLOT_ID = "AA300-20250101-U";
const SUGGESTION_SLOT_ID = "SUGGEST-100";
const MARKER_STD = "m-std";

const ALL_FEATURES: Feature[] = [
  "select-slots",
  "brush-select-slots",
  "resize-slot-time",
  "apply-slot-suggestions",
  "collapse-topics",
  "canvas-context-menu",
  "move-vertical-markers",
  "move-vertical-markers-from-context-menu",
  "move-slots-to-destination",
  "bulk-move-slots-to-destination",
  "copy-slots-to-destination",
  "bulk-copy-slots-to-destination",
  "move-slots-on-time-axis",
  "bulk-move-slots-on-time-axis",
  "copy-slots-on-time-axis",
  "bulk-copy-slots-on-time-axis",
  "preview-slots-to-destination",
  "preview-slots-on-time-axis",
  "copy-modifier-alt",
  "time-axis-modifier-shift",
];

function toFeatureQuery(features: Feature[]): string {
  return features.join(",");
}

function allExcept(feature: Feature): Feature[] {
  return ALL_FEATURES.filter((item) => item !== feature);
}

async function selectSingleSlot(page: Page): Promise<void> {
  const sourcePoint = await findSlotPoint(page, SOURCE_SLOT_ID, "center");
  await dispatchCanvasMouseEvent(page, sourcePoint, "click");
}

async function selectTwoSlots(page: Page): Promise<void> {
  const sourcePoint = await findSlotPoint(page, SOURCE_SLOT_ID, "center");
  const secondPoint = await findSlotPoint(page, SECOND_SLOT_ID, "center");
  await dispatchCanvasMouseEvent(page, sourcePoint, "click");
  await dispatchCanvasMouseEvent(page, secondPoint, "click", { ctrlKey: true, metaKey: true });
}

async function getTimeAxisTargetPointInGroup(page: Page): Promise<{ x: number; y: number }> {
  const state = (await getCanvasState<any>(page)) as
    | {
        layout?: { canvasCssWidth?: number } | null;
        margin?: { right?: number };
      }
    | null;
  const width = state?.layout?.canvasCssWidth ?? 0;
  const rightMargin = state?.margin?.right ?? 0;
  expect(width).toBeGreaterThan(0);
  const empty = await findEmptyChartBackgroundPoint(page);
  return {
    x: Math.max(20, width - rightMargin - 8),
    y: empty.y,
  };
}

async function seedSelectionFromStorage(page: Page, slotIds: string[]): Promise<void> {
  await page.evaluate((ids) => {
    const harness = (window as Window & {
      __ganttE2eHarness?: { getConfig: () => { slots: Array<Record<string, unknown>> } };
    }).__ganttE2eHarness;
    const config = harness?.getConfig();
    const selected = (config?.slots ?? []).filter((slot) => ids.includes(String(slot.id)));
    localStorage.setItem("pointerSelection", JSON.stringify(selected));
    const api = (window as Window & {
      __ganttCanvasTestApi?: { refreshSelectionFromStorage?: () => void; flush?: () => void };
    }).__ganttCanvasTestApi;
    api?.refreshSelectionFromStorage?.();
    api?.flush?.();
  }, slotIds);
}

async function dragSlotLeftEdge(page: Page): Promise<void> {
  const canvas = page.locator("canvas.chart-canvas").first();
  const edge = await findSlotPoint(page, SOURCE_SLOT_ID, "left-edge");
  const from = await canvasPointToPagePoint(canvas, edge);
  const to = { x: from.x - 80, y: from.y };
  await mouseDrag(page, from, to);
}

async function performTimeAxisAction(
  page: Page,
  useAltCopy: boolean,
): Promise<void> {
  const axisPoint = await getTimeAxisTargetPointInGroup(page);
  await dispatchCanvasMouseEvent(page, axisPoint, "mousemove", {
    shiftKey: true,
    altKey: useAltCopy,
  });
  await dispatchCanvasMouseEvent(page, axisPoint, "click", {
    shiftKey: true,
    altKey: useAltCopy,
  });
}

const featureCases: FeatureCase[] = [
  {
    feature: "select-slots",
    minimalOnFeatures: ["select-slots"],
    assertBehavior: async (page, enabled) => {
      await selectSingleSlot(page);
      const selected = (await getCanvasStateField<string[]>(page, "selectionSlotIds")) ?? [];
      expect(selected).toEqual(enabled ? [SOURCE_SLOT_ID] : []);
    },
  },
  {
    feature: "brush-select-slots",
    fixture: "dense",
    query: { slots: 20 },
    minimalOnFeatures: ["select-slots", "brush-select-slots"],
    assertBehavior: async (page, enabled) => {
      const state = (await getCanvasState<any>(page)) as
        | {
            margin?: { left: number; right: number };
            layout?: { groups?: Array<{ id: string; y: number; h: number }>; canvasCssWidth: number };
          }
        | null;
      const allocated = state?.layout?.groups?.find((group) => group.id === "allocated");
      expect(state?.margin && state?.layout && allocated).toBeTruthy();
      const canvas = page.locator("canvas.chart-canvas").first();
      const from = await canvasPointToPagePoint(canvas, {
        x: (state?.margin?.left ?? 20) + 4,
        y: (allocated?.y ?? 10) + 6,
      });
      const to = await canvasPointToPagePoint(canvas, {
        x: (state?.layout?.canvasCssWidth ?? 300) - (state?.margin?.right ?? 20) - 6,
        y: (allocated?.y ?? 10) + (allocated?.h ?? 40) - 6,
      });

      await page.keyboard.down("ControlOrMeta");
      await mouseDrag(page, from, to);
      await page.keyboard.up("ControlOrMeta");

      const selected = (await getCanvasStateField<string[]>(page, "selectionSlotIds")) ?? [];
      if (enabled) {
        expect(selected.length).toBeGreaterThan(1);
      } else {
        expect(selected).toEqual([]);
      }
    },
  },
  {
    feature: "resize-slot-time",
    minimalOnFeatures: ["resize-slot-time"],
    assertBehavior: async (page, enabled) => {
      await clearHarnessEvents(page);
      await dragSlotLeftEdge(page);
      const events = await getHarnessEvents(page);
      const changes = (events.onChangeSlotTime ?? []) as unknown[];
      if (enabled) {
        expect(changes.length).toBeGreaterThan(0);
      } else {
        expect(changes).toHaveLength(0);
      }
    },
  },
  {
    feature: "apply-slot-suggestions",
    fixture: "suggestions",
    minimalOnFeatures: ["apply-slot-suggestions"],
    assertBehavior: async (page, enabled) => {
      await clearHarnessEvents(page);
      if (enabled) {
        const suggestionPoint = await findSuggestionPoint(page, SUGGESTION_SLOT_ID);
        await dispatchCanvasMouseEvent(page, suggestionPoint, "click");
      } else {
        await expect(findSuggestionPoint(page, SUGGESTION_SLOT_ID)).rejects.toThrow();
      }
      const events = await getHarnessEvents(page);
      const moves = (events.onChangeDestinationId ?? []) as Array<{ preview?: boolean }>;
      if (enabled) {
        expect(moves.length).toBeGreaterThan(0);
        expect(moves.at(-1)?.preview).toBe(true);
      } else {
        expect(moves).toHaveLength(0);
      }
    },
  },
  {
    feature: "collapse-topics",
    fixture: "topic-collapse",
    minimalOnFeatures: ["collapse-topics"],
    assertBehavior: async (page, enabled) => {
      await page.evaluate(() => localStorage.removeItem("collapsedTopics"));
      const togglePoint = await findTopicTogglePoint(page);
      await dispatchCanvasMouseEvent(page, { x: togglePoint.x, y: togglePoint.y }, "click");
      const collapsed = await page.evaluate(() => {
        const raw = localStorage.getItem("collapsedTopics");
        return raw ? (JSON.parse(raw) as string[]) : [];
      });
      if (enabled) {
        expect(collapsed).toContain(togglePoint.topicId);
      } else {
        expect(collapsed).not.toContain(togglePoint.topicId);
      }
    },
  },
  {
    feature: "canvas-context-menu",
    fixture: "markers",
    minimalOnFeatures: ["canvas-context-menu"],
    assertBehavior: async (page, enabled) => {
      const point = await findEmptyChartBackgroundPoint(page);
      await dispatchCanvasMouseEvent(page, point, "contextmenu");
      const isOpen = await getCanvasStateField<boolean>(page, "contextMenuOpen");
      expect(isOpen).toBe(enabled);
    },
  },
  {
    feature: "move-vertical-markers",
    fixture: "markers",
    minimalOnFeatures: ["move-vertical-markers"],
    assertBehavior: async (page, enabled) => {
      await clearHarnessEvents(page);
      const canvas = page.locator("canvas.chart-canvas").first();
      const point = await findVerticalMarkerPoint(page, MARKER_STD);
      const from = await canvasPointToPagePoint(canvas, point);
      const to = { x: from.x + 90, y: from.y };
      await mouseDrag(page, from, to);
      const events = await getHarnessEvents(page);
      const changes = (events.onChangeVerticalMarker ?? []) as unknown[];
      if (enabled) {
        expect(changes.length).toBeGreaterThan(0);
      } else {
        expect(changes).toHaveLength(0);
      }
    },
  },
  {
    feature: "move-vertical-markers-from-context-menu",
    fixture: "markers",
    minimalOnFeatures: ["move-vertical-markers-from-context-menu", "canvas-context-menu"],
    assertBehavior: async (page, enabled) => {
      await clearHarnessEvents(page);
      const point = await findEmptyChartBackgroundPoint(page);
      await dispatchCanvasMouseEvent(page, point, "contextmenu");
      const menuState = await getCanvasState<any>(page);
      const rootLabels = ((menuState?.contextMenu?.rootItems ?? []) as Array<{ label?: string }>).map((item) => item.label ?? "");
      const hasGroupedMove = rootLabels.includes("Move marker here");
      const singleMoveLabel = rootLabels.find((label) => label.startsWith("Move ") && label.endsWith(" here"));

      if (enabled) {
        if (hasGroupedMove) {
          await clickCanvasContextMenuItem(page, "Move marker here", "STD");
        } else if (singleMoveLabel) {
          await clickCanvasContextMenuItem(page, singleMoveLabel);
        } else {
          throw new Error("Expected a context-menu marker move item in ON mode");
        }
      } else {
        // OFF-mode assertion is focused on emitted behavior, not menu composition details.
      }

      const events = await getHarnessEvents(page);
      const changes = (events.onChangeVerticalMarker ?? []) as unknown[];
      if (enabled) {
        expect(changes.length).toBeGreaterThan(0);
      } else {
        expect(changes).toHaveLength(0);
      }
    },
  },
  {
    feature: "move-slots-to-destination",
    minimalOnFeatures: ["select-slots", "move-slots-to-destination"],
    assertBehavior: async (page, enabled) => {
      await clearHarnessEvents(page);
      await selectSingleSlot(page);
      const targetPoint = await findSlotPoint(page, SECOND_SLOT_ID, "center");
      await dispatchCanvasMouseEvent(page, targetPoint, "click");
      const events = await getHarnessEvents(page);
      const moves = (events.onChangeDestinationId ?? []) as unknown[];
      if (enabled) {
        expect(moves.length).toBeGreaterThan(0);
      } else {
        expect(moves).toHaveLength(0);
      }
    },
  },
  {
    feature: "bulk-move-slots-to-destination",
    minimalOnFeatures: ["select-slots", "bulk-move-slots-to-destination"],
    assertBehavior: async (page, enabled) => {
      await clearHarnessEvents(page);
      await selectTwoSlots(page);
      const targetPoint = await findSlotPoint(page, THIRD_SLOT_ID, "center");
      await dispatchCanvasMouseEvent(page, targetPoint, "click");
      const events = await getHarnessEvents(page);
      const moves = (events.onBulkChangeDestinationId ?? []) as unknown[];
      if (enabled) {
        expect(moves.length).toBeGreaterThan(0);
      } else {
        expect(moves).toHaveLength(0);
      }
    },
  },
  {
    feature: "copy-slots-to-destination",
    minimalOnFeatures: ["select-slots", "copy-modifier-alt", "copy-slots-to-destination"],
    assertBehavior: async (page, enabled) => {
      await clearHarnessEvents(page);
      await selectSingleSlot(page);
      const targetPoint = await findSlotPoint(page, SECOND_SLOT_ID, "center");
      await dispatchCanvasMouseEvent(page, targetPoint, "click", { altKey: true });
      const events = await getHarnessEvents(page);
      const copies = (events.onCopyToDestinationId ?? []) as unknown[];
      if (enabled) {
        expect(copies.length).toBeGreaterThan(0);
      } else {
        expect(copies).toHaveLength(0);
      }
    },
  },
  {
    feature: "bulk-copy-slots-to-destination",
    minimalOnFeatures: ["select-slots", "copy-modifier-alt", "bulk-copy-slots-to-destination"],
    assertBehavior: async (page, enabled) => {
      await clearHarnessEvents(page);
      await selectTwoSlots(page);
      const targetPoint = await findSlotPoint(page, THIRD_SLOT_ID, "center");
      await dispatchCanvasMouseEvent(page, targetPoint, "click", { altKey: true });
      const events = await getHarnessEvents(page);
      const copies = (events.onBulkCopyToDestinationId ?? []) as unknown[];
      if (enabled) {
        expect(copies.length).toBeGreaterThan(0);
      } else {
        expect(copies).toHaveLength(0);
      }
    },
  },
  {
    feature: "move-slots-on-time-axis",
    query: { endTime: "2025-01-02T23:59:59Z" },
    minimalOnFeatures: ["select-slots", "time-axis-modifier-shift", "move-slots-on-time-axis"],
    assertBehavior: async (page, enabled) => {
      await clearHarnessEvents(page);
      await seedSelectionFromStorage(page, [SOURCE_SLOT_ID]);
      await performTimeAxisAction(page, false);
      const events = await getHarnessEvents(page);
      const moves = (events.onMoveSlotOnTimeAxis ?? []) as unknown[];
      if (enabled) {
        expect(moves.length).toBeGreaterThan(0);
      } else {
        expect(moves).toHaveLength(0);
      }
    },
  },
  {
    feature: "bulk-move-slots-on-time-axis",
    query: { endTime: "2025-01-02T23:59:59Z" },
    minimalOnFeatures: [
      "select-slots",
      "time-axis-modifier-shift",
      "bulk-move-slots-on-time-axis",
    ],
    assertBehavior: async (page, enabled) => {
      await clearHarnessEvents(page);
      await seedSelectionFromStorage(page, [SOURCE_SLOT_ID, SECOND_SLOT_ID]);
      await performTimeAxisAction(page, false);
      const events = await getHarnessEvents(page);
      const moves = (events.onBulkMoveSlotsOnTimeAxis ?? []) as unknown[];
      if (enabled) {
        expect(moves.length).toBeGreaterThan(0);
      } else {
        expect(moves).toHaveLength(0);
      }
    },
  },
  {
    feature: "copy-slots-on-time-axis",
    query: { endTime: "2025-01-02T23:59:59Z" },
    minimalOnFeatures: [
      "select-slots",
      "time-axis-modifier-shift",
      "copy-modifier-alt",
      "copy-slots-on-time-axis",
    ],
    assertBehavior: async (page, enabled) => {
      await clearHarnessEvents(page);
      await seedSelectionFromStorage(page, [SOURCE_SLOT_ID]);
      await performTimeAxisAction(page, true);
      const events = await getHarnessEvents(page);
      const copies = (events.onCopySlotOnTimeAxis ?? []) as unknown[];
      if (enabled) {
        expect(copies.length).toBeGreaterThan(0);
      } else {
        expect(copies).toHaveLength(0);
      }
    },
  },
  {
    feature: "bulk-copy-slots-on-time-axis",
    query: { endTime: "2025-01-02T23:59:59Z" },
    minimalOnFeatures: [
      "select-slots",
      "time-axis-modifier-shift",
      "copy-modifier-alt",
      "bulk-copy-slots-on-time-axis",
    ],
    assertBehavior: async (page, enabled) => {
      await clearHarnessEvents(page);
      await seedSelectionFromStorage(page, [SOURCE_SLOT_ID, SECOND_SLOT_ID]);
      await performTimeAxisAction(page, true);
      const events = await getHarnessEvents(page);
      const copies = (events.onBulkCopySlotsOnTimeAxis ?? []) as unknown[];
      if (enabled) {
        expect(copies.length).toBeGreaterThan(0);
      } else {
        expect(copies).toHaveLength(0);
      }
    },
  },
  {
    feature: "preview-slots-to-destination",
    minimalOnFeatures: [
      "select-slots",
      "move-slots-to-destination",
      "preview-slots-to-destination",
    ],
    assertBehavior: async (page, enabled) => {
      await selectSingleSlot(page);
      const targetPoint = await findSlotPoint(page, SECOND_SLOT_ID, "center");
      const canvas = page.locator("canvas.chart-canvas").first();
      const pagePoint = await canvasPointToPagePoint(canvas, targetPoint);
      await page.mouse.move(pagePoint.x, pagePoint.y);

      const previewTopicId = await getCanvasStateField<string | null>(page, "destinationPreviewTopicId");
      if (enabled) {
        const config = await getHarnessConfig(page);
        const targetDestination = config.slots.find((slot) => slot.id === SECOND_SLOT_ID)?.destinationId;
        expect(previewTopicId).toBe(targetDestination ?? null);
      } else {
        expect(previewTopicId).toBeNull();
      }
    },
  },
  {
    feature: "preview-slots-on-time-axis",
    query: { endTime: "2025-01-02T23:59:59Z" },
    minimalOnFeatures: [
      "select-slots",
      "time-axis-modifier-shift",
      "move-slots-on-time-axis",
      "preview-slots-on-time-axis",
    ],
    assertBehavior: async (page, enabled) => {
      await seedSelectionFromStorage(page, [SOURCE_SLOT_ID]);
      const axisPoint = await getTimeAxisTargetPointInGroup(page);
      await dispatchCanvasMouseEvent(page, axisPoint, "mousemove", {
        shiftKey: true,
      });
      const diff = await getCanvasStateField<number | null>(page, "hoveredTimeAxisDiffMs");
      if (enabled) {
        expect(diff).not.toBeNull();
      } else {
        expect(diff).toBeNull();
      }
    },
  },
  {
    feature: "copy-modifier-alt",
    minimalOnFeatures: ["copy-modifier-alt"],
    assertBehavior: async (page, enabled) => {
      await page.keyboard.down("Alt");
      const active = await getCanvasStateField<boolean>(page, "altCopyModifierActive");
      await page.keyboard.up("Alt");
      expect(active).toBe(enabled);
    },
  },
  {
    feature: "time-axis-modifier-shift",
    minimalOnFeatures: ["time-axis-modifier-shift"],
    assertBehavior: async (page, enabled) => {
      await page.keyboard.down("Shift");
      const active = await getCanvasStateField<boolean>(page, "shiftTimeAxisModifierActive");
      await page.keyboard.up("Shift");
      expect(active).toBe(enabled);
    },
  },
];

test.describe("feature flags per-feature ON/OFF", () => {
  for (const scenario of featureCases) {
    test(`${scenario.feature} OFF (independent)`, async ({ page }) => {
      const features = allExcept(scenario.feature);
      await openE2eHarness(page, {
        fixture: scenario.fixture ?? "core",
        query: {
          ...(scenario.query ?? {}),
          features: toFeatureQuery(features),
        },
      });

      await scenario.assertBehavior(page, false);
    });

    test(`${scenario.feature} ON (independent)`, async ({ page }) => {
      await openE2eHarness(page, {
        fixture: scenario.fixture ?? "core",
        query: {
          ...(scenario.query ?? {}),
          features: toFeatureQuery(scenario.minimalOnFeatures),
        },
      });

      await scenario.assertBehavior(page, true);
    });
  }
});
