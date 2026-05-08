import { useEffect, useState } from "react";
import { AppBar } from "react-admin";
import { Box, IconButton, Menu, MenuItem, Typography } from "@mui/material";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import HubIcon from "@mui/icons-material/Hub";
import { Link as RouterLink, useLocation } from "react-router-dom";
import { clearAuthorizedPhone } from "../../utils/auth";
import { getCurrentSession, subscribeSessionChanges } from "../../utils/session";

const resolveSectionTitle = (pathname: string): string => {
  if (pathname === "/" || pathname === "") return "Dashboard";
  if (pathname.startsWith("/stubs/used")) return "Used Stubs";
  if (pathname.startsWith("/stubs/unused")) return "Unused Stubs";
  if (pathname.startsWith("/stubs")) return "Stubs";
  if (pathname.startsWith("/services")) return "Services";
  if (pathname.startsWith("/descriptors")) return "Descriptors";
  if (pathname.startsWith("/history")) return "History";
  if (pathname.startsWith("/sniffer")) return "Sniffer";
  if (pathname.startsWith("/session")) return "Session Scope";
  if (pathname.startsWith("/verify")) return "Verify";
  if (pathname.startsWith("/inspect")) return "Inspector";

  return "";
};

export const CustomAppBar = () => {
  const location = useLocation();
  const sectionTitle = resolveSectionTitle(location.pathname);
  const [session, setSession] = useState(() => getCurrentSession());
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const isMenuOpen = Boolean(menuAnchorEl);

  useEffect(
    () =>
      subscribeSessionChanges(() => {
        setSession(getCurrentSession());
      }),
    [],
  );

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
      <Box sx={{ position: "relative", width: "100%", display: "flex", alignItems: "center" }}>
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
        {sectionTitle ? (
          <Typography
            variant="subtitle2"
            color="text.secondary"
            sx={{
              mr: 1,
              whiteSpace: "nowrap",
            }}
          >
            {sectionTitle}
          </Typography>
        ) : null}
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
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            display: "inline-flex",
            alignItems: "center",
            gap: 1,
          }}
        >
          <Box
            component={RouterLink}
            to="/session"
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
              Sessions
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
            current session - {session || "none"}
          </Typography>
        </Box>
      </Box>
    </AppBar>
  );
};
