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
  DESTINATION_LABEL_MIN_ROW_HEIGHT_PX,
  departureMarkersVisible,
  suggestionsVisible,
  slotsAllowLabelsAndInteraction,
} from "./canvas_slot_scale";
import { processData } from "./process-data";
import {
  drawTopicLines,
  computeContentHeight,
  computeTopicLayout,
  TOPIC_BAND_PADDING,
  type TopicLayout,
} from "./canvas_topics";
import {
  collectSlotsFromIndexInRect,
  buildSlotPositionIndex,
  drawSlots,
  hitTestSlotBar,
  hitTestSlotResizeEdge,
  slotTimesForResizeDragStep,
  type SlotPositionEntry,
  type SlotResizeEdge,
} from "./canvas_slots";
import { drawDepartureMarkers, hitTestDepartureGap } from "./canvas_departure_markers";
import { drawVerticalMarkers } from "./canvas_vertical_markers";
import type { SuggestionButtonDefinition } from "./canvas_suggestions";
import { drawSuggestionButtons } from "./canvas_suggestions";
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
  GanttEditorRulerMode,
} from "./gantt_canvas_props";
import {
  X_AXIS_HEIGHT,
  DEFAULT_ROW_HEIGHT,
  MIN_ROW_HEIGHT,
  MAX_ROW_HEIGHT,
  SLOT_REFLOW_ANIMATION_MS,
  SLOT_REFLOW_PENDING_TTL_MS,
  DESTINATION_PREVIEW_TRANSITION_MS,
  MARGIN,
  PROCESS_DATA_VIEW_PLACEHOLDER_START,
  PROCESS_DATA_VIEW_PLACEHOLDER_END,
  SELECTION_STORAGE_KEY,
  LEGACY_CLIPBOARD_STORAGE_KEY,
  BRUSH_DRAG_THRESHOLD_PX,
  CLIPBOARD_PREVIEW_MAX_ITEMS,
  destinationGroupsSnapshot,
  markedRegionSnapshot,
  type TopicLayoutSnapshot,
  type TopicLayoutShiftByGroup,
} from "./gantt_chart_canvas_constants";
import {
  timeMsToCanvasX,
  clampVerticalMarkerCanvasX,
  verticalMarkerDateFromCanvasX,
} from "./gantt_chart_time_utils";
import {
  readSelectionFromStorage,
  writeSelectionToStorage,
  applyCopiedFlagsFromSelection,
  slotSnapshotForSelection,
} from "./gantt_chart_selection_storage";
import {
  drawMarkedRegionOverlay,
  drawCurrentTimeIndicator,
  hitSuggestionForGroup,
  hitVerticalMarkerForGroup,
} from "./gantt_chart_interaction_and_overlay_utils";
import {
  buildCanvasContextMenuLayout,
  drawCanvasContextMenu,
  hitTestCanvasContextMenu,
  type CanvasContextMenuItem,
  type CanvasContextMenuLayout,
  type CanvasContextMenuState,
} from "./canvas_context_menu";

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const COLLAPSED_SYNC_MIN_INTERVAL_MS = 250;

type ContextMenuActionPayload = {
  kind: "move-vertical-marker";
  markerId: string;
  targetDate: Date;
};

const RULER_SNAP_CATCHMENT_PX = 3;
/** Clipboard items at or above this count suppress the destination-hover preview (too expensive). */
const HOVER_PREVIEW_MAX_CLIPBOARD_SIZE = 50;
const RESIZE_RULER_TICK_LENGTH_PX = 10;
const RESIZE_TIME_LABEL_OFFSET_X = 14;
const RESIZE_TIME_LABEL_OFFSET_Y = -16;

type ResizeRulerSnapPointKind = "openTime" | "closeTime" | "deadline" | "secondaryDeadline";

type ResizeRulerSnapPoint = {
  timeMs: number;
  kind: ResizeRulerSnapPointKind;
  slotId: string;
};

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
  private contextMenuState: CanvasContextMenuState<ContextMenuActionPayload> = {
    visible: false,
    anchorX: 0,
    anchorY: 0,
    items: [],
    hoverRootIndex: null,
    hoverChildIndex: null,
    openChildRootIndex: null,
  };

  private pointerInChart = false;
  private pointerCanvasX = 0;
  private pointerCanvasY = 0;
  private altCopyModifierActive = false;
  private shiftTimeAxisModifierActive = false;
  private clipboardItems: GanttEditorSlot[] = [];
  private hoveredClipboardTopicId: string | null = null;
  private hoveredTimeAxisDiffMs: number | null = null;

  private destinationPreviewTopicsCache: {
    key: string;
    topicsByGroupId: Map<string, Topic[]>;
  } | null = null;

  private destinationPreviewTransition: {
    toTopicId: string;
    startedAtMs: number;
    durationMs: number;
    shiftsBySlotId: Map<string, number>;
    shiftsByGroupId: Map<string, TopicLayoutShiftByGroup>;
  } | null = null;

  private brushSelection: {
    groupId: string;
    startX: number;
    startYContent: number;
    currentX: number;
    currentYContent: number;
  } | null = null;

  /**
   * Per-group cache of pre-computed slot pixel bounds.
   * Key: groupId → { cacheKey, entries }.
   * cacheKey encodes canvasWidth + timeRange + rowHeight + processDataFingerprint so the
   * cache auto-invalidates whenever any of those values change.
   */
  private slotPositionIndexCache = new Map<string, { cacheKey: string; entries: SlotPositionEntry[] }>();

  private resizeObserver: ResizeObserver | null = null;
  /** Recomputed only when geometry inputs change. */
  private chartLayoutCache: UnifiedChartLayout | null = null;
  private chartLayoutDirty = true;
  private readonly panZoomCallbacks: PanZoomCallbacks;

  /** Active left/right slot edge drag (canvas CSS pixels / inner chart width). */
  private slotResizeDrag: {
    edge: SlotResizeEdge;
    slotId: string;
    groupId: string;
    destinationId: string;
    rulerMode: Exclude<GanttEditorRulerMode, null> | null;
    snapPoints: ResizeRulerSnapPoint[];
    startClientX: number;
    displayInnerLeft: number;
    displayInnerWidth: number;
    chartWidth: number;
  } | null = null;

  /** Live bar geometry while resizing; cleared on mouseup. */
  private slotResizePreview: { slotId: string; openTime: Date; closeTime: Date } | null = null;

  /** Current locked ruler while resizing a slot edge. */
  private slotResizeRuler: {
    groupId: string;
    slotId: string;
    referenceSlotIds: string[];
    canvasX: number;
    snappedTimeMs: number;
    kinds: ResizeRulerSnapPointKind[];
  } | null = null;

  /** Active drag for a vertical marker line. */
  private verticalMarkerDrag: { markerId: string; currentX: number } | null = null;

  /** Captured row positions before a resize commit; consumed when parent props echo new times. */
  private pendingSlotReflowFromResize: {
    capturedAtMs: number;
    previousRowYBySlotId: Map<string, number>;
    previousLayoutByGroupId: Map<string, TopicLayoutSnapshot>;
  } | null = null;

  /** Short-lived row-shift animation for slots moved by post-resize reflow. */
  private slotReflowAnimation: {
    startedAtMs: number;
    durationMs: number;
    shiftsBySlotId: Map<string, number>;
    shiftsByGroupId: Map<string, TopicLayoutShiftByGroup>;
  } | null = null;

  /** Per-group topic Y-shift interpolation used for collapse/expand height transitions. */
  private collapseLayoutAnimation: {
    startedAtMs: number;
    durationMs: number;
    shiftsByGroupId: Map<string, TopicLayoutShiftByGroup>;
  } | null = null;

  private cachedCanvasEl: HTMLCanvasElement | null = null;
  private cachedCtx: CanvasRenderingContext2D | null = null;

  /** Cached `processData` result; invalidated when slot/destination model or collapse state changes. */
  private cachedProcessedTopics: Topic[] | null = null;
  /** Fingerprint of inputs last used to build {@link cachedProcessedTopics}. */
  private processDataDeepFingerprint: number | null = null;
  private cacheCollapsedLocalStorage = "";
  private lastCollapsedSyncCheckAtMs = 0;
  private topicsByGroupId = new Map<string, Topic[]>();
  private topicLayoutsByTopicsRef = new WeakMap<
    Topic[],
    { rowHeight: number; layouts: TopicLayout[] }
  >();
  private contentHeightsByTopicsRef = new WeakMap<Topic[], Map<number, number>>();

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
  private readonly boundDocumentKeyUp = (e: KeyboardEvent) => this.onDocumentKeyUp(e);

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
    const previousProps = this.props;
    const wasReadOnly = previousProps.isReadOnly;
    const previousStartMs = previousProps.startTime.getTime();
    const previousEndMs = previousProps.endTime.getTime();
    const nextStartMs = next.startTime.getTime();
    const nextEndMs = next.endTime.getTime();
    const parentTimeRangeChanged =
      previousStartMs !== nextStartMs || previousEndMs !== nextEndMs;
    const nonTimePropsUnchangedByRef =
      previousProps.slots === next.slots &&
      previousProps.destinations === next.destinations &&
      previousProps.destinationGroups === next.destinationGroups &&
      previousProps.suggestions === next.suggestions &&
      previousProps.activateRulers === next.activateRulers &&
      previousProps.verticalMarkers === next.verticalMarkers &&
      previousProps.markedRegion === next.markedRegion &&
      previousProps.isReadOnly === next.isReadOnly &&
      previousProps.topContentPortion === next.topContentPortion &&
      previousProps.xAxisOptions === next.xAxisOptions;
    const isTimeRangeOnlyUpdate = parentTimeRangeChanged && nonTimePropsUnchangedByRef;

    this.props = next;

    let shouldRedraw = false;
    let nextFingerprint: number | null = null;
    let processDataChanged = false;

    if (!wasReadOnly && next.isReadOnly) {
      this.clearSelection();
      shouldRedraw = true;
    }

    if (!isTimeRangeOnlyUpdate) {
      nextFingerprint = this.computeProcessDataDeepFingerprint(next);
      processDataChanged = this.processDataDeepFingerprint !== nextFingerprint;
      if (processDataChanged) {
        this.cachedProcessedTopics = null;
        shouldRedraw = true;
      }
    }

    const ps = nextStartMs;
    const pe = nextEndMs;
    if (ps !== this.lastSeenParentStartMs || pe !== this.lastSeenParentEndMs) {
      this.lastSeenParentStartMs = ps;
      this.lastSeenParentEndMs = pe;
      this.internalStartTime = new Date(next.startTime);
      this.internalEndTime = new Date(next.endTime);
      this.reconcileUnifiedZoomRowHeight();
      shouldRedraw = true;
    }

    if (next.topContentPortion !== undefined) {
      const t = next.topContentPortion;
      if (t !== this.lastSeenParentTopPortion) {
        this.lastSeenParentTopPortion = t;
        this.currentTopContentPortion = t;
        this.invalidateLayoutCache();
        shouldRedraw = true;
      }
    }

    const gSnap = destinationGroupsSnapshot(next.destinationGroups);
    if (gSnap !== this.lastDestinationGroupsSnapshot) {
      this.lastDestinationGroupsSnapshot = gSnap;
      this.syncDestinationGroupsFromProps();
      shouldRedraw = true;
    }

    const markedSnap = markedRegionSnapshot(next.markedRegion);
    if (markedSnap !== this.lastMarkedRegionSnapshot) {
      this.lastMarkedRegionSnapshot = markedSnap;
      this.scrollToMarkedRegionDestination(next.markedRegion);
      shouldRedraw = true;
    }

    // Keep isCopied flags in sync only when the slot model may have changed.
    const slotModelRefsChanged =
      next.slots !== previousProps.slots ||
      next.destinations !== previousProps.destinations ||
      next.isReadOnly !== previousProps.isReadOnly;
    if (slotModelRefsChanged || processDataChanged) {
      this.applyCopiedFlagsFromClipboard(this.clipboardItems);
      shouldRedraw = true;
    }

    if (nextFingerprint !== null) {
      this.tryStartPendingSlotReflowAnimation(nextFingerprint);
    }

    if (shouldRedraw) {
      this.redraw();
    }
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
    document.addEventListener("keyup", this.boundDocumentKeyUp);

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
    this.slotResizeRuler = null;
    this.verticalMarkerDrag = null;
    this.pendingSlotReflowFromResize = null;
    this.slotReflowAnimation = null;
    this.brushSelection = null;
    this.hoveredSlotId = null;
    this.hoveredSuggestion = null;
    this.hoveredClipboardTopicId = null;
    this.destinationPreviewTopicsCache = null;
    this.destinationPreviewTransition = null;
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
    document.removeEventListener("keyup", this.boundDocumentKeyUp);
    clearPanZoomWheelDebounce();
    this.container = null;
    this.canvas = null;
    this.isInitialized = false;
    this.lastNotifiedTopContentHeight = -1;
  }

  updateSelection(): void {
    const parsedData = this.readSelection();
    this.clipboardItems = parsedData;
    if (parsedData.length === 0) {
      this.hoveredClipboardTopicId = null;
      this.destinationPreviewTransition = null;
    }
    this.destinationPreviewTopicsCache = null;
    this.applyCopiedFlagsFromClipboard(parsedData);
    this.host.onSelectionItems?.(parsedData);
    this.host.onSelectionSlotIds?.(parsedData.map((slot) => slot.id));
    this.host.onClipboardItems?.(parsedData);
    this.refreshCopyCursorIndicator();
    this.redraw();
  }

  /** @deprecated Use updateSelection instead. */
  updateClipboard(): void {
    this.updateSelection();
  }

  clearSelection(): void {
    this.writeSelection([]);
    this.updateSelection();
  }

  /** @deprecated Use clearSelection instead. */
  clearClipboard(): void {
    this.clearSelection();
  }

  onContainerMouseMove(e: MouseEvent): void {
    this.updateCursorPosition(e);
  }

  onChartMouseMove(e: MouseEvent): void {
    this.updateCursorPosition(e);
    const layout = this.getChartLayout();
    const canvas = this.canvas;
    if (!layout || !canvas) return;

    if (this.contextMenuState.visible) {
      this.pointerInChart = true;
      const pt = canvasLocalPoint(canvas, e.clientX, e.clientY);
      const menuInteractionChanged = this.updateContextMenuHover(
        pt.x,
        pt.y,
        layout.canvasCssWidth,
        layout.canvasCssHeight,
      );
      canvas.style.cursor = this.isPointOverContextMenu(pt.x, pt.y, layout) ? "pointer" : "";
      if (menuInteractionChanged) {
        this.scheduleFrameRedraw(true);
      }
      return;
    }

    const altCopyChanged = this.syncAltCopyModifier(e.altKey);
    const shiftTimeAxisChanged = this.syncShiftTimeAxisModifier(e.shiftKey);
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
    let hoveredClipboardTopicId: string | null = null;
    let hoveredTimeAxisDiffMs: number | null = null;
    let ewResize = false;
    let suggestionHit = false;
    let verticalMarkerDraggable = false;
    if (hit.type === "group") {
      const gr = layout.groupRects.get(hit.groupId);
      if (gr) {
        const scroll = this.verticalScrollOffsets.get(hit.groupId) || 0;
        const contentY = pt.y - gr.y + scroll;
        if (!this.props.isReadOnly && this.clipboardItems.length > 0 && !this.brushSelection) {
          if (this.shiftTimeAxisModifierActive) {
            hoveredTimeAxisDiffMs = this.resolveTimeAxisDiffFromCanvasX(
              pt.x,
              layout.canvasCssWidth,
            );
          } else {
            hoveredClipboardTopicId = this.topicIdAtContentY(hit.groupId, contentY);
          }
        }
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
    const previousHoveredClipboardTopicId = this.hoveredClipboardTopicId;
    const previousHoveredTimeAxisDiffMs = this.hoveredTimeAxisDiffMs;
    this.updateHoverSlot(hoveredSlotId);
    this.hoveredSuggestion = hoveredSuggestion;
    this.hoveredClipboardTopicId = hoveredClipboardTopicId;
    this.hoveredTimeAxisDiffMs = hoveredTimeAxisDiffMs;
    const hoverSlotChanged = previousHoveredSlotId !== this.hoveredSlotId;
    const hoverSuggestionChanged =
      previousHoveredSuggestionSlotId !== (this.hoveredSuggestion?.slotId ?? null);
    const hoverClipboardTopicChanged =
      previousHoveredClipboardTopicId !== this.hoveredClipboardTopicId;
    const hoverTimeAxisDiffChanged = previousHoveredTimeAxisDiffMs !== this.hoveredTimeAxisDiffMs;

    if (hoverClipboardTopicChanged && !this.shiftTimeAxisModifierActive) {
      this.startDestinationPreviewTransition(previousHoveredClipboardTopicId, this.hoveredClipboardTopicId);
    } else if (hoverTimeAxisDiffChanged) {
      this.destinationPreviewTransition = null;
    }

    if (hit.type === "topResize" || hit.type === "betweenResize") {
      canvas.style.cursor = "ns-resize";
    } else if (suggestionHit) {
      canvas.style.cursor = "pointer";
    } else if (verticalMarkerDraggable) {
      canvas.style.cursor = "ew-resize";
    } else if (ewResize) {
      canvas.style.cursor = "ew-resize";
    } else if (this.shouldShowCopyCursorIndicator()) {
      canvas.style.cursor = "copy";
    } else {
      canvas.style.cursor = "";
    }

    if (
      hoverChanged ||
      hoverSlotChanged ||
      hoverSuggestionChanged ||
      hoverClipboardTopicChanged ||
      hoverTimeAxisDiffChanged ||
      altCopyChanged ||
      shiftTimeAxisChanged ||
      this.clipboardItems.length > 0 ||
      this.brushSelection ||
      this.hoveredSlotId
    ) {
      this.scheduleFrameRedraw(true);
    }
  }

  onChartMouseLeave(): void {
    this.closeContextMenu(false);
    this.hoverResizeBand = null;
    this.pointerInChart = false;
    this.hoveredSuggestion = null;
    this.hoveredClipboardTopicId = null;
    this.hoveredTimeAxisDiffMs = null;
    this.destinationPreviewTransition = null;
    this.resetHoverSlot();
    const canvas = this.canvas;
    if (canvas) canvas.style.cursor = "";
    this.redraw();
  }

  onMouseEnter(): void {
    this.host.onSelectionVisibility?.(true);
    this.host.onClipboardVisibility?.(true);
  }

  onMouseLeave(): void {
    this.closeContextMenu(false);
    this.pointerInChart = false;
    this.hoveredSuggestion = null;
    this.hoveredClipboardTopicId = null;
    this.hoveredTimeAxisDiffMs = null;
    this.destinationPreviewTransition = null;
    this.resetHoverSlot();
    this.host.onSelectionVisibility?.(false);
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

    if (this.contextMenuState.visible) {
      this.closeContextMenu(false);
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
    if (this.contextMenuState.visible) {
      return;
    }
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
          currentX: clampVerticalMarkerCanvasX(pt.x, layout.canvasCssWidth, MARGIN),
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
        this.hoveredSuggestion = null;
        this.hoveredClipboardTopicId = null;
        this.hoveredTimeAxisDiffMs = null;
        this.destinationPreviewTransition = null;
        this.resetHoverSlot();
        const chartWidth = layout.canvasCssWidth - MARGIN.left - MARGIN.right;
        const rulerMode = this.resolveRulerMode();
        this.slotResizeDrag = {
          edge: rh.edge,
          slotId: rh.slotId,
          groupId: hit.groupId,
          destinationId: rh.slot.destinationId,
          rulerMode,
          snapPoints: this.collectResizeSnapPoints(rh.slotId, rh.slot.destinationId, rulerMode),
          startClientX: e.clientX,
          displayInnerLeft: rh.displayInnerLeft,
          displayInnerWidth: rh.displayInnerWidth,
          chartWidth,
        };
        this.slotResizeRuler = null;
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

    if (!this.props.isReadOnly) {
      e.preventDefault();
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

    if (this.contextMenuState.visible) {
      this.handleContextMenuClick(
        ctx.point.x,
        ctx.point.y,
        ctx.layout.canvasCssWidth,
        ctx.layout.canvasCssHeight,
      );
      return;
    }

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

    if (this.shouldUseTimeAxisSelectionMode(e.shiftKey)) {
      const timeDiffMs = this.resolveTimeAxisDiffFromCanvasX(
        ctx.point.x,
        ctx.layout.canvasCssWidth,
      );
      if (timeDiffMs !== null && timeDiffMs !== 0) {
        this.moveSelectionOnTimeAxis(timeDiffMs, e.altKey);
      }
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
      this.onSlotPrimaryClick(slotHit.slotId, e.metaKey || e.ctrlKey, e.altKey);
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
      this.moveSelectionToTopic(topicId, e.altKey);
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
    const ctx = this.resolveGroupPointerContext(e.clientX, e.clientY);
    if (!ctx) return;

    this.closeContextMenu(false);

    const suggestionHit = this.hitSuggestionForGroup(
      ctx.groupId,
      ctx.point.x,
      ctx.contentY,
      ctx.layout.canvasCssWidth,
      ctx.groupTopics,
    );
    if (suggestionHit) return;

    const markerHit = this.hitVerticalMarkerForGroup(
      ctx.groupId,
      ctx.point.x,
      ctx.point.y,
      ctx.layout.canvasCssWidth,
    );
    if (markerHit) return;

    const slotsInteractive = slotsAllowLabelsAndInteraction(this.rowHeight);
    if (slotsInteractive) {
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
      if (slotHit) {
        this.lastContextClickedSlotId = slotHit.slotId;
        this.callbacks.onContextClickOnSlot?.(slotHit.slotId);
        return;
      }

      const resizeHit = hitTestSlotResizeEdge({
        topics: ctx.groupTopics,
        canvasX: ctx.point.x,
        contentY: ctx.contentY,
        margin: MARGIN,
        width: ctx.layout.canvasCssWidth,
        rowHeight: this.rowHeight,
        startTime: this.internalStartTime,
        endTime: this.internalEndTime,
        isReadOnly: this.props.isReadOnly,
      });
      if (resizeHit) return;

      const departureGapSlotId = departureMarkersVisible(this.rowHeight)
        ? hitTestDepartureGap({
            width: ctx.layout.canvasCssWidth,
            topics: ctx.groupTopics,
            margin: MARGIN,
            rowHeight: this.rowHeight,
            startTime: this.internalStartTime,
            endTime: this.internalEndTime,
            canvasX: ctx.point.x,
            contentY: ctx.contentY,
          })
        : null;
      if (departureGapSlotId) return;
    }

    if (ctx.point.x < MARGIN.left) return;

    const contextMenuMovableMarkers = this.getContextMenuMovableMarkers();
    if (contextMenuMovableMarkers.length === 0) return;

    const targetX = clampVerticalMarkerCanvasX(ctx.point.x, ctx.layout.canvasCssWidth, MARGIN);
    const targetDate = verticalMarkerDateFromCanvasX(
      targetX,
      ctx.layout.canvasCssWidth,
      this.internalStartTime,
      this.internalEndTime,
      MARGIN,
    );

    const menuItems: CanvasContextMenuItem<ContextMenuActionPayload>[] =
      contextMenuMovableMarkers.length === 1
        ? [
            {
              id: "move-marker-here",
              label: `Move ${
                contextMenuMovableMarkers[0]!.label &&
                contextMenuMovableMarkers[0]!.label.trim().length > 0
                  ? contextMenuMovableMarkers[0]!.label
                  : contextMenuMovableMarkers[0]!.id
              } here`,
              payload: {
                kind: "move-vertical-marker",
                markerId: contextMenuMovableMarkers[0]!.id,
                targetDate,
              },
            },
          ]
        : [
            {
              id: "move-marker-here",
              label: "Move marker here",
              children: contextMenuMovableMarkers.map((marker) => ({
                id: `move-marker:${marker.id}`,
                label: marker.label && marker.label.trim().length > 0 ? marker.label : marker.id,
                payload: {
                  kind: "move-vertical-marker",
                  markerId: marker.id,
                  targetDate,
                },
              })),
            },
          ];

    this.openContextMenu(ctx.point.x, ctx.point.y, menuItems);
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
    selectionSlotIds: string[];
    hoveredSlotId: string | null;
    pointerInChart: boolean;
    /** @deprecated Use selectionSlotIds instead. */
    clipboardSlotIds: string[];
    destinationPreviewTopicId: string | null;
    destinationPreviewSourceSlotIds: string[];
    destinationPreviewMode: "move" | "copy" | null;
    hoveredTimeAxisDiffMs: number | null;
    altCopyModifierActive: boolean;
    shiftTimeAxisModifierActive: boolean;
    lastClickedSlotId: string | null;
    lastDoubleClickedSlotId: string | null;
    lastContextClickedSlotId: string | null;
    internalStartTimeMs: number;
    internalEndTimeMs: number;
    contextMenuOpen: boolean;
    contextMenu: {
      rootItems: Array<{ id: string; label: string; center: { x: number; y: number } }>;
      childItems: Array<{ id: string; label: string; center: { x: number; y: number } }>;
    } | null;
    resizeRuler: {
      groupId: string;
      slotId: string;
      referenceSlotIds: string[];
      canvasX: number;
      snappedTimeMs: number;
      kinds: ResizeRulerSnapPointKind[];
    } | null;
    slotResizeActive: boolean;
    resizePreviewEdgeTimeMs: number | null;
    margin: { left: number; right: number };
    layout: {
      canvasCssWidth: number;
      canvasCssHeight: number;
      axisRect: { y: number; h: number };
      groups: Array<{ id: string; y: number; h: number; scrollOffset: number }>;
    } | null;
  } {
    const destinationPreviewState = this.getDestinationPreviewState(performance.now());
    const layout = this.getChartLayout();
    const contextMenuLayout = layout
      ? this.getContextMenuLayout(layout.canvasCssWidth, layout.canvasCssHeight)
      : null;
    const resizePreviewEdgeTimeMs =
      this.slotResizeDrag && this.slotResizePreview
        ? (this.slotResizeDrag.edge === "left"
            ? this.slotResizePreview.openTime.getTime()
            : this.slotResizePreview.closeTime.getTime())
        : null;
    return {
      rowHeight: this.rowHeight,
      selectionSlotIds: this.clipboardItems.map((slot) => slot.id),
      hoveredSlotId: this.hoveredSlotId,
      pointerInChart: this.pointerInChart,
      clipboardSlotIds: this.clipboardItems.map((slot) => slot.id),
      destinationPreviewTopicId: destinationPreviewState?.topicId ?? null,
      destinationPreviewSourceSlotIds: destinationPreviewState?.sourceSlotIds ?? [],
      destinationPreviewMode: destinationPreviewState?.mode ?? null,
      hoveredTimeAxisDiffMs: this.hoveredTimeAxisDiffMs,
      altCopyModifierActive: this.altCopyModifierActive,
      shiftTimeAxisModifierActive: this.shiftTimeAxisModifierActive,
      lastClickedSlotId: this.lastClickedSlotId,
      lastDoubleClickedSlotId: this.lastDoubleClickedSlotId,
      lastContextClickedSlotId: this.lastContextClickedSlotId,
      internalStartTimeMs: this.internalStartTime.getTime(),
      internalEndTimeMs: this.internalEndTime.getTime(),
      contextMenuOpen: this.contextMenuState.visible,
      contextMenu: contextMenuLayout
        ? {
            rootItems: contextMenuLayout.rootItems.map((item) => ({
              id: item.id,
              label: item.label,
              center: {
                x: item.rect.x + item.rect.width / 2,
                y: item.rect.y + item.rect.height / 2,
              },
            })),
            childItems: contextMenuLayout.childItems.map((item) => ({
              id: item.id,
              label: item.label,
              center: {
                x: item.rect.x + item.rect.width / 2,
                y: item.rect.y + item.rect.height / 2,
              },
            })),
          }
        : null,
      resizeRuler: this.slotResizeRuler
        ? {
            groupId: this.slotResizeRuler.groupId,
            slotId: this.slotResizeRuler.slotId,
            referenceSlotIds: [...this.slotResizeRuler.referenceSlotIds],
            canvasX: this.slotResizeRuler.canvasX,
            snappedTimeMs: this.slotResizeRuler.snappedTimeMs,
            kinds: [...this.slotResizeRuler.kinds],
          }
        : null,
      slotResizeActive: !!this.slotResizeDrag,
      resizePreviewEdgeTimeMs,
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
    const nowMs = performance.now();
    if (nowMs - this.lastCollapsedSyncCheckAtMs < COLLAPSED_SYNC_MIN_INTERVAL_MS) {
      return;
    }
    this.lastCollapsedSyncCheckAtMs = nowMs;

    const collapsed = localStorage.getItem("collapsedTopics") ?? "[]";
    if (collapsed !== this.cacheCollapsedLocalStorage) {
      this.cacheCollapsedLocalStorage = collapsed;
      this.cachedProcessedTopics = null;
    }
  }

  private getTopicLayouts(topics: Topic[]): TopicLayout[] {
    const cached = this.topicLayoutsByTopicsRef.get(topics);
    if (cached && cached.rowHeight === this.rowHeight) {
      return cached.layouts;
    }

    const layouts = computeTopicLayout(topics, MARGIN.left, this.rowHeight);
    this.topicLayoutsByTopicsRef.set(topics, { rowHeight: this.rowHeight, layouts });
    return layouts;
  }

  private getContentHeight(topics: Topic[], rowHeight: number): number {
    const key = Math.round(rowHeight * 10_000) / 10_000;
    const cachedByHeight = this.contentHeightsByTopicsRef.get(topics);
    const cached = cachedByHeight?.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const computed = computeContentHeight(topics, rowHeight);
    const byHeight = cachedByHeight ?? new Map<number, number>();
    byHeight.set(key, computed);
    // Keep only a tiny LRU-ish window per topics reference.
    if (byHeight.size > 4) {
      const firstKey = byHeight.keys().next().value;
      if (firstKey !== undefined) {
        byHeight.delete(firstKey);
      }
    }
    if (!cachedByHeight) {
      this.contentHeightsByTopicsRef.set(topics, byHeight);
    }
    return computed;
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
      const layouts = this.getTopicLayouts(topics);
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
    this.startSlotReflowAnimationFromPreviousRows(
      pending.previousRowYBySlotId,
      now,
      pending.previousLayoutByGroupId,
    );
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
    previousLayoutByGroupId?: ReadonlyMap<string, TopicLayoutSnapshot>,
  ): void {
    const rawShiftsBySlotId = this.buildSlotRowShiftMap(previousRowYBySlotId);
    const shiftsByGroupId = previousLayoutByGroupId
      ? this.buildTopicLayoutShiftByGroupId(
          previousLayoutByGroupId,
          this.captureTopicLayoutSnapshotByGroupId(),
        )
      : new Map<string, TopicLayoutShiftByGroup>();
    const shiftsBySlotId = this.subtractTopicShiftFromSlotShifts(
      rawShiftsBySlotId,
      shiftsByGroupId,
      this.topicsByGroupId,
    );

    if (shiftsBySlotId.size === 0 && shiftsByGroupId.size === 0) {
      this.slotReflowAnimation = null;
      return;
    }

    this.slotReflowAnimation = {
      startedAtMs,
      durationMs: SLOT_REFLOW_ANIMATION_MS,
      shiftsBySlotId,
      shiftsByGroupId,
    };
  }

  private subtractTopicShiftFromSlotShifts(
    shiftsBySlotId: ReadonlyMap<string, number>,
    shiftsByGroupId: ReadonlyMap<string, TopicLayoutShiftByGroup>,
    topicsByGroupId: ReadonlyMap<string, Topic[]>,
  ): Map<string, number> {
    if (shiftsBySlotId.size === 0 || shiftsByGroupId.size === 0) {
      return new Map(shiftsBySlotId);
    }

    const adjusted = new Map<string, number>();
    const topicAdjustedSlotIds = new Set<string>();

    topicsByGroupId.forEach((topics, groupId) => {
      const topicShifts = shiftsByGroupId.get(groupId)?.shiftsByTopicId;
      if (!topicShifts || topicShifts.size === 0) return;

      for (const topic of topics) {
        const topicShift = topicShifts.get(topic.id);
        if (topicShift === undefined || Math.abs(topicShift) < 0.5) continue;

        for (const row of topic.rows) {
          for (const slot of row.slots) {
            const slotShift = shiftsBySlotId.get(slot.id);
            if (slotShift === undefined) continue;
            topicAdjustedSlotIds.add(slot.id);
            const residualShift = slotShift - topicShift;
            if (Math.abs(residualShift) >= 0.5) {
              adjusted.set(slot.id, residualShift);
            }
          }
        }
      }
    });

    shiftsBySlotId.forEach((shift, slotId) => {
      if (!adjusted.has(slotId) && !topicAdjustedSlotIds.has(slotId)) {
        adjusted.set(slotId, shift);
      }
    });

    return adjusted;
  }

  private getActiveSlotReflowTransition(nowMs: number): {
    shiftsBySlotId: ReadonlyMap<string, number>;
    shiftsByGroupId: ReadonlyMap<string, TopicLayoutShiftByGroup>;
    progress: number;
  } | null {
    const anim = this.slotReflowAnimation;
    if (!anim || (anim.shiftsBySlotId.size === 0 && anim.shiftsByGroupId.size === 0)) {
      return null;
    }

    const rawProgress = (nowMs - anim.startedAtMs) / anim.durationMs;
    if (rawProgress >= 1) {
      this.slotReflowAnimation = null;
      return null;
    }

    const eased = this.easeOutCubic(rawProgress);
    return {
      shiftsBySlotId: anim.shiftsBySlotId,
      shiftsByGroupId: anim.shiftsByGroupId,
      progress: eased,
    };
  }

  private cancelSlotReflowAnimation(): void {
    this.pendingSlotReflowFromResize = null;
    this.slotReflowAnimation = null;
    this.collapseLayoutAnimation = null;
  }

  private easeOutCubic(rawProgress: number): number {
    const clamped = Math.max(0, Math.min(1, rawProgress));
    return 1 - Math.pow(1 - clamped, 3);
  }

  private captureTopicLayoutSnapshotForGroups(
    topicsByGroupId: ReadonlyMap<string, Topic[]>,
  ): Map<string, TopicLayoutSnapshot> {
    const snapshots = new Map<string, TopicLayoutSnapshot>();

    topicsByGroupId.forEach((topics, groupId) => {
      const layouts = this.getTopicLayouts(topics);
      const topicYById = new Map<string, number>();
      for (const layout of layouts) {
        topicYById.set(layout.topic.id, layout.gridlineY);
      }
      snapshots.set(groupId, {
        topicYById,
        contentHeight: layouts.length > 0 ? layouts[layouts.length - 1]!.topic.yEnd : 0,
      });
    });

    return snapshots;
  }

  private captureTopicLayoutSnapshotByGroupId(): Map<string, TopicLayoutSnapshot> {
    this.getProcessedTopics();
    return this.captureTopicLayoutSnapshotForGroups(this.topicsByGroupId);
  }

  private buildTopicLayoutShiftByGroupId(
    previousByGroupId: ReadonlyMap<string, TopicLayoutSnapshot>,
    nextByGroupId: ReadonlyMap<string, TopicLayoutSnapshot>,
  ): Map<string, TopicLayoutShiftByGroup> {
    const shiftsByGroupId = new Map<string, TopicLayoutShiftByGroup>();

    nextByGroupId.forEach((next, groupId) => {
      const previous = previousByGroupId.get(groupId);
      if (!previous) return;

      const shiftsByTopicId = new Map<string, number>();
      next.topicYById.forEach((nextY, topicId) => {
        const previousY = previous.topicYById.get(topicId);
        if (previousY === undefined) return;
        const shift = previousY - nextY;
        if (Math.abs(shift) >= 0.5) {
          shiftsByTopicId.set(topicId, shift);
        }
      });

      const contentHeightShift = previous.contentHeight - next.contentHeight;
      if (shiftsByTopicId.size > 0 || Math.abs(contentHeightShift) >= 0.5) {
        shiftsByGroupId.set(groupId, {
          shiftsByTopicId,
          contentHeightShift,
        });
      }
    });

    return shiftsByGroupId;
  }

  private startCollapseLayoutAnimation(
    previousByGroupId: ReadonlyMap<string, TopicLayoutSnapshot>,
    startedAtMs = performance.now(),
  ): void {
    const nextByGroupId = this.captureTopicLayoutSnapshotByGroupId();
    const shiftsByGroupId = this.buildTopicLayoutShiftByGroupId(previousByGroupId, nextByGroupId);

    if (shiftsByGroupId.size === 0) {
      this.collapseLayoutAnimation = null;
      return;
    }

    this.collapseLayoutAnimation = {
      startedAtMs,
      durationMs: SLOT_REFLOW_ANIMATION_MS,
      shiftsByGroupId,
    };
  }

  private getActiveCollapseLayoutTransition(nowMs: number): {
    progress: number;
    shiftsByGroupId: ReadonlyMap<string, TopicLayoutShiftByGroup>;
  } | null {
    const anim = this.collapseLayoutAnimation;
    if (!anim || anim.shiftsByGroupId.size === 0) return null;

    const rawProgress = (nowMs - anim.startedAtMs) / anim.durationMs;
    if (rawProgress >= 1) {
      this.collapseLayoutAnimation = null;
      return null;
    }

    return {
      progress: this.easeOutCubic(rawProgress),
      shiftsByGroupId: anim.shiftsByGroupId,
    };
  }

  private applyTopicLayoutYShift(
    topicLayouts: TopicLayout[],
    shiftsByTopicId: ReadonlyMap<string, number>,
    progress: number,
  ): TopicLayout[] {
    if (shiftsByTopicId.size === 0) return topicLayouts;

    const shiftedLayouts: TopicLayout[] = [];
    for (const layout of topicLayouts) {
      const shift = shiftsByTopicId.get(layout.topic.id);
      if (shift === undefined) {
        shiftedLayouts.push(layout);
        continue;
      }

      const appliedShift = shift * (1 - progress);
      const shiftedTopic = {
        ...layout.topic,
        yStart: layout.topic.yStart + appliedShift,
        yEnd: layout.topic.yEnd + appliedShift,
      };
      shiftedLayouts.push({
        ...layout,
        topic: shiftedTopic,
        gridlineY: layout.gridlineY + appliedShift,
        labelY: layout.labelY + appliedShift,
        rowYs: layout.rowYs.map((y) => y + appliedShift),
      });
    }

    return shiftedLayouts;
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

  private captureSlotRowYByIdForTopics(
    topicsByGroupId: ReadonlyMap<string, Topic[]>,
  ): Map<string, number> {
    const rowsBySlotId = new Map<string, number>();
    topicsByGroupId.forEach((topics) => {
      const layouts = this.getTopicLayouts(topics);
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

  private startDestinationPreviewTransition(
    previousTopicId: string | null,
    nextTopicId: string | null,
  ): void {
    if (!previousTopicId || !nextTopicId || previousTopicId === nextTopicId) {
      this.destinationPreviewTransition = null;
      return;
    }
    if (this.clipboardItems.length === 0) {
      this.destinationPreviewTransition = null;
      return;
    }

    const previousTopicsByGroupId = this.createDestinationPreviewTopics(previousTopicId);
    const nextTopicsByGroupId = this.createDestinationPreviewTopics(nextTopicId);
    const previousLayoutByGroupId = this.captureTopicLayoutSnapshotForGroups(previousTopicsByGroupId);
    const nextLayoutByGroupId = this.captureTopicLayoutSnapshotForGroups(nextTopicsByGroupId);

    const previousRows = this.captureSlotRowYByIdForTopics(previousTopicsByGroupId);
    const nextRows = this.captureSlotRowYByIdForTopics(nextTopicsByGroupId);

    const rawShiftsBySlotId = new Map<string, number>();
    nextRows.forEach((toY, slotId) => {
      const fromY = previousRows.get(slotId);
      if (fromY === undefined) return;
      const delta = fromY - toY;
      if (Math.abs(delta) > 0.5) {
        rawShiftsBySlotId.set(slotId, delta);
      }
    });

    const shiftsByGroupId = this.buildTopicLayoutShiftByGroupId(
      previousLayoutByGroupId,
      nextLayoutByGroupId,
    );
    const shiftsBySlotId = this.subtractTopicShiftFromSlotShifts(
      rawShiftsBySlotId,
      shiftsByGroupId,
      nextTopicsByGroupId,
    );

    if (shiftsBySlotId.size === 0 && shiftsByGroupId.size === 0) {
      this.destinationPreviewTransition = null;
      return;
    }

    this.destinationPreviewTransition = {
      toTopicId: nextTopicId,
      startedAtMs: performance.now(),
      durationMs: DESTINATION_PREVIEW_TRANSITION_MS,
      shiftsBySlotId,
      shiftsByGroupId,
    };
  }

  private getActiveDestinationPreviewTransition(
    nowMs: number,
    topicId: string,
  ):
    | {
        shiftsBySlotId: ReadonlyMap<string, number>;
        shiftsByGroupId: ReadonlyMap<string, TopicLayoutShiftByGroup>;
        progress: number;
      }
    | null {
    const anim = this.destinationPreviewTransition;
    if (
      !anim ||
      anim.toTopicId !== topicId ||
      (anim.shiftsBySlotId.size === 0 && anim.shiftsByGroupId.size === 0)
    ) {
      return null;
    }

    const rawProgress = (nowMs - anim.startedAtMs) / anim.durationMs;
    if (rawProgress >= 1) {
      this.destinationPreviewTransition = null;
      return null;
    }

    return {
      shiftsBySlotId: anim.shiftsBySlotId,
      shiftsByGroupId: anim.shiftsByGroupId,
      progress: this.easeOutCubic(rawProgress),
    };
  }

  private previewCacheKeyForTopic(topicId: string): string {
    const modelKey = this.processDataDeepFingerprint ?? this.computeProcessDataDeepFingerprint(this.props);
    const clipboardKey = this.getPreviewEligibleClipboardItems(topicId)
      .map((slot, index) => {
        const openMs = new Date(slot.openTime).getTime();
        const closeMs = new Date(slot.closeTime).getTime();
        return `${index}:${slot.id}:${slot.destinationId}:${openMs}:${closeMs}:${slot.displayName}`;
      })
      .join("|");
    return `${modelKey}:${topicId}:${this.altCopyModifierActive ? "copy" : "move"}:${clipboardKey}`;
  }

  private previewCacheKeyForTimeAxisDiff(timeDiffMs: number): string {
    const modelKey = this.processDataDeepFingerprint ?? this.computeProcessDataDeepFingerprint(this.props);
    const clipboardKey = this.clipboardItems
      .map((slot, index) => {
        const openMs = new Date(slot.openTime).getTime();
        const closeMs = new Date(slot.closeTime).getTime();
        return `${index}:${slot.id}:${slot.destinationId}:${openMs}:${closeMs}:${slot.displayName}`;
      })
      .join("|");
    return `${modelKey}:time-axis:${timeDiffMs}:${this.altCopyModifierActive ? "copy" : "move"}:${clipboardKey}`;
  }

  private getPreviewEligibleClipboardItems(topicId: string): GanttEditorSlot[] {
    if (this.altCopyModifierActive) {
      return this.clipboardItems;
    }
    return this.clipboardItems.filter((slot) => slot.destinationId !== topicId);
  }

  private createDestinationPreviewTopics(topicId: string): Map<string, Topic[]> {
    const cacheKey = this.previewCacheKeyForTopic(topicId);
    if (this.destinationPreviewTopicsCache?.key === cacheKey) {
      return this.destinationPreviewTopicsCache.topicsByGroupId;
    }

    const previewSlots: GanttEditorSlotWithUiAttributes[] = [];
    const copyPreview = this.altCopyModifierActive;
    this.getPreviewEligibleClipboardItems(topicId).forEach((slot, index) => {
      const openTime = new Date(slot.openTime);
      const closeTime = new Date(slot.closeTime);
      if (!Number.isFinite(openTime.getTime()) || !Number.isFinite(closeTime.getTime())) {
        return;
      }
      previewSlots.push({
        ...slot,
        id: `__destination_preview__${index}__${slot.id}`,
        destinationId: topicId,
        openTime,
        closeTime,
        deadline: slot.deadline ? new Date(slot.deadline) : undefined,
        secondaryDeadline: slot.secondaryDeadline ? new Date(slot.secondaryDeadline) : undefined,
        isCopied: false,
        isPreview: true,
        isCopyPreview: copyPreview,
        readOnly: true,
      });
    });

    const { processedData_ } = processData(
      [...this.props.slots, ...previewSlots],
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

    const topicsByGroupId = new Map<string, Topic[]>();
    for (const topic of processedData_) {
      let list = topicsByGroupId.get(topic.groupId);
      if (!list) {
        list = [];
        topicsByGroupId.set(topic.groupId, list);
      }
      list.push(topic);
    }

    this.destinationPreviewTopicsCache = {
      key: cacheKey,
      topicsByGroupId,
    };
    return topicsByGroupId;
  }

  private createTimeAxisPreviewTopics(timeDiffMs: number): Map<string, Topic[]> {
    const cacheKey = this.previewCacheKeyForTimeAxisDiff(timeDiffMs);
    if (this.destinationPreviewTopicsCache?.key === cacheKey) {
      return this.destinationPreviewTopicsCache.topicsByGroupId;
    }

    const previewSlots: GanttEditorSlotWithUiAttributes[] = [];
    const copyPreview = this.altCopyModifierActive;
    this.clipboardItems.forEach((slot, index) => {
      const openTime = new Date(new Date(slot.openTime).getTime() + timeDiffMs);
      const closeTime = new Date(new Date(slot.closeTime).getTime() + timeDiffMs);
      if (!Number.isFinite(openTime.getTime()) || !Number.isFinite(closeTime.getTime())) {
        return;
      }
      previewSlots.push({
        ...slot,
        id: `__time_axis_preview__${index}__${slot.id}`,
        openTime,
        closeTime,
        deadline: slot.deadline ? new Date(new Date(slot.deadline).getTime() + timeDiffMs) : undefined,
        secondaryDeadline: slot.secondaryDeadline
          ? new Date(new Date(slot.secondaryDeadline).getTime() + timeDiffMs)
          : undefined,
        isCopied: false,
        isPreview: true,
        isCopyPreview: copyPreview,
        readOnly: true,
      });
    });

    const { processedData_ } = processData(
      [...this.props.slots, ...previewSlots],
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

    const topicsByGroupId = new Map<string, Topic[]>();
    for (const topic of processedData_) {
      let list = topicsByGroupId.get(topic.groupId);
      if (!list) {
        list = [];
        topicsByGroupId.set(topic.groupId, list);
      }
      list.push(topic);
    }

    this.destinationPreviewTopicsCache = {
      key: cacheKey,
      topicsByGroupId,
    };
    return topicsByGroupId;
  }

  private getDestinationPreviewState(nowMs: number): {
    topicId: string;
    sourceSlotIds: string[];
    mode: "move" | "copy";
    topicsByGroupId: Map<string, Topic[]>;
    pulseAlpha: number;
    slotYTransition: { shiftsBySlotId: ReadonlyMap<string, number>; progress: number } | null;
    layoutYTransition: {
      shiftsByGroupId: ReadonlyMap<string, TopicLayoutShiftByGroup>;
      progress: number;
    } | null;
  } | null {
    if (!this.pointerInChart) return null;
    if (this.brushSelection) return null;
    if (this.props.isReadOnly) return null;
    if (this.clipboardItems.length === 0) return null;
    const pulseAlpha = 0.58 + 0.2 * (0.5 + 0.5 * Math.sin(nowMs / 160));
    if (this.shiftTimeAxisModifierActive) {
      const timeDiffMs = this.hoveredTimeAxisDiffMs;
      if (timeDiffMs === null) return null;
      const sourceSlotIds = this.clipboardItems.map((slot) => slot.id);
      if (sourceSlotIds.length === 0) return null;

      return {
        topicId: `__time_axis__${timeDiffMs}`,
        sourceSlotIds,
        mode: this.altCopyModifierActive ? "copy" : "move",
        topicsByGroupId: this.createTimeAxisPreviewTopics(timeDiffMs),
        pulseAlpha,
        slotYTransition: null,
        layoutYTransition: null,
      };
    }

    const topicId = this.hoveredClipboardTopicId;
    if (!topicId) return null;
    // Skip the expensive processData call when the clipboard is very large.
    if (this.clipboardItems.length >= HOVER_PREVIEW_MAX_CLIPBOARD_SIZE) return null;
    const sourceSlotIds = this.getPreviewEligibleClipboardItems(topicId).map((slot) => slot.id);
    if (sourceSlotIds.length === 0) return null;
    const transition = this.getActiveDestinationPreviewTransition(nowMs, topicId);

    return {
      topicId,
      sourceSlotIds,
      mode: this.altCopyModifierActive ? "copy" : "move",
      topicsByGroupId: this.createDestinationPreviewTopics(topicId),
      pulseAlpha,
      slotYTransition: transition
        ? { shiftsBySlotId: transition.shiftsBySlotId, progress: transition.progress }
        : null,
      layoutYTransition: transition
        ? { shiftsByGroupId: transition.shiftsByGroupId, progress: transition.progress }
        : null,
    };
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
    if (this.slotResizeDrag) {
      if (this.hoveredSlotId !== null) this.hoveredSlotId = null;
      return;
    }
    if (nextSlotId === this.hoveredSlotId) return;
    if (this.hoverTimeout) {
      clearTimeout(this.hoverTimeout);
      this.hoverTimeout = null;
    }
    this.hoveredSlotId = nextSlotId;
    if (!nextSlotId || !this.callbacks.onHoverOnSlot) return;
    this.callbacks.onHoverOnSlot(nextSlotId);
  }

  private resetHoverSlot(): void {
    if (this.hoverTimeout) {
      clearTimeout(this.hoverTimeout);
      this.hoverTimeout = null;
    }
    this.hoveredSlotId = null;
  }

  private readSelection(): GanttEditorSlot[] {
    return readSelectionFromStorage(SELECTION_STORAGE_KEY, LEGACY_CLIPBOARD_STORAGE_KEY);
  }

  /** @deprecated Use readSelection instead. */
  private readClipboard(): GanttEditorSlot[] {
    return this.readSelection();
  }

  private writeSelection(items: GanttEditorSlot[]): void {
    writeSelectionToStorage(items, SELECTION_STORAGE_KEY, LEGACY_CLIPBOARD_STORAGE_KEY);
  }

  /** @deprecated Use writeSelection instead. */
  private writeClipboard(items: GanttEditorSlot[]): void {
    this.writeSelection(items);
  }

  private applyCopiedFlagsFromClipboard(clipboard: GanttEditorSlot[]): void {
    applyCopiedFlagsFromSelection(this.props.slots, clipboard);
    this.cachedProcessedTopics = null;
    // Slot positions change whenever isCopied flags or destinationIds change, so any
    // cached position index is now stale and must be rebuilt on the next brush selection.
    this.slotPositionIndexCache.clear();
  }

  private slotSnapshotForClipboard(slot: GanttEditorSlotWithUiAttributes): GanttEditorSlot {
    return slotSnapshotForSelection(slot);
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

  private shouldUseTimeAxisSelectionMode(shiftPressed: boolean): boolean {
    return (
      shiftPressed &&
      !this.props.isReadOnly &&
      !this.brushSelection &&
      this.readSelection().length > 0
    );
  }

  private selectionAnchorDayStartMs(): number | null {
    const clipboard = this.readSelection();
    if (clipboard.length === 0) return null;

    const firstSelected = clipboard[0];
    const source = this.props.slots.find((slot) => slot.id === firstSelected.id);
    const anchorTimeMs = source?.openTime?.getTime() ?? new Date(firstSelected.openTime).getTime();
    if (!Number.isFinite(anchorTimeMs)) return null;

    const anchorDay = new Date(anchorTimeMs);
    anchorDay.setHours(0, 0, 0, 0);
    return anchorDay.getTime();
  }

  private resolveTimeAxisDiffFromCanvasX(canvasX: number, canvasCssWidth: number): number | null {
    const anchorDayStartMs = this.selectionAnchorDayStartMs();
    if (anchorDayStartMs === null) return null;

    const clampedX = clampVerticalMarkerCanvasX(canvasX, canvasCssWidth, MARGIN);
    const hoveredDate = verticalMarkerDateFromCanvasX(
      clampedX,
      canvasCssWidth,
      this.internalStartTime,
      this.internalEndTime,
      MARGIN,
    );
    const hoveredDayStart = new Date(hoveredDate);
    hoveredDayStart.setHours(0, 0, 0, 0);
    const dayDiff = Math.round((hoveredDayStart.getTime() - anchorDayStartMs) / DAY_IN_MS);
    if (dayDiff === 0) return null;
    return dayDiff * DAY_IN_MS;
  }

  private onSlotPrimaryClick(slotId: string, multiSelect: boolean, copyInsteadOfMove: boolean): void {
    const slot = this.props.slots.find((s) => s.id === slotId);
    if (!slot) return;

    if (!this.props.isReadOnly && !slot.readOnly) {
      const clipboard = this.readSelection();
      if (clipboard.length === 0 || multiSelect) {
        this.toggleSlotSelection(slotId);
      } else {
        this.moveSelectionToTopic(slot.destinationId, copyInsteadOfMove);
      }
    }
  }

  private toggleSlotSelection(slotId: string): void {
    const slot = this.props.slots.find((s) => s.id === slotId);
    if (!slot || slot.readOnly) return;

    const clipboard = this.readSelection();
    const idx = clipboard.findIndex((s) => s.id === slotId);
    if (idx >= 0) {
      clipboard.splice(idx, 1);
    } else {
      clipboard.push(this.slotSnapshotForClipboard(slot));
    }
    this.writeSelection(clipboard);
    this.updateSelection();
  }

  private addSlotsToSelection(slotIds: string[]): void {
    if (slotIds.length === 0) return;
    const clipboard = this.readSelection();
    const idsInClipboard = new Set(clipboard.map((s) => s.id));
    // Build a Map once so each lookup is O(1) instead of O(N) via Array.find.
    const slotById = new Map(this.props.slots.map((s) => [s.id, s]));
    let changed = false;
    for (const slotId of slotIds) {
      if (idsInClipboard.has(slotId)) continue;
      const slot = slotById.get(slotId);
      if (!slot || slot.readOnly) continue;
      clipboard.push(this.slotSnapshotForClipboard(slot));
      idsInClipboard.add(slotId);
      changed = true;
    }
    if (!changed) return;
    this.writeSelection(clipboard);
    this.updateSelection();
  }

  private emitCopySelectionToTopic(clipboard: GanttEditorSlot[], topicId: string): boolean {
    const slotById = new Map(this.props.slots.map((s) => [s.id, s]));
    const copiedSlotIds: string[] = [];
    for (const copiedSlot of clipboard) {
      const source = slotById.get(copiedSlot.id);
      if (!source || source.readOnly || source.destinationId === topicId) continue;
      copiedSlotIds.push(source.id);
    }

    if (copiedSlotIds.length > 1) {
      if (this.callbacks.onBulkCopyToDestinationId) {
        this.callbacks.onBulkCopyToDestinationId(copiedSlotIds, topicId, false);
      } else {
        for (const slotId of copiedSlotIds) {
          this.callbacks.onCopyToDestinationId?.(slotId, topicId, false);
        }
      }
    } else if (copiedSlotIds.length === 1) {
      this.callbacks.onCopyToDestinationId?.(copiedSlotIds[0], topicId, false);
    }

    return copiedSlotIds.length > 0;
  }

  private emitCopySelectionOnTimeAxis(clipboard: GanttEditorSlot[], timeDiffMs: number): boolean {
    const slotById = new Map(this.props.slots.map((s) => [s.id, s]));
    const copiedSlotIds: string[] = [];
    for (const copiedSlot of clipboard) {
      const source = slotById.get(copiedSlot.id);
      if (!source || source.readOnly) continue;
      copiedSlotIds.push(source.id);
    }

    if (copiedSlotIds.length > 1) {
      if (this.callbacks.onBulkCopySlotsOnTimeAxis) {
        this.callbacks.onBulkCopySlotsOnTimeAxis(copiedSlotIds, timeDiffMs, false);
      } else {
        for (const slotId of copiedSlotIds) {
          this.callbacks.onCopySlotOnTimeAxis?.(slotId, timeDiffMs, false);
        }
      }
    } else if (copiedSlotIds.length === 1) {
      this.callbacks.onCopySlotOnTimeAxis?.(copiedSlotIds[0], timeDiffMs, false);
    }

    return copiedSlotIds.length > 0;
  }

  private moveSelectionToTopic(topicId: string, copyInsteadOfMove = false): void {
    if (this.props.isReadOnly) return;
    const clipboard = this.readSelection();
    if (clipboard.length === 0) return;

    if (copyInsteadOfMove) {
      this.writeSelection([]);
      this.updateSelection();
      const copiedSomething = this.emitCopySelectionToTopic(clipboard, topicId);
      if (copiedSomething) {
        this.redraw();
      }
      return;
    }

    const previousRowYBySlotId = this.captureSlotRowYById();
    const previousLayoutByGroupId = this.captureTopicLayoutSnapshotByGroupId();

    let movedSomething = false;
    const movedSlotIds: string[] = [];
    const slotById = new Map(this.props.slots.map((s) => [s.id, s]));
    for (const copiedSlot of clipboard) {
      const target = slotById.get(copiedSlot.id);
      if (!target || target.readOnly) continue;
      target.destinationId = topicId;
      target.isCopied = false;
      movedSomething = true;
      movedSlotIds.push(target.id);
    }

    if (movedSlotIds.length > 1) {
      if (this.callbacks.onBulkChangeDestinationId) {
        this.callbacks.onBulkChangeDestinationId(movedSlotIds, topicId, false);
      } else {
        for (const slotId of movedSlotIds) {
          this.callbacks.onChangeDestinationId?.(slotId, topicId, false);
        }
      }
    } else if (movedSlotIds.length === 1) {
      this.callbacks.onChangeDestinationId?.(movedSlotIds[0], topicId, false);
    }

    this.writeSelection([]);
    this.updateSelection();
    if (movedSomething) {
      this.cachedProcessedTopics = null;
      this.startSlotReflowAnimationFromPreviousRows(
        previousRowYBySlotId,
        performance.now(),
        previousLayoutByGroupId,
      );
      this.redraw();
    }
  }

  private moveSelectionOnTimeAxis(timeDiffMs: number, copyInsteadOfMove = false): void {
    if (this.props.isReadOnly) return;
    if (timeDiffMs === 0) return;

    const clipboard = this.readSelection();
    if (clipboard.length === 0) return;

    if (copyInsteadOfMove) {
      this.writeSelection([]);
      this.updateSelection();
      const copiedSomething = this.emitCopySelectionOnTimeAxis(clipboard, timeDiffMs);
      if (copiedSomething) {
        this.redraw();
      }
      return;
    }

    const movedSlotIds: string[] = [];
    const slotById = new Map(this.props.slots.map((s) => [s.id, s]));
    for (const copiedSlot of clipboard) {
      const target = slotById.get(copiedSlot.id);
      if (!target || target.readOnly) continue;
      movedSlotIds.push(target.id);
    }

    if (movedSlotIds.length > 1) {
      if (this.callbacks.onBulkMoveSlotsOnTimeAxis) {
        this.callbacks.onBulkMoveSlotsOnTimeAxis(movedSlotIds, timeDiffMs, false);
      } else {
        for (const slotId of movedSlotIds) {
          this.callbacks.onMoveSlotOnTimeAxis?.(slotId, timeDiffMs, false);
        }
      }
    } else if (movedSlotIds.length === 1) {
      this.callbacks.onMoveSlotOnTimeAxis?.(movedSlotIds[0], timeDiffMs, false);
    }

    this.writeSelection([]);
    this.updateSelection();
    if (movedSlotIds.length > 0) {
      this.redraw();
    }
  }

  /** @deprecated Use toggleSlotSelection instead. */
  private toggleSlotClipboardSelection(slotId: string): void {
    this.toggleSlotSelection(slotId);
  }

  /** @deprecated Use addSlotsToSelection instead. */
  private addSlotsToClipboard(slotIds: string[]): void {
    this.addSlotsToSelection(slotIds);
  }

  /** @deprecated Use moveSelectionToTopic instead. */
  private moveClipboardToTopic(topicId: string): void {
    this.moveSelectionToTopic(topicId);
  }

  private toggleTopicCollapse(topicId: string): void {
    if (!topicId) return;

    const previousRowYBySlotId = this.captureSlotRowYById();
    const previousLayoutByGroupId = this.captureTopicLayoutSnapshotByGroupId();

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
    this.startSlotReflowAnimationFromPreviousRows(previousRowYBySlotId);
    this.startCollapseLayoutAnimation(previousLayoutByGroupId);
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

  private resolveRulerMode(): Exclude<GanttEditorRulerMode, null> | null {
    const mode = this.props.activateRulers ?? null;
    return mode === "ROW" || mode === "GLOBAL" ? mode : null;
  }

  private collectResizeSnapPoints(
    slotId: string,
    destinationId: string,
    mode: Exclude<GanttEditorRulerMode, null> | null,
  ): ResizeRulerSnapPoint[] {
    if (!mode) return [];

    const points: ResizeRulerSnapPoint[] = [];
    for (const slot of this.props.slots) {
      if (mode === "ROW" && slot.destinationId !== destinationId) continue;

      const sameSlot = slot.id === slotId;
      if (!sameSlot) {
        points.push({ timeMs: slot.openTime.getTime(), kind: "openTime", slotId: slot.id });
        points.push({ timeMs: slot.closeTime.getTime(), kind: "closeTime", slotId: slot.id });
      }
      if (slot.deadline) {
        points.push({ timeMs: slot.deadline.getTime(), kind: "deadline", slotId: slot.id });
      }
      if (slot.secondaryDeadline) {
        points.push({
          timeMs: slot.secondaryDeadline.getTime(),
          kind: "secondaryDeadline",
          slotId: slot.id,
        });
      }
    }
    return points;
  }

  private resolveResizePreviewWithRulers(
    drag: NonNullable<GanttChartCanvasController["slotResizeDrag"]>,
    dx: number,
    canvasWidth: number,
  ): {
    openTime: Date;
    closeTime: Date;
    ruler: {
      canvasX: number;
      snappedTimeMs: number;
      kinds: ResizeRulerSnapPointKind[];
      referenceSlotIds: string[];
    } | null;
  } {
    const base = slotTimesForResizeDragStep(
      drag.edge,
      dx,
      drag.displayInnerLeft,
      drag.displayInnerWidth,
      drag.chartWidth,
      this.internalStartTime,
      this.internalEndTime,
    );

    if (!drag.rulerMode || drag.snapPoints.length === 0) {
      return { ...base, ruler: null };
    }

    const edgeTimeMs =
      drag.edge === "left" ? base.openTime.getTime() : base.closeTime.getTime();
    const edgeCanvasX = timeMsToCanvasX(
      edgeTimeMs,
      canvasWidth,
      this.internalStartTime,
      this.internalEndTime,
      MARGIN,
    );

    let bestPoint: ResizeRulerSnapPoint | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const point of drag.snapPoints) {
      const pointX = timeMsToCanvasX(
        point.timeMs,
        canvasWidth,
        this.internalStartTime,
        this.internalEndTime,
        MARGIN,
      );
      const dist = Math.abs(pointX - edgeCanvasX);
      if (dist > RULER_SNAP_CATCHMENT_PX) continue;
      if (
        dist < bestDistance ||
        (dist === bestDistance && bestPoint && point.timeMs < bestPoint.timeMs)
      ) {
        bestDistance = dist;
        bestPoint = point;
      }
    }

    if (!bestPoint) {
      return { ...base, ruler: null };
    }

    const lockedCanvasX = timeMsToCanvasX(
      bestPoint.timeMs,
      canvasWidth,
      this.internalStartTime,
      this.internalEndTime,
      MARGIN,
    );
    const lockedInnerX = lockedCanvasX - MARGIN.left;
    let snappedDx = dx;
    if (drag.edge === "left") {
      snappedDx = lockedInnerX - drag.displayInnerLeft;
    } else {
      const lockedWidth = lockedInnerX - drag.displayInnerLeft;
      snappedDx = lockedWidth - drag.displayInnerWidth;
    }

    const snapped = slotTimesForResizeDragStep(
      drag.edge,
      snappedDx,
      drag.displayInnerLeft,
      drag.displayInnerWidth,
      drag.chartWidth,
      this.internalStartTime,
      this.internalEndTime,
    );

    const snappedEdgeMs =
      drag.edge === "left" ? snapped.openTime.getTime() : snapped.closeTime.getTime();
    const snappedEdgeCanvasX = timeMsToCanvasX(
      snappedEdgeMs,
      canvasWidth,
      this.internalStartTime,
      this.internalEndTime,
      MARGIN,
    );
    if (Math.abs(snappedEdgeCanvasX - lockedCanvasX) > 0.5) {
      return { ...base, ruler: null };
    }

    const kinds = drag.snapPoints
      .filter((p) => p.timeMs === bestPoint.timeMs)
      .map((p) => p.kind);
    const referenceSlotIds = Array.from(
      new Set(drag.snapPoints.filter((p) => p.timeMs === bestPoint.timeMs).map((p) => p.slotId)),
    );

    return {
      ...snapped,
      ruler: {
        canvasX: snappedEdgeCanvasX,
        snappedTimeMs: snappedEdgeMs,
        kinds: kinds.length > 0 ? Array.from(new Set(kinds)) : [bestPoint.kind],
        referenceSlotIds,
      },
    };
  }

  private onSlotResizeMouseMove(e: MouseEvent): void {
    if (!this.slotResizeDrag) return;
    const dx = e.clientX - this.slotResizeDrag.startClientX;
    const d = this.slotResizeDrag;
    const canvasWidth = d.chartWidth + MARGIN.left + MARGIN.right;
    const preview = this.resolveResizePreviewWithRulers(d, dx, canvasWidth);
    this.slotResizePreview = {
      slotId: d.slotId,
      openTime: preview.openTime,
      closeTime: preview.closeTime,
    };
    this.slotResizeRuler = preview.ruler
      ? {
          groupId: d.groupId,
          slotId: d.slotId,
          referenceSlotIds: preview.ruler.referenceSlotIds,
          canvasX: preview.ruler.canvasX,
          snappedTimeMs: preview.ruler.snappedTimeMs,
          kinds: preview.ruler.kinds,
        }
      : null;
    this.updateCursorPosition(e);
    this.redraw();
  }

  private onSlotResizeMouseUp(e: MouseEvent): void {
    document.removeEventListener("mousemove", this.boundSlotResizeMouseMove);
    document.removeEventListener("mouseup", this.boundSlotResizeMouseUp);
    if (!this.slotResizeDrag) return;
    const d = this.slotResizeDrag;
    const dx = e.clientX - d.startClientX;
    const canvasWidth = d.chartWidth + MARGIN.left + MARGIN.right;
    const preview = this.resolveResizePreviewWithRulers(d, dx, canvasWidth);
    const { openTime, closeTime } = preview;

    const prev = this.props.slots.find((s) => s.id === d.slotId);
    const shouldCommit =
      !!prev &&
      !prev.readOnly &&
      (prev.openTime.getTime() !== openTime.getTime() ||
        prev.closeTime.getTime() !== closeTime.getTime());
    const previousRowYBySlotId = shouldCommit ? this.captureSlotRowYById() : null;
    const previousLayoutByGroupId = shouldCommit
      ? this.captureTopicLayoutSnapshotByGroupId()
      : null;

    this.slotResizeDrag = null;
    this.slotResizePreview = null;
    this.slotResizeRuler = null;
    this.redraw();

    if (shouldCommit && previousRowYBySlotId) {
      this.pendingSlotReflowFromResize = {
        capturedAtMs: performance.now(),
        previousRowYBySlotId,
        previousLayoutByGroupId: previousLayoutByGroupId ?? new Map(),
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
    drag.currentX = clampVerticalMarkerCanvasX(pt.x, layout.canvasCssWidth, MARGIN);
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
      const x = clampVerticalMarkerCanvasX(pt.x, layout.canvasCssWidth, MARGIN);
      const date = verticalMarkerDateFromCanvasX(
        x,
        layout.canvasCssWidth,
        this.internalStartTime,
        this.internalEndTime,
        MARGIN,
      );
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
    if (!this.suppressNextCanvasClick) {
      const dx = Math.abs(brush.currentX - brush.startX);
      const dy = Math.abs(brush.currentYContent - brush.startYContent);
      if (dx > BRUSH_DRAG_THRESHOLD_PX || dy > BRUSH_DRAG_THRESHOLD_PX) {
        this.suppressNextCanvasClick = true;
      }
    }
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

    const didDrag = dx > BRUSH_DRAG_THRESHOLD_PX || dy > BRUSH_DRAG_THRESHOLD_PX;
    if (didDrag) {
      const topics = this.topicsForGroup(brush.groupId);

      // Build / reuse cached position index so geometry is never computed twice for
      // the same view state.  The cache key encodes every input that affects pixel
      // positions, so it self-invalidates on pan, zoom, resize or data changes.
      const fingerprint = this.processDataDeepFingerprint ?? "?";
      const cacheKey = `${layout.canvasCssWidth}:${this.internalStartTime.getTime()}:${this.internalEndTime.getTime()}:${this.rowHeight}:${fingerprint}`;
      let indexEntry = this.slotPositionIndexCache.get(brush.groupId);
      if (indexEntry?.cacheKey !== cacheKey) {
        indexEntry = {
          cacheKey,
          entries: buildSlotPositionIndex({
            topics,
            margin: MARGIN,
            width: layout.canvasCssWidth,
            rowHeight: this.rowHeight,
            startTime: this.internalStartTime,
            endTime: this.internalEndTime,
            excludeReadOnly: true,
          }),
        };
        this.slotPositionIndexCache.set(brush.groupId, indexEntry);
      }

      const selectedSlots = collectSlotsFromIndexInRect(indexEntry.entries, {
        x0: brush.startX,
        y0: brush.startYContent,
        x1: brush.currentX,
        y1: brush.currentYContent,
      });
      const slotIds = Array.from(new Set(selectedSlots.map((s) => s.id)));
      this.addSlotsToSelection(slotIds);
    } else {
      this.suppressNextCanvasClick = false;
    }

    this.brushSelection = null;
    this.redraw();
  }

  private onDocumentKeyDown(e: KeyboardEvent): void {
    if (e.key === "Alt") {
      if (this.syncAltCopyModifier(true)) {
        this.scheduleFrameRedraw(true);
      }
      return;
    }

    if (e.key === "Shift") {
      if (this.syncShiftTimeAxisModifier(true)) {
        this.scheduleFrameRedraw(true);
      }
      return;
    }

    if (e.key !== "Escape" && e.keyCode !== 27) return;

    if (this.contextMenuState.visible) {
      e.preventDefault();
      this.closeContextMenu(true);
      return;
    }

    if (this.readSelection().length === 0) return;
    e.preventDefault();
    this.clearSelection();
  }

  private onDocumentKeyUp(e: KeyboardEvent): void {
    if (e.key === "Alt") {
      if (this.syncAltCopyModifier(false)) {
        this.scheduleFrameRedraw(true);
      }
      return;
    }
    if (e.key !== "Shift") return;
    if (this.syncShiftTimeAxisModifier(false)) {
      this.scheduleFrameRedraw(true);
    }
  }

  private syncAltCopyModifier(active: boolean): boolean {
    if (this.altCopyModifierActive === active) return false;
    this.altCopyModifierActive = active;
    this.destinationPreviewTopicsCache = null;
    this.refreshCopyCursorIndicator();
    return true;
  }

  private syncShiftTimeAxisModifier(active: boolean): boolean {
    if (this.shiftTimeAxisModifierActive === active) return false;
    this.shiftTimeAxisModifierActive = active;
    if (active) {
      this.hoveredClipboardTopicId = null;
    } else {
      this.hoveredTimeAxisDiffMs = null;
    }
    this.destinationPreviewTransition = null;
    this.destinationPreviewTopicsCache = null;
    return true;
  }

  private refreshCopyCursorIndicator(): void {
    const canvas = this.canvas;
    if (!canvas) return;
    if (this.shouldShowCopyCursorIndicator()) {
      if (canvas.style.cursor === "" || canvas.style.cursor === "copy") {
        canvas.style.cursor = "copy";
      }
      return;
    }
    if (canvas.style.cursor === "copy") {
      canvas.style.cursor = "";
    }
  }

  private shouldShowCopyCursorIndicator(): boolean {
    return (
      this.pointerInChart &&
      !this.brushSelection &&
      !this.props.isReadOnly &&
      this.altCopyModifierActive &&
      this.clipboardItems.length > 0
    );
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
      this.slotResizeRuler = null;
    }

    this.getProcessedTopics();

    for (const group of this.props.destinationGroups) {
      const groupTopics = this.topicsByGroupId.get(group.id) ?? [];
      const viewportHeight = this.heightMap.get(group.id) || 0;
      const H_old = this.getContentHeight(groupTopics, prevRowHeight);
      const H_new = this.getContentHeight(groupTopics, next);
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

    const nowMs = performance.now();
    const slotReflowTransition = this.getActiveSlotReflowTransition(nowMs);
    const collapseLayoutTransition = this.getActiveCollapseLayoutTransition(nowMs);
    const destinationPreview = this.getDestinationPreviewState(nowMs);

    for (const group of this.props.destinationGroups) {
      const gr = layout.groupRects.get(group.id);
      if (!gr || gr.h <= 0) continue;

      const viewportHeight = gr.h;
      const groupTopics =
        destinationPreview?.topicsByGroupId.get(group.id) ??
        this.topicsByGroupId.get(group.id) ??
        [];
      const contentHeight = this.getContentHeight(groupTopics, this.rowHeight);
      const slotReflowGroupTransition = slotReflowTransition?.shiftsByGroupId.get(group.id);
      const collapseGroupTransition = collapseLayoutTransition?.shiftsByGroupId.get(group.id);
      const previewGroupTransition = destinationPreview?.layoutYTransition?.shiftsByGroupId.get(
        group.id,
      );
      const slotReflowProgress = slotReflowTransition?.progress ?? 1;
      const collapseProgress = collapseLayoutTransition?.progress ?? 1;
      const previewProgress = destinationPreview?.layoutYTransition?.progress ?? 1;
      const displayContentHeight =
        contentHeight +
        (slotReflowGroupTransition
          ? slotReflowGroupTransition.contentHeightShift * (1 - slotReflowProgress)
          : 0) +
        (collapseGroupTransition
          ? collapseGroupTransition.contentHeightShift * (1 - collapseProgress)
          : 0) +
        (previewGroupTransition
          ? previewGroupTransition.contentHeightShift * (1 - previewProgress)
          : 0);
      const scrollOffset = this.verticalScrollOffsets.get(group.id) || 0;

      const maxOffset = Math.max(0, displayContentHeight - viewportHeight);
      const clampedOffset = Math.min(scrollOffset, maxOffset);
      if (clampedOffset !== scrollOffset) {
        this.verticalScrollOffsets.set(group.id, clampedOffset);
      }

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, gr.y, layout.canvasCssWidth, gr.h);
      ctx.clip();
      ctx.translate(0, gr.y - clampedOffset);

      const topicLayouts = this.getTopicLayouts(groupTopics);
      let animatedTopicLayouts = topicLayouts;
      if (slotReflowGroupTransition && slotReflowTransition) {
        animatedTopicLayouts = this.applyTopicLayoutYShift(
          animatedTopicLayouts,
          slotReflowGroupTransition.shiftsByTopicId,
          slotReflowProgress,
        );
      }
      if (collapseGroupTransition && collapseLayoutTransition) {
        animatedTopicLayouts = this.applyTopicLayoutYShift(
          animatedTopicLayouts,
          collapseGroupTransition.shiftsByTopicId,
          collapseProgress,
        );
      }
      if (previewGroupTransition && destinationPreview?.layoutYTransition) {
        animatedTopicLayouts = this.applyTopicLayoutYShift(
          animatedTopicLayouts,
          previewGroupTransition.shiftsByTopicId,
          previewProgress,
        );
      }

      drawTopicLines({
        ctx,
        width: layout.canvasCssWidth,
        height: viewportHeight,
        topics: groupTopics,
        margin: MARGIN,
        rowHeight: this.rowHeight,
        viewportTop: clampedOffset,
        viewportHeight: viewportHeight,
        layouts: animatedTopicLayouts,
        topicHeaderMinVisibleHeightPx: DESTINATION_LABEL_MIN_ROW_HEIGHT_PX,
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
        topicLayouts: animatedTopicLayouts,
        slotTimeOverride: this.slotResizePreview,
        slotYTransition: destinationPreview?.slotYTransition ?? slotReflowTransition,
        previewPulseAlpha: destinationPreview?.pulseAlpha,
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
          topicLayouts: animatedTopicLayouts,
          slotTimeOverride: this.slotResizePreview,
          slotYTransition: destinationPreview?.slotYTransition ?? slotReflowTransition,
          previewPulseAlpha: destinationPreview?.pulseAlpha,
        });
      }

      this.drawMarkedRegionOverlay(ctx, group.id, displayContentHeight, layout.canvasCssWidth);

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
          topicLayouts: animatedTopicLayouts,
          hoveredSlotId: this.hoveredSuggestion?.slotId ?? null,
        });
      }

      ctx.restore();
    }

    drawVerticalMarkers({
      ctx,
      width: layout.canvasCssWidth,
      margin: MARGIN,
      startTime: this.internalStartTime,
      endTime: this.internalEndTime,
      markers: this.props.verticalMarkers ?? [],
      isReadOnly: this.props.isReadOnly,
      lineTop: 0,
      lineBottom: layout.canvasCssHeight,
      draggingMarker: this.verticalMarkerDrag
        ? { id: this.verticalMarkerDrag.markerId, x: this.verticalMarkerDrag.currentX }
        : null,
    });

    this.drawSlotResizeRulerOverlay(ctx, layout);

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
    this.drawSlotResizeCursorTimeOverlay(ctx, layout);
    this.drawContextMenuOverlay(ctx, layout);

    if (slotReflowTransition || collapseLayoutTransition || destinationPreview) {
      this.scheduleFrameRedraw(false);
    }
  }

  private drawSuggestionHoverOverlay(
    ctx: CanvasRenderingContext2D,
    layout: UnifiedChartLayout,
  ): void {
    if (this.slotResizeDrag) return;
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

  private drawSlotResizeRulerOverlay(
    ctx: CanvasRenderingContext2D,
    layout: UnifiedChartLayout,
  ): void {
    const ruler = this.slotResizeRuler;
    if (!ruler) return;
    const groupRect = layout.groupRects.get(ruler.groupId);
    if (!groupRect) return;

    const x = Math.max(MARGIN.left, Math.min(layout.canvasCssWidth - MARGIN.right, ruler.canvasX));
    const movingSlotCenterY = this.resolveSlotCenterCanvasY(ruler.groupId, ruler.slotId, layout);
    if (movingSlotCenterY === null) return;

    let referenceSlotCenterY: number | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const referenceSlotId of ruler.referenceSlotIds) {
      const y = this.resolveSlotCenterCanvasY(ruler.groupId, referenceSlotId, layout);
      if (y === null) continue;
      const distance = Math.abs(y - movingSlotCenterY);
      if (distance < bestDistance) {
        bestDistance = distance;
        referenceSlotCenterY = y;
      }
    }

    if (referenceSlotCenterY === null) {
      referenceSlotCenterY = movingSlotCenterY;
    }

    const y0 = Math.min(movingSlotCenterY, referenceSlotCenterY);
    const y1 = Math.max(movingSlotCenterY, referenceSlotCenterY);
    const topY = Math.max(groupRect.y + 1, y0);
    const bottomY = Math.min(groupRect.y + groupRect.h - 1, y1);
    if (bottomY - topY < 1) return;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, topY, layout.canvasCssWidth, groupRect.h);
    ctx.clip();

    ctx.strokeStyle = "rgba(37, 99, 235, 0.8)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x + 0.5, topY + 1);
    ctx.lineTo(x + 0.5, bottomY - 1);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = "#1d4ed8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, topY + 1);
    ctx.lineTo(x + 0.5, Math.min(bottomY - 1, topY + RESIZE_RULER_TICK_LENGTH_PX));
    ctx.moveTo(x + 0.5, Math.max(topY + 1, bottomY - RESIZE_RULER_TICK_LENGTH_PX));
    ctx.lineTo(x + 0.5, bottomY - 1);
    ctx.stroke();

    ctx.restore();
  }

  private resolveSlotCenterCanvasY(
    groupId: string,
    slotId: string,
    layout: UnifiedChartLayout,
  ): number | null {
    const groupRect = layout.groupRects.get(groupId);
    if (!groupRect) return null;

    const groupTopics = this.topicsByGroupId.get(groupId) ?? [];
    if (groupTopics.length === 0) return null;

    const topicLayouts = this.getTopicLayouts(groupTopics);
    const rowHeight = this.rowHeight;
    const rowBandwidth = rowHeight * (1 - TOPIC_BAND_PADDING);
    const scrollOffset = this.verticalScrollOffsets.get(groupId) || 0;

    for (const layoutEntry of topicLayouts) {
      for (let rowIndex = 0; rowIndex < layoutEntry.topic.rows.length; rowIndex++) {
        const row = layoutEntry.topic.rows[rowIndex];
        if (!row) continue;
        const hasSlot = row.slots.some((slot) => slot.id === slotId);
        if (!hasSlot) continue;
        const rowTop = layoutEntry.rowYs[rowIndex];
        if (rowTop === undefined) return null;
        return groupRect.y - scrollOffset + rowTop + rowBandwidth / 2;
      }
    }

    return null;
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

    const lines = [`Selection (${count})`, ...visibleItems];
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
    if (this.slotResizeDrag) return;
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

  private drawSlotResizeCursorTimeOverlay(
    ctx: CanvasRenderingContext2D,
    layout: UnifiedChartLayout,
  ): void {
    const drag = this.slotResizeDrag;
    const preview = this.slotResizePreview;
    if (!drag || !preview) return;

    const time = drag.edge === "left" ? preview.openTime : preview.closeTime;
    const label = this.formatResizeTimeLabel(time);
    if (!label) return;

    ctx.save();
    ctx.font = "600 12px sans-serif";
    const textWidth = ctx.measureText(label).width;
    const padX = 7;
    const boxWidth = Math.ceil(textWidth + padX * 2);
    const boxHeight = 24;
    const margin = 6;

    const preferredX = this.pointerCanvasX + RESIZE_TIME_LABEL_OFFSET_X;
    const preferredY = this.pointerCanvasY + RESIZE_TIME_LABEL_OFFSET_Y - boxHeight;
    const x = Math.max(
      margin,
      Math.min(layout.canvasCssWidth - boxWidth - margin, preferredX),
    );
    const y = Math.max(
      margin,
      Math.min(layout.canvasCssHeight - boxHeight - margin, preferredY),
    );

    const radius = 5;
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

    ctx.fillStyle = "rgba(30, 41, 59, 0.92)";
    ctx.fill();
    ctx.strokeStyle = "rgba(148, 163, 184, 0.9)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = "#f8fafc";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(label, x + padX, y + boxHeight / 2);
    ctx.restore();
  }

  private formatResizeTimeLabel(value: Date): string {
    const hh = `${value.getHours()}`.padStart(2, "0");
    const mm = `${value.getMinutes()}`.padStart(2, "0");
    return `${hh}:${mm}`;
  }

  private drawContextMenuOverlay(
    ctx: CanvasRenderingContext2D,
    layout: UnifiedChartLayout,
  ): void {
    const menuLayout = this.getContextMenuLayout(layout.canvasCssWidth, layout.canvasCssHeight);
    if (!menuLayout) return;
    drawCanvasContextMenu(ctx, menuLayout, this.contextMenuState);
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

  private getContextMenuMeasureTextWidth(text: string): number {
    const canvas = this.canvas;
    if (!canvas) return text.length * 7;

    const ctx = canvas.getContext("2d");
    if (!ctx) return text.length * 7;

    ctx.save();
    ctx.font = "13px sans-serif";
    const width = ctx.measureText(text).width;
    ctx.restore();
    return width;
  }

  private getContextMenuLayout(
    canvasWidth: number,
    canvasHeight: number,
  ): CanvasContextMenuLayout<ContextMenuActionPayload> | null {
    return buildCanvasContextMenuLayout({
      state: this.contextMenuState,
      canvasWidth,
      canvasHeight,
      measureTextWidth: (text) => this.getContextMenuMeasureTextWidth(text),
    });
  }

  private openContextMenu(
    anchorX: number,
    anchorY: number,
    items: CanvasContextMenuItem<ContextMenuActionPayload>[],
  ): void {
    this.contextMenuState = {
      visible: true,
      anchorX,
      anchorY,
      items,
      hoverRootIndex: null,
      hoverChildIndex: null,
      openChildRootIndex: null,
    };
    this.scheduleFrameRedraw(true);
  }

  private closeContextMenu(redraw: boolean): void {
    if (!this.contextMenuState.visible) return;
    this.contextMenuState = {
      ...this.contextMenuState,
      visible: false,
      items: [],
      hoverRootIndex: null,
      hoverChildIndex: null,
      openChildRootIndex: null,
    };
    if (redraw) {
      this.scheduleFrameRedraw(true);
    }
  }

  private updateContextMenuHover(
    canvasX: number,
    canvasY: number,
    canvasWidth: number,
    canvasHeight: number,
  ): boolean {
    const menuLayout = this.getContextMenuLayout(canvasWidth, canvasHeight);
    if (!menuLayout) return false;

    const hit = hitTestCanvasContextMenu(menuLayout, canvasX, canvasY);
    const prevRoot = this.contextMenuState.hoverRootIndex;
    const prevChild = this.contextMenuState.hoverChildIndex;
    const prevOpenChildRoot = this.contextMenuState.openChildRootIndex;

    if (hit.zone === "root" && hit.rootItem) {
      const hasChildren = (this.contextMenuState.items[hit.rootItem.index]?.children?.length ?? 0) > 0;
      this.contextMenuState.hoverRootIndex = hit.rootItem.index;
      this.contextMenuState.hoverChildIndex = null;
      this.contextMenuState.openChildRootIndex = hasChildren ? hit.rootItem.index : null;
    } else if (hit.zone === "child" && hit.childItem) {
      this.contextMenuState.hoverChildIndex = hit.childItem.index;
    } else if (hit.zone === "bridge") {
      // Keep submenu state stable while crossing the intentional visual gap.
    } else {
      this.contextMenuState.hoverRootIndex = null;
      this.contextMenuState.hoverChildIndex = null;
      this.contextMenuState.openChildRootIndex = null;
    }

    return (
      prevRoot !== this.contextMenuState.hoverRootIndex ||
      prevChild !== this.contextMenuState.hoverChildIndex ||
      prevOpenChildRoot !== this.contextMenuState.openChildRootIndex
    );
  }

  private handleContextMenuClick(
    canvasX: number,
    canvasY: number,
    canvasWidth: number,
    canvasHeight: number,
  ): void {
    const menuLayout = this.getContextMenuLayout(canvasWidth, canvasHeight);
    if (!menuLayout) return;

    const hit = hitTestCanvasContextMenu(menuLayout, canvasX, canvasY);
    if (hit.zone === "bridge") {
      return;
    }
    if (hit.zone === "outside") {
      this.closeContextMenu(true);
      return;
    }

    if (hit.zone === "root" && hit.rootItem) {
      const rootItem = this.contextMenuState.items[hit.rootItem.index];
      if (!rootItem || rootItem.enabled === false) {
        this.closeContextMenu(true);
        return;
      }
      if ((rootItem.children?.length ?? 0) > 0) {
        this.contextMenuState.hoverRootIndex = hit.rootItem.index;
        this.contextMenuState.openChildRootIndex = hit.rootItem.index;
        this.contextMenuState.hoverChildIndex = null;
        this.scheduleFrameRedraw(true);
        return;
      }
      this.runContextMenuAction(rootItem.payload);
      this.closeContextMenu(true);
      return;
    }

    if (hit.zone === "child" && hit.childItem) {
      const rootIndex = this.contextMenuState.openChildRootIndex;
      const child =
        rootIndex !== null
          ? this.contextMenuState.items[rootIndex]?.children?.[hit.childItem.index]
          : null;
      if (!child || child.enabled === false) {
        this.closeContextMenu(true);
        return;
      }
      this.runContextMenuAction(child.payload);
      this.closeContextMenu(true);
    }
  }

  private isPointOverContextMenu(
    canvasX: number,
    canvasY: number,
    layout: UnifiedChartLayout,
  ): boolean {
    const menuLayout = this.getContextMenuLayout(layout.canvasCssWidth, layout.canvasCssHeight);
    if (!menuLayout) return false;
    return hitTestCanvasContextMenu(menuLayout, canvasX, canvasY).zone !== "outside";
  }

  private runContextMenuAction(payload: ContextMenuActionPayload | undefined): void {
    if (!payload) return;
    if (payload.kind === "move-vertical-marker") {
      this.callbacks.onVerticalMarkerChange?.(payload.markerId, payload.targetDate);
    }
  }

  private getContextMenuMovableMarkers(): Array<{ id: string; label?: string }> {
    if (this.props.isReadOnly) return [];
    const markers = this.props.verticalMarkers ?? [];
    return markers
      .filter((marker) => marker.movableByContextMenu !== false)
      .map((marker) => ({ id: marker.id, label: marker.label }));
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
    const contentHeight = this.getContentHeight(groupTopics, this.rowHeight);
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
    drawMarkedRegionOverlay({
      ctx,
      groupId,
      contentHeight,
      width,
      markedRegion: this.props.markedRegion,
      destinationGroups: this.props.destinationGroups,
      topicsByGroupId: this.topicsByGroupId,
      startTime: this.internalStartTime,
      endTime: this.internalEndTime,
      margin: MARGIN,
    });
  }

  private drawCurrentTimeIndicator(
    ctx: CanvasRenderingContext2D,
    layout: UnifiedChartLayout,
  ): void {
    drawCurrentTimeIndicator(
      ctx,
      layout,
      this.internalStartTime,
      this.internalEndTime,
      MARGIN,
    );
  }

  private applySuggestionForSlot(slotId: string): void {
    if (!slotId || this.props.isReadOnly) return;
    const suggestion = this.props.suggestions.find((s) => s.slotId === slotId);
    if (!suggestion) return;

    const slot = this.props.slots.find((s) => s.id === slotId);
    if (!slot || slot.readOnly) return;

    const previousRowYBySlotId = this.captureSlotRowYById();
    const previousLayoutByGroupId = this.captureTopicLayoutSnapshotByGroupId();

    slot.destinationId = suggestion.alternativeDestinationId;
    this.cachedProcessedTopics = null;
    this.startSlotReflowAnimationFromPreviousRows(
      previousRowYBySlotId,
      performance.now(),
      previousLayoutByGroupId,
    );
    this.callbacks.onChangeDestinationId?.(slot.id, suggestion.alternativeDestinationId, true);
    this.redraw();
  }

  private hitSuggestionForGroup(
    groupId: string,
    canvasX: number,
    contentY: number,
    width: number,
    groupTopics: Topic[],
  ) {
    if (!suggestionsVisible(this.rowHeight)) return null;
    return hitSuggestionForGroup({
      canvasX,
      contentY,
      width,
      groupTopics,
      suggestions: this.props.suggestions,
      rowHeight: this.rowHeight,
      startTime: this.internalStartTime,
      endTime: this.internalEndTime,
      margin: MARGIN,
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

    return hitVerticalMarkerForGroup({
      groupId,
      canvasX,
      canvasY,
      width,
      layout,
      markers: this.props.verticalMarkers,
      isReadOnly: this.props.isReadOnly,
      startTime: this.internalStartTime,
      endTime: this.internalEndTime,
      margin: MARGIN,
    });
  }

}
