export type PanelRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ViewportSize = {
  width: number;
  height: number;
};

export type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export const PANEL_MARGIN = 20;
export const MIN_PANEL_WIDTH = 320;
export const MIN_PANEL_HEIGHT = 240;
const MOBILE_BREAKPOINT = 900;
const DEFAULT_DESKTOP_MIN_WIDTH = 400;

export const clamp = (value: number, min: number, max: number): number => {
  if (max < min) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
};

const maxWidthForViewport = (viewport: ViewportSize): number =>
  Math.max(MIN_PANEL_WIDTH, viewport.width - PANEL_MARGIN * 2);

const maxHeightForViewport = (viewport: ViewportSize): number =>
  Math.max(MIN_PANEL_HEIGHT, viewport.height - PANEL_MARGIN * 2);

export const clampRect = (
  rect: PanelRect,
  viewport: ViewportSize,
): PanelRect => {
  const width = clamp(
    rect.width,
    MIN_PANEL_WIDTH,
    maxWidthForViewport(viewport),
  );
  const height = clamp(
    rect.height,
    MIN_PANEL_HEIGHT,
    maxHeightForViewport(viewport),
  );
  const maxX = Math.max(PANEL_MARGIN, viewport.width - width - PANEL_MARGIN);
  const maxY = Math.max(PANEL_MARGIN, viewport.height - height - PANEL_MARGIN);

  return {
    x: clamp(rect.x, PANEL_MARGIN, maxX),
    y: clamp(rect.y, PANEL_MARGIN, maxY),
    width,
    height,
  };
};

export const defaultRect = (viewport: ViewportSize): PanelRect => {
  const availableWidth = maxWidthForViewport(viewport);
  const width =
    viewport.width < MOBILE_BREAKPOINT
      ? availableWidth
      : clamp(
          Math.max(viewport.width * 0.33, DEFAULT_DESKTOP_MIN_WIDTH),
          MIN_PANEL_WIDTH,
          availableWidth,
        );
  const height = maxHeightForViewport(viewport);

  return clampRect(
    {
      x: viewport.width - width - PANEL_MARGIN,
      y: PANEL_MARGIN,
      width,
      height,
    },
    viewport,
  );
};

export const maximizedRect = (viewport: ViewportSize): PanelRect =>
  clampRect(
    {
      x: PANEL_MARGIN,
      y: PANEL_MARGIN,
      width: viewport.width - PANEL_MARGIN * 2,
      height: viewport.height - PANEL_MARGIN * 2,
    },
    viewport,
  );

export const moveRect = (
  rect: PanelRect,
  deltaX: number,
  deltaY: number,
  viewport: ViewportSize,
): PanelRect =>
  clampRect(
    {
      ...rect,
      x: rect.x + deltaX,
      y: rect.y + deltaY,
    },
    viewport,
  );

export const resizeRect = (
  rect: PanelRect,
  edge: ResizeEdge,
  deltaX: number,
  deltaY: number,
  viewport: ViewportSize,
): PanelRect => {
  let { x, y, width, height } = rect;
  const growWest = edge.includes("w");
  const growEast = edge.includes("e");
  const growNorth = edge.includes("n");
  const growSouth = edge.includes("s");

  if (growEast) {
    width += deltaX;
  }
  if (growWest) {
    x += deltaX;
    width -= deltaX;
  }
  if (growSouth) {
    height += deltaY;
  }
  if (growNorth) {
    y += deltaY;
    height -= deltaY;
  }

  if (width < MIN_PANEL_WIDTH) {
    if (growWest) {
      x -= MIN_PANEL_WIDTH - width;
    }
    width = MIN_PANEL_WIDTH;
  }
  if (height < MIN_PANEL_HEIGHT) {
    if (growNorth) {
      y -= MIN_PANEL_HEIGHT - height;
    }
    height = MIN_PANEL_HEIGHT;
  }

  return clampRect({ x, y, width, height }, viewport);
};

export const unmaximizeForMove = (
  restored: PanelRect,
  pointerX: number,
  viewport: ViewportSize,
): PanelRect => {
  const next = clampRect(restored, viewport);
  return clampRect(
    {
      ...next,
      x: pointerX - next.width / 2,
    },
    viewport,
  );
};
