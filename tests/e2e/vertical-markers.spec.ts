import { expect, test } from "./coverage-test";
import {
  clickCanvasContextMenuItem,
  canvasPointToPagePoint,
  clearHarnessEvents,
  dispatchCanvasMouseEvent,
  findEmptyChartBackgroundPoint,
  findVerticalMarkerPoint,
  getCanvasStateField,
  getHarnessConfig,
  getHarnessEvents,
  mouseDrag,
  openE2eHarness,
} from "./helpers";

const MARKER_STD = "m-std";
const MARKER_ETD = "m-etd";

test.describe("canvas rewrite vertical markers", () => {
  test("markers are rendered and hit-testable", async ({ page }) => {
    await openE2eHarness(page, { fixture: "markers" });

    const stdPoint = await findVerticalMarkerPoint(page, MARKER_STD);
    const etdPoint = await findVerticalMarkerPoint(page, MARKER_ETD);

    expect(stdPoint.x).toBeGreaterThan(0);
    expect(etdPoint.x).toBeGreaterThan(0);
    expect(stdPoint.y).toBeGreaterThanOrEqual(0);
    expect(etdPoint.y).toBeGreaterThanOrEqual(0);
  });

  test("configured marker colors are exposed in marker config", async ({ page }) => {
    await openE2eHarness(page, { fixture: "markers" });

    const markers = (await getHarnessConfig(page)).verticalMarkers ?? [];
    expect(markers.find((marker) => marker.id === MARKER_STD)?.color?.toLowerCase()).toBe("#e74c3c");
    expect(markers.find((marker) => marker.id === MARKER_ETD)?.color?.toLowerCase()).toBe("#2ecc71");
  });

  test("clicking a marker emits onClickVerticalMarker", async ({ page }) => {
    await openE2eHarness(page, { fixture: "markers" });
    await clearHarnessEvents(page);

    const point = await findVerticalMarkerPoint(page, MARKER_STD);
    await dispatchCanvasMouseEvent(page, point, "click");

    await expect
      .poll(async () => {
        const events = await getHarnessEvents(page);
        const clicks = (events.onClickVerticalMarker ?? []) as Array<{ id?: string }>;
        return clicks.at(-1)?.id ?? null;
      })
      .toBe(MARKER_STD);
  });

  test("dragging a marker changes its date", async ({ page }) => {
    const canvas = await openE2eHarness(page, { fixture: "markers" });
    await clearHarnessEvents(page);

    const beforeDate = (await getHarnessConfig(page)).verticalMarkers?.find(
      (marker) => marker.id === MARKER_STD,
    )?.date;
    expect(beforeDate).toBeTruthy();

    const markerPoint = await findVerticalMarkerPoint(page, MARKER_STD);
    const from = await canvasPointToPagePoint(canvas, markerPoint);
    const to = { x: from.x + 100, y: from.y };

    await mouseDrag(page, from, to);

    await expect
      .poll(async () => {
        const marker = (await getHarnessConfig(page)).verticalMarkers?.find(
          (item) => item.id === MARKER_STD,
        );
        return marker?.date ? new Date(marker.date).getTime() : null;
      })
      .not.toBe(beforeDate ? new Date(beforeDate).getTime() : null);

    await expect
      .poll(async () => {
        const events = await getHarnessEvents(page);
        const changes = (events.onChangeVerticalMarker ?? []) as Array<{ id?: string }>;
        return changes.at(-1)?.id ?? null;
      })
      .toBe(MARKER_STD);
  });

  test("single draggable marker can be moved from background context menu", async ({ page }) => {
    await openE2eHarness(page, { fixture: "core", query: { markers: true } });
    await clearHarnessEvents(page);

    const before = (await getHarnessConfig(page)).verticalMarkers?.find((marker) => marker.id === "m-auto")?.date;
    expect(before).toBeTruthy();

    const backgroundPoint = await findEmptyChartBackgroundPoint(page);
    await dispatchCanvasMouseEvent(page, backgroundPoint, "contextmenu");
    await clickCanvasContextMenuItem(page, "Move marker here");

    await expect
      .poll(async () => {
        const events = await getHarnessEvents(page);
        const changes = (events.onChangeVerticalMarker ?? []) as Array<{ id?: string }>;
        return changes.at(-1)?.id ?? null;
      })
      .toBe("m-auto");

    await expect
      .poll(async () => {
        const marker = (await getHarnessConfig(page)).verticalMarkers?.find((item) => item.id === "m-auto");
        return marker?.date ? new Date(marker.date).getTime() : null;
      })
      .not.toBe(before ? new Date(before).getTime() : null);
  });

  test("multiple markers require submenu and move selected marker", async ({ page }) => {
    await openE2eHarness(page, { fixture: "markers" });
    await clearHarnessEvents(page);

    const before = await getHarnessConfig(page);
    const beforeStd = before.verticalMarkers?.find((marker) => marker.id === MARKER_STD)?.date;
    const beforeEtd = before.verticalMarkers?.find((marker) => marker.id === MARKER_ETD)?.date;
    expect(beforeStd).toBeTruthy();
    expect(beforeEtd).toBeTruthy();

    const backgroundPoint = await findEmptyChartBackgroundPoint(page);
    await dispatchCanvasMouseEvent(page, backgroundPoint, "contextmenu");
    await clickCanvasContextMenuItem(page, "Move marker here", "STD");

    await expect
      .poll(async () => {
        const events = await getHarnessEvents(page);
        const changes = (events.onChangeVerticalMarker ?? []) as Array<{ id?: string }>;
        return changes.at(-1)?.id ?? null;
      })
      .toBe(MARKER_STD);

    await expect
      .poll(async () => {
        const config = await getHarnessConfig(page);
        const marker = config.verticalMarkers?.find((item) => item.id === MARKER_STD);
        return marker?.date ? new Date(marker.date).getTime() : null;
      })
      .not.toBe(beforeStd ? new Date(beforeStd).getTime() : null);

    await expect
      .poll(async () => {
        const config = await getHarnessConfig(page);
        const marker = config.verticalMarkers?.find((item) => item.id === MARKER_ETD);
        return marker?.date ? new Date(marker.date).getTime() : null;
      })
      .toBe(beforeEtd ? new Date(beforeEtd).getTime() : null);
  });

  test("marker can be context-menu movable even when dragging is disabled", async ({ page }) => {
    const customData = encodeURIComponent(
      JSON.stringify({
        verticalMarkers: [
          {
            id: "menu-only-marker",
            label: "Menu Only",
            date: "2025-01-01T11:00:00Z",
            color: "#e74c3c",
            draggable: false,
            movableByContextMenu: true,
          },
        ],
      }),
    );

    await openE2eHarness(page, { fixture: "core", query: { data: customData } });
    await clearHarnessEvents(page);

    const before = (await getHarnessConfig(page)).verticalMarkers?.find(
      (marker) => marker.id === "menu-only-marker",
    )?.date;
    expect(before).toBeTruthy();

    const backgroundPoint = await findEmptyChartBackgroundPoint(page);
    await dispatchCanvasMouseEvent(page, backgroundPoint, "contextmenu");
    await clickCanvasContextMenuItem(page, "Move marker here");

    await expect
      .poll(async () => {
        const events = await getHarnessEvents(page);
        const changes = (events.onChangeVerticalMarker ?? []) as Array<{ id?: string }>;
        return changes.at(-1)?.id ?? null;
      })
      .toBe("menu-only-marker");

    await expect
      .poll(async () => {
        const marker = (await getHarnessConfig(page)).verticalMarkers?.find(
          (item) => item.id === "menu-only-marker",
        );
        return marker?.date ? new Date(marker.date).getTime() : null;
      })
      .not.toBe(before ? new Date(before).getTime() : null);
  });

  test("marker can stay draggable but be excluded from context-menu movement", async ({ page }) => {
    const customData = encodeURIComponent(
      JSON.stringify({
        verticalMarkers: [
          {
            id: "drag-only-marker",
            label: "Drag Only",
            date: "2025-01-01T11:00:00Z",
            color: "#2ecc71",
            draggable: true,
            movableByContextMenu: false,
          },
        ],
      }),
    );

    await openE2eHarness(page, { fixture: "core", query: { data: customData } });
    await clearHarnessEvents(page);

    const backgroundPoint = await findEmptyChartBackgroundPoint(page);
    await dispatchCanvasMouseEvent(page, backgroundPoint, "contextmenu");

    await expect
      .poll(async () => {
        const config = await getHarnessConfig(page);
        return config.verticalMarkers?.find((marker) => marker.id === "drag-only-marker")?.date
          ? new Date(
              config.verticalMarkers!.find((marker) => marker.id === "drag-only-marker")!.date,
            ).getTime()
          : null;
      })
      .toBeTruthy();

    await expect
      .poll(async () => {
        return await getCanvasStateField<boolean>(page, "contextMenuOpen");
      })
      .toBe(false);

    const canvas = await page.locator("canvas.chart-canvas").first();
    const markerPoint = await findVerticalMarkerPoint(page, "drag-only-marker");
    const from = await canvasPointToPagePoint(canvas, markerPoint);
    const to = { x: from.x + 80, y: from.y };

    const before = (await getHarnessConfig(page)).verticalMarkers?.find(
      (marker) => marker.id === "drag-only-marker",
    )?.date;
    await mouseDrag(page, from, to);

    await expect
      .poll(async () => {
        const marker = (await getHarnessConfig(page)).verticalMarkers?.find(
          (item) => item.id === "drag-only-marker",
        );
        return marker?.date ? new Date(marker.date).getTime() : null;
      })
      .not.toBe(before ? new Date(before).getTime() : null);
  });
});
