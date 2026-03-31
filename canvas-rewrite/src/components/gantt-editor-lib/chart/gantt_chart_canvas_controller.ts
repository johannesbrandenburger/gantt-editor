import { drawXAxisOnCanvas } from "./canvas_axis";
import {
  setupCanvasPanZoom,
  handlePanZoomWheelEvent,
  clearPanZoomWheelDebounce,
  type PanZoomCleanup,
  type WheelZoomAnchor,
} from "./canvas_pan_zoom";
import {
  computeRowHeightForUnifiedZoom,
  SLOT_RENDER_RATIO,
  slotsAllowLabelsAndInteraction,
} from "./canvas_slot_scale";
import { processData } from "./process-data";
import { drawTopicLines, computeContentHeight, computeTopicLayout } from "./canvas_topics";
import {
  drawSlots,
  hitTestSlotResizeEdge,
  slotTimesForResizeDragStep,
  type SlotResizeEdge,
} from "./canvas_slots";
import {
  computeUnifiedChartLayout,
  hitTestChart,
  canvasLocalPoint,
  anchorYInGroupViewport,
  drawResizeBands,
  type UnifiedChartLayout,
} from "./unified_chart_layout";
import type { GanttEditorSlot, Topic } from "./types";
import type {
  GanttChartCanvasHost,
  GanttEditorCanvasCallbacks,
  GanttEditorCanvasProps,
} from "./gantt_canvas_props";

const X_AXIS_HEIGHT = 50;
/** Fallback before layout; reconciled from visible time span and chart width. */
const DEFAULT_ROW_HEIGHT = 40;
/** Lower bound for unified zoom so many rows fit when fully zoomed out (band ≈ (1−padding)× this). */
const MIN_ROW_HEIGHT = 1;
const MAX_ROW_HEIGHT = 120;

const MARGIN = { left: 200, right: 12 };

// processData only uses slots, destinations, and settings.compactView; it does not use the view
// time range or row height. Omitting those reactive deps keeps pan/zoom from re-running O(n) work
// (row assignment + conflict detection) on every wheel tick.
const PROCESS_DATA_VIEW_PLACEHOLDER_START = new Date(0);
const PROCESS_DATA_VIEW_PLACEHOLDER_END = new Date(86400000);

const CLIPBOARD_STORAGE_KEY = "pointerClipboard";

function destinationGroupsSnapshot(
  groups: GanttEditorCanvasProps["destinationGroups"],
): string {
  return groups.map((g) => `${g.id}:${g.heightPortion}:${g.displayName}`).join("\0");
}

export class GanttChartCanvasController {
  private props: GanttEditorCanvasProps;
  private readonly callbacks: GanttEditorCanvasCallbacks;
  private readonly host: GanttChartCanvasHost;

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

  private hoverResizeBand: string | null = null;

  private resizeObserver: ResizeObserver | null = null;

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

  constructor(
    initialProps: GanttEditorCanvasProps,
    callbacks: GanttEditorCanvasCallbacks,
    host: GanttChartCanvasHost = {},
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
    this.initMapsFromGroups(initialProps.destinationGroups);
  }

  /**
   * Apply the latest model from the host framework. Preserves internal pan/zoom time and local
   * top-content portion until the parent actually changes those inputs (matches prior Vue watches).
   */
  refreshModel(next: GanttEditorCanvasProps): void {
    this.props = next;

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
      }
    }

    const gSnap = destinationGroupsSnapshot(next.destinationGroups);
    if (gSnap !== this.lastDestinationGroupsSnapshot) {
      this.lastDestinationGroupsSnapshot = gSnap;
      this.syncDestinationGroupsFromProps();
    }

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
  }

  attach(container: HTMLElement, canvas: HTMLCanvasElement): void {
    this.detach();
    this.container = container;
    this.canvas = canvas;

    this.containerHeight = container.clientHeight;
    this.containerWidth = container.clientWidth;

    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        this.containerHeight = entry.contentRect.height;
        this.containerWidth = entry.contentRect.width;
        this.reconcileUnifiedZoomRowHeight();
        this.redraw();
        this.maybeNotifyTopContentLayout();
      }
    });
    this.resizeObserver.observe(container);

    canvas.addEventListener("wheel", this.boundCanvasWheel, { passive: false });

    queueMicrotask(() => {
      this.reconcileUnifiedZoomRowHeight();
      this.drawUnifiedFrame();
      this.isInitialized = true;
      this.maybeNotifyTopContentLayout();

      if (this.canvas) {
        this.panZoomCleanup = setupCanvasPanZoom(this.canvas, this.buildPanZoomCallbacks());
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
    document.removeEventListener("mousemove", this.boundTopContentResize);
    document.removeEventListener("mouseup", this.boundStopTopContentResize);
    document.removeEventListener("mousemove", this.boundResize);
    document.removeEventListener("mouseup", this.boundStopResize);
    this.slotResizeDrag = null;
    this.slotResizePreview = null;
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
    clearPanZoomWheelDebounce();
    this.container = null;
    this.canvas = null;
    this.isInitialized = false;
    this.lastNotifiedTopContentHeight = -1;
  }

  updateClipboard(): void {
    const storedData = localStorage.getItem(CLIPBOARD_STORAGE_KEY);
    if (!storedData) {
      this.host.onClipboardItems?.([]);
      return;
    }
    try {
      const parsedData = JSON.parse(storedData) as GanttEditorSlot[];
      this.host.onClipboardItems?.(parsedData);
    } catch (e) {
      console.error("Error updating clipboard content:", e);
      this.host.onClipboardItems?.([]);
    }
  }

  clearClipboard(): void {
    localStorage.setItem(CLIPBOARD_STORAGE_KEY, "[]");
    this.updateClipboard();
    for (const slot of this.props.slots) {
      slot.isCopied = false;
    }
    this.cachedProcessedTopics = null;
  }

  onContainerMouseMove(e: MouseEvent): void {
    this.updateCursorPosition(e);
  }

  onChartMouseMove(e: MouseEvent): void {
    this.updateCursorPosition(e);
    const layout = this.getChartLayout();
    const canvas = this.canvas;
    if (!layout || !canvas) return;
    const nextHover = this.resizeHoverKey(layout, e.clientX, e.clientY);
    if (nextHover !== this.hoverResizeBand) {
      this.hoverResizeBand = nextHover;
      this.redraw();
    } else {
      this.hoverResizeBand = nextHover;
    }
    const pt = canvasLocalPoint(canvas, e.clientX, e.clientY);
    const hit = hitTestChart(layout, pt.x, pt.y);
    let ewResize = false;
    if (hit.type === "group" && !this.props.isReadOnly) {
      const gr = layout.groupRects.get(hit.groupId);
      if (gr) {
        const scroll = this.verticalScrollOffsets.get(hit.groupId) || 0;
        const contentY = pt.y - gr.y + scroll;
        const groupTopics = this.topicsForGroup(hit.groupId);
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
      }
    }
    if (hit.type === "topResize" || hit.type === "betweenResize") {
      canvas.style.cursor = "ns-resize";
    } else if (ewResize) {
      canvas.style.cursor = "ew-resize";
    } else {
      canvas.style.cursor = "";
    }
  }

  onChartMouseLeave(): void {
    this.hoverResizeBand = null;
    const canvas = this.canvas;
    if (canvas) canvas.style.cursor = "";
  }

  onMouseEnter(): void {
    this.host.onClipboardVisibility?.(true);
  }

  onMouseLeave(): void {
    this.host.onClipboardVisibility?.(false);
  }

  onCanvasWheel(event: WheelEvent): void {
    const canvas = this.canvas;
    if (!canvas) return;

    const callbacks = this.buildPanZoomCallbacks();
    if (handlePanZoomWheelEvent(event, canvas, callbacks)) {
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
    if (hit.type === "group") {
      const gr = layout.groupRects.get(hit.groupId);
      if (gr) {
        const scroll = this.verticalScrollOffsets.get(hit.groupId) || 0;
        const contentY = pt.y - gr.y + scroll;
        const groupTopics = this.topicsForGroup(hit.groupId);
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
        }
      }
    }
  }

  getCanvasElement(): HTMLCanvasElement | null {
    return this.canvas;
  }

  /** For bindings that only need layout metrics without running a full draw. */
  getCurrentTopContentHeightPx(): number {
    return this.getChartLayout()?.currentTopContentHeight ?? 0;
  }

  private initMapsFromGroups(groups: GanttEditorCanvasProps["destinationGroups"]): void {
    for (const group of groups) {
      this.currentHeightPortions.set(group.id, group.heightPortion);
      this.verticalScrollOffsets.set(group.id, 0);
    }
  }

  private getChartLayout(): UnifiedChartLayout | null {
    if (this.containerWidth <= 0 || this.containerHeight <= 0) return null;
    if (this.props.destinationGroups.length === 0) return null;
    return computeUnifiedChartLayout({
      containerWidth: this.containerWidth,
      containerHeight: this.containerHeight,
      destinationGroups: this.props.destinationGroups,
      heightPortions: this.currentHeightPortions,
      topContentPortion: this.currentTopContentPortion,
      xAxisHeight: X_AXIS_HEIGHT,
      resizeHandlePx: 3,
    });
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
  private computeProcessDataDeepFingerprint(p: GanttEditorCanvasProps): number {
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
    this.host.onCursorMove?.(e.clientX, e.clientY);
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
    this.slotResizeDrag = null;
    this.slotResizePreview = null;
    this.redraw();

    const prev = this.props.slots.find((s) => s.id === d.slotId);
    if (
      prev &&
      !prev.readOnly &&
      (prev.openTime.getTime() !== openTime.getTime() ||
        prev.closeTime.getTime() !== closeTime.getTime())
    ) {
      this.callbacks.onChangeSlotTime(d.slotId, openTime, closeTime);
    }
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
      const pt = canvasLocalPoint(canvas, wheelAnchor.clientX, wheelAnchor.clientY);
      const hit = hitTestChart(layout, pt.x, pt.y);
      if (hit.type === "group") {
        focusedGroupId = hit.groupId;
        anchorMouseY = anchorYInGroupViewport(
          layout,
          hit.groupId,
          wheelAnchor.clientX,
          wheelAnchor.clientY,
          canvas,
        );
      }
    }

    this.rowHeight = next;

    if (!slotsAllowLabelsAndInteraction(next) && this.slotResizeDrag) {
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
        this.internalStartTime = start;
        this.internalEndTime = end;
        if (wheelZoomAnchor) {
          this.reconcileUnifiedZoomRowHeight(wheelZoomAnchor);
        }
        this.scheduleFrameRedraw(true);
      },
      onTimeRangeCommit: (start: Date, end: Date) => {
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
        showTopicHeaderText: slotsAllowLabelsAndInteraction(this.rowHeight),
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
      });

      ctx.restore();
    }
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
}
