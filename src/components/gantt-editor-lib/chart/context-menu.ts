export type CanvasContextMenuItem<TPayload = unknown> = {
  id: string;
  label: string;
  enabled?: boolean;
  payload?: TPayload;
  children?: CanvasContextMenuItem<TPayload>[];
};

export type CanvasContextMenuState<TPayload = unknown> = {
  visible: boolean;
  anchorX: number;
  anchorY: number;
  items: CanvasContextMenuItem<TPayload>[];
  hoverRootIndex: number | null;
  hoverChildIndex: number | null;
  openChildRootIndex: number | null;
};

export type CanvasMenuItemLayout<TPayload = unknown> = {
  index: number;
  id: string;
  label: string;
  enabled: boolean;
  hasChildren: boolean;
  rect: { x: number; y: number; width: number; height: number };
  payload?: TPayload;
};

export type CanvasContextMenuLayout<TPayload = unknown> = {
  rootRect: { x: number; y: number; width: number; height: number };
  rootItems: CanvasMenuItemLayout<TPayload>[];
  childRect: { x: number; y: number; width: number; height: number } | null;
  childItems: CanvasMenuItemLayout<TPayload>[];
};

type BuildLayoutArgs<TPayload> = {
  state: CanvasContextMenuState<TPayload>;
  canvasWidth: number;
  canvasHeight: number;
  measureTextWidth: (text: string) => number;
};

const MENU_MIN_WIDTH = 180;
const MENU_PADDING_X = 12;
const MENU_PADDING_Y = 6;
const MENU_ROW_HEIGHT = 28;
const MENU_EDGE_MARGIN = 8;
const SUBMENU_GAP = 6;
const SUBMENU_ARROW_WIDTH = 16;

function clampMenuRect(
  width: number,
  height: number,
  canvasWidth: number,
  canvasHeight: number,
  preferredX: number,
  preferredY: number,
): { x: number; y: number; width: number; height: number } {
  const x = Math.max(
    MENU_EDGE_MARGIN,
    Math.min(canvasWidth - width - MENU_EDGE_MARGIN, preferredX),
  );
  const y = Math.max(
    MENU_EDGE_MARGIN,
    Math.min(canvasHeight - height - MENU_EDGE_MARGIN, preferredY),
  );
  return { x, y, width, height };
}

function menuWidthFromItems<TPayload>(
  items: CanvasContextMenuItem<TPayload>[],
  measureTextWidth: (text: string) => number,
): number {
  const maxLabelWidth = items.reduce(
    (max, item) => Math.max(max, measureTextWidth(item.label)),
    0,
  );
  const hasChildren = items.some((item) => (item.children?.length ?? 0) > 0);
  return Math.ceil(
    Math.max(
      MENU_MIN_WIDTH,
      MENU_PADDING_X * 2 + maxLabelWidth + (hasChildren ? SUBMENU_ARROW_WIDTH : 0),
    ),
  );
}

function itemLayoutsFromRect<TPayload>(
  items: CanvasContextMenuItem<TPayload>[],
  rect: { x: number; y: number; width: number; height: number },
): CanvasMenuItemLayout<TPayload>[] {
  return items.map((item, index) => ({
    index,
    id: item.id,
    label: item.label,
    enabled: item.enabled !== false,
    hasChildren: (item.children?.length ?? 0) > 0,
    rect: {
      x: rect.x,
      y: rect.y + index * MENU_ROW_HEIGHT,
      width: rect.width,
      height: MENU_ROW_HEIGHT,
    },
    payload: item.payload,
  }));
}

function pointInRect(
  x: number,
  y: number,
  rect: { x: number; y: number; width: number; height: number },
): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

export function buildCanvasContextMenuLayout<TPayload>(
  args: BuildLayoutArgs<TPayload>,
): CanvasContextMenuLayout<TPayload> | null {
  const { state, canvasWidth, canvasHeight, measureTextWidth } = args;
  if (!state.visible || state.items.length === 0) return null;

  const rootWidth = menuWidthFromItems(state.items, measureTextWidth);
  const rootHeight = state.items.length * MENU_ROW_HEIGHT;
  const rootRect = clampMenuRect(
    rootWidth,
    rootHeight,
    canvasWidth,
    canvasHeight,
    state.anchorX,
    state.anchorY,
  );

  const rootItems = itemLayoutsFromRect(state.items, rootRect);

  const childRootIndex =
    state.openChildRootIndex !== null
      ? state.openChildRootIndex
      : state.hoverRootIndex !== null &&
          (state.items[state.hoverRootIndex]?.children?.length ?? 0) > 0
        ? state.hoverRootIndex
        : null;
  if (childRootIndex === null) {
    return { rootRect, rootItems, childRect: null, childItems: [] };
  }

  const childItemsSource = state.items[childRootIndex]?.children ?? [];
  if (childItemsSource.length === 0) {
    return { rootRect, rootItems, childRect: null, childItems: [] };
  }

  const parentItemRect = rootItems[childRootIndex]?.rect;
  if (!parentItemRect) {
    return { rootRect, rootItems, childRect: null, childItems: [] };
  }

  const childWidth = menuWidthFromItems(childItemsSource, measureTextWidth);
  const childHeight = childItemsSource.length * MENU_ROW_HEIGHT;
  const preferRightX = rootRect.x + rootRect.width + SUBMENU_GAP;
  const preferLeftX = rootRect.x - childWidth - SUBMENU_GAP;
  const fitsRight = preferRightX + childWidth + MENU_EDGE_MARGIN <= canvasWidth;
  const childPreferredX = fitsRight ? preferRightX : preferLeftX;
  const childPreferredY = parentItemRect.y;

  const childRect = clampMenuRect(
    childWidth,
    childHeight,
    canvasWidth,
    canvasHeight,
    childPreferredX,
    childPreferredY,
  );

  const childItems = itemLayoutsFromRect(childItemsSource, childRect);
  return { rootRect, rootItems, childRect, childItems };
}

export function hitTestCanvasContextMenu<TPayload>(
  layout: CanvasContextMenuLayout<TPayload>,
  x: number,
  y: number,
): {
  zone: "root" | "child" | "bridge" | "outside";
  rootItem: CanvasMenuItemLayout<TPayload> | null;
  childItem: CanvasMenuItemLayout<TPayload> | null;
} {
  const rootItem = layout.rootItems.find((item) => pointInRect(x, y, item.rect)) ?? null;
  if (rootItem) {
    return { zone: "root", rootItem, childItem: null };
  }

  const childItem = layout.childItems.find((item) => pointInRect(x, y, item.rect)) ?? null;
  if (childItem) {
    return { zone: "child", rootItem: null, childItem };
  }

  if (layout.childRect) {
    const childOnRight = layout.childRect.x >= layout.rootRect.x + layout.rootRect.width;
    const bridgeX0 = childOnRight
      ? layout.rootRect.x + layout.rootRect.width
      : layout.childRect.x + layout.childRect.width;
    const bridgeX1 = childOnRight
      ? layout.childRect.x
      : layout.rootRect.x;
    const bridgeY0 = Math.max(layout.rootRect.y, layout.childRect.y);
    const bridgeY1 = Math.min(
      layout.rootRect.y + layout.rootRect.height,
      layout.childRect.y + layout.childRect.height,
    );

    const hasBridge = bridgeX1 >= bridgeX0 && bridgeY1 >= bridgeY0;
    if (hasBridge && x >= bridgeX0 && x <= bridgeX1 && y >= bridgeY0 && y <= bridgeY1) {
      return { zone: "bridge", rootItem: null, childItem: null };
    }
  }

  return { zone: "outside", rootItem: null, childItem: null };
}

export function drawCanvasContextMenu<TPayload>(
  ctx: CanvasRenderingContext2D,
  layout: CanvasContextMenuLayout<TPayload>,
  state: CanvasContextMenuState<TPayload>,
): void {
  ctx.save();
  ctx.font = "13px sans-serif";
  ctx.textBaseline = "middle";

  const drawPanel = (rect: { x: number; y: number; width: number; height: number }) => {
    const radius = 6;
    ctx.beginPath();
    ctx.moveTo(rect.x + radius, rect.y);
    ctx.lineTo(rect.x + rect.width - radius, rect.y);
    ctx.quadraticCurveTo(rect.x + rect.width, rect.y, rect.x + rect.width, rect.y + radius);
    ctx.lineTo(rect.x + rect.width, rect.y + rect.height - radius);
    ctx.quadraticCurveTo(
      rect.x + rect.width,
      rect.y + rect.height,
      rect.x + rect.width - radius,
      rect.y + rect.height,
    );
    ctx.lineTo(rect.x + radius, rect.y + rect.height);
    ctx.quadraticCurveTo(rect.x, rect.y + rect.height, rect.x, rect.y + rect.height - radius);
    ctx.lineTo(rect.x, rect.y + radius);
    ctx.quadraticCurveTo(rect.x, rect.y, rect.x + radius, rect.y);
    ctx.closePath();

    ctx.fillStyle = "rgba(255, 255, 255, 0.98)";
    ctx.fill();
    ctx.strokeStyle = "#d1d5db";
    ctx.lineWidth = 1;
    ctx.stroke();
  };

  const drawItems = (
    items: CanvasMenuItemLayout<TPayload>[],
    hoveredIndex: number | null,
    showChildrenArrow: boolean,
  ) => {
    for (const item of items) {
      const isHovered = hoveredIndex === item.index;
      if (isHovered) {
        ctx.fillStyle = "rgba(15, 118, 110, 0.12)";
        ctx.fillRect(item.rect.x + 1, item.rect.y + 1, item.rect.width - 2, item.rect.height - 2);
      }

      ctx.fillStyle = item.enabled ? "#111827" : "#9ca3af";
      ctx.fillText(item.label, item.rect.x + MENU_PADDING_X, item.rect.y + item.rect.height / 2);

      if (showChildrenArrow && item.hasChildren) {
        ctx.fillStyle = item.enabled ? "#6b7280" : "#cbd5e1";
        const arrowX = item.rect.x + item.rect.width - MENU_PADDING_X - 4;
        const arrowY = item.rect.y + item.rect.height / 2;
        ctx.beginPath();
        ctx.moveTo(arrowX - 4, arrowY - 5);
        ctx.lineTo(arrowX + 2, arrowY);
        ctx.lineTo(arrowX - 4, arrowY + 5);
        ctx.closePath();
        ctx.fill();
      }
    }
  };

  drawPanel(layout.rootRect);
  drawItems(layout.rootItems, state.hoverRootIndex, true);

  if (layout.childRect && layout.childItems.length > 0) {
    drawPanel(layout.childRect);
    drawItems(layout.childItems, state.hoverChildIndex, false);
  }

  ctx.restore();
}
