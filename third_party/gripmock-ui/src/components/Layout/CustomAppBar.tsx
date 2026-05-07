import { useState } from "react";
import { AppBar } from "react-admin";
import { Box, IconButton, Menu, MenuItem, Typography } from "@mui/material";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import { useLocation } from "react-router-dom";
import { clearAuthorizedPhone } from "../../utils/auth";

const resolveSectionTitle = (pathname: string): string => {
  if (pathname === "/" || pathname === "") return "Dashboard";
  if (pathname.startsWith("/stubs/used")) return "Used Stubs";
  if (pathname.startsWith("/stubs/unused")) return "Unused Stubs";
  if (pathname.startsWith("/stubs")) return "Stubs";
  if (pathname.startsWith("/services")) return "Services";
  if (pathname.startsWith("/descriptors")) return "Descriptors";
  if (pathname.startsWith("/history")) return "History";
  if (pathname.startsWith("/session")) return "Session Scope";
  if (pathname.startsWith("/verify")) return "Verify";
  if (pathname.startsWith("/inspect")) return "Inspector";

  return "";
};

export const CustomAppBar = () => {
  const location = useLocation();
  const sectionTitle = resolveSectionTitle(location.pathname);
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const isMenuOpen = Boolean(menuAnchorEl);

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
    </AppBar>
  );
};
