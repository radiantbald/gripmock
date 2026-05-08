import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Chip,
  Divider,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import SearchOffRoundedIcon from "@mui/icons-material/SearchOffRounded";
import { useDataProvider, useNotify } from "react-admin";

import { API_CONFIG } from "./constants/api";
import { apiClient } from "./dataProvider/apiClient";
import { getCurrentSession, subscribeSessionChanges } from "./utils/session";
import type { HistoryRecord } from "./types/entities";

type StreamHandlers = {
  onCall: (record: HistoryRecord) => void;
  onError: () => void;
};

const RADIUS_PX = "10px";

const panelHeaderSx = {
  px: 1.25,
  py: 0.875,
  minHeight: 42,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

const panelTitleSx = { fontSize: 13, fontWeight: 700, letterSpacing: 0.15 };
const jsonTextSx = {
  m: 0,
  p: 0,
  whiteSpace: "pre",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: 13,
  lineHeight: 1.28,
  color: "text.primary",
  tabSize: 2,
  cursor: "text",
} as const;

const MAX_ITEMS = 500;
const codeToChipColor = (code?: number) => (code === undefined || code === 0 ? "success" : "error");
const protoMissingErrorMarkers = ["unknown service/method", "method not found"];
const notFoundCode = 5;
const serverTimestampFormatter = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  fractionalSecondDigits: 3,
  hour12: false,
});

const formatServerReceivedAt = (timestamp?: string): string => {
  if (!timestamp) {
    return "-";
  }

  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return timestamp;
  }

  return serverTimestampFormatter.format(parsed);
};

const toSnifferRecord = (record: HistoryRecord): HistoryRecord => {
  const callId = String(record.callId || record.id || "").trim();

  return {
    ...record,
    callId,
    id: callId || record.id,
    request:
      record.request ||
      (Array.isArray(record.requests) && record.requests.length > 0 ? record.requests[0] : undefined),
    response:
      record.response ||
      (Array.isArray(record.responses) && record.responses.length > 0 ? record.responses[0] : undefined),
  };
};

const pushRecord = (records: HistoryRecord[], nextRecord: HistoryRecord): HistoryRecord[] => {
  const normalized = toSnifferRecord(nextRecord);
  const dedupeKey = normalized.callId || normalized.id;
  if (!dedupeKey) {
    return [normalized, ...records].slice(0, MAX_ITEMS);
  }

  const filtered = records.filter((item) => (item.callId || item.id) !== dedupeKey);
  return [normalized, ...filtered].slice(0, MAX_ITEMS);
};

const buildStreamUrl = (session: string): string => {
  const query = new URLSearchParams();
  if (session) {
    query.set("session", session);
  }

  const qs = query.toString();
  return `${API_CONFIG.BASE_URL}/history/stream${qs ? `?${qs}` : ""}`;
};

const parseEvent = (raw: MessageEvent<string>): HistoryRecord | null => {
  if (!raw.data) {
    return null;
  }

  try {
    return JSON.parse(raw.data) as HistoryRecord;
  } catch {
    return null;
  }
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const unwrapRootPayload = (value: unknown): unknown => {
  if (!isPlainObject(value)) {
    return value;
  }

  const keys = Object.keys(value);
  if (keys.length === 1 && keys[0] === "root") {
    return value.root;
  }

  return value;
};

const formatJsonPayload = (value: unknown): string => {
  const normalized = value ?? {};
  try {
    return JSON.stringify(normalized, null, 2);
  } catch {
    return "{}";
  }
};

const formatJsonInlinePayload = (value: unknown, maxLength = 180): string => {
  const normalized = value ?? {};
  try {
    const compact = JSON.stringify(normalized);
    if (!compact) {
      return "{}";
    }

    if (compact.length <= maxLength) {
      return compact;
    }

    return `${compact.slice(0, Math.max(0, maxLength - 3))}...`;
  } catch {
    return "{}";
  }
};

const hasMissingProtoError = (record?: HistoryRecord): boolean => {
  if (!record || record.code !== 12) {
    return false;
  }

  const normalizedError = String(record.error || "").toLowerCase();
  if (!normalizedError) {
    return true;
  }

  return protoMissingErrorMarkers.some((marker) => normalizedError.includes(marker));
};

const subscribeHistoryStream = (session: string, handlers: StreamHandlers): (() => void) => {
  const eventSource = new EventSource(buildStreamUrl(session));

  const onMessage = (event: MessageEvent<string>) => {
    const parsed = parseEvent(event);
    if (parsed) {
      handlers.onCall(parsed);
    }
  };

  eventSource.addEventListener("call", onMessage as EventListener);
  eventSource.onerror = () => handlers.onError();

  return () => {
    eventSource.removeEventListener("call", onMessage as EventListener);
    eventSource.close();
  };
};

export const SnifferPage = () => {
  const notify = useNotify();
  const dataProvider = useDataProvider();
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [activeSession, setActiveSession] = useState(() => getCurrentSession());
  const [isUploadingProto, setIsUploadingProto] = useState(false);
  const [streamRevision, setStreamRevision] = useState(0);
  const [expandedResponseKeys, setExpandedResponseKeys] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => subscribeSessionChanges(() => setActiveSession(getCurrentSession())), []);

  const loadHistorySnapshot = useCallback(async () => {
    const params = new URLSearchParams();
    if (activeSession) {
      params.set("session", activeSession);
    }

    const query = params.toString();
    const payload = await apiClient.request<HistoryRecord[]>(`/history${query ? `?${query}` : ""}`);
    const normalized = payload.map(toSnifferRecord).reverse().slice(0, MAX_ITEMS);
    setRecords(normalized);
    setSelectedId((current) => current || normalized[0]?.callId || normalized[0]?.id || "");
  }, [activeSession]);

  useEffect(() => {
    let cancelled = false;

    loadHistorySnapshot().catch(() => {
      if (!cancelled) {
        setRecords([]);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [loadHistorySnapshot]);

  useEffect(() => {
    const unsubscribe = subscribeHistoryStream(activeSession, {
      onCall: (record) => {
        setRecords((current) => pushRecord(current, record));
        const nextId = String(record.callId || record.id || "").trim();
        if (nextId) {
          setSelectedId((current) => current || nextId);
        }
      },
      onError: () => {
        // SSE reconnects automatically; UI keeps last snapshot.
      },
    });

    return unsubscribe;
  }, [activeSession, streamRevision]);

  const selected = useMemo(
    () => records.find((item) => (item.callId || item.id) === selectedId) || records[0],
    [records, selectedId],
  );
  const showMissingProtoHint = hasMissingProtoError(selected);
  const selectedSession = String(selected?.session || "").trim();
  const suggestedSession = activeSession.trim();
  const selectedPeer = String(selected?.client || "").trim();
  const selectedService = String(selected?.service || "").trim();
  const selectedMethod = String(selected?.method || "").trim();
  const selectedCode = selected?.code;
  const isGlobalSessionCall = !!selected && selectedSession.length === 0;
  const showMissingSessionHint =
    isGlobalSessionCall && (selected.code === notFoundCode || showMissingProtoHint);
  const canAssignPeerSession = isGlobalSessionCall && !!suggestedSession && !!selectedPeer;
  const shouldHideResponsePayload = showMissingProtoHint || showMissingSessionHint;
  const requestPayload = useMemo(() => {
    if (selected?.requests && selected.requests.length > 1) {
      return selected.requests.map((item) => unwrapRootPayload(item));
    }

    return unwrapRootPayload(selected?.request ?? {});
  }, [selected]);
  const requestPayloadText = useMemo(() => formatJsonPayload(requestPayload), [requestPayload]);
  const responseEntries = useMemo(() => {
    const selectedResponses =
      Array.isArray(selected?.responses) && selected.responses.length > 0 ? selected.responses : [];
    const responsePayloads =
      selectedResponses.length > 0 ? selectedResponses : [selected?.response ?? {}];
    const responseTimestamps = Array.isArray(selected?.responseTimestamps) ? selected.responseTimestamps : [];

    return responsePayloads.map((payload, index) => ({
      key: `${index}-${String(responseTimestamps[index] || "")}`,
      payload: unwrapRootPayload(payload),
      timestamp: responseTimestamps[index] || (index === 0 ? selected?.timestamp : undefined),
      index,
    }));
  }, [selected]);
  const orderedResponseEntries = useMemo(() => [...responseEntries].reverse(), [responseEntries]);
  const isSingleResponseView = orderedResponseEntries.length <= 1;
  const singleResponseEntry = orderedResponseEntries[0];
  const responseHeaderTimestamp = isSingleResponseView
    ? formatServerReceivedAt(singleResponseEntry?.timestamp || selected?.timestamp)
    : undefined;

  useEffect(() => {
    setExpandedResponseKeys(() => {
      const latestKey = orderedResponseEntries[0]?.key;
      return latestKey ? new Set([latestKey]) : new Set();
    });
  }, [selected?.callId, selected?.id, orderedResponseEntries]);

  const handleAssignPeerSession = useCallback(async () => {
    if (!selectedPeer) {
      notify("Selected call has no peer identifier.", { type: "warning" });
      return;
    }

    if (!suggestedSession) {
      notify("Select a non-global session first.", { type: "warning" });
      return;
    }

    try {
      await apiClient.request<{ message?: string }>("/sessions/peers", {
        method: "POST",
        body: JSON.stringify({ peer: selectedPeer, session: suggestedSession }),
      });
      notify(`Peer ${selectedPeer} is now routed to session ${suggestedSession}. Retry call.`, {
        type: "success",
      });
    } catch (error) {
      notify((error as Error).message || "Failed to assign peer to session", { type: "warning" });
    }
  }, [notify, selectedPeer, suggestedSession]);

  const handleProtoSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setIsUploadingProto(true);
    try {
      await dataProvider.create("descriptors", { data: { file } });
      notify("Descriptor uploaded. Retry the gRPC call.", { type: "success" });
      await loadHistorySnapshot().catch(() => {
        // Keep current snapshot on refresh failure.
      });
      setStreamRevision((current) => current + 1);
    } catch (error) {
      notify((error as Error).message || "Failed to upload descriptor", { type: "error" });
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setIsUploadingProto(false);
    }
  };

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateRows: "minmax(280px, 1fr) minmax(260px, 1fr)",
        gap: 1.5,
        p: 1.5,
        height: "calc(100vh - 120px)",
      }}
    >
      <Paper
        sx={{
          overflow: "hidden",
          borderRadius: RADIUS_PX,
          border: "1px solid",
          borderColor: "divider",
          boxShadow: "0 10px 28px rgba(0,0,0,0.16)",
        }}
      >
        <Box
          sx={panelHeaderSx}
        >
          <Typography variant="subtitle2" sx={panelTitleSx}>
            Requests
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
            <Chip size="small" variant="outlined" label={`Session: ${activeSession || "global"}`} />
            <Chip size="small" variant="outlined" label={`${records.length} calls`} />
          </Box>
        </Box>
        <Divider />
        <TableContainer sx={{ maxHeight: "100%" }}>
          <Table
            stickyHeader
            size="small"
            sx={{
              "& .MuiTableCell-root": {
                py: 0.45,
                px: 1,
              },
              "& .MuiTableCell-head": {
                py: 0.55,
                fontSize: 11,
              },
              "& .MuiTableRow-root": {
                height: 32,
              },
            }}
          >
            <TableHead>
              <TableRow>
                <TableCell width="24%">client</TableCell>
                <TableCell width="18%">Received by server</TableCell>
                <TableCell width="14%">Service</TableCell>
                <TableCell width="14%">Method</TableCell>
                <TableCell width="8%">Code</TableCell>
                <TableCell width="22%">Session</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {records.map((record) => {
                const id = record.callId || record.id || "";
                const selectedRow = !!id && id === (selected?.callId || selected?.id);
                return (
                  <TableRow
                    hover
                    key={id || `${record.timestamp || ""}-${record.service || ""}-${record.method || ""}`}
                    selected={selectedRow}
                    onClick={() => {
                      if (id) {
                        setSelectedId(id);
                      }
                    }}
                    sx={{
                      cursor: "pointer",
                      "&:hover": {
                        bgcolor: "rgba(255,255,255,0.03)",
                      },
                      "&.Mui-selected": {
                        bgcolor: "rgba(255,255,255,0.06)",
                      },
                      "&.Mui-selected:hover": {
                        bgcolor: "rgba(255,255,255,0.08)",
                      },
                    }}
                  >
                    <TableCell title={record.client || "-"}>
                      <Typography variant="body2" noWrap>
                        {record.client || "-"}
                      </Typography>
                    </TableCell>
                    <TableCell title={record.timestamp || "-"}>
                      {formatServerReceivedAt(record.timestamp)}
                    </TableCell>
                    <TableCell>{record.service || "-"}</TableCell>
                    <TableCell>{record.method || "-"}</TableCell>
                    <TableCell>
                      <Chip size="small" color={codeToChipColor(record.code)} label={record.code ?? 0} />
                    </TableCell>
                    <TableCell>{record.session || "global"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {!selected ? (
        <Paper
          sx={{
            borderRadius: RADIUS_PX,
            border: "1px solid",
            borderColor: "divider",
            boxShadow: "0 10px 28px rgba(0,0,0,0.16)",
            minHeight: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            color: "text.secondary",
          }}
        >
          <Box sx={{ maxWidth: 420, px: 2 }}>
            <SearchOffRoundedIcon sx={{ fontSize: 78, opacity: 0.55, mb: 1.1 }} />
            <Typography variant="h5" sx={{ fontWeight: 600, opacity: 0.9 }}>
              No Selection
            </Typography>
          </Box>
        </Paper>
      ) : (
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5, minHeight: 0 }}>
          <Paper
            sx={{
              overflow: "hidden",
              borderRadius: RADIUS_PX,
              border: "1px solid",
              borderColor: "divider",
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
              boxShadow: "0 10px 28px rgba(0,0,0,0.16)",
            }}
          >
            <Box
              sx={panelHeaderSx}
            >
              <Typography variant="subtitle2" sx={panelTitleSx}>
                Request
              </Typography>
              <Chip
                size="small"
                variant="outlined"
                label={selectedService && selectedMethod ? `${selectedService}.${selectedMethod}` : "No call selected"}
              />
            </Box>
            <Divider />
            <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", p: 1.25 }}>
              <Box component="pre" sx={jsonTextSx}>
                {requestPayloadText}
              </Box>
            </Box>
          </Paper>

          <Paper
            sx={{
              overflow: "hidden",
              borderRadius: RADIUS_PX,
              border: "1px solid",
              borderColor: "divider",
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
              boxShadow: "0 10px 28px rgba(0,0,0,0.16)",
            }}
          >
            <Box
              sx={panelHeaderSx}
            >
              <Typography variant="subtitle2" sx={panelTitleSx}>
                {isSingleResponseView ? "Response" : "Responses"}
              </Typography>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                <Chip size="small" color={codeToChipColor(selectedCode)} variant="outlined" label={`Code: ${selectedCode ?? 0}`} />
                {isSingleResponseView ? (
                  <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
                    {responseHeaderTimestamp}
                  </Typography>
                ) : (
                  <Chip size="small" variant="outlined" label={`${orderedResponseEntries.length} items`} />
                )}
              </Box>
            </Box>
            <Divider />
            <input
              ref={fileInputRef}
              type="file"
              accept=".proto,.pb"
              style={{ display: "none" }}
              onChange={handleProtoSelect}
            />
            {shouldHideResponsePayload ? (
              <Box
                sx={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  px: 2,
                  color: "text.secondary",
                }}
              >
                <Box sx={{ maxWidth: 520 }}>
                  <LockOutlinedIcon sx={{ fontSize: 44, opacity: 0.7, mb: 0.75 }} />
                  <Typography variant="h5" sx={{ fontWeight: 600, mb: 1 }}>
                    Response payload locked
                  </Typography>
                  <Typography variant="body1" sx={{ opacity: 0.85 }}>
                    This response cannot be decoded yet.
                  </Typography>
                  <Typography variant="body1" sx={{ opacity: 0.85 }}>
                    Upload runtime proto and route the peer to a session to view the content.
                  </Typography>
                  <Box
                    sx={{
                      mt: 2.25,
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      gap: 1.25,
                      flexWrap: "wrap",
                    }}
                  >
                    <Button
                      variant="outlined"
                      onClick={handleAssignPeerSession}
                      disabled={!canAssignPeerSession}
                      sx={{ textTransform: "none", fontWeight: 700, borderRadius: RADIUS_PX, px: 2.25, py: 0.9 }}
                    >
                      Assign session
                    </Button>
                    <Button
                      variant="contained"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploadingProto}
                      sx={{ textTransform: "none", fontWeight: 700, borderRadius: RADIUS_PX, px: 2.25, py: 0.9 }}
                    >
                      {isUploadingProto ? "Uploading..." : "Upload proto"}
                    </Button>
                  </Box>
                </Box>
              </Box>
            ) : (
              <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", p: 1.25 }}>
                {isSingleResponseView ? (
                  <Box component="pre" sx={jsonTextSx}>
                    {formatJsonPayload(singleResponseEntry?.payload ?? {})}
                  </Box>
                ) : (
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    {orderedResponseEntries.map((entry) => (
                      <Accordion
                        key={entry.key}
                        disableGutters
                        elevation={0}
                        square
                        expanded={expandedResponseKeys.has(entry.key)}
                        onChange={(_, expanded) => {
                          setExpandedResponseKeys((current) => {
                            const next = new Set(current);
                            if (expanded) {
                              next.add(entry.key);
                            } else {
                              next.delete(entry.key);
                            }
                            return next;
                          });
                        }}
                        sx={{
                          border: "1px solid",
                          borderColor: "divider",
                          borderRadius: RADIUS_PX,
                          overflow: "hidden",
                          "&::before": { display: "none" },
                          bgcolor: "background.paper",
                        }}
                      >
                        <AccordionSummary
                          expandIcon={<ExpandMoreRoundedIcon fontSize="small" />}
                          sx={{
                            px: 1,
                            minHeight: 36,
                            bgcolor: "action.hover",
                            "&.Mui-expanded": { minHeight: 36 },
                            "& .MuiAccordionSummary-content": {
                              my: 0.4,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 1.2,
                            },
                            "& .MuiAccordionSummary-content.Mui-expanded": { my: 0.4 },
                          }}
                        >
                          <Box sx={{ minWidth: 0, display: "flex", alignItems: "center", gap: 0.75 }}>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{
                                minWidth: 0,
                                display: "block",
                                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                maxWidth: "100%",
                              }}
                            >
                              {formatJsonInlinePayload(entry.payload)}
                            </Typography>
                          </Box>
                          <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
                            {formatServerReceivedAt(entry.timestamp || selected?.timestamp)}
                          </Typography>
                        </AccordionSummary>
                        <AccordionDetails
                          sx={{
                            p: 1,
                            borderTop: "1px solid",
                            borderColor: "divider",
                            bgcolor: "background.paper",
                          }}
                        >
                          <Box component="pre" sx={jsonTextSx}>
                            {formatJsonPayload(entry.payload)}
                          </Box>
                        </AccordionDetails>
                      </Accordion>
                    ))}
                  </Box>
                )}
              </Box>
            )}
          </Paper>
        </Box>
      )}
    </Box>
  );
};
