import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Divider,
  Stack,
  Typography,
} from "@mui/material";
import { useGetList, useNotify } from "react-admin";

import {
  clearCurrentSession,
  getCurrentSession,
  readRecentSessions,
  setCurrentSession,
  subscribeSessionChanges,
} from "./utils/session";
import { SessionScopeChip } from "./features/session/components/SessionScopeChip";
import { mergeSessionOptions, normalizeSessionId, type SessionRow } from "./features/session/model";

export const SessionScopePage = () => {
  const notify = useNotify();
  const [session, setSession] = useState(() => getCurrentSession());
  const [recent, setRecent] = useState<string[]>(() => readRecentSessions());
  const { data: backendSessions = [] } = useGetList<SessionRow>(
    "sessions",
    { pagination: { page: 1, perPage: 1000 } },
    { retry: false, staleTime: 30_000 },
  );

  const allSessions = useMemo(
    () => mergeSessionOptions(backendSessions, recent, ""),
    [backendSessions, recent],
  );

  useEffect(() => subscribeSessionChanges(() => setSession(getCurrentSession())), []);

  const activateSession = (value: string) => {
    const normalized = normalizeSessionId(value);
    if (!normalized) {
      return;
    }

    setCurrentSession(normalized);
    setSession(normalized);
    setRecent((prev) => Array.from(new Set([normalized, ...prev])));
    notify(`Session set: ${normalized}`, { type: "info" });
  };

  const activateGlobal = () => {
    clearCurrentSession();
    setSession("");
    notify("Switched to global session", { type: "info" });
  };

  return (
    <Box p={1.5} maxWidth={900}>
      <Card>
        <CardHeader
          title="Session scope"
          subheader="Switch between existing sessions to keep verify/inspect counters deterministic."
        />
        <CardContent>
          <Stack spacing={2}>
            <Alert severity="info">
              Verify compares cumulative call counters in the active session. If you reuse one session for many runs,
              expected counts may look inflated.
            </Alert>

            <Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Active scope
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <SessionScopeChip session={session} />
                <Button size="small" variant="outlined" onClick={activateGlobal}>
                  Use global
                </Button>
              </Stack>
            </Box>

            <Divider />

            <Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Recent and discovered sessions
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {allSessions.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No saved sessions yet.
                  </Typography>
                ) : (
                  allSessions.map((value) => (
                    <Chip
                      key={value}
                      label={value}
                      clickable
                      color={value === session ? "primary" : "default"}
                      onClick={() => activateSession(value)}
                      sx={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                    />
                  ))
                )}
              </Stack>
            </Box>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
};
