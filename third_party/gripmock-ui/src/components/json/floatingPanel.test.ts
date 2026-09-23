import { describe, expect, it } from "vitest";

import {
  MIN_PANEL_HEIGHT,
  MIN_PANEL_WIDTH,
  PANEL_MARGIN,
  clampRect,
  defaultRect,
  maximizedRect,
  moveRect,
  resizeRect,
  unmaximizeForMove,
} from "./floatingPanel";

const desktopViewport = { width: 1440, height: 900 };
const mobileViewport = { width: 390, height: 844 };

describe("defaultRect", () => {
  it("anchors the panel to the right edge on desktop", () => {
    const rect = defaultRect(desktopViewport);

    expect(rect.y).toBe(PANEL_MARGIN);
    expect(rect.height).toBe(desktopViewport.height - PANEL_MARGIN * 2);
    expect(rect.width).toBe(Math.max(desktopViewport.width * 0.33, 400));
    expect(rect.x).toBe(desktopViewport.width - rect.width - PANEL_MARGIN);
  });

  it("uses the available width on a narrow viewport", () => {
    const rect = defaultRect(mobileViewport);

    expect(rect.x).toBe(PANEL_MARGIN);
    expect(rect.width).toBe(mobileViewport.width - PANEL_MARGIN * 2);
  });
});

describe("maximizedRect", () => {
  it("fills the viewport with the panel margin", () => {
    expect(maximizedRect(desktopViewport)).toEqual({
      x: PANEL_MARGIN,
      y: PANEL_MARGIN,
      width: desktopViewport.width - PANEL_MARGIN * 2,
      height: desktopViewport.height - PANEL_MARGIN * 2,
    });
  });
});

describe("moveRect", () => {
  it("shifts the panel by the pointer delta", () => {
    const start = { x: 200, y: 80, width: 400, height: 400 };
    expect(moveRect(start, 40, -20, desktopViewport)).toEqual({
      x: 240,
      y: 60,
      width: 400,
      height: 400,
    });
  });

  it("keeps the header inside the viewport", () => {
    const start = { x: PANEL_MARGIN, y: PANEL_MARGIN, width: 400, height: 400 };
    const next = moveRect(start, -400, -400, desktopViewport);

    expect(next.x).toBe(PANEL_MARGIN);
    expect(next.y).toBe(PANEL_MARGIN);
  });
});

describe("resizeRect", () => {
  it("grows from the south-east edge", () => {
    const start = { x: 100, y: 80, width: 400, height: 300 };
    expect(resizeRect(start, "se", 50, 40, desktopViewport)).toEqual({
      x: 100,
      y: 80,
      width: 450,
      height: 340,
    });
  });

  it("does not shrink below the minimum size", () => {
    const start = {
      x: 200,
      y: 200,
      width: MIN_PANEL_WIDTH,
      height: MIN_PANEL_HEIGHT,
    };
    const next = resizeRect(start, "se", -200, -200, desktopViewport);

    expect(next.width).toBe(MIN_PANEL_WIDTH);
    expect(next.height).toBe(MIN_PANEL_HEIGHT);
  });

  it("keeps the opposite corner when shrinking from the north-west", () => {
    const start = { x: 240, y: 200, width: 400, height: 320 };
    const next = resizeRect(start, "nw", 40, 20, desktopViewport);

    expect(next.x).toBe(280);
    expect(next.y).toBe(220);
    expect(next.width).toBe(360);
    expect(next.height).toBe(300);
  });
});

describe("clampRect", () => {
  it("clamps an oversized panel into the viewport", () => {
    const next = clampRect(
      { x: -40, y: -10, width: 4000, height: 3000 },
      desktopViewport,
    );

    expect(next).toEqual(maximizedRect(desktopViewport));
  });
});

describe("unmaximizeForMove", () => {
  it("recenters the restored width under the pointer", () => {
    const restored = { x: 800, y: 40, width: 400, height: 400 };
    const next = unmaximizeForMove(restored, 720, desktopViewport);

    expect(next.width).toBe(400);
    expect(next.height).toBe(400);
    expect(next.x).toBe(520);
    expect(next.y).toBe(40);
  });
});
