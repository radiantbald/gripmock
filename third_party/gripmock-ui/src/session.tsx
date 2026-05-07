import { useEffect, useMemo, useState } from "react";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import {
  alpha,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useGetList, useNotify, useRefresh } from "react-admin";

import {
  clearCurrentSession,
  getCurrentSession,
  setCurrentSession,
  subscribeSessionChanges,
} from "./utils/session";
import { getAuthorizedPhone, subscribeAuthChanges } from "./utils/auth";
import { API_CONFIG } from "./constants/api";
import { SessionScopeChip } from "./features/session/components/SessionScopeChip";
import { normalizeSessionId, type SessionRow } from "./features/session/model";
import { apiClient } from "./dataProvider/apiClient";

const toDigits = (value: string): string => value.replace(/\D/g, "");
const isMySession = (sessionId: string, phone: string): boolean => {
  const phoneDigits = toDigits(phone);
  if (!phoneDigits) {
    return false;
  }

  const sessionDigits = toDigits(sessionId);
  if (!sessionDigits) {
    return false;
  }

  return sessionDigits.includes(phoneDigits);
};

export const SessionScopePage = () => {
  const notify = useNotify();
  const refresh = useRefresh();
  const [session, setSession] = useState(() => getCurrentSession());
  const [authorizedPhone, setAuthorizedPhone] = useState(() => getAuthorizedPhone());
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteInProgress, setDeleteInProgress] = useState(false);
  const [createInProgress, setCreateInProgress] = useState(false);
  const [newSessionName, setNewSessionName] = useState("");
  const { data: backendSessions = [], refetch: refetchSessions } = useGetList<SessionRow>(
    "sessions",
    { pagination: { page: 1, perPage: 1000 } },
    { retry: false, staleTime: 0, refetchOnMount: "always", refetchOnWindowFocus: true },
  );

  const allSessions = useMemo(
    () =>
      backendSessions
        .map((row) => {
          const sessionId = String(row?.id || "").trim();
          const sessionName = String(row?.session || row?.name || "").trim();
          if (!sessionId || !sessionName) {
            return null;
          }

          return {
            id: sessionId,
            name: sessionName,
          };
        })
        .filter((item): item is { id: string; name: string } => item !== null),
    [backendSessions],
  );

  useEffect(
    () =>
      subscribeSessionChanges(() => {
        setSession(getCurrentSession());
        void refetchSessions();
      }),
    [refetchSessions],
  );
  useEffect(() => subscribeAuthChanges(() => setAuthorizedPhone(getAuthorizedPhone())), []);

  const activateSession = (value: string) => {
    const normalized = normalizeSessionId(value);
    if (!normalized) {
      return;
    }

    setCurrentSession(normalized);
    setSession(normalized);
    notify(`Session set: ${normalized}`, { type: "info" });
  };

  const activateGlobal = () => {
    clearCurrentSession();
    setSession("");
    notify("Switched to global session", { type: "info" });
  };

  const createSession = async () => {
    const normalizedName = normalizeSessionId(newSessionName);
    if (!normalizedName) {
      notify("Enter session name", { type: "warning" });
      return;
    }

    setCreateInProgress(true);
    try {
      const created = await apiClient.request<{ id?: string; name?: string }>("/sessions", {
        method: "POST",
        body: JSON.stringify({ name: normalizedName }),
      });
      const createdID = String(created?.id || "").trim();
      if (!createdID) {
        throw new Error("Failed to create session: missing id");
      }

      setCurrentSession(createdID);
      setSession(createdID);
      refresh();
      await refetchSessions();
      setCreateDialogOpen(false);
      setNewSessionName("");
      notify(`Session created: ${normalizedName} (#${createdID})`, { type: "info" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create session";
      notify(message, { type: "warning" });
    } finally {
      setCreateInProgress(false);
    }
  };

  const deleteSessionData = async () => {
    const targetSession = sessionToDelete;
    if (!targetSession) {
      return;
    }

    setDeleteInProgress(true);
    try {
      type McpPurgeResponse = {
        error?: {
          code?: number;
          message?: string;
        };
        result?: {
          structuredContent?: {
            deletedCount?: number;
            deletedHistoryCount?: number;
            deletedSessionRows?: number;
          };
        };
      };

      const payload = await apiClient.request<McpPurgeResponse>("/mcp", {
        method: "POST",
        headers: {
          Accept: "application/json, text/event-stream",
          [API_CONFIG.SESSION_HEADER]: targetSession,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now(),
          method: "tools/call",
          params: {
            name: "stubs.purge",
            arguments: {
              session: targetSession,
            },
          },
        }),
      });

      if (payload?.error) {
        throw new Error(payload.error.message || "Failed to delete session data");
      }

      if (!payload?.result?.structuredContent) {
        throw new Error("Unexpected MCP response: missing structuredContent");
      }

      const deletedStubs = Number(payload?.result?.structuredContent?.deletedCount || 0);
      const deletedHistory = Number(payload?.result?.structuredContent?.deletedHistoryCount || 0);
      const deletedSessionRows = Number(payload?.result?.structuredContent?.deletedSessionRows || 0);

      if (session === targetSession) {
        activateGlobal();
      }
      refresh();
      await refetchSessions();
      notify(
        `Session data deleted: ${deletedStubs} stubs, ${deletedHistory} history records, ${deletedSessionRows} session rows`,
        { type: "info" },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete session data";
      notify(message, { type: "warning" });
    } finally {
      setDeleteInProgress(false);
      setSessionToDelete(null);
    }
  };

  return (
    <Box p={1.5} width="100%">
      <Card
        sx={{
          borderRadius: 1,
          border: "1px solid",
          borderColor: alpha("#ffffff", 0.14),
          boxShadow: "none",
        }}
      >
        <CardHeader
          title="Session settings"
          subheader="Manage active session and delete scoped data from one place."
          sx={{
            pb: 1,
            "& .MuiCardHeader-title": {
              fontSize: 16,
              fontWeight: 600,
              letterSpacing: 0.2,
            },
            "& .MuiCardHeader-subheader": {
              mt: 0.4,
              fontSize: 12,
              color: "text.secondary",
            },
          }}
        />
        <CardContent sx={{ pt: 0 }}>
          <Stack spacing={2}>
            <Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Active session
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                <SessionScopeChip session={session} />
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => setCreateDialogOpen(true)}
                  sx={{ whiteSpace: "nowrap" }}
                >
                  Create session
                </Button>
              </Stack>
            </Box>

            <Divider />

            <Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Sessions from database
              </Typography>
              {allSessions.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No saved sessions yet.
                </Typography>
              ) : (
                <List
                  disablePadding
                  sx={{
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 1,
                    overflow: "hidden",
                    bgcolor: "background.paper",
                  }}
                >
                  {allSessions.map((item) => {
                    const active = item.id === session;
                    return (
                      <ListItemButton
                        key={item.id}
                        selected={active}
                        onClick={() => activateSession(item.id)}
                        sx={{
                          py: 0.9,
                          px: 1.25,
                          borderBottom: "1px solid",
                          borderBottomColor: "divider",
                          "&:last-of-type": {
                            borderBottom: "none",
                          },
                        }}
                      >
                        {isMySession(item.name, authorizedPhone) ? (
                          <PersonOutlineIcon
                            fontSize="small"
                            sx={{
                              color: "text.secondary",
                              mr: 1,
                            }}
                          />
                        ) : null}
                        <ListItemText
                          primary={item.id}
                          secondary={item.name}
                          primaryTypographyProps={{
                            fontSize: 12.5,
                            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                          }}
                          secondaryTypographyProps={{
                            fontSize: 11.5,
                            color: "text.secondary",
                          }}
                        />
                        <Stack direction="row" spacing={0.75}>
                          {active ? (
                            <Button
                              size="small"
                              variant="outlined"
                              color="warning"
                              onClick={(event) => {
                                event.stopPropagation();
                                activateGlobal();
                              }}
                            >
                              quit
                            </Button>
                          ) : null}
                          <IconButton
                            size="small"
                            color="error"
                            disabled={deleteInProgress}
                            onClick={(event) => {
                              event.stopPropagation();
                              setSessionToDelete(item.id);
                            }}
                            aria-label={`Delete session ${item.id}`}
                          >
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </Stack>
                      </ListItemButton>
                    );
                  })}
                </List>
              )}
            </Box>
          </Stack>
        </CardContent>
      </Card>
      <Dialog
        open={createDialogOpen}
        onClose={() => {
          if (!createInProgress) {
            setCreateDialogOpen(false);
            setNewSessionName("");
          }
        }}
        PaperProps={{
          sx: {
            bgcolor: "#2b3345",
            color: "#e8ebf2",
            borderRadius: 2,
            minWidth: 430,
          },
        }}
      >
        <DialogTitle
          sx={{
            fontSize: 34,
            fontWeight: 500,
            letterSpacing: 0,
            lineHeight: 1.2,
            pb: 1,
          }}
        >
          Create session
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            size="small"
            margin="dense"
            variant="standard"
            label="Session name"
            placeholder="QA regression run"
            value={newSessionName}
            helperText="Session ID will be generated automatically."
            onChange={(event) => setNewSessionName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void createSession();
              }
            }}
            sx={{
              mt: 0.5,
              "& .MuiInputLabel-root": {
                color: alpha("#ffffff", 0.72),
                fontSize: 16,
                lineHeight: 1.2,
                fontWeight: 400,
                transform: "translate(0, -2px) scale(1)",
                transformOrigin: "top left",
              },
              "& .MuiInputLabel-root.Mui-focused": {
                color: alpha("#ffffff", 0.72),
              },
              "& .MuiInput-root": {
                mt: 2,
              },
              "& .MuiInputBase-input": {
                fontFamily: "inherit",
                fontSize: 20,
                fontWeight: 400,
                letterSpacing: 0,
                color: "#c6ccd8",
                py: 0.55,
              },
              "& .MuiInput-underline:before": {
                borderBottomColor: alpha("#ff6c37", 0.55),
              },
              "& .MuiInput-underline:hover:not(.Mui-disabled, .Mui-error):before": {
                borderBottomColor: "#ff6c37",
              },
              "& .MuiInput-underline:after": {
                borderBottomColor: "#ff6c37",
              },
              "& .MuiFormHelperText-root": {
                mt: 1,
                fontSize: 13,
                lineHeight: 1.35,
                color: alpha("#ffffff", 0.64),
              },
            }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            disabled={createInProgress}
            onClick={() => {
              setCreateDialogOpen(false);
              setNewSessionName("");
            }}
            sx={{
              color: "#ff6c37",
              fontWeight: 600,
              textTransform: "none",
              letterSpacing: 0,
            }}
          >
            Cancel
          </Button>
          <Button
            disabled={createInProgress}
            onClick={createSession}
            sx={{
              color: "#ff6c37",
              fontWeight: 600,
              textTransform: "none",
              letterSpacing: 0,
            }}
          >
            {createInProgress ? "Creating..." : "Create"}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={Boolean(sessionToDelete)}
        onClose={() => {
          if (!deleteInProgress) {
            setSessionToDelete(null);
          }
        }}
      >
        <DialogTitle>Delete session data?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will delete all stubs and history records for session{" "}
            <strong>{sessionToDelete || "-"}</strong>. This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button disabled={deleteInProgress} onClick={() => setSessionToDelete(null)}>
            Cancel
          </Button>
          <Button color="error" disabled={deleteInProgress || !sessionToDelete} onClick={deleteSessionData}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
