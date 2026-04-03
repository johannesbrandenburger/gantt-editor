import { drawXAxisOnCanvas } from "./canvas_axis";
import {
  setupCanvasPanZoom,
  handlePanZoomWheelEvent,
  clearPanZoomWheelDebounce,
  type PanZoomCleanup,
  type PanZoomCallbacks,
  type WheelZoomAnchor,
} from "./canvas_pan_zoom";
import {
  computeRowHeightForUnifiedZoom,
  SLOT_RENDER_RATIO,
  departureMarkersVisible,
  destinationLabelsVisible,
  suggestionsVisible,
  slotsAllowLabelsAndInteraction,
} from "./canvas_slot_scale";
import { processData } from "./process-data";
import { drawTopicLines, computeContentHeight, computeTopicLayout } from "./canvas_topics";
import {
  collectSlotsFullyInsideRect,
  drawSlots,
  hitTestSlotBar,
  hitTestSlotResizeEdge,
  slotTimesForResizeDragStep,
  type SlotResizeEdge,
} from "./canvas_slots";
import { drawDepartureMarkers, hitTestDepartureGap } from "./canvas_departure_markers";
import { drawVerticalMarkers, hitTestVerticalMarker } from "./canvas_vertical_markers";
import type { SuggestionButtonDefinition } from "./canvas_suggestions";
import { drawSuggestionButtons, hitTestSuggestionButton } from "./canvas_suggestions";
import { drawWeekdayOverlay } from "./canvas_weekdays";
import {
  computeUnifiedChartLayout,
  hitTestChart,
  canvasLocalPoint,
  drawResizeBands,
  type UnifiedChartLayout,
} from "./unified_chart_layout";
import type { GanttEditorSlot, GanttEditorSlotWithUiAttributes, Topic } from "./types";
import type {
  GanttEditorHost,
  GanttEditorCallbacks,
  GanttEditorProps,
} from "./gantt_canvas_props";

const X_AXIS_HEIGHT = 50;
/** Fallback before layout; reconciled from visible time span and chart width. */
const DEFAULT_ROW_HEIGHT = 40;
/** Lower bound for unified zoom so many rows fit when fully zoomed out (band ≈ (1−padding)× this). */
const MIN_ROW_HEIGHT = 1;
const MAX_ROW_HEIGHT = 120;
const SLOT_REFLOW_ANIMATION_MS = 180;
const SLOT_REFLOW_PENDING_TTL_MS = 2_000;

const MARGIN = { left: 200, right: 12 };

// processData only uses slots, destinations, and settings.compactView; it does not use the view
// time range or row height. Omitting those reactive deps keeps pan/zoom from re-running O(n) work
// (row assignment + conflict detection) on every wheel tick.
const PROCESS_DATA_VIEW_PLACEHOLDER_START = new Date(0);
const PROCESS_DATA_VIEW_PLACEHOLDER_END = new Date(86400000);

const CLIPBOARD_STORAGE_KEY = "pointerClipboard";
const HOVER_DELAY_MS = 500;
const BRUSH_DRAG_THRESHOLD_PX = 3;
const CLIPBOARD_PREVIEW_MAX_ITEMS = 5;

function destinationGroupsSnapshot(
  groups: GanttEditorProps["destinationGroups"],
): string {
  return groups.map((g) => `${g.id}:${g.heightPortion}:${g.displayName}`).join("\0");
}

function markedRegionSnapshot(region: GanttEditorProps["markedRegion"]): string {
  if (!region) return "";
  return `${region.destinationId}:${region.startTime.getTime()}:${region.endTime.getTime()}`;
}

export class GanttChartCanvasController {
  private props: GanttEditorProps;
  private readonly callbacks: GanttEditorCallbacks;
  private readonly host: GanttEditorHost;

  private container: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;

  private containerWidth = 0;
  private containerHeight = 0;

  private rowHeight = DEFAULT_ROW_HEIGHT;
  private internalStartTime: Date;
  private internalEndTime: Date;
  private panZoomCleanup: PanZoomCleanup | null = null;

  private currentTopContentPortion: number;
  private isResizingTopContent = false;
  private topContentStartY = 0;

  private isResizing = false;
  private resizingElement: string | null = null;
  private startY = 0;
  private currentHeightPortions = new Map<string, number>();
  private verticalScrollOffsets = new Map<string, number>();

  private isInitialized = false;
  private lastNotifiedTopContentHeight = -1;

  private lastSeenParentStartMs: number;
  private lastSeenParentEndMs: number;
  private lastSeenParentTopPortion: number | undefined;
  private lastDestinationGroupsSnapshot: string;
  private lastMarkedRegionSnapshot: string;

  private hoverResizeBand: string | null = null;
  private hoveredSlotId: string | null = null;
  private hoveredSuggestion: SuggestionButtonDefinition | null = null;
  private hoverTimeout: ReturnType<typeof setTimeout> | null = null;
  private suppressNextCanvasClick = false;
  private lastClickedSlotId: string | null = null;
  private lastDoubleClickedSlotId: string | null = null;
  private lastContextClickedSlotId: string | null = null;

  private pointerInChart = false;
  private pointerCanvasX = 0;
  private pointerCanvasY = 0;
  private clipboardItems: GanttEditorSlot[] = [];

  private brushSelection: {
    groupId: string;
    startX: number;
    startYContent: number;
    currentX: number;
    currentYContent: number;
  } | null = null;

  private resizeObserver: ResizeObserver | null = null;
  /** Recomputed only when geometry inputs change. */
  private chartLayoutCache: UnifiedChartLayout | null = null;
  private chartLayoutDirty = true;
  private readonly panZoomCallbacks: PanZoomCallbacks;

  /** Active left/right slot edge drag (canvas CSS pixels / inner chart width). */
  private slotResizeDrag: {
    edge: SlotResizeEdge;
    slotId: string;
    startClientX: number;
    displayInnerLeft: number;
    displayInnerWidth: number;
    chartWidth: number;
  } | null = null;

  /** Live bar geometry while resizing; cleared on mouseup. */
  private slotResizePreview: { slotId: string; openTime: Date; closeTime: Date } | null = null;

  /** Active drag for a vertical marker line. */
  private verticalMarkerDrag: { markerId: string; currentX: number } | null = null;

  /** Captured row positions before a resize commit; consumed when parent props echo new times. */
  private pendingSlotReflowFromResize: {
    capturedAtMs: number;
    previousRowYBySlotId: Map<string, number>;
  } | null = null;

  /** Short-lived row-shift animation for slots moved by post-resize reflow. */
  private slotReflowAnimation: {
    startedAtMs: number;
    durationMs: number;
    shiftsBySlotId: Map<string, number>;
  } | null = null;

  private cachedCanvasEl: HTMLCanvasElement | null = null;
  private cachedCtx: CanvasRenderingContext2D | null = null;

  /** Cached `processData` result; invalidated when slot/destination model or collapse state changes. */
  private cachedProcessedTopics: Topic[] | null = null;
  /** Fingerprint of inputs last used to build {@link cachedProcessedTopics}. */
  private processDataDeepFingerprint: number | null = null;
  private cacheCollapsedLocalStorage = "";
  private topicsByGroupId = new Map<string, Topic[]>();

  /** At most one full draw per animation frame (pan / drag / hover bursts). */
  private frameRedrawRaf: number | null = null;
  /**
   * When true, the pending rAF was scheduled from an interactive (wheel/pan) path. If false and the
   * user wheels again before it runs, we must paint synchronously — otherwise the first movement
   * waits on refresh/resize work queued earlier.
   */
  private pendingRedrawFollowsInteractive = false;

  private readonly boundCanvasWheel = (e: WheelEvent) => this.onCanvasWheel(e);
  private readonly boundTopContentResize = (e: MouseEvent) => this.handleTopContentResize(e);
  private readonly boundStopTopContentResize = () => this.stopTopContentResize();
  private readonly boundResize = (e: MouseEvent) => this.handleResize(e);
  private readonly boundStopResize = () => this.stopResize();
  private readonly boundSlotResizeMouseMove = (e: MouseEvent) => this.onSlotResizeMouseMove(e);
  private readonly boundSlotResizeMouseUp = (e: MouseEvent) => this.onSlotResizeMouseUp(e);
  private readonly boundVerticalMarkerMouseMove = (e: MouseEvent) =>
    this.onVerticalMarkerMouseMove(e);
  private readonly boundVerticalMarkerMouseUp = (e: MouseEvent) =>
    this.onVerticalMarkerMouseUp(e);
  private readonly boundBrushMouseMove = (e: MouseEvent) => this.onBrushMouseMove(e);
  private readonly boundBrushMouseUp = (e: MouseEvent) => this.onBrushMouseUp(e);
  private readonly boundDocumentKeyDown = (e: KeyboardEvent) => this.onDocumentKeyDown(e);

  constructor(
    initialProps: GanttEditorProps,
    callbacks: GanttEditorCallbacks,
    host: GanttEditorHost = {},
  ) {
    this.props = initialProps;
    this.callbacks = callbacks;
    this.host = host;
    this.internalStartTime = new Date(initialProps.startTime);
    this.internalEndTime = new Date(initialProps.endTime);
    this.currentTopContentPortion = initialProps.topContentPortion ?? 0;
    this.lastSeenParentStartMs = initialProps.startTime.getTime();
    this.lastSeenParentEndMs = initialProps.endTime.getTime();
    this.lastSeenParentTopPortion = initialProps.topContentPortion;
    this.lastDestinationGroupsSnapshot = destinationGroupsSnapshot(
      initialProps.destinationGroups,
    );
    this.lastMarkedRegionSnapshot = markedRegionSnapshot(initialProps.markedRegion);
    this.initMapsFromGroups(initialProps.destinationGroups);
    this.panZoomCallbacks = this.buildPanZoomCallbacks();
  }

  /**
   * Apply the latest model from the host framework. Preserves internal pan/zoom time and local
   * top-content portion until the parent actually changes those inputs (matches prior Vue watches).
   */
  refreshModel(next: GanttEditorProps): void {
    const wasReadOnly = this.props.isReadOnly;
    this.props = next;

    if (!wasReadOnly && next.isReadOnly) {
      this.clearClipboard();
    }

    const newFp = this.computeProcessDataDeepFingerprint(next);
    if (this.processDataDeepFingerprint !== newFp) {
      this.cachedProcessedTopics = null;
    }

    const ps = next.startTime.getTime();
    const pe = next.endTime.getTime();
    if (ps !== this.lastSeenParentStartMs || pe !== this.lastSeenParentEndMs) {
      this.lastSeenParentStartMs = ps;
      this.lastSeenParentEndMs = pe;
      this.internalStartTime = new Date(next.startTime);
      this.internalEndTime = new Date(next.endTime);
      this.reconcileUnifiedZoomRowHeight();
    }

    if (next.topContentPortion !== undefined) {
      const t = next.topContentPortion;
      if (t !== this.lastSeenParentTopPortion) {
        this.lastSeenParentTopPortion = t;
        this.currentTopContentPortion = t;
        this.invalidateLayoutCache();
      }
    }

    const gSnap = destinationGroupsSnapshot(next.destinationGroups);
    if (gSnap !== this.lastDestinationGroupsSnapshot) {
      this.lastDestinationGroupsSnapshot = gSnap;
      this.syncDestinationGroupsFromProps();
    }

    const markedSnap = markedRegionSnapshot(next.markedRegion);
    if (markedSnap !== this.lastMarkedRegionSnapshot) {
      this.lastMarkedRegionSnapshot = markedSnap;
      this.scrollToMarkedRegionDestination(next.markedRegion);
    }

    this.tryStartPendingSlotReflowAnimation(newFp);

    this.redraw();
    this.maybeNotifyTopContentLayout();
  }

  /** Sync maps when `destinationGroups` identity/length changes (matches Vue deep watch). */
  syncDestinationGroupsFromProps(): void {
    const nextH = new Map<string, number>();
    const nextS = new Map<string, number>();
    for (const g of this.props.destinationGroups) {
      nextH.set(g.id, this.currentHeightPortions.get(g.id) ?? g.heightPortion);
      nextS.set(g.id, this.verticalScrollOffsets.get(g.id) ?? 0);
    }
    this.currentHeightPortions = nextH;
    this.verticalScrollOffsets = nextS;
    this.invalidateLayoutCache();
  }

  attach(container: HTMLElement, canvas: HTMLCanvasElement): void {
    this.detach();
    this.container = container;
    this.canvas = canvas;

    this.containerHeight = container.clientHeight;
    this.containerWidth = container.clientWidth;
    this.invalidateLayoutCache();

    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        this.containerHeight = entry.contentRect.height;
        this.containerWidth = entry.contentRect.width;
        this.invalidateLayoutCache();
        this.reconcileUnifiedZoomRowHeight();
        this.redraw();
        this.maybeNotifyTopContentLayout();
      }
    });
    this.resizeObserver.observe(container);

    canvas.addEventListener("wheel", this.boundCanvasWheel, { passive: false });
    document.addEventListener("keydown", this.boundDocumentKeyDown);

    queueMicrotask(() => {
      this.reconcileUnifiedZoomRowHeight();
      this.scrollToMarkedRegionDestination(this.props.markedRegion);
      this.drawUnifiedFrame();
      this.isInitialized = true;
      this.maybeNotifyTopContentLayout();

      if (this.canvas) {
        this.panZoomCleanup = setupCanvasPanZoom(this.canvas, this.panZoomCallbacks);
      }
    });
  }

  detach(): void {
    if (this.frameRedrawRaf !== null) {
      cancelAnimationFrame(this.frameRedrawRaf);
      this.frameRedrawRaf = null;
    }
    this.pendingRedrawFollowsInteractive = false;
    document.removeEventListener("mousemove", this.boundSlotResizeMouseMove);
    document.removeEventListener("mouseup", this.boundSlotResizeMouseUp);
    document.removeEventListener("mousemove", this.boundVerticalMarkerMouseMove);
    document.removeEventListener("mouseup", this.boundVerticalMarkerMouseUp);
    document.removeEventListener("mousemove", this.boundTopContentResize);
    document.removeEventListener("mouseup", this.boundStopTopContentResize);
    document.removeEventListener("mousemove", this.boundResize);
    document.removeEventListener("mouseup", this.boundStopResize);
    document.removeEventListener("mousemove", this.boundBrushMouseMove);
    document.removeEventListener("mouseup", this.boundBrushMouseUp);
    if (this.hoverTimeout) {
      clearTimeout(this.hoverTimeout);
      this.hoverTimeout = null;
    }
    this.slotResizeDrag = null;
    this.slotResizePreview = null;
    this.verticalMarkerDrag = null;
    this.pendingSlotReflowFromResize = null;
    this.slotReflowAnimation = null;
    this.brushSelection = null;
    this.hoveredSlotId = null;
    this.hoveredSuggestion = null;
    this.pointerInChart = false;
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.panZoomCleanup) {
      this.panZoomCleanup.destroy();
      this.panZoomCleanup = null;
    }
    if (this.canvas) {
      this.canvas.removeEventListener("wheel", this.boundCanvasWheel);
    }
    document.removeEventListener("keydown", this.boundDocumentKeyDown);
    clearPanZoomWheelDebounce();
    this.container = null;
    this.canvas = null;
    this.isInitialized = false;
    this.lastNotifiedTopContentHeight = -1;
  }

  updateClipboard(): void {
    const parsedData = this.readClipboard();
    this.clipboardItems = parsedData;
    this.applyCopiedFlagsFromClipboard(parsedData);
    this.host.onClipboardItems?.(parsedData);
    this.redraw();
  }

  clearClipboard(): void {
    this.writeClipboard([]);
    this.updateClipboard();
  }

  onContainerMouseMove(e: MouseEvent): void {
    this.updateCursorPosition(e);
  }

  onChartMouseMove(e: MouseEvent): void {
    this.updateCursorPosition(e);
    const layout = this.getChartLayout();
    const canvas = this.canvas;
    if (!layout || !canvas) return;
    this.pointerInChart = true;
    const nextHover = this.resizeHoverKey(layout, e.clientX, e.clientY);
    const hoverChanged = nextHover !== this.hoverResizeBand;
    this.hoverResizeBand = nextHover;

    const pt = canvasLocalPoint(canvas, e.clientX, e.clientY);
    const hit = hitTestChart(layout, pt.x, pt.y);

    const slotsInteractive = slotsAllowLabelsAndInteraction(this.rowHeight);
    const showDepartureMarkers = departureMarkersVisible(this.rowHeight);
    const showSuggestions = suggestionsVisible(this.rowHeight);

    let hoveredSlotId: string | null = null;
    let hoveredSuggestion: SuggestionButtonDefinition | null = null;
    let ewResize = false;
    let suggestionHit = false;
    let verticalMarkerDraggable = false;
    if (hit.type === "group") {
      const gr = layout.groupRects.get(hit.groupId);
      if (gr) {
        const scroll = this.verticalScrollOffsets.get(hit.groupId) || 0;
        const contentY = pt.y - gr.y + scroll;
        const groupTopics = this.topicsForGroup(hit.groupId);
        const suggestionHover = showSuggestions
          ? this.hitSuggestionForGroup(
              hit.groupId,
              pt.x,
              contentY,
              layout.canvasCssWidth,
              groupTopics,
            )
          : null;
        if (suggestionHover) {
          suggestionHit = true;
          hoveredSuggestion = suggestionHover;
          hoveredSlotId = null;
        }

        const markerHit = suggestionHover
          ? null
          : this.hitVerticalMarkerForGroup(
              hit.groupId,
              pt.x,
              pt.y,
              layout.canvasCssWidth,
            );
        if (markerHit) {
          hoveredSlotId = null;
          verticalMarkerDraggable = markerHit.draggable;
        }

        if (!suggestionHover && !markerHit && slotsInteractive) {
          const departureGapSlotId =
            showDepartureMarkers
              ? hitTestDepartureGap({
                  width: layout.canvasCssWidth,
                  topics: groupTopics,
                  margin: MARGIN,
                  rowHeight: this.rowHeight,
                  startTime: this.internalStartTime,
                  endTime: this.internalEndTime,
                  canvasX: pt.x,
                  contentY,
                })
              : null;
          hoveredSlotId =
            showDepartureMarkers && departureGapSlotId
              ? departureGapSlotId
              : (hitTestSlotBar({
                  topics: groupTopics,
                  canvasX: pt.x,
                  contentY,
                  margin: MARGIN,
                  width: layout.canvasCssWidth,
                  rowHeight: this.rowHeight,
                  startTime: this.internalStartTime,
                  endTime: this.internalEndTime,
                })?.slotId ?? null);
          if (!this.props.isReadOnly) {
            ewResize =
              hitTestSlotResizeEdge({
                topics: groupTopics,
                canvasX: pt.x,
                contentY,
                margin: MARGIN,
                width: layout.canvasCssWidth,
                rowHeight: this.rowHeight,
                startTime: this.internalStartTime,
                endTime: this.internalEndTime,
                isReadOnly: this.props.isReadOnly,
              }) !== null;
            if (ewResize) {
              hoveredSlotId = null;
            }
          }
        }
      }
    }
    const previousHoveredSlotId = this.hoveredSlotId;
    const previousHoveredSuggestionSlotId = this.hoveredSuggestion?.slotId ?? null;
    this.updateHoverSlot(hoveredSlotId);
    this.hoveredSuggestion = hoveredSuggestion;
    const hoverSlotChanged = previousHoveredSlotId !== this.hoveredSlotId;
    const hoverSuggestionChanged =
      previousHoveredSuggestionSlotId !== (this.hoveredSuggestion?.slotId ?? null);

    if (hit.type === "topResize" || hit.type === "betweenResize") {
      canvas.style.cursor = "ns-resize";
    } else if (suggestionHit) {
      canvas.style.cursor = "pointer";
    } else if (verticalMarkerDraggable) {
      canvas.style.cursor = "ew-resize";
    } else if (ewResize) {
      canvas.style.cursor = "ew-resize";
    } else {
      canvas.style.cursor = "";
    }

    if (
      hoverChanged ||
      hoverSlotChanged ||
      hoverSuggestionChanged ||
      this.clipboardItems.length > 0 ||
      this.brushSelection ||
      this.hoveredSlotId
    ) {
      this.scheduleFrameRedraw(true);
    }
  }

  onChartMouseLeave(): void {
    this.hoverResizeBand = null;
    this.pointerInChart = false;
    this.hoveredSuggestion = null;
    this.resetHoverSlot();
    const canvas = this.canvas;
    if (canvas) canvas.style.cursor = "";
    this.redraw();
  }

  onMouseEnter(): void {
    this.host.onClipboardVisibility?.(true);
  }

  onMouseLeave(): void {
    this.pointerInChart = false;
    this.hoveredSuggestion = null;
    this.resetHoverSlot();
    this.host.onClipboardVisibility?.(false);
    this.redraw();
  }

  onCanvasWheel(event: WheelEvent): void {
    const canvas = this.canvas;
    if (!canvas) return;

    this.cancelSlotReflowAnimation();

    if (handlePanZoomWheelEvent(event, canvas, this.panZoomCallbacks)) {
      return;
    }

    if (event.ctrlKey || event.shiftKey || event.altKey) return;
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;

    const layout = this.getChartLayout();
    if (!layout) return;

    const pt = canvasLocalPoint(canvas, event.clientX, event.clientY);
    const hit = hitTestChart(layout, pt.x, pt.y);
    if (hit.type !== "group") return;

    event.preventDefault();

    const groupId = hit.groupId;
    const groupTopics = this.topicsForGroup(groupId);
    const contentHeight = computeContentHeight(groupTopics, this.rowHeight);
    const viewportHeight = this.heightMap.get(groupId) || 0;

    const currentOffset = this.verticalScrollOffsets.get(groupId) || 0;
    const maxOffset = Math.max(0, contentHeight - viewportHeight);
    const newOffset = Math.max(0, Math.min(maxOffset, currentOffset + event.deltaY));

    this.verticalScrollOffsets.set(groupId, newOffset);
    this.scheduleFrameRedraw(true);
  }

  onCanvasMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return;
    const layout = this.getChartLayout();
    const canvas = this.canvas;
    if (!layout || !canvas) return;
    const pt = canvasLocalPoint(canvas, e.clientX, e.clientY);
    const hit = hitTestChart(layout, pt.x, pt.y);
    if (hit.type === "topResize") {
      this.startTopContentResize(e);
      return;
    }
    if (hit.type === "betweenResize") {
      this.startResize(e, hit.groupIdAbove);
      return;
    }
    if (hit.type !== "group") return;

    const gr = layout.groupRects.get(hit.groupId);
    if (!gr) return;
    const scroll = this.verticalScrollOffsets.get(hit.groupId) || 0;
    const contentY = pt.y - gr.y + scroll;
    const groupTopics = this.topicsForGroup(hit.groupId);
    const slotsInteractive = slotsAllowLabelsAndInteraction(this.rowHeight);

    const suggestionHit = this.hitSuggestionForGroup(
      hit.groupId,
      pt.x,
      contentY,
      layout.canvasCssWidth,
      groupTopics,
    );
    if (suggestionHit) {
      return;
    }

    const markerHit = this.hitVerticalMarkerForGroup(
      hit.groupId,
      pt.x,
      pt.y,
      layout.canvasCssWidth,
    );
    if (markerHit) {
      if (markerHit.draggable) {
        e.preventDefault();
        this.suppressNextCanvasClick = true;
        this.cancelSlotReflowAnimation();
        this.verticalMarkerDrag = {
          markerId: markerHit.id,
          currentX: this.clampVerticalMarkerCanvasX(pt.x, layout.canvasCssWidth),
        };
        document.addEventListener("mousemove", this.boundVerticalMarkerMouseMove);
        document.addEventListener("mouseup", this.boundVerticalMarkerMouseUp);
      }
      return;
    }

    if (slotsInteractive) {
      const rh = hitTestSlotResizeEdge({
        topics: groupTopics,
        canvasX: pt.x,
        contentY,
        margin: MARGIN,
        width: layout.canvasCssWidth,
        rowHeight: this.rowHeight,
        startTime: this.internalStartTime,
        endTime: this.internalEndTime,
        isReadOnly: this.props.isReadOnly,
      });
      if (rh) {
        e.preventDefault();
        this.suppressNextCanvasClick = true;
        this.cancelSlotReflowAnimation();
        const chartWidth = layout.canvasCssWidth - MARGIN.left - MARGIN.right;
        this.slotResizeDrag = {
          edge: rh.edge,
          slotId: rh.slotId,
          startClientX: e.clientX,
          displayInnerLeft: rh.displayInnerLeft,
          displayInnerWidth: rh.displayInnerWidth,
          chartWidth,
        };
        document.addEventListener("mousemove", this.boundSlotResizeMouseMove);
        document.addEventListener("mouseup", this.boundSlotResizeMouseUp);
        return;
      }

      const slotHit = hitTestSlotBar({
        topics: groupTopics,
        canvasX: pt.x,
        contentY,
        margin: MARGIN,
        width: layout.canvasCssWidth,
        rowHeight: this.rowHeight,
        startTime: this.internalStartTime,
        endTime: this.internalEndTime,
      });
      if (slotHit) {
        return;
      }
    }

    if ((e.metaKey || e.ctrlKey) && !this.props.isReadOnly) {
      e.preventDefault();
      this.suppressNextCanvasClick = true;
      this.brushSelection = {
        groupId: hit.groupId,
        startX: Math.max(0, Math.min(layout.canvasCssWidth, pt.x)),
        startYContent: contentY,
        currentX: Math.max(0, Math.min(layout.canvasCssWidth, pt.x)),
        currentYContent: contentY,
      };
      document.addEventListener("mousemove", this.boundBrushMouseMove);
      document.addEventListener("mouseup", this.boundBrushMouseUp);
      this.scheduleFrameRedraw(true);
    }
  }

  onCanvasClick(e: MouseEvent): void {
    if (this.suppressNextCanvasClick) {
      this.suppressNextCanvasClick = false;
      return;
    }
    if (e.button !== 0) return;
    const ctx = this.resolveGroupPointerContext(e.clientX, e.clientY);
    if (!ctx) return;

    const markerHit = this.hitVerticalMarkerForGroup(
      ctx.groupId,
      ctx.point.x,
      ctx.point.y,
      ctx.layout.canvasCssWidth,
    );
    if (markerHit) {
      this.callbacks.onVerticalMarkerClick?.(markerHit.id);
      return;
    }

    const suggestionHit = this.hitSuggestionForGroup(
      ctx.groupId,
      ctx.point.x,
      ctx.contentY,
      ctx.layout.canvasCssWidth,
      ctx.groupTopics,
    );
    if (suggestionHit) {
      this.applySuggestionForSlot(suggestionHit.slotId);
      return;
    }

    const slotHit = slotsAllowLabelsAndInteraction(this.rowHeight)
      ? hitTestSlotBar({
          topics: ctx.groupTopics,
          canvasX: ctx.point.x,
          contentY: ctx.contentY,
          margin: MARGIN,
          width: ctx.layout.canvasCssWidth,
          rowHeight: this.rowHeight,
          startTime: this.internalStartTime,
          endTime: this.internalEndTime,
        })
      : null;

    if (slotHit) {
      this.onSlotPrimaryClick(slotHit.slotId, e.metaKey || e.ctrlKey);
      this.lastClickedSlotId = slotHit.slotId;
      this.callbacks.onClickOnSlot?.(slotHit.slotId);
      return;
    }

    const topicId = this.topicIdAtContentY(ctx.groupId, ctx.contentY);
    if (topicId) {
      if (ctx.point.x < MARGIN.left) {
        this.toggleTopicCollapse(topicId);
        return;
      }
      this.moveClipboardToTopic(topicId);
    }
  }

  onCanvasDoubleClick(e: MouseEvent): void {
    if (!slotsAllowLabelsAndInteraction(this.rowHeight)) return;

    const ctx = this.resolveGroupPointerContext(e.clientX, e.clientY);
    if (!ctx) return;
    const slotHit = hitTestSlotBar({
      topics: ctx.groupTopics,
      canvasX: ctx.point.x,
      contentY: ctx.contentY,
      margin: MARGIN,
      width: ctx.layout.canvasCssWidth,
      rowHeight: this.rowHeight,
      startTime: this.internalStartTime,
      endTime: this.internalEndTime,
    });
    if (!slotHit) return;
    this.lastDoubleClickedSlotId = slotHit.slotId;
    this.callbacks.onDoubleClickOnSlot?.(slotHit.slotId);
  }

  onCanvasContextMenu(e: MouseEvent): void {
    if (!slotsAllowLabelsAndInteraction(this.rowHeight)) return;

    const ctx = this.resolveGroupPointerContext(e.clientX, e.clientY);
    if (!ctx) return;
    const slotHit = hitTestSlotBar({
      topics: ctx.groupTopics,
      canvasX: ctx.point.x,
      contentY: ctx.contentY,
      margin: MARGIN,
      width: ctx.layout.canvasCssWidth,
      rowHeight: this.rowHeight,
      startTime: this.internalStartTime,
      endTime: this.internalEndTime,
    });
    if (!slotHit) return;
    this.lastContextClickedSlotId = slotHit.slotId;
    this.callbacks.onContextClickOnSlot?.(slotHit.slotId);
  }

  getCanvasElement(): HTMLCanvasElement | null {
    return this.canvas;
  }

  /** For bindings that only need layout metrics without running a full draw. */
  getCurrentTopContentHeightPx(): number {
    return this.getChartLayout()?.currentTopContentHeight ?? 0;
  }

  /** Test-only snapshot for canvas e2e probes. Returns serializable state only. */
  getTestState(): {
    rowHeight: number;
    hoveredSlotId: string | null;
    pointerInChart: boolean;
    clipboardSlotIds: string[];
    lastClickedSlotId: string | null;
    lastDoubleClickedSlotId: string | null;
    lastContextClickedSlotId: string | null;
    internalStartTimeMs: number;
    internalEndTimeMs: number;
    margin: { left: number; right: number };
    layout: {
      canvasCssWidth: number;
      canvasCssHeight: number;
      axisRect: { y: number; h: number };
      groups: Array<{ id: string; y: number; h: number; scrollOffset: number }>;
    } | null;
  } {
    const layout = this.getChartLayout();
    return {
      rowHeight: this.rowHeight,
      hoveredSlotId: this.hoveredSlotId,
      pointerInChart: this.pointerInChart,
      clipboardSlotIds: this.clipboardItems.map((slot) => slot.id),
      lastClickedSlotId: this.lastClickedSlotId,
      lastDoubleClickedSlotId: this.lastDoubleClickedSlotId,
      lastContextClickedSlotId: this.lastContextClickedSlotId,
      internalStartTimeMs: this.internalStartTime.getTime(),
      internalEndTimeMs: this.internalEndTime.getTime(),
      margin: { left: MARGIN.left, right: MARGIN.right },
      layout: layout
        ? {
            canvasCssWidth: layout.canvasCssWidth,
            canvasCssHeight: layout.canvasCssHeight,
            axisRect: {
              y: layout.axisRect.y,
              h: layout.axisRect.h,
            },
            groups: Array.from(layout.groupRects.entries()).map(([id, rect]) => ({
              id,
              y: rect.y,
              h: rect.h,
              scrollOffset: this.verticalScrollOffsets.get(id) || 0,
            })),
          }
        : null,
    };
  }

  /** Test-only hit probe in canvas-local coordinates. */
  probeCanvasPoint(canvasX: number, canvasY: number): {
    point: { x: number; y: number };
    chartHitType: string;
    groupId: string | null;
    contentY: number | null;
    slotId: string | null;
    slotResize: { slotId: string; edge: SlotResizeEdge } | null;
    departureGapSlotId: string | null;
    verticalMarkerId: string | null;
    suggestionSlotId: string | null;
    topicId: string | null;
  } {
    const layout = this.getChartLayout();
    if (!layout) {
      return {
        point: { x: canvasX, y: canvasY },
        chartHitType: "none",
        groupId: null,
        contentY: null,
        slotId: null,
        slotResize: null,
        departureGapSlotId: null,
        verticalMarkerId: null,
        suggestionSlotId: null,
        topicId: null,
      };
    }

    const x = Math.max(0, Math.min(layout.canvasCssWidth, canvasX));
    const y = Math.max(0, Math.min(layout.canvasCssHeight, canvasY));
    const hit = hitTestChart(layout, x, y);
    if (hit.type !== "group") {
      return {
        point: { x, y },
        chartHitType: hit.type,
        groupId: null,
        contentY: null,
        slotId: null,
        slotResize: null,
        departureGapSlotId: null,
        verticalMarkerId: null,
        suggestionSlotId: null,
        topicId: null,
      };
    }

    const gr = layout.groupRects.get(hit.groupId);
    if (!gr) {
      return {
        point: { x, y },
        chartHitType: "group",
        groupId: hit.groupId,
        contentY: null,
        slotId: null,
        slotResize: null,
        departureGapSlotId: null,
        verticalMarkerId: null,
        suggestionSlotId: null,
        topicId: null,
      };
    }

    const scroll = this.verticalScrollOffsets.get(hit.groupId) || 0;
    const contentY = y - gr.y + scroll;
    const groupTopics = this.topicsForGroup(hit.groupId);

    const suggestion = this.hitSuggestionForGroup(
      hit.groupId,
      x,
      contentY,
      layout.canvasCssWidth,
      groupTopics,
    );

    const verticalMarker = this.hitVerticalMarkerForGroup(
      hit.groupId,
      x,
      y,
      layout.canvasCssWidth,
    );

    const slot = slotsAllowLabelsAndInteraction(this.rowHeight)
      ? hitTestSlotBar({
          topics: groupTopics,
          canvasX: x,
          contentY,
          margin: MARGIN,
          width: layout.canvasCssWidth,
          rowHeight: this.rowHeight,
          startTime: this.internalStartTime,
          endTime: this.internalEndTime,
        })
      : null;

    const slotResize = slotsAllowLabelsAndInteraction(this.rowHeight)
      ? hitTestSlotResizeEdge({
          topics: groupTopics,
          canvasX: x,
          contentY,
          margin: MARGIN,
          width: layout.canvasCssWidth,
          rowHeight: this.rowHeight,
          startTime: this.internalStartTime,
          endTime: this.internalEndTime,
          isReadOnly: this.props.isReadOnly,
        })
      : null;

    const departureGap = departureMarkersVisible(this.rowHeight)
      ? hitTestDepartureGap({
          width: layout.canvasCssWidth,
          topics: groupTopics,
          margin: MARGIN,
          rowHeight: this.rowHeight,
          startTime: this.internalStartTime,
          endTime: this.internalEndTime,
          canvasX: x,
          contentY,
        })
      : null;

    return {
      point: { x, y },
      chartHitType: "group",
      groupId: hit.groupId,
      contentY,
      slotId: slot?.slotId ?? null,
      slotResize: slotResize ? { slotId: slotResize.slotId, edge: slotResize.edge } : null,
      departureGapSlotId: departureGap,
      verticalMarkerId: verticalMarker?.id ?? null,
      suggestionSlotId: suggestion?.slotId ?? null,
      topicId: this.topicIdAtContentY(hit.groupId, contentY),
    };
  }

  /** Test-only utility to locate a point for a slot interaction. */
  findSlotPoint(
    slotId: string,
    mode: "center" | "left-edge" | "right-edge" = "center",
  ): { x: number; y: number } | null {
    const layout = this.getChartLayout();
    if (!layout || !slotsAllowLabelsAndInteraction(this.rowHeight)) return null;

    for (const group of this.props.destinationGroups) {
      const gr = layout.groupRects.get(group.id);
      if (!gr) continue;

      const topics = this.topicsForGroup(group.id);
      const scroll = this.verticalScrollOffsets.get(group.id) || 0;
      const minX = Math.max(MARGIN.left + 1, 1);
      const maxX = Math.max(minX, layout.canvasCssWidth - MARGIN.right - 1);
      const minY = Math.max(1, gr.y + 1);
      const maxY = Math.max(minY, gr.y + gr.h - 1);

      for (let y = minY; y <= maxY; y += 2) {
        const contentY = y - gr.y + scroll;
        for (let x = minX; x <= maxX; x += 2) {
          if (mode === "center") {
            const hit = hitTestSlotBar({
              topics,
              canvasX: x,
              contentY,
              margin: MARGIN,
              width: layout.canvasCssWidth,
              rowHeight: this.rowHeight,
              startTime: this.internalStartTime,
              endTime: this.internalEndTime,
            });
            if (hit?.slotId === slotId) {
              return { x, y };
            }
            continue;
          }

          const edgeHit = hitTestSlotResizeEdge({
            topics,
            canvasX: x,
            contentY,
            margin: MARGIN,
            width: layout.canvasCssWidth,
            rowHeight: this.rowHeight,
            startTime: this.internalStartTime,
            endTime: this.internalEndTime,
            isReadOnly: this.props.isReadOnly,
          });
          if (!edgeHit || edgeHit.slotId !== slotId) continue;
          if (mode === "left-edge" && edgeHit.edge === "left") {
            return { x, y };
          }
          if (mode === "right-edge" && edgeHit.edge === "right") {
            return { x, y };
          }
        }
      }
    }

    return null;
  }

  /** Force a synchronous redraw from tests to reduce timing flake around queued rAF updates. */
  flushForTests(): void {
    if (this.frameRedrawRaf !== null) {
      cancelAnimationFrame(this.frameRedrawRaf);
      this.frameRedrawRaf = null;
    }
    this.pendingRedrawFollowsInteractive = false;
    this.drawUnifiedFrame();
  }

  private initMapsFromGroups(groups: GanttEditorProps["destinationGroups"]): void {
    for (const group of groups) {
      this.currentHeightPortions.set(group.id, group.heightPortion);
      this.verticalScrollOffsets.set(group.id, 0);
    }
  }

  private getChartLayout(): UnifiedChartLayout | null {
    if (this.containerWidth <= 0 || this.containerHeight <= 0) return null;
    if (this.props.destinationGroups.length === 0) return null;
    if (!this.chartLayoutDirty && this.chartLayoutCache) {
      return this.chartLayoutCache;
    }
    this.chartLayoutCache = computeUnifiedChartLayout({
      containerWidth: this.containerWidth,
      containerHeight: this.containerHeight,
      destinationGroups: this.props.destinationGroups,
      heightPortions: this.currentHeightPortions,
      topContentPortion: this.currentTopContentPortion,
      xAxisHeight: X_AXIS_HEIGHT,
      resizeHandlePx: 3,
    });
    this.chartLayoutDirty = false;
    return this.chartLayoutCache;
  }

  private invalidateLayoutCache(): void {
    this.chartLayoutDirty = true;
    this.chartLayoutCache = null;
  }

  private get heightMap(): Map<string, number> {
    const layout = this.getChartLayout();
    if (!layout) return new Map<string, number>();
    return layout.groupHeights;
  }

  private get totalContentHeight(): number {
    return this.getChartLayout()?.totalContentHeight ?? 0;
  }

  private get outerComponentHeight(): number {
    return this.getChartLayout()?.outerComponentHeight ?? 0;
  }

  /**
   * Invalidates processData cache when `collapsedTopics` in localStorage changes without a Vue refresh.
   */
  private syncProcessDataCacheWithLocalStorage(): void {
    const collapsed = localStorage.getItem("collapsedTopics") ?? "[]";
    if (collapsed !== this.cacheCollapsedLocalStorage) {
      this.cacheCollapsedLocalStorage = collapsed;
      this.cachedProcessedTopics = null;
    }
  }

  /**
   * Fingerprint of everything `processData` reads (slots, destinations, editable, compactView,
   * collapsedTopics). O(n); only used from `refreshModel` and when rebuilding the cache.
   */
  private computeProcessDataDeepFingerprint(p: GanttEditorProps): number {
    const collapsed = localStorage.getItem("collapsedTopics") ?? "[]";
    let h = 0;
    for (let i = 0; i < p.slots.length; i++) {
      const s = p.slots[i]!;
      h =
        (Math.imul(h, 31) +
          s.id.length +
          s.openTime.getTime() +
          s.closeTime.getTime() +
          s.destinationId.length +
          s.displayName.length +
          s.group.length) |
        0;
      if (s.isCopied) h ^= 0xb783f5a1;
      if (s.readOnly) h ^= 0x3c6ef372;
      if (s.isPreview) h ^= 0x4a7f2953;
    }
    for (let i = 0; i < p.destinations.length; i++) {
      const d = p.destinations[i]!;
      h =
        (Math.imul(h, 31) + d.id.length + (d.active ? 1 : 0) + d.groupId.length) | 0;
    }
    h ^= p.slots.length * 1009 ^ p.destinations.length * 7919;
    if (p.isReadOnly) h ^= 0xdeadbeef;
    for (let i = 0; i < collapsed.length; i++) {
      h = (Math.imul(h, 31) + collapsed.charCodeAt(i)) | 0;
    }
    return h >>> 0;
  }

  private rebuildTopicsByGroupId(topics: Topic[]): void {
    this.topicsByGroupId.clear();
    for (const t of topics) {
      let list = this.topicsByGroupId.get(t.groupId);
      if (!list) {
        list = [];
        this.topicsByGroupId.set(t.groupId, list);
      }
      list.push(t);
    }
  }

  private topicsForGroup(groupId: string): Topic[] {
    this.syncProcessDataCacheWithLocalStorage();
    this.getProcessedTopics();
    return this.topicsByGroupId.get(groupId) ?? [];
  }

  private captureSlotRowYById(): Map<string, number> {
    this.getProcessedTopics();
    const rowsBySlotId = new Map<string, number>();
    this.topicsByGroupId.forEach((topics) => {
      const layouts = computeTopicLayout(topics, MARGIN.left, this.rowHeight);
      for (const layout of layouts) {
        layout.topic.rows.forEach((row, rowIndex) => {
          const rowTop = layout.rowYs[rowIndex];
          if (rowTop === undefined) return;
          for (const slot of row.slots) {
            rowsBySlotId.set(slot.id, rowTop);
          }
        });
      }
    });
    return rowsBySlotId;
  }

  private tryStartPendingSlotReflowAnimation(nextFingerprint: number): void {
    const pending = this.pendingSlotReflowFromResize;
    if (!pending) return;

    const now = performance.now();
    if (now - pending.capturedAtMs > SLOT_REFLOW_PENDING_TTL_MS) {
      this.pendingSlotReflowFromResize = null;
      return;
    }

    if (
      this.processDataDeepFingerprint === null ||
      this.processDataDeepFingerprint === nextFingerprint
    ) {
      return;
    }
    this.pendingSlotReflowFromResize = null;
    this.startSlotReflowAnimationFromPreviousRows(pending.previousRowYBySlotId, now);
  }

  private buildSlotRowShiftMap(
    previousRowYBySlotId: ReadonlyMap<string, number>,
  ): Map<string, number> {
    const nextRows = this.captureSlotRowYById();
    const shiftsBySlotId = new Map<string, number>();
    nextRows.forEach((toY, slotId) => {
      const fromY = previousRowYBySlotId.get(slotId);
      if (fromY === undefined) return;
      const shift = fromY - toY;
      if (Math.abs(shift) >= 0.5) {
        shiftsBySlotId.set(slotId, shift);
      }
    });
    return shiftsBySlotId;
  }

  private startSlotReflowAnimationFromPreviousRows(
    previousRowYBySlotId: ReadonlyMap<string, number>,
    startedAtMs = performance.now(),
  ): void {
    const shiftsBySlotId = this.buildSlotRowShiftMap(previousRowYBySlotId);
    if (shiftsBySlotId.size === 0) {
      this.slotReflowAnimation = null;
      return;
    }

    this.slotReflowAnimation = {
      startedAtMs,
      durationMs: SLOT_REFLOW_ANIMATION_MS,
      shiftsBySlotId,
    };
  }

  private getActiveSlotYTransition(nowMs: number): {
    shiftsBySlotId: ReadonlyMap<string, number>;
    progress: number;
  } | null {
    const anim = this.slotReflowAnimation;
    if (!anim || anim.shiftsBySlotId.size === 0) return null;

    const rawProgress = (nowMs - anim.startedAtMs) / anim.durationMs;
    if (rawProgress >= 1) {
      this.slotReflowAnimation = null;
      return null;
    }

    const clamped = Math.max(0, Math.min(1, rawProgress));
    // Quick ease-out keeps the movement readable while minimizing frame count.
    const eased = 1 - Math.pow(1 - clamped, 3);
    return {
      shiftsBySlotId: anim.shiftsBySlotId,
      progress: eased,
    };
  }

  private cancelSlotReflowAnimation(): void {
    this.pendingSlotReflowFromResize = null;
    this.slotReflowAnimation = null;
  }

  private getProcessedTopics(): Topic[] {
    this.syncProcessDataCacheWithLocalStorage();
    if (this.cachedProcessedTopics !== null) {
      return this.cachedProcessedTopics;
    }
    const { processedData_ } = processData(
      this.props.slots,
      this.props.destinations,
      PROCESS_DATA_VIEW_PLACEHOLDER_START,
      PROCESS_DATA_VIEW_PLACEHOLDER_END,
      {
        groupBy: "destinationId",
        rowHeight: 0,
        progressChartsDisplay: "None",
        collapseGroups: false,
        editable: !this.props.isReadOnly,
        compactView: false,
        sortInFrontend: "None",
        slotLimit: 0,
        overlayWeeks: 0,
        overlayDays: 0,
        seperateByClasses: false,
        showSlotState: false,
        showEventDots: false,
        showDeparture: null,
        showEventCharts: false,
        showBagStateCharts: false,
        showCheckInCharts: false,
        showTransferCharts: false,
        showBagStateTimeline: false,
      },
    );
    this.cachedProcessedTopics = processedData_;
    this.processDataDeepFingerprint = this.computeProcessDataDeepFingerprint(this.props);
    this.cacheCollapsedLocalStorage = localStorage.getItem("collapsedTopics") ?? "[]";
    this.rebuildTopicsByGroupId(processedData_);
    return this.cachedProcessedTopics;
  }

  private maybeNotifyTopContentLayout(): void {
    if (!this.isInitialized) return;
    const layout = this.getChartLayout();
    const h = layout?.currentTopContentHeight ?? 0;
    if (h === this.lastNotifiedTopContentHeight) return;
    this.lastNotifiedTopContentHeight = h;
    this.callbacks.onTopContentPortionChange(this.currentTopContentPortion, h);
    this.host.onTopContentHeightPx?.(h);
  }

  private startTopContentResize(e: MouseEvent): void {
    this.isResizingTopContent = true;
    this.topContentStartY = e.clientY;
    document.addEventListener("mousemove", this.boundTopContentResize);
    document.addEventListener("mouseup", this.boundStopTopContentResize);
    e.preventDefault();
  }

  private handleTopContentResize(e: MouseEvent): void {
    if (!this.isResizingTopContent) return;
    const th = this.totalContentHeight;
    if (th <= 0) return;
    const deltaY = e.clientY - this.topContentStartY;
    const portionDelta = deltaY / th;
    let newPortion = this.currentTopContentPortion + portionDelta;
    if (newPortion < 0.01) newPortion = 0.01;
    if (newPortion > 0.99) newPortion = 0.99;
    this.currentTopContentPortion = newPortion;
    this.invalidateLayoutCache();
    this.topContentStartY = e.clientY;
    this.callbacks.onTopContentPortionChange(newPortion, th * newPortion);
    this.redraw();
    this.maybeNotifyTopContentLayout();
  }

  private stopTopContentResize(): void {
    this.isResizingTopContent = false;
    document.removeEventListener("mousemove", this.boundTopContentResize);
    document.removeEventListener("mouseup", this.boundStopTopContentResize);
  }

  private startResize(e: MouseEvent, element: string): void {
    this.isResizing = true;
    this.resizingElement = element;
    this.startY = e.clientY;
    document.addEventListener("mousemove", this.boundResize);
    document.addEventListener("mouseup", this.boundStopResize);
    e.preventDefault();
  }

  private handleResize(e: MouseEvent): void {
    if (!this.isResizing || !this.resizingElement) return;
    const o = this.outerComponentHeight;
    if (o <= 0) return;
    const deltaY = e.clientY - this.startY;
    const minHeightPortion = 0.01;
    const currentIndex = this.props.destinationGroups.findIndex(
      (group) => group.id === this.resizingElement,
    );
    if (currentIndex < 0 || currentIndex >= this.props.destinationGroups.length - 1) return;

    const nextElement = this.props.destinationGroups[currentIndex + 1];
    const currentElement = this.props.destinationGroups[currentIndex];
    const currentPortion = this.currentHeightPortions.get(currentElement.id) || 0;
    const nextPortion = this.currentHeightPortions.get(nextElement.id) || 0;
    const portionDelta = deltaY / o;
    const totalPortion = currentPortion + nextPortion;
    let newCurrentPortion = currentPortion + portionDelta;
    let newNextPortion = nextPortion - portionDelta;

    if (newCurrentPortion < minHeightPortion) {
      newCurrentPortion = minHeightPortion;
      newNextPortion = totalPortion - minHeightPortion;
    } else if (newNextPortion < minHeightPortion) {
      newNextPortion = minHeightPortion;
      newCurrentPortion = totalPortion - minHeightPortion;
    }

    this.currentHeightPortions.set(currentElement.id, newCurrentPortion);
    this.currentHeightPortions.set(nextElement.id, newNextPortion);
    this.invalidateLayoutCache();
    this.startY = e.clientY;
    this.redraw();
    this.maybeNotifyTopContentLayout();
  }

  private stopResize(): void {
    if (this.isResizing) {
      this.isResizing = false;
      this.resizingElement = null;
      this.redraw();
    }
    document.removeEventListener("mousemove", this.boundResize);
    document.removeEventListener("mouseup", this.boundStopResize);
  }

  private updateCursorPosition(e: MouseEvent): void {
    if (this.canvas) {
      const pt = canvasLocalPoint(this.canvas, e.clientX, e.clientY);
      this.pointerCanvasX = pt.x;
      this.pointerCanvasY = pt.y;
    }
    this.host.onCursorMove?.(e.clientX, e.clientY);
  }

  private updateHoverSlot(nextSlotId: string | null): void {
    if (nextSlotId === this.hoveredSlotId) return;
    if (this.hoverTimeout) {
      clearTimeout(this.hoverTimeout);
      this.hoverTimeout = null;
    }
    this.hoveredSlotId = nextSlotId;
    if (!nextSlotId || !this.callbacks.onHoverOnSlot) return;
    this.hoverTimeout = setTimeout(() => {
      if (this.hoveredSlotId === nextSlotId) {
        this.callbacks.onHoverOnSlot?.(nextSlotId);
      }
    }, HOVER_DELAY_MS);
  }

  private resetHoverSlot(): void {
    if (this.hoverTimeout) {
      clearTimeout(this.hoverTimeout);
      this.hoverTimeout = null;
    }
    this.hoveredSlotId = null;
  }

  private readClipboard(): GanttEditorSlot[] {
    const storedData = localStorage.getItem(CLIPBOARD_STORAGE_KEY);
    if (!storedData) return [];
    try {
      const parsed = JSON.parse(storedData) as GanttEditorSlot[];
      if (!Array.isArray(parsed)) return [];
      return parsed;
    } catch (e) {
      console.error("Error parsing clipboard content:", e);
      return [];
    }
  }

  private writeClipboard(items: GanttEditorSlot[]): void {
    localStorage.setItem(CLIPBOARD_STORAGE_KEY, JSON.stringify(items));
  }

  private applyCopiedFlagsFromClipboard(clipboard: GanttEditorSlot[]): void {
    const copiedIds = new Set(clipboard.map((s) => s.id));
    for (const slot of this.props.slots) {
      slot.isCopied = copiedIds.has(slot.id);
    }
    this.cachedProcessedTopics = null;
  }

  private slotSnapshotForClipboard(slot: GanttEditorSlotWithUiAttributes): GanttEditorSlot {
    return {
      ...slot,
      openTime: new Date(slot.openTime),
      closeTime: new Date(slot.closeTime),
      deadline: slot.deadline ? new Date(slot.deadline) : undefined,
      secondaryDeadline: slot.secondaryDeadline ? new Date(slot.secondaryDeadline) : undefined,
    };
  }

  private resolveGroupPointerContext(clientX: number, clientY: number): {
    layout: UnifiedChartLayout;
    point: { x: number; y: number };
    groupId: string;
    contentY: number;
    groupTopics: Topic[];
  } | null {
    const layout = this.getChartLayout();
    const canvas = this.canvas;
    if (!layout || !canvas) return null;
    const point = canvasLocalPoint(canvas, clientX, clientY);
    const hit = hitTestChart(layout, point.x, point.y);
    if (hit.type !== "group") return null;

    const gr = layout.groupRects.get(hit.groupId);
    if (!gr) return null;
    const scroll = this.verticalScrollOffsets.get(hit.groupId) || 0;
    const contentY = point.y - gr.y + scroll;
    return {
      layout,
      point,
      groupId: hit.groupId,
      contentY,
      groupTopics: this.topicsForGroup(hit.groupId),
    };
  }

  private topicIdAtContentY(groupId: string, contentY: number): string | null {
    const topics = this.topicsForGroup(groupId);
    for (const topic of topics) {
      if (contentY >= topic.yStart && contentY <= topic.yEnd) {
        return topic.id;
      }
    }
    return null;
  }

  private onSlotPrimaryClick(slotId: string, multiSelect: boolean): void {
    const slot = this.props.slots.find((s) => s.id === slotId);
    if (!slot) return;

    if (!this.props.isReadOnly && !slot.readOnly) {
      const clipboard = this.readClipboard();
      if (clipboard.length === 0 || multiSelect) {
        this.toggleSlotClipboardSelection(slotId);
      } else {
        this.moveClipboardToTopic(slot.destinationId);
      }
    }
  }

  private toggleSlotClipboardSelection(slotId: string): void {
    const slot = this.props.slots.find((s) => s.id === slotId);
    if (!slot || slot.readOnly) return;

    const clipboard = this.readClipboard();
    const idx = clipboard.findIndex((s) => s.id === slotId);
    if (idx >= 0) {
      clipboard.splice(idx, 1);
    } else {
      clipboard.push(this.slotSnapshotForClipboard(slot));
    }
    this.writeClipboard(clipboard);
    this.updateClipboard();
  }

  private addSlotsToClipboard(slotIds: string[]): void {
    if (slotIds.length === 0) return;
    const clipboard = this.readClipboard();
    const idsInClipboard = new Set(clipboard.map((s) => s.id));
    let changed = false;
    for (const slotId of slotIds) {
      if (idsInClipboard.has(slotId)) continue;
      const slot = this.props.slots.find((s) => s.id === slotId);
      if (!slot || slot.readOnly) continue;
      clipboard.push(this.slotSnapshotForClipboard(slot));
      idsInClipboard.add(slotId);
      changed = true;
    }
    if (!changed) return;
    this.writeClipboard(clipboard);
    this.updateClipboard();
  }

  private moveClipboardToTopic(topicId: string): void {
    if (this.props.isReadOnly) return;
    const clipboard = this.readClipboard();
    if (clipboard.length === 0) return;

    const previousRowYBySlotId = this.captureSlotRowYById();

    let movedSomething = false;
    for (const copiedSlot of clipboard) {
      const target = this.props.slots.find((s) => s.id === copiedSlot.id);
      if (!target || target.readOnly) continue;
      target.destinationId = topicId;
      target.isCopied = false;
      movedSomething = true;
      this.callbacks.onChangeDestinationId?.(target.id, topicId, false);
    }

    this.writeClipboard([]);
    this.updateClipboard();
    if (movedSomething) {
      this.cachedProcessedTopics = null;
      this.startSlotReflowAnimationFromPreviousRows(previousRowYBySlotId);
      this.redraw();
    }
  }

  private toggleTopicCollapse(topicId: string): void {
    if (!topicId) return;

    let collapsedTopics: string[] = [];
    try {
      const raw = localStorage.getItem("collapsedTopics") || "[]";
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        collapsedTopics = parsed.filter((v): v is string => typeof v === "string");
      }
    } catch {
      collapsedTopics = [];
    }

    if (collapsedTopics.includes(topicId)) {
      collapsedTopics = collapsedTopics.filter((id) => id !== topicId);
    } else {
      collapsedTopics.push(topicId);
    }

    localStorage.setItem("collapsedTopics", JSON.stringify(collapsedTopics));
    this.cachedProcessedTopics = null;
    this.redraw();
  }

  private resizeHoverKey(
    layout: UnifiedChartLayout,
    clientX: number,
    clientY: number,
  ): string | null {
    const canvas = this.canvas;
    if (!canvas) return null;
    const pt = canvasLocalPoint(canvas, clientX, clientY);
    const hit = hitTestChart(layout, pt.x, pt.y);
    if (hit.type === "topResize") return "top";
    if (hit.type === "betweenResize") return `between:${hit.groupIdAbove}`;
    return null;
  }

  private onSlotResizeMouseMove(e: MouseEvent): void {
    if (!this.slotResizeDrag) return;
    const dx = e.clientX - this.slotResizeDrag.startClientX;
    const d = this.slotResizeDrag;
    this.slotResizePreview = {
      slotId: d.slotId,
      ...slotTimesForResizeDragStep(
        d.edge,
        dx,
        d.displayInnerLeft,
        d.displayInnerWidth,
        d.chartWidth,
        this.internalStartTime,
        this.internalEndTime,
      ),
    };
    this.redraw();
  }

  private onSlotResizeMouseUp(e: MouseEvent): void {
    document.removeEventListener("mousemove", this.boundSlotResizeMouseMove);
    document.removeEventListener("mouseup", this.boundSlotResizeMouseUp);
    if (!this.slotResizeDrag) return;
    const d = this.slotResizeDrag;
    const dx = e.clientX - d.startClientX;
    const { openTime, closeTime } = slotTimesForResizeDragStep(
      d.edge,
      dx,
      d.displayInnerLeft,
      d.displayInnerWidth,
      d.chartWidth,
      this.internalStartTime,
      this.internalEndTime,
    );

    const prev = this.props.slots.find((s) => s.id === d.slotId);
    const shouldCommit =
      !!prev &&
      !prev.readOnly &&
      (prev.openTime.getTime() !== openTime.getTime() ||
        prev.closeTime.getTime() !== closeTime.getTime());
    const previousRowYBySlotId = shouldCommit ? this.captureSlotRowYById() : null;

    this.slotResizeDrag = null;
    this.slotResizePreview = null;
    this.redraw();

    if (shouldCommit && previousRowYBySlotId) {
      this.pendingSlotReflowFromResize = {
        capturedAtMs: performance.now(),
        previousRowYBySlotId,
      };
      this.callbacks.onChangeSlotTime(d.slotId, openTime, closeTime);
    }
  }

  private onVerticalMarkerMouseMove(e: MouseEvent): void {
    const drag = this.verticalMarkerDrag;
    const layout = this.getChartLayout();
    const canvas = this.canvas;
    if (!drag || !layout || !canvas) return;

    const pt = canvasLocalPoint(canvas, e.clientX, e.clientY);
    drag.currentX = this.clampVerticalMarkerCanvasX(pt.x, layout.canvasCssWidth);
    this.scheduleFrameRedraw(true);
  }

  private onVerticalMarkerMouseUp(e: MouseEvent): void {
    document.removeEventListener("mousemove", this.boundVerticalMarkerMouseMove);
    document.removeEventListener("mouseup", this.boundVerticalMarkerMouseUp);

    const drag = this.verticalMarkerDrag;
    this.verticalMarkerDrag = null;
    if (!drag) return;

    const layout = this.getChartLayout();
    const canvas = this.canvas;
    if (layout && canvas) {
      const pt = canvasLocalPoint(canvas, e.clientX, e.clientY);
      const x = this.clampVerticalMarkerCanvasX(pt.x, layout.canvasCssWidth);
      const date = this.verticalMarkerDateFromCanvasX(x, layout.canvasCssWidth);
      this.callbacks.onVerticalMarkerChange?.(drag.markerId, date);
    }

    this.redraw();
  }

  private onBrushMouseMove(e: MouseEvent): void {
    const brush = this.brushSelection;
    const canvas = this.canvas;
    const layout = this.getChartLayout();
    if (!brush || !canvas || !layout) return;

    const gr = layout.groupRects.get(brush.groupId);
    if (!gr) return;

    const pt = canvasLocalPoint(canvas, e.clientX, e.clientY);
    const scroll = this.verticalScrollOffsets.get(brush.groupId) || 0;

    const clampedX = Math.max(0, Math.min(layout.canvasCssWidth, pt.x));
    const clampedYInGroup = Math.max(0, Math.min(gr.h, pt.y - gr.y));

    brush.currentX = clampedX;
    brush.currentYContent = clampedYInGroup + scroll;
    this.scheduleFrameRedraw(true);
  }

  private onBrushMouseUp(e: MouseEvent): void {
    document.removeEventListener("mousemove", this.boundBrushMouseMove);
    document.removeEventListener("mouseup", this.boundBrushMouseUp);
    const brush = this.brushSelection;
    const canvas = this.canvas;
    const layout = this.getChartLayout();
    if (!brush || !canvas || !layout) {
      this.brushSelection = null;
      this.redraw();
      return;
    }

    const gr = layout.groupRects.get(brush.groupId);
    if (!gr) {
      this.brushSelection = null;
      this.redraw();
      return;
    }

    const pt = canvasLocalPoint(canvas, e.clientX, e.clientY);
    const scroll = this.verticalScrollOffsets.get(brush.groupId) || 0;
    const clampedX = Math.max(0, Math.min(layout.canvasCssWidth, pt.x));
    const clampedYInGroup = Math.max(0, Math.min(gr.h, pt.y - gr.y));
    brush.currentX = clampedX;
    brush.currentYContent = clampedYInGroup + scroll;

    const dx = Math.abs(brush.currentX - brush.startX);
    const dy = Math.abs(brush.currentYContent - brush.startYContent);

    if (dx > BRUSH_DRAG_THRESHOLD_PX || dy > BRUSH_DRAG_THRESHOLD_PX) {
      const topics = this.topicsForGroup(brush.groupId);
      const selectedSlots = collectSlotsFullyInsideRect({
        topics,
        selectionRect: {
          x0: brush.startX,
          y0: brush.startYContent,
          x1: brush.currentX,
          y1: brush.currentYContent,
        },
        margin: MARGIN,
        width: layout.canvasCssWidth,
        rowHeight: this.rowHeight,
        startTime: this.internalStartTime,
        endTime: this.internalEndTime,
        excludeReadOnly: true,
      });
      const slotIds = Array.from(new Set(selectedSlots.map((s) => s.id)));
      this.addSlotsToClipboard(slotIds);
    }

    this.brushSelection = null;
    this.redraw();
  }

  private onDocumentKeyDown(e: KeyboardEvent): void {
    if (e.key !== "Escape" && e.keyCode !== 27) return;
    if (this.readClipboard().length === 0) return;
    e.preventDefault();
    this.clearClipboard();
  }

  private ensureCanvasContext(
    canvas: HTMLCanvasElement,
    cssWidth: number,
    cssHeight: number,
  ): CanvasRenderingContext2D | null {
    const dpr = window.devicePixelRatio || 1;
    const pw = Math.max(1, Math.round(cssWidth * dpr));
    const ph = Math.max(1, Math.round(cssHeight * dpr));

    if (this.cachedCanvasEl !== canvas) {
      this.cachedCanvasEl = canvas;
      this.cachedCtx = null;
    }

    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;

    if (canvas.width !== pw || canvas.height !== ph || !this.cachedCtx) {
      canvas.width = pw;
      canvas.height = ph;
      this.cachedCtx = canvas.getContext("2d");
    }

    const ctx = this.cachedCtx;
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    return ctx;
  }

  /**
   * Keeps row height locked to the time scale so slot aspect ratio is stable (see SLOT_RENDER_RATIO).
   * Optionally preserves vertical position under the cursor during wheel zoom.
   */
  private reconcileUnifiedZoomRowHeight(wheelAnchor?: WheelZoomAnchor): void {
    const chartW = this.containerWidth - MARGIN.left - MARGIN.right;
    const timeRangeMs = this.internalEndTime.getTime() - this.internalStartTime.getTime();
    const raw = computeRowHeightForUnifiedZoom(chartW, timeRangeMs, SLOT_RENDER_RATIO);
    if (!Number.isFinite(raw)) return;

    const prevRowHeight = this.rowHeight;
    const next = Math.max(MIN_ROW_HEIGHT, Math.min(MAX_ROW_HEIGHT, raw));
    if (Math.abs(next - prevRowHeight) < 1e-4) return;

    const layout = this.getChartLayout();
    const canvas = this.canvas;
    let focusedGroupId: string | null = null;
    let anchorMouseY = 0;
    if (wheelAnchor && layout && canvas) {
      const pt =
        wheelAnchor.localX !== undefined && wheelAnchor.localY !== undefined
          ? { x: wheelAnchor.localX, y: wheelAnchor.localY }
          : canvasLocalPoint(canvas, wheelAnchor.clientX, wheelAnchor.clientY);
      const hit = hitTestChart(layout, pt.x, pt.y);
      if (hit.type === "group") {
        focusedGroupId = hit.groupId;
        const gr = layout.groupRects.get(hit.groupId);
        if (gr) {
          anchorMouseY = Math.max(0, Math.min(gr.h, pt.y - gr.y));
        }
      }
    }

    const hadSlotInteractions = slotsAllowLabelsAndInteraction(prevRowHeight);
    const hasSlotInteractions = slotsAllowLabelsAndInteraction(next);
    const hadSuggestions = suggestionsVisible(prevRowHeight);
    const hasSuggestions = suggestionsVisible(next);

    this.rowHeight = next;

    if (hadSlotInteractions && !hasSlotInteractions) {
      this.resetHoverSlot();
    }

    if (hadSuggestions && !hasSuggestions) {
      this.hoveredSuggestion = null;
    }

    if (!hasSlotInteractions && this.slotResizeDrag) {
      document.removeEventListener("mousemove", this.boundSlotResizeMouseMove);
      document.removeEventListener("mouseup", this.boundSlotResizeMouseUp);
      this.slotResizeDrag = null;
      this.slotResizePreview = null;
    }

    this.getProcessedTopics();

    for (const group of this.props.destinationGroups) {
      const groupTopics = this.topicsByGroupId.get(group.id) ?? [];
      const viewportHeight = this.heightMap.get(group.id) || 0;
      const H_old = computeContentHeight(groupTopics, prevRowHeight);
      const H_new = computeContentHeight(groupTopics, next);
      if (H_old <= 0) continue;

      const s = this.verticalScrollOffsets.get(group.id) || 0;
      const ratio = H_new / H_old;
      const newScroll =
        group.id === focusedGroupId
          ? (s + anchorMouseY) * ratio - anchorMouseY
          : s * ratio;
      const maxOffset = Math.max(0, H_new - viewportHeight);
      this.verticalScrollOffsets.set(group.id, Math.max(0, Math.min(maxOffset, newScroll)));
    }
  }

  private buildPanZoomCallbacks() {
    return {
      marginLeft: MARGIN.left,
      getCurrentTimeRange: () => ({
        start: this.internalStartTime,
        end: this.internalEndTime,
      }),
      getChartWidth: () => this.containerWidth - MARGIN.left - MARGIN.right,
      onTimeRangeChange: (start: Date, end: Date, wheelZoomAnchor?: WheelZoomAnchor) => {
        this.cancelSlotReflowAnimation();
        this.internalStartTime = start;
        this.internalEndTime = end;
        if (wheelZoomAnchor) {
          this.reconcileUnifiedZoomRowHeight(wheelZoomAnchor);
        }
        this.scheduleFrameRedraw(true);
      },
      onTimeRangeCommit: (start: Date, end: Date) => {
        this.cancelSlotReflowAnimation();
        this.internalStartTime = start;
        this.internalEndTime = end;
        this.reconcileUnifiedZoomRowHeight();
        // Parent will echo these props; mark seen now so refreshModel skips duplicate reconcile.
        this.lastSeenParentStartMs = start.getTime();
        this.lastSeenParentEndMs = end.getTime();
        this.callbacks.onChangeStartAndEndTime(start, end);
        this.scheduleFrameRedraw(true);
        this.maybeNotifyTopContentLayout();
      },
    };
  }

  private drawUnifiedFrame(): void {
    const layout = this.getChartLayout();
    const canvas = this.canvas;
    if (!layout || !canvas || layout.canvasCssHeight <= 0) return;

    this.getProcessedTopics();

    const ctx = this.ensureCanvasContext(canvas, layout.canvasCssWidth, layout.canvasCssHeight);
    if (!ctx) return;

    ctx.clearRect(0, 0, layout.canvasCssWidth, layout.canvasCssHeight);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, layout.canvasCssWidth, layout.canvasCssHeight);

    const bandKey = this.hoverResizeBand;
    drawResizeBands(ctx, layout, bandKey);

    drawXAxisOnCanvas({
      ctx,
      width: layout.canvasCssWidth,
      height: X_AXIS_HEIGHT,
      startTime: this.internalStartTime,
      endTime: this.internalEndTime,
      margin: MARGIN,
      xAxisOptions: this.props.xAxisOptions,
      offsetY: layout.axisRect.y,
    });

    const slotYTransition = this.getActiveSlotYTransition(performance.now());

    for (const group of this.props.destinationGroups) {
      const gr = layout.groupRects.get(group.id);
      if (!gr || gr.h <= 0) continue;

      const viewportHeight = gr.h;
      const groupTopics = this.topicsByGroupId.get(group.id) ?? [];
      const contentHeight = computeContentHeight(groupTopics, this.rowHeight);
      const scrollOffset = this.verticalScrollOffsets.get(group.id) || 0;

      const maxOffset = Math.max(0, contentHeight - viewportHeight);
      const clampedOffset = Math.min(scrollOffset, maxOffset);
      if (clampedOffset !== scrollOffset) {
        this.verticalScrollOffsets.set(group.id, clampedOffset);
      }

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, gr.y, layout.canvasCssWidth, gr.h);
      ctx.clip();
      ctx.translate(0, gr.y - clampedOffset);

      const topicLayouts = computeTopicLayout(groupTopics, MARGIN.left, this.rowHeight);

      drawTopicLines({
        ctx,
        width: layout.canvasCssWidth,
        height: viewportHeight,
        topics: groupTopics,
        margin: MARGIN,
        rowHeight: this.rowHeight,
        viewportTop: clampedOffset,
        viewportHeight: viewportHeight,
        layouts: topicLayouts,
        showTopicHeaderText: destinationLabelsVisible(this.rowHeight),
      });

      drawSlots({
        ctx,
        width: layout.canvasCssWidth,
        topics: groupTopics,
        margin: MARGIN,
        rowHeight: this.rowHeight,
        startTime: this.internalStartTime,
        endTime: this.internalEndTime,
        viewportTop: clampedOffset,
        viewportHeight: viewportHeight,
        topicLayouts,
        slotTimeOverride: this.slotResizePreview,
        slotYTransition,
      });

      if (departureMarkersVisible(this.rowHeight)) {
        drawDepartureMarkers({
          ctx,
          width: layout.canvasCssWidth,
          topics: groupTopics,
          margin: MARGIN,
          rowHeight: this.rowHeight,
          startTime: this.internalStartTime,
          endTime: this.internalEndTime,
          viewportTop: clampedOffset,
          viewportHeight: viewportHeight,
          topicLayouts,
          slotTimeOverride: this.slotResizePreview,
        });
      }

      drawVerticalMarkers({
        ctx,
        width: layout.canvasCssWidth,
        margin: MARGIN,
        startTime: this.internalStartTime,
        endTime: this.internalEndTime,
        markers: this.props.verticalMarkers ?? [],
        isReadOnly: this.props.isReadOnly,
        groupY: 0,
        groupHeight: contentHeight,
        draggingMarker: this.verticalMarkerDrag
          ? { id: this.verticalMarkerDrag.markerId, x: this.verticalMarkerDrag.currentX }
          : null,
      });

      this.drawMarkedRegionOverlay(ctx, group.id, contentHeight, layout.canvasCssWidth);

      if (suggestionsVisible(this.rowHeight)) {
        drawSuggestionButtons({
          ctx,
          width: layout.canvasCssWidth,
          topics: groupTopics,
          suggestions: this.props.suggestions,
          margin: MARGIN,
          rowHeight: this.rowHeight,
          startTime: this.internalStartTime,
          endTime: this.internalEndTime,
          viewportTop: clampedOffset,
          viewportHeight: viewportHeight,
          topicLayouts,
          hoveredSlotId: this.hoveredSuggestion?.slotId ?? null,
        });
      }

      ctx.restore();
    }

    drawWeekdayOverlay({
      ctx,
      width: layout.canvasCssWidth,
      lineTop: layout.axisRect.y,
      lineBottom: layout.canvasCssHeight,
      labelY: layout.axisRect.y + layout.axisRect.h / 8,
      margin: MARGIN,
      startTime: this.internalStartTime,
      endTime: this.internalEndTime,
    });

    this.drawCurrentTimeIndicator(ctx, layout);

    this.drawBrushSelectionOverlay(ctx, layout);
    this.drawClipboardPreviewOverlay(ctx, layout);
    this.drawSuggestionHoverOverlay(ctx, layout);
    this.drawSlotHoverTooltipOverlay(ctx, layout);

    if (slotYTransition) {
      this.scheduleFrameRedraw(false);
    }
  }

  private drawSuggestionHoverOverlay(
    ctx: CanvasRenderingContext2D,
    layout: UnifiedChartLayout,
  ): void {
    if (!suggestionsVisible(this.rowHeight)) return;
    const suggestion = this.hoveredSuggestion;
    if (!this.pointerInChart || !suggestion) return;

    ctx.save();
    ctx.font = "12px sans-serif";

    const lines = this.wrapTooltipText(ctx, suggestion.text, 260);
    if (lines.length === 0) {
      ctx.restore();
      return;
    }

    const lineHeight = 16;
    const padX = 10;
    const padY = 8;
    const textWidth = lines.reduce((max, line) => Math.max(max, ctx.measureText(line).width), 0);
    const boxWidth = Math.ceil(textWidth + padX * 2);
    const boxHeight = Math.ceil(lines.length * lineHeight + padY * 2);

    const margin = 8;
    const preferredX = this.pointerCanvasX - boxWidth - 14;
    const preferredY = this.pointerCanvasY - boxHeight / 2;
    const x = Math.max(
      margin,
      Math.min(layout.canvasCssWidth - boxWidth - margin, preferredX),
    );
    const y = Math.max(
      margin,
      Math.min(layout.canvasCssHeight - boxHeight - margin, preferredY),
    );

    const radius = 6;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + boxWidth - radius, y);
    ctx.quadraticCurveTo(x + boxWidth, y, x + boxWidth, y + radius);
    ctx.lineTo(x + boxWidth, y + boxHeight - radius);
    ctx.quadraticCurveTo(x + boxWidth, y + boxHeight, x + boxWidth - radius, y + boxHeight);
    ctx.lineTo(x + radius, y + boxHeight);
    ctx.quadraticCurveTo(x, y + boxHeight, x, y + boxHeight - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();

    ctx.fillStyle = "rgba(255, 255, 255, 0.97)";
    ctx.fill();
    ctx.strokeStyle = "#d4d4d8";
    ctx.lineWidth = 1;
    ctx.stroke();

    lines.forEach((line, idx) => {
      const baseline = y + padY + idx * lineHeight + 11;
      ctx.fillStyle = idx === lines.length - 1 ? "#0f766e" : "#111827";
      ctx.fillText(line, x + padX, baseline);
    });

    ctx.restore();
  }

  private drawBrushSelectionOverlay(
    ctx: CanvasRenderingContext2D,
    layout: UnifiedChartLayout,
  ): void {
    const brush = this.brushSelection;
    if (!brush) return;
    const gr = layout.groupRects.get(brush.groupId);
    if (!gr) return;

    const scroll = this.verticalScrollOffsets.get(brush.groupId) || 0;
    const startY = gr.y - scroll + brush.startYContent;
    const currentY = gr.y - scroll + brush.currentYContent;

    const x = Math.min(brush.startX, brush.currentX);
    const y = Math.min(startY, currentY);
    const w = Math.abs(brush.currentX - brush.startX);
    const h = Math.abs(currentY - startY);
    if (w <= 0 || h <= 0) return;

    ctx.save();
    ctx.fillStyle = "rgba(55, 0, 255, 0.16)";
    ctx.strokeStyle = "rgba(55, 0, 255, 0.8)";
    ctx.lineWidth = 1;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, w - 1), Math.max(0, h - 1));
    ctx.restore();
  }

  private drawClipboardPreviewOverlay(
    ctx: CanvasRenderingContext2D,
    layout: UnifiedChartLayout,
  ): void {
    if (!this.pointerInChart) return;
    if (this.brushSelection) return;

    const count = this.clipboardItems.length;
    if (count === 0) return;

    const visibleItems = this.clipboardItems
      .slice(0, CLIPBOARD_PREVIEW_MAX_ITEMS)
      .map((item) => item.displayName || item.id);
    const extraCount = Math.max(0, count - visibleItems.length);

    const lines = [`Clipboard (${count})`, ...visibleItems];
    if (extraCount > 0) {
      lines.push(`+${extraCount} more...`);
    }

    const lineHeight = 15;
    const padX = 10;
    const padY = 8;

    ctx.save();
    ctx.font = "12px sans-serif";
    const textWidth = lines.reduce((max, line) => Math.max(max, ctx.measureText(line).width), 0);
    const boxWidth = Math.ceil(textWidth + padX * 2);
    const boxHeight = Math.ceil(lines.length * lineHeight + padY * 2);

    const margin = 6;
    const preferredX = this.pointerCanvasX + 16;
    const preferredY = this.pointerCanvasY + 16;
    const x = Math.max(
      margin,
      Math.min(layout.canvasCssWidth - boxWidth - margin, preferredX),
    );
    const y = Math.max(
      margin,
      Math.min(layout.canvasCssHeight - boxHeight - margin, preferredY),
    );

    const radius = 6;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + boxWidth - radius, y);
    ctx.quadraticCurveTo(x + boxWidth, y, x + boxWidth, y + radius);
    ctx.lineTo(x + boxWidth, y + boxHeight - radius);
    ctx.quadraticCurveTo(x + boxWidth, y + boxHeight, x + boxWidth - radius, y + boxHeight);
    ctx.lineTo(x + radius, y + boxHeight);
    ctx.quadraticCurveTo(x, y + boxHeight, x, y + boxHeight - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();

    ctx.fillStyle = "rgba(17, 24, 39, 0.9)";
    ctx.fill();
    ctx.strokeStyle = "rgba(59, 130, 246, 0.9)";
    ctx.lineWidth = 1;
    ctx.stroke();

    lines.forEach((line, idx) => {
      const baseline = y + padY + idx * lineHeight + 11;
      if (idx === 0) {
        ctx.fillStyle = "#93c5fd";
      } else if (extraCount > 0 && idx === lines.length - 1) {
        ctx.fillStyle = "#d1d5db";
      } else {
        ctx.fillStyle = "#f9fafb";
      }
      ctx.fillText(line, x + padX, baseline);
    });

    ctx.restore();
  }

  private drawSlotHoverTooltipOverlay(
    ctx: CanvasRenderingContext2D,
    layout: UnifiedChartLayout,
  ): void {
    if (!slotsAllowLabelsAndInteraction(this.rowHeight)) return;
    if (!this.pointerInChart) return;
    if (!this.hoveredSlotId) return;

    const tooltipText = this.hoveredSlotHoverData();
    if (!tooltipText) return;

    ctx.save();
    ctx.font = "12px sans-serif";

    const lines = this.wrapTooltipText(ctx, tooltipText, 260);
    if (lines.length === 0) {
      ctx.restore();
      return;
    }

    const lineHeight = 16;
    const padX = 8;
    const padY = 8;

    const textWidth = lines.reduce((max, line) => Math.max(max, ctx.measureText(line).width), 0);
    const boxWidth = Math.ceil(textWidth + padX * 2);
    const boxHeight = Math.ceil(lines.length * lineHeight + padY * 2);

    const margin = 6;
    const preferredX = this.pointerCanvasX + 10;
    const preferredY = this.pointerCanvasY - boxHeight - 10;
    const x = Math.max(margin, Math.min(layout.canvasCssWidth - boxWidth - margin, preferredX));
    const y = Math.max(margin, Math.min(layout.canvasCssHeight - boxHeight - margin, preferredY));

    const radius = 4;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + boxWidth - radius, y);
    ctx.quadraticCurveTo(x + boxWidth, y, x + boxWidth, y + radius);
    ctx.lineTo(x + boxWidth, y + boxHeight - radius);
    ctx.quadraticCurveTo(x + boxWidth, y + boxHeight, x + boxWidth - radius, y + boxHeight);
    ctx.lineTo(x + radius, y + boxHeight);
    ctx.quadraticCurveTo(x, y + boxHeight, x, y + boxHeight - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();

    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    ctx.fill();
    ctx.strokeStyle = "#dddddd";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = "#111111";
    lines.forEach((line, idx) => {
      const baseline = y + padY + idx * lineHeight + 11;
      ctx.fillText(line, x + padX, baseline);
    });

    ctx.restore();
  }

  private hoveredSlotHoverData(): string | null {
    const slotId = this.hoveredSlotId;
    if (!slotId) return null;

    for (const topics of Array.from(this.topicsByGroupId.values())) {
      for (const topic of topics) {
        for (const row of topic.rows) {
          const slot = row.slots.find((s) => s.id === slotId);
          if (!slot) continue;
          return slot.hoverData ?? null;
        }
      }
    }

    const baseSlot = this.props.slots.find((s) => s.id === slotId);
    return baseSlot?.hoverData ?? null;
  }

  private wrapTooltipText(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
  ): string[] {
    const normalized = text
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .trim();
    if (!normalized) return [];

    const result: string[] = [];
    const paragraphs = normalized.split(/\n+/);

    for (const paragraph of paragraphs) {
      const words = paragraph.split(/\s+/).filter(Boolean);
      if (words.length === 0) continue;

      let line = words[0] || "";
      for (let i = 1; i < words.length; i++) {
        const candidate = `${line} ${words[i]}`;
        if (ctx.measureText(candidate).width <= maxWidth) {
          line = candidate;
        } else {
          result.push(line);
          line = words[i] || "";
        }
      }
      result.push(line);
    }

    return result;
  }

  /**
   * @param interactive Wheel/pan/vertical scroll: paint without waiting on a rAF queued by
   *   refresh/resize when that would hide the first delta of a new gesture.
   */
  private scheduleFrameRedraw(interactive = false): void {
    if (!this.canvas) return;
    if (interactive) {
      if (this.frameRedrawRaf === null) {
        this.drawUnifiedFrame();
      } else if (!this.pendingRedrawFollowsInteractive) {
        this.drawUnifiedFrame();
      }
    }
    if (this.frameRedrawRaf !== null) return;
    this.frameRedrawRaf = requestAnimationFrame(() => {
      this.frameRedrawRaf = null;
      this.pendingRedrawFollowsInteractive = false;
      this.drawUnifiedFrame();
    });
    this.pendingRedrawFollowsInteractive = interactive;
  }

  private redraw(): void {
    this.scheduleFrameRedraw(false);
  }

  private scrollToMarkedRegionDestination(
    region: GanttEditorProps["markedRegion"],
  ): void {
    if (!region || region.destinationId === "multiple") return;

    this.getProcessedTopics();
    const topic = this.cachedProcessedTopics?.find((t) => t.id === region.destinationId);
    if (!topic) return;

    const layout = this.getChartLayout();
    if (!layout) return;

    const viewportHeight = layout.groupHeights.get(topic.groupId) || 0;
    if (viewportHeight <= 0) return;

    const groupTopics = this.topicsByGroupId.get(topic.groupId) ?? [];
    const contentHeight = computeContentHeight(groupTopics, this.rowHeight);
    const topicY = topic.yStart + (topic.yEnd - topic.yStart) / 2;
    const target = topicY - viewportHeight / 2;
    const maxOffset = Math.max(0, contentHeight - viewportHeight);
    const clamped = Math.max(0, Math.min(maxOffset, target));
    this.verticalScrollOffsets.set(topic.groupId, clamped);
  }

  private drawMarkedRegionOverlay(
    ctx: CanvasRenderingContext2D,
    groupId: string,
    contentHeight: number,
    width: number,
  ): void {
    const region = this.props.markedRegion;
    if (!region) return;

    const firstGroupId = this.props.destinationGroups[0]?.id;
    let yStart = 0;
    let yEnd = contentHeight;

    if (region.destinationId === "multiple") {
      if (!firstGroupId || groupId !== firstGroupId) return;
      if (yEnd <= yStart) return;
    } else {
      const topic = (this.topicsByGroupId.get(groupId) ?? []).find(
        (t) => t.id === region.destinationId,
      );
      if (!topic) return;
      yStart = topic.yStart;
      yEnd = topic.yEnd;
      if (yEnd <= yStart) return;
    }

    const startMs = region.startTime.getTime();
    const endMs = region.endTime.getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return;

    const xStart = this.timeMsToCanvasX(startMs, width);
    const xEnd = this.timeMsToCanvasX(endMs, width);
    const markerWidth = xEnd - xStart;
    if (markerWidth <= 0) return;

    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = "rgba(255, 255, 0, 0.2)";
    ctx.strokeStyle = "rgba(255, 215, 0, 0.8)";
    ctx.lineWidth = 2;
    ctx.fillRect(xStart, yStart, markerWidth, yEnd - yStart);
    ctx.strokeRect(xStart, yStart, markerWidth, yEnd - yStart);
    ctx.restore();
  }

  private drawCurrentTimeIndicator(
    ctx: CanvasRenderingContext2D,
    layout: UnifiedChartLayout,
  ): void {
    const now = new Date();
    if (now < this.internalStartTime || now > this.internalEndTime) return;

    const x = this.timeMsToCanvasX(now.getTime(), layout.canvasCssWidth);
    const axisRowHeight = layout.axisRect.h / 4;
    const labelY = layout.axisRect.y + axisRowHeight * 3.5;
    const labelText = this.formatCurrentTimeLabel(now);
    ctx.save();

    ctx.strokeStyle = "red";
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(x, layout.axisRect.y);
    ctx.lineTo(x, layout.canvasCssHeight);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = "bold 10px sans-serif";
    const textWidth = ctx.measureText(labelText).width;
    const labelPadX = 4;
    const labelWidth = textWidth + labelPadX * 2;
    const labelHeight = Math.max(10, axisRowHeight - 2);
    const labelTop = labelY - labelHeight / 2;

    ctx.fillStyle = "rgba(255, 0, 0, 0.75)";
    ctx.fillRect(x, labelTop, labelWidth, labelHeight);

    ctx.fillStyle = "white";
    ctx.font = "bold 10px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(labelText, x + labelPadX, labelY);

    ctx.restore();
  }

  private formatCurrentTimeLabel(value: Date): string {
    const hh = `${value.getHours()}`.padStart(2, "0");
    const mm = `${value.getMinutes()}`.padStart(2, "0");
    return `${hh}:${mm}`;
  }

  private applySuggestionForSlot(slotId: string): void {
    if (!slotId || this.props.isReadOnly) return;
    const suggestion = this.props.suggestions.find((s) => s.slotId === slotId);
    if (!suggestion) return;

    const slot = this.props.slots.find((s) => s.id === slotId);
    if (!slot || slot.readOnly) return;

    const previousRowYBySlotId = this.captureSlotRowYById();

    slot.destinationId = suggestion.alternativeDestinationId;
    this.cachedProcessedTopics = null;
    this.startSlotReflowAnimationFromPreviousRows(previousRowYBySlotId);
    this.callbacks.onChangeDestinationId?.(slot.id, suggestion.alternativeDestinationId, true);
    this.redraw();
  }

  private timeMsToCanvasX(timeMs: number, width: number): number {
    const chartWidth = width - MARGIN.left - MARGIN.right;
    if (chartWidth <= 0) return MARGIN.left;

    const startMs = this.internalStartTime.getTime();
    const endMs = this.internalEndTime.getTime();
    const span = endMs - startMs;
    if (span <= 0) return MARGIN.left;

    const clamped = Math.max(startMs, Math.min(endMs, timeMs));
    return MARGIN.left + ((clamped - startMs) / span) * chartWidth;
  }

  private hitSuggestionForGroup(
    groupId: string,
    canvasX: number,
    contentY: number,
    width: number,
    groupTopics: Topic[],
  ) {
    if (!suggestionsVisible(this.rowHeight)) return null;
    return hitTestSuggestionButton({
      width,
      topics: groupTopics,
      suggestions: this.props.suggestions,
      margin: MARGIN,
      rowHeight: this.rowHeight,
      startTime: this.internalStartTime,
      endTime: this.internalEndTime,
      canvasX,
      contentY,
    });
  }

  private hitVerticalMarkerForGroup(
    groupId: string,
    canvasX: number,
    canvasY: number,
    width: number,
  ) {
    const layout = this.getChartLayout();
    if (!layout) return null;
    const gr = layout.groupRects.get(groupId);
    if (!gr) return null;

    return hitTestVerticalMarker({
      markers: this.props.verticalMarkers ?? [],
      margin: MARGIN,
      width,
      startTime: this.internalStartTime,
      endTime: this.internalEndTime,
      isReadOnly: this.props.isReadOnly,
      canvasX,
      canvasY,
      groupY: gr.y,
      groupHeight: gr.h,
    });
  }

  private clampVerticalMarkerCanvasX(x: number, width: number): number {
    const minX = MARGIN.left;
    const maxX = width - MARGIN.right;
    return Math.max(minX, Math.min(maxX, x));
  }

  private verticalMarkerDateFromCanvasX(x: number, width: number): Date {
    const chartWidth = width - MARGIN.left - MARGIN.right;
    if (chartWidth <= 0) return new Date(this.internalStartTime);

    const clamped = this.clampVerticalMarkerCanvasX(x, width);
    const innerX = clamped - MARGIN.left;
    const startMs = this.internalStartTime.getTime();
    const endMs = this.internalEndTime.getTime();
    const spanMs = Math.max(0, endMs - startMs);
    const ratio = Math.max(0, Math.min(1, innerX / chartWidth));
    return new Date(startMs + spanMs * ratio);
  }
}
