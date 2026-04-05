import { expect, test } from "./coverage-test";
import {
  canvasPointToPagePoint,
  clearHarnessEvents,
  dispatchCanvasMouseEvent,
  findVerticalMarkerPoint,
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
});
