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
  slots: Array<{ id: string; destinationId: string; closeTime: Date | string }>;
};

type HarnessEvents = Record<string, unknown[]>;

type CanvasStateRecord = Record<string, unknown>;

type CanvasTestApi = {
  flush: () => void;
  getState: () => CanvasStateRecord;
};

type E2eHarnessApi = {
  getConfig: () => HarnessConfig;
  getEvents: () => HarnessEvents;
  clearEvents: () => void;
};

type HarnessWindow = Window & {
  __ganttCanvasTestApi?: CanvasTestApi;
  __ganttE2eHarness?: Partial<E2eHarnessApi>;
};

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
      | (CanvasTestApi & { getState: () => TestApiState })
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
): Promise<void> {
  await page.evaluate(
    ({ x, y, eventType }) => {
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
        }),
      );
    },
    { x: canvasPoint.x, y: canvasPoint.y, eventType: type },
  );
}

export async function getCanvasState<TState extends CanvasStateRecord>(page: Page): Promise<TState | null> {
  return await page.evaluate(() => {
    const api = (window as HarnessWindow).__ganttCanvasTestApi;
    api?.flush();
    return (api?.getState() ?? null) as TState | null;
  });
}

export async function getCanvasStateField<TValue>(page: Page, field: string): Promise<TValue | null> {
  return await page.evaluate((fieldName) => {
    const api = (window as HarnessWindow).__ganttCanvasTestApi;
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

export async function getHarnessSlotCloseTimeMs(page: Page, slotId: string): Promise<number | null> {
  return await page.evaluate((currentSlotId) => {
    const harness = (window as HarnessWindow).__ganttE2eHarness as
      | Pick<E2eHarnessApi, "getConfig">
      | undefined;
    const slot = harness?.getConfig().slots.find((item) => item.id === currentSlotId);
    return slot ? new Date(slot.closeTime).getTime() : null;
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
  const point = await page.evaluate((targetMarkerId) => {
    const api = (window as HarnessWindow).__ganttCanvasTestApi as
      | (CanvasTestApi & {
          getState: () => {
            layout: { canvasCssWidth: number; canvasCssHeight: number } | null;
            margin: { left: number; right: number };
          };
          probeCanvasPoint: (x: number, y: number) => { verticalMarkerId: string | null };
        })
      | undefined;

    api?.flush();
    const state = api?.getState();
    if (!api || !state?.layout) return null;

    const minX = Math.max(1, state.margin.left + 1);
    const maxX = Math.max(minX, state.layout.canvasCssWidth - state.margin.right - 1);
    const maxY = Math.max(1, state.layout.canvasCssHeight - 1);

    for (let x = minX; x <= maxX; x += 2) {
      for (let y = 1; y <= maxY; y += 3) {
        const probe = api.probeCanvasPoint(x, y);
        if (probe.verticalMarkerId === targetMarkerId) {
          return { x, y };
        }
      }
    }

    return null;
  }, markerId);

  expect(point, `Expected to find vertical marker point for ${markerId}`).not.toBeNull();
  return point as { x: number; y: number };
}

export async function findSuggestionPoint(page: Page, slotId: string): Promise<{ x: number; y: number }> {
  const point = await page.evaluate((targetSlotId) => {
    const api = (window as HarnessWindow).__ganttCanvasTestApi as
      | (CanvasTestApi & {
          getState: () => {
            layout: { canvasCssWidth: number; canvasCssHeight: number } | null;
            margin: { left: number; right: number };
          };
          probeCanvasPoint: (x: number, y: number) => { suggestionSlotId: string | null };
        })
      | undefined;

    api?.flush();
    const state = api?.getState();
    if (!api || !state?.layout) return null;

    const minX = Math.max(1, state.margin.left + 1);
    const maxX = Math.max(minX, state.layout.canvasCssWidth - state.margin.right - 1);
    const maxY = Math.max(1, state.layout.canvasCssHeight - 1);

    for (let y = 1; y <= maxY; y += 2) {
      for (let x = minX; x <= maxX; x += 2) {
        const probe = api.probeCanvasPoint(x, y);
        if (probe.suggestionSlotId === targetSlotId) {
          return { x, y };
        }
      }
    }

    return null;
  }, slotId);

  expect(point, `Expected to find suggestion point for ${slotId}`).not.toBeNull();
  return point as { x: number; y: number };
}

export async function findTopicTogglePoint(
  page: Page,
): Promise<{ x: number; y: number; topicId: string }> {
  const point = await page.evaluate(() => {
    const api = (window as HarnessWindow).__ganttCanvasTestApi as
      | (CanvasTestApi & {
          getState: () => {
            layout: { canvasCssWidth: number; canvasCssHeight: number } | null;
            margin: { left: number; right: number };
          };
          probeCanvasPoint: (x: number, y: number) => { topicId: string | null };
        })
      | undefined;

    api?.flush();
    const state = api?.getState();
    if (!api || !state?.layout) return null;

    const x = Math.max(1, Math.floor(state.margin.left - 8));
    const maxY = Math.max(1, state.layout.canvasCssHeight - 1);

    for (let y = 1; y <= maxY; y += 2) {
      const probe = api.probeCanvasPoint(x, y);
      if (probe.topicId) {
        return { x, y, topicId: probe.topicId };
      }
    }

    return null;
  });

  expect(point, "Expected to find topic toggle point in left label gutter").not.toBeNull();
  return point as { x: number; y: number; topicId: string };
}
