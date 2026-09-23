import CloseFullscreenRoundedIcon from "@mui/icons-material/CloseFullscreenRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import OpenInFullRoundedIcon from "@mui/icons-material/OpenInFullRounded";
import { Box, IconButton, Modal } from "@mui/material";
import type { ModalProps } from "@mui/material/Modal";
import type { SxProps, Theme } from "@mui/material/styles";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";

import {
  type PanelRect,
  type ResizeEdge,
  clampRect,
  defaultRect,
  maximizedRect,
  moveRect,
  resizeRect,
  unmaximizeForMove,
} from "./floatingPanel";

type FloatingEditorModalProps = {
  open: boolean;
  onClose: NonNullable<ModalProps["onClose"]>;
  onCloseClick: () => void;
  title: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  closeAriaLabel?: string;
};

type PointerSession = {
  pointerId: number;
  lastX: number;
  lastY: number;
  edge?: ResizeEdge;
};

const HANDLE_SIZE = 8;

const headerIconButtonSx = {
  m: 0,
  p: 0,
  width: 18,
  height: 18,
  borderRadius: 0,
  bgcolor: "transparent",
  color: "text.secondary",
  transition: "color 0.15s ease",
  "&:hover": {
    color: "primary.main",
    bgcolor: "transparent",
  },
} as const;

const resizeHandles: { edge: ResizeEdge; sx: SxProps<Theme> }[] = [
  {
    edge: "n",
    sx: {
      top: 0,
      left: HANDLE_SIZE,
      right: HANDLE_SIZE,
      height: HANDLE_SIZE,
      cursor: "ns-resize",
    },
  },
  {
    edge: "s",
    sx: {
      bottom: 0,
      left: HANDLE_SIZE,
      right: HANDLE_SIZE,
      height: HANDLE_SIZE,
      cursor: "ns-resize",
    },
  },
  {
    edge: "e",
    sx: {
      top: HANDLE_SIZE,
      right: 0,
      bottom: HANDLE_SIZE,
      width: HANDLE_SIZE,
      cursor: "ew-resize",
    },
  },
  {
    edge: "w",
    sx: {
      top: HANDLE_SIZE,
      left: 0,
      bottom: HANDLE_SIZE,
      width: HANDLE_SIZE,
      cursor: "ew-resize",
    },
  },
  {
    edge: "ne",
    sx: {
      top: 0,
      right: 0,
      width: HANDLE_SIZE,
      height: HANDLE_SIZE,
      cursor: "nesw-resize",
    },
  },
  {
    edge: "nw",
    sx: {
      top: 0,
      left: 0,
      width: HANDLE_SIZE,
      height: HANDLE_SIZE,
      cursor: "nwse-resize",
    },
  },
  {
    edge: "se",
    sx: {
      bottom: 0,
      right: 0,
      width: HANDLE_SIZE,
      height: HANDLE_SIZE,
      cursor: "nwse-resize",
    },
  },
  {
    edge: "sw",
    sx: {
      bottom: 0,
      left: 0,
      width: HANDLE_SIZE,
      height: HANDLE_SIZE,
      cursor: "nesw-resize",
    },
  },
];

const readViewport = () => ({
  width: window.innerWidth,
  height: window.innerHeight,
});

const isInteractiveTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) {
    return false;
  }
  return Boolean(target.closest("button, input, textarea, [data-no-drag]"));
};

export const FloatingEditorModal = ({
  open,
  onClose,
  onCloseClick,
  title,
  actions,
  children,
  closeAriaLabel = "Close editor",
}: FloatingEditorModalProps) => {
  const [rect, setRect] = useState<PanelRect>(() =>
    typeof window === "undefined"
      ? { x: 20, y: 20, width: 400, height: 600 }
      : defaultRect(readViewport()),
  );
  const [isMaximized, setIsMaximized] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const [dragMode, setDragMode] = useState<"move" | "resize" | null>(null);
  const sessionRef = useRef<PointerSession | null>(null);
  const restoreRectRef = useRef<PanelRect | null>(null);
  const isMaximizedRef = useRef(false);

  if (open && !hasOpened) {
    setHasOpened(true);
    setRect(defaultRect(readViewport()));
    setIsMaximized(false);
  }

  useEffect(() => {
    isMaximizedRef.current = isMaximized;
  }, [isMaximized]);

  useEffect(() => {
    const onResize = () => {
      const nextViewport = readViewport();
      setRect((current) =>
        isMaximizedRef.current
          ? maximizedRect(nextViewport)
          : clampRect(current, nextViewport),
      );
    };

    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, []);

  useEffect(() => {
    if (!dragMode) {
      return;
    }
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";

    const onPointerMove = (event: PointerEvent) => {
      const session = sessionRef.current;
      if (!session || session.pointerId !== event.pointerId) {
        return;
      }

      const deltaX = event.clientX - session.lastX;
      const deltaY = event.clientY - session.lastY;
      session.lastX = event.clientX;
      session.lastY = event.clientY;
      const viewport = readViewport();

      setRect((current) =>
        session.edge
          ? resizeRect(current, session.edge, deltaX, deltaY, viewport)
          : moveRect(current, deltaX, deltaY, viewport),
      );
    };

    const onPointerUp = (event: PointerEvent) => {
      const session = sessionRef.current;
      if (!session || session.pointerId !== event.pointerId) {
        return;
      }
      sessionRef.current = null;
      setDragMode(null);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [dragMode]);

  const beginSession = useCallback(
    (event: ReactPointerEvent<HTMLElement>, edge?: ResizeEdge) => {
      if (event.button !== 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      sessionRef.current = {
        pointerId: event.pointerId,
        lastX: event.clientX,
        lastY: event.clientY,
        edge,
      };
      setDragMode(edge ? "resize" : "move");

      if (!edge && isMaximized) {
        const viewport = readViewport();
        const restored = restoreRectRef.current ?? defaultRect(viewport);
        setIsMaximized(false);
        setRect(unmaximizeForMove(restored, event.clientX, viewport));
      } else if (edge && isMaximized) {
        setIsMaximized(false);
      }
    },
    [isMaximized],
  );

  const handleHeaderPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (isInteractiveTarget(event.target)) {
        return;
      }
      beginSession(event);
    },
    [beginSession],
  );

  const toggleMaximized = useCallback(() => {
    const viewport = readViewport();
    if (isMaximized) {
      setRect(
        clampRect(restoreRectRef.current ?? defaultRect(viewport), viewport),
      );
      setIsMaximized(false);
      return;
    }

    setRect((current) => {
      restoreRectRef.current = current;
      return maximizedRect(viewport);
    });
    setIsMaximized(true);
  }, [isMaximized]);

  return (
    <Modal open={open} onClose={onClose}>
      <Box
        tabIndex={-1}
        sx={{
          position: "fixed",
          left: rect.x,
          top: rect.y,
          width: rect.width,
          height: rect.height,
          bgcolor: "background.paper",
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 1.5,
          p: 1.5,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          outline: "none",
          boxSizing: "border-box",
        }}
      >
        <Box
          onPointerDown={handleHeaderPointerDown}
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            mb: 1,
            cursor: dragMode === "move" ? "grabbing" : "grab",
            touchAction: "none",
          }}
        >
          <Box sx={{ minWidth: 0, flex: 1, userSelect: "none" }}>{title}</Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
            {actions}
            <IconButton
              size="small"
              aria-label={isMaximized ? "Restore editor" : "Maximize editor"}
              onClick={toggleMaximized}
              sx={headerIconButtonSx}
            >
              {isMaximized ? (
                <CloseFullscreenRoundedIcon
                  sx={{ fontSize: 14, display: "block" }}
                />
              ) : (
                <OpenInFullRoundedIcon
                  sx={{ fontSize: 12, display: "block" }}
                />
              )}
            </IconButton>
            <IconButton
              size="small"
              aria-label={closeAriaLabel}
              onClick={onCloseClick}
              sx={headerIconButtonSx}
            >
              <CloseRoundedIcon sx={{ fontSize: 12, display: "block" }} />
            </IconButton>
          </Box>
        </Box>
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {children}
        </Box>
        {resizeHandles.map(({ edge, sx }) => (
          <Box
            key={edge}
            onPointerDown={(event) => {
              beginSession(event, edge);
            }}
            sx={{
              position: "absolute",
              zIndex: 2,
              touchAction: "none",
              ...sx,
            }}
          />
        ))}
      </Box>
    </Modal>
  );
};
