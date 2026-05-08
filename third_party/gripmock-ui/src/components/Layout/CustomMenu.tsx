import { useEffect, useState } from "react";
import { Menu, useGetList, useSidebarState } from "react-admin";
import StorageIcon from "@mui/icons-material/Storage";
import TravelExploreIcon from "@mui/icons-material/TravelExplore";

import { getCurrentSession, subscribeSessionChanges } from "../../utils/session";
import type { SessionRow } from "../../features/session/model";

export const CustomMenu = () => {
  const [sidebarOpen] = useSidebarState();
  const [session, setSession] = useState(() => getCurrentSession());
  const { data: sessions = [], refetch: refetchSessions } = useGetList<SessionRow>(
    "sessions",
    { pagination: { page: 1, perPage: 1000 } },
    { retry: false, staleTime: 0, refetchOnMount: "always", refetchOnWindowFocus: true },
  );
  const sessionExistsInDb = sessions.some((row) => {
    const value = String(row?.id || row?.session || row?.name || "").trim();
    return value !== "" && value === session;
  });

  useEffect(
    () =>
      subscribeSessionChanges(() => {
        setSession(getCurrentSession());
        void refetchSessions();
      }),
    [refetchSessions],
  );

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
      <Menu.Item to="/sniffer" primaryText="Sniffer" leftIcon={<TravelExploreIcon />} />
      {sessionExistsInDb ? <Menu.Item to="/stubs" primaryText="Stubs" leftIcon={<StorageIcon />} /> : null}
    </Menu>
  );
};
