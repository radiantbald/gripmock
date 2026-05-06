import { useEffect, useMemo, useState } from "react";
import { AppBar, ToggleThemeButton, useGetList } from "react-admin";
import {
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Tooltip,
  Typography,
} from "@mui/material";
import ClearIcon from "@mui/icons-material/Clear";
import HubIcon from "@mui/icons-material/Hub";
import { useLocation } from "react-router-dom";

import {
  clearCurrentSession,
  getCurrentSession,
  readRecentSessions,
  saveRecentSessions,
  setCurrentSession,
  subscribeSessionChanges,
} from "../../utils/session";
import { mergeSessionOptions, normalizeSessionId, type SessionRow } from "../../features/session/model";

const MAX_RECENT_SESSIONS = 8;

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
  const [session, setSession] = useState(() => getCurrentSession());
  const [recentSessions, setRecentSessions] = useState<string[]>(() => readRecentSessions());
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const { data: backendSessions = [] } = useGetList<SessionRow>(
    "sessions",
    {
      pagination: { page: 1, perPage: 1000 },
    },
    {
      retry: false,
      staleTime: 30_000,
    },
  );

  const options = useMemo(() => {
    return mergeSessionOptions(backendSessions, recentSessions, session);
  }, [backendSessions, recentSessions, session]);

  useEffect(() => subscribeSessionChanges(() => setSession(getCurrentSession())), []);

  const rememberSession = (value: string) => {
    const normalized = normalizeSessionId(value);
    if (!normalized) {
      return;
    }

    const next = [normalized, ...recentSessions.filter((item) => item !== normalized)].slice(
      0,
      MAX_RECENT_SESSIONS,
    );

    setRecentSessions(next);
    saveRecentSessions(next);
  };

  const onSessionChange = (value: string) => {
    const normalized = normalizeSessionId(value);
    setSession(normalized);
    if (!normalized) {
      clearCurrentSession();
      return;
    }

    setCurrentSession(normalized);
    rememberSession(normalized);
  };

  const clearSession = () => {
    onSessionChange("");
  };

  const menuOpen = Boolean(menuAnchor);
  const currentLabel = session ? session : "global";
  const shortCurrentLabel = currentLabel.length > 18 ? `${currentLabel.slice(0, 18)}...` : currentLabel;
  const sectionTitle = resolveSectionTitle(location.pathname);

  return (
    <AppBar toolbar={<ToggleThemeButton />}>
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
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Button
          color="inherit"
          variant="text"
          startIcon={<HubIcon fontSize="small" />}
          onClick={(event) => setMenuAnchor(event.currentTarget)}
          sx={{
            textTransform: "none",
            borderRadius: 6,
            px: 1.5,
            py: 0.5,
            minWidth: 0,
          }}
        >
          <Box
            component="span"
            sx={{
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 13,
            }}
          >
            {shortCurrentLabel}
          </Box>
        </Button>

        <Menu
          anchorEl={menuAnchor}
          open={menuOpen}
          onClose={() => setMenuAnchor(null)}
          transformOrigin={{ horizontal: "right", vertical: "top" }}
          anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
        >
          <MenuItem
            onClick={() => {
              clearSession();
              setMenuAnchor(null);
            }}
          >
            Global session (no header)
          </MenuItem>
          {session ? (
            <MenuItem disabled>
              <Chip size="small" color="primary" label="active" sx={{ mr: 1 }} />
              {session}
            </MenuItem>
          ) : null}
          {options.length > 0 ? <Divider /> : null}
          {options.slice(0, MAX_RECENT_SESSIONS).map((value) => (
            <MenuItem
              key={value}
              onClick={() => {
                onSessionChange(value);
                setMenuAnchor(null);
              }}
              sx={{
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 13,
              }}
            >
              {value}
            </MenuItem>
          ))}
        </Menu>

        {session ? (
          <Tooltip title="Clear session">
            <IconButton size="small" onClick={clearSession} aria-label="clear session" color="inherit">
              <ClearIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        ) : null}
      </Box>
    </AppBar>
  );
};
