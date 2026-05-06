import { useEffect, useState } from "react";
import { Menu, useSidebarState } from "react-admin";
import { Box, Chip, Typography } from "@mui/material";
import HubIcon from "@mui/icons-material/Hub";
import SpaceDashboardIcon from "@mui/icons-material/SpaceDashboard";

import { getCurrentSession, subscribeSessionChanges } from "../../utils/session";

export const CustomMenu = () => {
  const [session, setSession] = useState(() => getCurrentSession());
  const [sidebarOpen] = useSidebarState();

  useEffect(() => {
    const refresh = () => setSession(getCurrentSession());

    return subscribeSessionChanges(refresh);
  }, []);

  return (
    <Menu
      sx={{
        "& .RaMenuItemLink-root, & .MuiMenuItem-root": {
          borderRadius: 1.5,
          mx: 1,
          my: 0.25,
          px: sidebarOpen ? 1.25 : 0.75,
          justifyContent: sidebarOpen ? "flex-start" : "center",
          transition: "background-color 120ms ease, color 120ms ease, box-shadow 120ms ease",
        },
        "& .RaMenuItemLink-root .MuiListItemIcon-root, & .MuiMenuItem-root .MuiListItemIcon-root": {
          minWidth: sidebarOpen ? 34 : 0,
          mr: sidebarOpen ? 1 : 0,
          justifyContent: "center",
        },
        "& .RaMenuItemLink-root[aria-current='page'], & .MuiMenuItem-root[aria-current='page']": {
          backgroundColor: "rgba(255, 108, 55, 0.16)",
          color: "primary.main",
          borderLeft: "3px solid",
          borderColor: "primary.main",
        },
        "& .RaMenuItemLink-root[aria-current='page'] .MuiListItemIcon-root, & .MuiMenuItem-root[aria-current='page'] .MuiListItemIcon-root": {
          color: "primary.main",
        },
      }}
    >
      <Box
        px={sidebarOpen ? 2 : 1}
        pt={1.25}
        pb={1.5}
        sx={{
          borderBottom: "1px solid",
          borderColor: "divider",
          background: "linear-gradient(180deg, rgba(255,108,55,0.12) 0%, rgba(255,108,55,0) 100%)",
          display: "flex",
          alignItems: sidebarOpen ? "stretch" : "center",
          justifyContent: sidebarOpen ? "initial" : "center",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {sidebarOpen ? (
          <>
            <Typography variant="caption" color="text.secondary">
              Active Session
            </Typography>
            <Chip
              size="small"
              color={session ? "primary" : "default"}
              variant={session ? "filled" : "outlined"}
              label={session || "global"}
              sx={{
                mt: 0.5,
                maxWidth: "100%",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              }}
            />
          </>
        ) : (
          <HubIcon fontSize="small" color={session ? "primary" : "disabled"} />
        )}
      </Box>
      <Menu.Item to="/" primaryText="Dashboard" leftIcon={<SpaceDashboardIcon />} />
      <Menu.ResourceItems />
    </Menu>
  );
};
