import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppBar, useGetList } from "react-admin";
import { Box, IconButton, Menu, MenuItem, Typography } from "@mui/material";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import HubIcon from "@mui/icons-material/Hub";
import { Link as RouterLink, useLocation } from "react-router-dom";
import { clearAuthorizedPhone } from "../../utils/auth";
import { clearCurrentRoom, getCurrentRoom, subscribeRoomChanges } from "../../utils/room";
import { resolveRoomRow, type RoomRow } from "../../features/room/model";

const resolveSectionTitle = (pathname: string): string => {
  if (pathname === "/" || pathname === "") return "Dashboard";
  if (pathname.startsWith("/stubs/used")) return "Used Stubs";
  if (pathname.startsWith("/stubs/unused")) return "Unused Stubs";
  if (pathname.startsWith("/stubs")) return "Stubs";
  if (pathname.startsWith("/services")) return "Services";
  if (pathname.startsWith("/descriptors")) return "Descriptors";
  if (pathname.startsWith("/history")) return "History";
  if (pathname.startsWith("/sniffer")) return "Sniffer";
  if (pathname.startsWith("/clients")) return "Clients";
  if (pathname.startsWith("/sender")) return "Sender";
  if (pathname.startsWith("/room")) return "";
  if (pathname.startsWith("/verify")) return "Verify";
  if (pathname.startsWith("/inspect")) return "Inspector";

  return "";
};

export const CustomAppBar = () => {
  const location = useLocation();
  const sectionTitle = resolveSectionTitle(location.pathname);
  const isRoomPage = location.pathname.startsWith("/room");
  const [room, setRoom] = useState(() => getCurrentRoom());
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const isMenuOpen = Boolean(menuAnchorEl);
  const appBarContentRef = useRef<HTMLDivElement | null>(null);
  const roomScopeSlotRef = useRef<HTMLDivElement | null>(null);
  const [roomScopeSlotLeft, setRoomScopeSlotLeft] = useState<number | null>(null);
  const {
    data: rooms = [],
    isPending: roomsPending,
    error: roomsError,
  } = useGetList<RoomRow>(
    "rooms",
    { pagination: { page: 1, perPage: 1000 } },
    { retry: false, staleTime: 30_000, refetchOnMount: false, refetchOnWindowFocus: false },
  );
  const roomNameById = useMemo(() => {
    const map = new Map<string, string>();
    rooms.forEach((row) => {
      const resolved = resolveRoomRow(row);
      if (resolved) {
        map.set(resolved.id, resolved.name);
      }
    });
    return map;
  }, [rooms]);
  const activeRoomName = room ? String(roomNameById.get(room) || "").trim() : "";

  useEffect(
    () =>
      subscribeRoomChanges(() => {
        setRoom(getCurrentRoom());
      }),
    [],
  );
  useEffect(() => {
    if (roomsPending || roomsError) {
      return;
    }

    if (!room) {
      return;
    }

    if (!roomNameById.has(room)) {
      clearCurrentRoom();
      setRoom("");
    }
  }, [room, roomNameById, roomsError, roomsPending]);

  const updateRoomScopeSlotLeft = useCallback(() => {
    const container = appBarContentRef.current;
    const slot = roomScopeSlotRef.current;
    if (!container || !slot) {
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const slotRect = slot.getBoundingClientRect();
    setRoomScopeSlotLeft(slotRect.left - containerRect.left);
  }, []);

  useEffect(() => {
    updateRoomScopeSlotLeft();
  }, [updateRoomScopeSlotLeft, sectionTitle, isRoomPage]);

  useEffect(() => {
    const handleResize = () => updateRoomScopeSlotLeft();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [updateRoomScopeSlotLeft]);

  const openProfileMenu = (event: React.MouseEvent<HTMLElement>) => {
    setMenuAnchorEl(event.currentTarget);
  };

  const closeProfileMenu = () => {
    setMenuAnchorEl(null);
  };

  const handleLogout = () => {
    closeProfileMenu();
    clearAuthorizedPhone();
  };

  return (
    <AppBar toolbar={null}>
      <Box ref={appBarContentRef} sx={{ position: "relative", width: "100%", display: "flex", alignItems: "center" }}>
        <Typography
          variant="subtitle1"
          sx={{
            fontWeight: 700,
            letterSpacing: 0.2,
            ml: 0.5,
            mr: 1.5,
            whiteSpace: "nowrap",
          }}
        >
          GripMock UI
        </Typography>
        <Box
          ref={roomScopeSlotRef}
          sx={{
            display: "inline-flex",
            alignItems: "center",
            mr: 1,
            minWidth: isRoomPage ? 1 : 0,
            minHeight: 1,
          }}
        >
          {sectionTitle ? (
            <Typography
              variant="subtitle2"
              color="text.secondary"
              sx={{
                whiteSpace: "nowrap",
              }}
            >
              {sectionTitle}
            </Typography>
          ) : null}
        </Box>
        <Box sx={{ flex: 1 }} />
        <IconButton
          color="inherit"
          aria-label="Открыть меню профиля"
          aria-controls={isMenuOpen ? "profile-menu" : undefined}
          aria-haspopup="true"
          aria-expanded={isMenuOpen ? "true" : undefined}
          onClick={openProfileMenu}
        >
          <AccountCircleIcon />
        </IconButton>
        <Menu
          id="profile-menu"
          anchorEl={menuAnchorEl}
          open={isMenuOpen}
          onClose={closeProfileMenu}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
        >
          <MenuItem onClick={handleLogout}>Выйти</MenuItem>
        </Menu>

        <Box
          sx={{
            position: "absolute",
            left: isRoomPage && roomScopeSlotLeft !== null ? `${roomScopeSlotLeft}px` : "50%",
            top: "50%",
            transform: isRoomPage ? "translate(0, -50%)" : "translate(-50%, -50%)",
            display: "inline-flex",
            alignItems: "center",
            gap: 1,
            transition: "left 280ms cubic-bezier(0.22, 1, 0.36, 1), transform 280ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          <Box
            component={RouterLink}
            to="/room"
            sx={{
              height: "calc(100% - 12px)",
              minHeight: 30,
              px: 1.25,
              borderRadius: 1.5,
              border: "1px solid",
              borderColor: "rgba(255, 108, 55, 0.42)",
              background:
                "linear-gradient(120deg, rgba(255, 108, 55, 0.17) 0%, rgba(255, 108, 55, 0.08) 50%, rgba(15, 76, 129, 0.26) 100%)",
              boxShadow: "inset 0 0 0 1px rgba(15, 76, 129, 0.16)",
              display: "inline-flex",
              alignItems: "center",
              gap: 0.85,
              textDecoration: "none",
              color: "inherit",
              transition: "background-color 120ms ease, border-color 120ms ease",
              "&:hover": {
                borderColor: "primary.main",
                background:
                  "linear-gradient(120deg, rgba(255, 108, 55, 0.24) 0%, rgba(255, 108, 55, 0.14) 50%, rgba(15, 76, 129, 0.3) 100%)",
              },
            }}
          >
            <HubIcon sx={{ fontSize: 18, color: "primary.main" }} />
            <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1, whiteSpace: "nowrap" }}>
              Rooms
            </Typography>
          </Box>
          <Typography
            variant="caption"
            sx={{
              display: { xs: "none", md: "inline" },
              maxWidth: 220,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              color: "text.secondary",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            }}
          >
            <Box component="span">current - </Box>
            {room ? (
              <>
                <Box
                  component="span"
                  sx={{
                    fontSize: 11,
                    color: "text.disabled",
                  }}
                >
                  #{room}
                </Box>
                {activeRoomName ? (
                  <Box
                    component="span"
                    sx={{
                      ml: 0.65,
                      fontSize: 13,
                      fontWeight: 600,
                      color: "#D7DCE2",
                    }}
                  >
                    {activeRoomName}
                  </Box>
                ) : null}
              </>
            ) : (
              <Box component="span">global</Box>
            )}
          </Typography>
        </Box>
      </Box>
    </AppBar>
  );
};
