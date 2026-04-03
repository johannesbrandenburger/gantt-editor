import { expect, type Locator, type Page } from "@playwright/test";

type TestApiState = {
  layout: {
    canvasCssWidth: number;
    canvasCssHeight: number;
  } | null;
};

type OpenHarnessOptions = {
  fixture?: "core" | "dense" | "readonly" | "markers" | "suggestions" | "topic-collapse";
  query?: Record<string, string | number | boolean | null | undefined>;
};

type HarnessConfig = {
  slots: Array<{
    id: string;
    displayName?: string;
    destinationId: string;
    openTime?: Date | string;
    closeTime: Date | string;
  }>;
  isReadOnly?: boolean;
  topContentPortion?: number;
  suggestions?: Array<{ slotId: string; alternativeDestinationId: string }>;
  verticalMarkers?: Array<{ id: string; date: Date | string; color?: string }>;
  destinations?: Array<{ id: string; displayName?: string; groupId?: string }>;
  markedRegion?: {
    startTime: Date | string;
    endTime: Date | string;
    destinationId: string;
  } | null;
};

type HarnessEvents = Record<string, unknown[]>;

type CanvasStateRecord = Record<string, unknown>;

type CanvasTestApi<TState = unknown> = {
  flush: () => void;
  getState: () => TState;
};

type E2eHarnessApi = {
  getConfig: () => HarnessConfig;
  setConfig: (partial: Partial<HarnessConfig>) => HarnessConfig;
  applyQuery: (query: Record<string, string | number | boolean | null | undefined>) => Promise<void>;
  getEvents: () => HarnessEvents;
  clearEvents: () => void;
};

type HarnessWindow = Window & {
  __ganttCanvasTestApi?: CanvasTestApi;
  __ganttE2eHarness?: Partial<E2eHarnessApi>;
};

type ProbeField = "verticalMarkerId" | "suggestionSlotId" | "topicId";

type ProbeCanvasState = {
  layout: { canvasCssWidth: number; canvasCssHeight: number } | null;
  margin: { left: number; right: number };
};

type ProbeCanvasApi = CanvasTestApi<ProbeCanvasState> & {
  probeCanvasPoint: (x: number, y: number) => Record<ProbeField, string | null>;
};

type ProbeScanOptions = {
  field: ProbeField;
  targetId?: string;
  scanOrder: "x-first" | "y-first";
  xStep: number;
  yStep: number;
  xMode: "inside-chart" | "topic-gutter";
};

async function findProbePoint(
  page: Page,
  options: ProbeScanOptions,
): Promise<{ x: number; y: number; probeId: string } | null> {
  return await page.evaluate((scan) => {
    const api = (window as HarnessWindow).__ganttCanvasTestApi as ProbeCanvasApi | undefined;

    api?.flush();
    const state = api?.getState();
    if (!api || !state?.layout) return null;

    const minX =
      scan.xMode === "topic-gutter"
        ? Math.max(1, Math.floor(state.margin.left - 8))
        : Math.max(1, state.margin.left + 1);
    const maxX =
      scan.xMode === "topic-gutter"
        ? minX
        : Math.max(minX, state.layout.canvasCssWidth - state.margin.right - 1);
    const maxY = Math.max(1, state.layout.canvasCssHeight - 1);

    const matches = (probeId: string | null): probeId is string => {
      if (scan.targetId) {
        return probeId === scan.targetId;
      }
      return !!probeId;
    };

    if (scan.scanOrder === "x-first") {
      for (let x = minX; x <= maxX; x += scan.xStep) {
        for (let y = 1; y <= maxY; y += scan.yStep) {
          const probeId = api.probeCanvasPoint(x, y)[scan.field];
          if (matches(probeId)) {
            return { x, y, probeId };
          }
        }
      }
      return null;
    }

    for (let y = 1; y <= maxY; y += scan.yStep) {
      for (let x = minX; x <= maxX; x += scan.xStep) {
        const probeId = api.probeCanvasPoint(x, y)[scan.field];
        if (matches(probeId)) {
          return { x, y, probeId };
        }
      }
    }

    return null;
  }, options);
}

export async function openE2eHarness(page: Page, options?: OpenHarnessOptions): Promise<Locator> {
  const fixture = options?.fixture ?? "core";
  const queryParams = new URLSearchParams({ fixture });
  for (const [key, value] of Object.entries(options?.query ?? {})) {
    if (value === null || value === undefined) continue;
    queryParams.set(key, String(value));
  }

  await page.goto(`/e2e-harness?${queryParams.toString()}`);
  const canvas = page.locator("canvas.chart-canvas").first();
  await expect(canvas).toBeVisible();
  await waitForCanvasApi(page);
  await page.evaluate(() => {
    (window as HarnessWindow).__ganttCanvasTestApi?.flush();
  });
  return canvas;
}

export async function waitForCanvasApi(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const api = (window as HarnessWindow).__ganttCanvasTestApi as
      | CanvasTestApi<TestApiState>
      | undefined;
    return !!api?.getState()?.layout;
  });
}

export async function findSlotPoint(
  page: Page,
  slotId: string,
  mode: "center" | "left-edge" | "right-edge" = "center",
): Promise<{ x: number; y: number }> {
  const point = await page.evaluate(
    ({ currentSlotId, currentMode }) => {
      const api = (window as HarnessWindow).__ganttCanvasTestApi as
        | (CanvasTestApi & {
            findSlotPoint: (
              slotId: string,
              mode?: "center" | "left-edge" | "right-edge",
            ) => { x: number; y: number } | null;
          })
        | undefined;
      api?.flush();
      return api?.findSlotPoint(currentSlotId, currentMode) ?? null;
    },
    { currentSlotId: slotId, currentMode: mode },
  );

  expect(point, `Expected to find slot point for ${slotId} (${mode})`).not.toBeNull();
  return point as { x: number; y: number };
}

export async function canvasPointToPagePoint(
  canvas: Locator,
  canvasPoint: { x: number; y: number },
): Promise<{ x: number; y: number }> {
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  return {
    x: (box as { x: number; y: number }).x + canvasPoint.x,
    y: (box as { x: number; y: number }).y + canvasPoint.y,
  };
}

export async function mouseDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 14 });
  await page.mouse.up();
}

export async function dispatchCanvasMouseEvent(
  page: Page,
  canvasPoint: { x: number; y: number },
  type: "click" | "dblclick" | "contextmenu",
  modifiers?: { ctrlKey?: boolean; metaKey?: boolean },
): Promise<void> {
  await page.evaluate(
    ({ x, y, eventType, eventModifiers }) => {
      const canvas = document.querySelector("canvas.chart-canvas") as HTMLCanvasElement | null;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const button = eventType === "contextmenu" ? 2 : 0;
      canvas.dispatchEvent(
        new MouseEvent(eventType, {
          bubbles: true,
          cancelable: true,
          clientX: rect.left + x,
          clientY: rect.top + y,
          button,
          ctrlKey: !!eventModifiers?.ctrlKey,
          metaKey: !!eventModifiers?.metaKey,
        }),
      );
    },
    { x: canvasPoint.x, y: canvasPoint.y, eventType: type, eventModifiers: modifiers ?? {} },
  );
}

export async function getCanvasState<TState extends CanvasStateRecord>(page: Page): Promise<TState | null> {
  return await page.evaluate(() => {
    const api = (window as HarnessWindow).__ganttCanvasTestApi as CanvasTestApi<CanvasStateRecord> | undefined;
    api?.flush();
    return (api?.getState() ?? null) as TState | null;
  });
}

export async function getCanvasStateField<TValue>(page: Page, field: string): Promise<TValue | null> {
  return await page.evaluate((fieldName) => {
    const api = (window as HarnessWindow).__ganttCanvasTestApi as CanvasTestApi<CanvasStateRecord> | undefined;
    api?.flush();
    const state = api?.getState();
    if (!state || !(fieldName in state)) {
      return null;
    }
    return state[fieldName] as TValue;
  }, field);
}

export async function getHarnessConfig(page: Page): Promise<HarnessConfig> {
  return await page.evaluate(() => {
    const harness = (window as HarnessWindow).__ganttE2eHarness as
      | Pick<E2eHarnessApi, "getConfig">
      | undefined;
    return harness?.getConfig() ?? { slots: [] };
  });
}

export async function setHarnessConfig(
  page: Page,
  partial: Partial<HarnessConfig>,
): Promise<HarnessConfig> {
  return await page.evaluate((nextPartial) => {
    const harness = (window as HarnessWindow).__ganttE2eHarness as
      | Pick<E2eHarnessApi, "setConfig">
      | undefined;
    return harness?.setConfig(nextPartial) ?? { slots: [] };
  }, partial);
}

export async function applyHarnessQuery(
  page: Page,
  query: Record<string, string | number | boolean | null | undefined>,
): Promise<void> {
  await page.evaluate(async (nextQuery) => {
    const harness = (window as HarnessWindow).__ganttE2eHarness as
      | Pick<E2eHarnessApi, "applyQuery">
      | undefined;
    await harness?.applyQuery(nextQuery);
  }, query);
}

export async function getHarnessSlotCloseTimeMs(page: Page, slotId: string): Promise<number | null> {
  return await page.evaluate((currentSlotId) => {
    const harness = (window as HarnessWindow).__ganttE2eHarness as
      | Pick<E2eHarnessApi, "getConfig">
      | undefined;
    const slot = harness?.getConfig().slots.find((item) => item.id === currentSlotId);
    return slot ? new Date(slot.closeTime).getTime() : null;
  }, slotId);
}

export async function getHarnessSlotOpenTimeMs(page: Page, slotId: string): Promise<number | null> {
  return await page.evaluate((currentSlotId) => {
    const harness = (window as HarnessWindow).__ganttE2eHarness as
      | Pick<E2eHarnessApi, "getConfig">
      | undefined;
    const slot = harness?.getConfig().slots.find((item) => item.id === currentSlotId) as
      | { openTime?: Date | string }
      | undefined;
    return slot?.openTime ? new Date(slot.openTime).getTime() : null;
  }, slotId);
}

export async function getHarnessEvents(page: Page): Promise<HarnessEvents> {
  return await page.evaluate(() => {
    const harness = (window as HarnessWindow).__ganttE2eHarness as
      | Pick<E2eHarnessApi, "getEvents">
      | undefined;
    return harness?.getEvents() ?? {};
  });
}

export async function clearHarnessEvents(page: Page): Promise<void> {
  await page.evaluate(() => {
    const harness = (window as HarnessWindow).__ganttE2eHarness as
      | Pick<E2eHarnessApi, "clearEvents">
      | undefined;
    harness?.clearEvents();
  });
}

export async function findVerticalMarkerPoint(page: Page, markerId: string): Promise<{ x: number; y: number }> {
  const point = await findProbePoint(page, {
    field: "verticalMarkerId",
    targetId: markerId,
    scanOrder: "x-first",
    xStep: 2,
    yStep: 3,
    xMode: "inside-chart",
  });

  expect(point, `Expected to find vertical marker point for ${markerId}`).not.toBeNull();
  return point as { x: number; y: number };
}

export async function findSuggestionPoint(page: Page, slotId: string): Promise<{ x: number; y: number }> {
  const point = await findProbePoint(page, {
    field: "suggestionSlotId",
    targetId: slotId,
    scanOrder: "y-first",
    xStep: 2,
    yStep: 2,
    xMode: "inside-chart",
  });

  expect(point, `Expected to find suggestion point for ${slotId}`).not.toBeNull();
  return point as { x: number; y: number };
}

export async function findTopicTogglePoint(
  page: Page,
): Promise<{ x: number; y: number; topicId: string }> {
  const point = await findProbePoint(page, {
    field: "topicId",
    scanOrder: "y-first",
    xStep: 1,
    yStep: 2,
    xMode: "topic-gutter",
  });

  expect(point, "Expected to find topic toggle point in left label gutter").not.toBeNull();
  return {
    x: (point as { x: number; y: number }).x,
    y: (point as { x: number; y: number }).y,
    topicId: (point as { probeId: string }).probeId,
  };
}
