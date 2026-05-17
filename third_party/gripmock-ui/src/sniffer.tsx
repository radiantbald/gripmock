import { ChangeEvent, Fragment, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  IconButton,
  Chip,
  Divider,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import KeyboardArrowUpRoundedIcon from "@mui/icons-material/KeyboardArrowUpRounded";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import SearchOffRoundedIcon from "@mui/icons-material/SearchOffRounded";
import { useCreatePath, useDataProvider, useGetList, useNotify } from "react-admin";
import { Link as RouterLink, useLocation } from "react-router-dom";

import { API_CONFIG } from "./constants/api";
import { apiClient } from "./dataProvider/apiClient";
import { getCurrentRoom, subscribeRoomChanges } from "./utils/room";
import {
  getStubCreatedHistory,
  getStubEditedHistory,
  getStubCallResolutionKind,
  getStubReplacedHistory,
  setStubCallResolutionKind,
} from "./utils/stubEditSignal";
import type { HistoryRecord, StubRecord } from "./types/entities";

type StreamHandlers = {
  onCall: (record: HistoryRecord) => void;
  onError: () => void;
};

const RADIUS_PX = "10px";
const RESIZE_HANDLE_SIZE_PX = 10;
const MIN_TOP_PANEL_RATIO = 0.2;
const MIN_BOTTOM_PANEL_RATIO = 0.25;
const MIN_REQUEST_PANEL_RATIO = 0.2;
const MIN_RESPONSE_PANEL_RATIO = 0.2;
const clampRatio = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

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
const compactSearchBarSx = {
  display: "flex",
  alignItems: "center",
  gap: 0.5,
  px: 1,
  py: 0.25,
  minHeight: 42,
  bgcolor: "#2f3136",
  borderBottom: "1px solid",
  borderColor: "divider",
} as const;
const compactSearchInputSx = {
  "& .MuiInputBase-root": {
    minHeight: 28,
    height: 28,
    bgcolor: "#36393f",
    color: "common.white",
    borderRadius: 1,
  },
  "& .MuiInputBase-input": {
    fontSize: 12,
    py: 0.35,
    px: 1,
  },
  "& .MuiOutlinedInput-notchedOutline": { borderColor: "#575c64" },
} as const;
const compactSearchToggleButtonSx = {
  minWidth: 26,
  width: 26,
  height: 26,
  px: 0,
  fontSize: 11,
  lineHeight: 1,
  textTransform: "none",
  color: "grey.200",
  backgroundColor: "transparent",
  boxShadow: "none",
  "&:hover": {
    backgroundColor: "transparent",
    color: "#FF6C37",
    boxShadow: "none",
  },
  "&.MuiButton-contained": {
    backgroundColor: "transparent",
    color: "#FF6C37",
    boxShadow: "none",
  },
  "&.MuiButton-contained:hover": {
    backgroundColor: "transparent",
    color: "#FF6C37",
    boxShadow: "none",
  },
} as const;
const compactSearchIconButtonSx = {
  width: 26,
  height: 26,
  p: 0,
  color: "grey.200",
  "&:hover": {
    backgroundColor: "transparent",
    color: "#FF6C37",
  },
} as const;
const searchHeaderButtonSx = {
  border: "none",
  borderRadius: 1,
  color: "text.secondary",
  transition: "color 120ms ease",
  "&:hover": {
    backgroundColor: "transparent",
    color: "#FF6C37",
  },
} as const;
const compactSearchCounterSx = {
  minWidth: 48,
  textAlign: "center",
  color: "grey.300",
  fontSize: 12,
  lineHeight: 1,
  transition: "color 120ms ease",
  "&:hover": {
    color: "#FF6C37",
  },
} as const;

const MAX_ITEMS = 500;
const codeToChipColor = (code?: number) => (code === undefined || code === 0 ? "success" : "error");
const protoMissingErrorMarkers = [
  "unknown service/method",
  "method not found",
  "message descriptor not found",
  "not a message descriptor",
];
const missingStubErrorMarkers = ["no matching stub found", "stub not found", "can't find stub", "no stub found"];
const responseSchemaErrorMarkers = [
  "failed to unmarshal json into dynamic message",
  "failed to convert response to dynamic message",
  "failed to marshal map to json",
  "proto:",
];
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

const parseTimestampToMs = (timestamp?: string): number | null => {
  if (!timestamp) {
    return null;
  }

  const parsed = new Date(timestamp).getTime();
  return Number.isNaN(parsed) ? null : parsed;
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

const buildStreamUrl = (room: string): string => {
  const query = new URLSearchParams();
  if (room) {
    query.set("room", room);
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

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const normalizeValue = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const shortServiceName = (service: string): { short: string; hasDot: boolean } => {
  const index = service.lastIndexOf(".");
  if (index === -1) {
    return { short: service, hasDot: false };
  }

  return { short: service.slice(index + 1), hasDot: true };
};
const sameServiceAlias = (leftRaw: unknown, rightRaw: unknown): boolean => {
  const left = normalizeValue(leftRaw);
  const right = normalizeValue(rightRaw);
  if (left === right) {
    return true;
  }

  const leftMeta = shortServiceName(left);
  const rightMeta = shortServiceName(right);
  if (leftMeta.short !== rightMeta.short) {
    return false;
  }

  return !leftMeta.hasDot || !rightMeta.hasDot;
};

type SearchOptions = {
  caseSensitive: boolean;
  wholeWord: boolean;
  useRegex: boolean;
};

type MatchRange = {
  start: number;
  end: number;
  index: number;
};

const hasSearchableContent = (value: unknown): boolean => {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (isPlainObject(value)) {
    return Object.keys(value).length > 0;
  }

  return true;
};

const buildSearchRegex = (query: string, options: SearchOptions): RegExp | null => {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return null;
  }

  const source = options.useRegex ? normalizedQuery : escapeRegExp(normalizedQuery);
  const boundedSource = options.wholeWord ? `\\b(?:${source})\\b` : source;
  const flags = options.caseSensitive ? "g" : "gi";

  try {
    return new RegExp(boundedSource, flags);
  } catch {
    return null;
  }
};

const collectMatchRanges = (text: string, matcher: RegExp | null, offset = 0): MatchRange[] => {
  if (!matcher) {
    return [];
  }

  const ranges: MatchRange[] = [];
  const regex = new RegExp(matcher.source, matcher.flags.includes("g") ? matcher.flags : `${matcher.flags}g`);
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const start = match.index;
    const matchedText = match[0] || "";
    const end = start + matchedText.length;
    ranges.push({ start, end, index: offset + ranges.length });
    if (!matchedText) {
      regex.lastIndex += 1;
    }
  }

  return ranges;
};

const renderHighlightedJsonText = (text: string, ranges: MatchRange[], activeMatchIndex: number): ReactNode => {
  if (!ranges.length) {
    return text;
  }

  const nodes: ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((range, idx) => {
    if (range.start > cursor) {
      nodes.push(<Fragment key={`plain-${idx}`}>{text.slice(cursor, range.start)}</Fragment>);
    }
    const isActive = range.index === activeMatchIndex;
    nodes.push(
      <Box
        component="mark"
        data-match-index={range.index}
        key={`mark-${range.index}`}
        sx={{
          px: 0,
          borderRadius: 0.2,
          bgcolor: isActive ? "#ff9800" : "warning.light",
          color: isActive ? "#1a1a1a" : "warning.contrastText",
        }}
      >
        {text.slice(range.start, range.end)}
      </Box>,
    );
    cursor = range.end;
  });
  if (cursor < text.length) {
    nodes.push(<Fragment key="plain-tail">{text.slice(cursor)}</Fragment>);
  }

  return nodes;
};

const hasMissingProtoError = (record?: HistoryRecord): boolean => {
  if (!record || record.code !== 12) {
    return false;
  }

  const normalizedError = String(record.error || "").toLowerCase();
  if (!normalizedError) {
    return true;
  }

  // Keep lock screen for any Unimplemented response. This is the most stable
  // signal for "runtime proto is missing/incomplete" flows in sniffer.
  return protoMissingErrorMarkers.some((marker) => normalizedError.includes(marker)) || normalizedError.length > 0;
};

const hasMissingStubError = (record?: HistoryRecord): boolean => {
  if (!record || record.code !== notFoundCode) {
    return false;
  }

  const normalizedError = String(record.error || "").toLowerCase();
  if (!normalizedError) {
    return false;
  }

  return missingStubErrorMarkers.some((marker) => normalizedError.includes(marker));
};

const hasResponseSchemaError = (record?: HistoryRecord): boolean => {
  if (!record) {
    return false;
  }

  if (record.code === notFoundCode || record.code === 12) {
    return false;
  }

  const normalizedError = String(record.error || "").toLowerCase();
  if (normalizedError) {
    return responseSchemaErrorMarkers.some((marker) => normalizedError.includes(marker));
  }

  const response = unwrapRootPayload(record.response);
  const isEmptyResponseObject = isPlainObject(response) && Object.keys(response).length === 0;
  const hasNoResponsePayload = response === undefined || response === null;

  // Some invalid stub payload cases come back with stub-defined non-zero
  // gRPC code, no explicit error text and no response payload.
  // The code value itself is not a validator here.
  return (record.code ?? 0) !== 0 && !normalizedError && (isEmptyResponseObject || hasNoResponsePayload);
};

const subscribeHistoryStream = (room: string, handlers: StreamHandlers): (() => void) => {
  const eventSource = new EventSource(buildStreamUrl(room));

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
  const createPath = useCreatePath();
  const location = useLocation();
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [activeRoom, setActiveRoom] = useState(() => getCurrentRoom());
  const [isUploadingProto, setIsUploadingProto] = useState(false);
  const [hasProtoFromApi, setHasProtoFromApi] = useState(false);
  const [hasMethodFromApi, setHasMethodFromApi] = useState(false);
  const [peerBoundRoom, setPeerBoundRoom] = useState("");
  const [recentlyAttachedPeer, setRecentlyAttachedPeer] = useState("");
  const [streamRevision, setStreamRevision] = useState(0);
  const [expandedResponseKeys, setExpandedResponseKeys] = useState<Set<string>>(new Set());
  const [stubCreatedHistory, setStubCreatedHistory] = useState(() => getStubCreatedHistory());
  const [editedStubHistory, setEditedStubHistory] = useState(() => getStubEditedHistory());
  const [stubReplacedHistory, setStubReplacedHistory] = useState(() => getStubReplacedHistory());
  const [showRequestSearch, setShowRequestSearch] = useState(false);
  const [showResponseSearch, setShowResponseSearch] = useState(false);
  const [requestSearchQuery, setRequestSearchQuery] = useState("");
  const [requestSearchOptions, setRequestSearchOptions] = useState<SearchOptions>({
    caseSensitive: false,
    wholeWord: false,
    useRegex: false,
  });
  const [requestActiveMatch, setRequestActiveMatch] = useState(-1);
  const [responseSearchQuery, setResponseSearchQuery] = useState("");
  const [responseSearchOptions, setResponseSearchOptions] = useState<SearchOptions>({
    caseSensitive: false,
    wholeWord: false,
    useRegex: false,
  });
  const [responseActiveMatch, setResponseActiveMatch] = useState(-1);
  const [activeSearchTarget, setActiveSearchTarget] = useState<"request" | "response">("request");
  const [topPanelRatio, setTopPanelRatio] = useState(0.5);
  const [requestPanelRatio, setRequestPanelRatio] = useState(0.5);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const requestSearchInputRef = useRef<HTMLInputElement | null>(null);
  const responseSearchInputRef = useRef<HTMLInputElement | null>(null);
  const requestSearchContainerRef = useRef<HTMLDivElement | null>(null);
  const responseSearchContainerRef = useRef<HTMLDivElement | null>(null);
  const rootLayoutRef = useRef<HTMLDivElement | null>(null);
  const detailsLayoutRef = useRef<HTMLDivElement | null>(null);
  const activeResizeRef = useRef<"rows" | "columns" | null>(null);

  const checkProtoStatus = useCallback(
    async (service: string, method: string): Promise<{ hasMethod: boolean; hasProto: boolean }> => {
      const normalizedService = service.trim();
      const normalizedMethod = method.trim();
      if (!normalizedService || !normalizedMethod) {
        return { hasMethod: false, hasProto: false };
      }

      const query = new URLSearchParams();
      query.set("service", normalizedService);
      query.set("method", normalizedMethod);

      const [methodResult, protoStatusResult] = await Promise.allSettled([
        apiClient.request(
          `/services/${encodeURIComponent(normalizedService)}/methods/${encodeURIComponent(normalizedMethod)}`,
        ),
        apiClient.request<{ exists?: boolean }>(`/proto-metadata/status?${query.toString()}`),
      ]);

      const hasMethod = methodResult.status === "fulfilled";
      const hasProto = protoStatusResult.status === "fulfilled" ? Boolean(protoStatusResult.value?.exists) : false;

      return { hasMethod, hasProto };
    },
    [],
  );

  useEffect(() => subscribeRoomChanges(() => setActiveRoom(getCurrentRoom())), []);

  const loadHistorySnapshot = useCallback(async () => {
    const params = new URLSearchParams();
    if (activeRoom) {
      params.set("room", activeRoom);
    }

    const query = params.toString();
    const payload = await apiClient.request<HistoryRecord[]>(`/history${query ? `?${query}` : ""}`);
    const normalized = payload.map(toSnifferRecord).reverse().slice(0, MAX_ITEMS);
    setRecords(normalized);
    setSelectedId((current) => current || normalized[0]?.callId || normalized[0]?.id || "");
  }, [activeRoom]);

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
    const unsubscribe = subscribeHistoryStream(activeRoom, {
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
  }, [activeRoom, streamRevision]);

  const selected = useMemo(
    () => records.find((item) => (item.callId || item.id) === selectedId) || records[0],
    [records, selectedId],
  );
  const selectedRequestId = String(selected?.callId || selected?.id || "").trim();
  const showMissingProtoHint = hasMissingProtoError(selected);
  const showMissingStubHint = hasMissingStubError(selected);
  const selectedStubId = String(selected?.stubId || "").trim();
  const showResponseSchemaHint = hasResponseSchemaError(selected);
  const selectedRoom = String(selected?.room || "").trim();
  const selectedCallReceivedAtMs = parseTimestampToMs(selected?.timestamp);
  const latestEditedStubEventForSelected = editedStubHistory.find((item) => item.stubId === selectedStubId);
  const latestEditedStubSavedAt = latestEditedStubEventForSelected?.savedAt ?? 0;
  const isEditedSignalFreshForSelectedCall =
    latestEditedStubSavedAt === 0 ||
    selectedCallReceivedAtMs === null ||
    latestEditedStubSavedAt >= selectedCallReceivedAtMs;
  const suggestedRoom = activeRoom.trim();
  const selectedPeer = String(selected?.client || "").trim();
  const selectedService = String(selected?.service || "").trim();
  const selectedMethod = String(selected?.method || "").trim();
  const selectedCode = selected?.code;
  const resolvedPeerRoom = (peerBoundRoom || selectedRoom).trim();
  const isPeerBoundToAnyRoom = resolvedPeerRoom.length > 0;
  const isGlobalRoomCall = !!selected && selectedRoom.length === 0;
  const showMissingRoomHint =
    isGlobalRoomCall && !isPeerBoundToAnyRoom && (selected.code === notFoundCode || showMissingProtoHint);
  const canAssignPeerRoom = !isPeerBoundToAnyRoom && !!suggestedRoom && !!selectedPeer;
  const isPeerAttachedToCurrentRoom = !!suggestedRoom && resolvedPeerRoom === suggestedRoom;
  const shouldShowProtoUploadedHint = hasProtoFromApi && showMissingProtoHint;
  const shouldShowAttachedRoomInfo =
    isGlobalRoomCall &&
    isPeerBoundToAnyRoom &&
    isPeerAttachedToCurrentRoom &&
    !!selectedPeer &&
    recentlyAttachedPeer === selectedPeer;
  const shouldShowCombinedAttachAndProtoHint = shouldShowAttachedRoomInfo && shouldShowProtoUploadedHint;
  const attachedRoomLabel = resolvedPeerRoom;
  const shouldHideResponsePayload = showMissingProtoHint || showMissingRoomHint || shouldShowAttachedRoomInfo;
  const shouldShowMissingStubBlock = !shouldHideResponsePayload && showMissingStubHint;
  const shouldShowInvalidStubBlock = !shouldHideResponsePayload && showResponseSchemaHint;
  const shouldShowResponsePayloadBlock = !shouldHideResponsePayload && !shouldShowInvalidStubBlock && !shouldShowMissingStubBlock;
  const latestReplacedSignalForSelectedCall = stubReplacedHistory.find(
    (item) =>
      sameServiceAlias(item.service, selectedService) &&
      normalizeValue(item.method) === normalizeValue(selectedMethod),
  );
  const latestReplacedSavedAt = latestReplacedSignalForSelectedCall?.savedAt ?? 0;
  const shouldShowStubEditedRetryHint =
    shouldShowInvalidStubBlock &&
    isEditedSignalFreshForSelectedCall &&
    latestEditedStubSavedAt > 0;
  const shouldShowStubReplacedRetryHint =
    shouldShowInvalidStubBlock &&
    latestReplacedSavedAt > 0 &&
    (selectedCallReceivedAtMs === null || latestReplacedSavedAt >= selectedCallReceivedAtMs);
  const persistedResolutionKind = getStubCallResolutionKind(selectedRequestId);
  const resolvedRetryHintKind =
    persistedResolutionKind ||
    (shouldShowStubReplacedRetryHint ? "replaced" : shouldShowStubEditedRetryHint ? "edited" : "");
  const shouldShowResolvedReplacedHint = shouldShowInvalidStubBlock && resolvedRetryHintKind === "replaced";
  const shouldShowResolvedEditedHint = shouldShowInvalidStubBlock && resolvedRetryHintKind === "edited";
  const shouldHideSelectAnotherStubButton = shouldShowResolvedReplacedHint || shouldShowResolvedEditedHint;
  const stubsListPath = useMemo(() => {
    const basePath = createPath({ resource: "stubs", type: "list" });
    if (!selectedService || !selectedMethod) {
      return basePath;
    }

    const filter = encodeURIComponent(JSON.stringify({ service: selectedService, method: selectedMethod }));
    return `${basePath}?filter=${filter}`;
  }, [createPath, selectedMethod, selectedService]);
  const snifferPath = useMemo(() => createPath({ resource: "sniffer", type: "list" }), [createPath]);
  const selectedStubEditPath = useMemo(() => {
    if (!selectedStubId) {
      return createPath({ resource: "stubs", type: "list" });
    }

    return createPath({ resource: "stubs", type: "edit", id: selectedStubId });
  }, [createPath, selectedStubId]);
  const stubCreatePath = useMemo(() => createPath({ resource: "stubs", type: "create" }), [createPath]);
  const selectedServiceAndMethodFilter = useMemo(
    () => ({ service: selectedService, method: selectedMethod }),
    [selectedMethod, selectedService],
  );
  const shouldFetchMatchingStubs = Boolean(selectedService && selectedMethod);
  const { data: matchingStubs = [], total: matchingStubsTotal } = useGetList<StubRecord>(
    "stubs",
    {
      pagination: { page: 1, perPage: 1 },
      sort: { field: "id", order: "DESC" },
      filter: selectedServiceAndMethodFilter,
    },
    { enabled: shouldFetchMatchingStubs, retry: false, staleTime: 30_000, refetchOnWindowFocus: false },
  );
  const hasAnyMatchingStubs = (matchingStubsTotal ?? matchingStubs.length) > 0;
  const canCreateStubFromSelectedCall = Boolean(selectedService && selectedMethod);
  const latestCreatedSignalForSelectedCall = stubCreatedHistory.find(
    (item) =>
      sameServiceAlias(item.service, selectedService) &&
      normalizeValue(item.method) === normalizeValue(selectedMethod),
  );
  const latestCreatedSavedAt = latestCreatedSignalForSelectedCall?.savedAt ?? 0;
  const shouldShowStubCreatedHint =
    shouldShowMissingStubBlock &&
    latestCreatedSavedAt > 0 &&
    (selectedCallReceivedAtMs === null || latestCreatedSavedAt >= selectedCallReceivedAtMs);
  const shouldShowStubAssignedRetryHint =
    shouldShowMissingStubBlock &&
    latestReplacedSavedAt > 0 &&
    (selectedCallReceivedAtMs === null || latestReplacedSavedAt >= selectedCallReceivedAtMs);
  const shouldShowStubCreatedAndAssignedRetryHint = shouldShowStubCreatedHint && shouldShowStubAssignedRetryHint;
  const requestPayload = useMemo(() => {
    if (selected?.requests && selected.requests.length > 1) {
      return selected.requests.map((item) => unwrapRootPayload(item));
    }

    return unwrapRootPayload(selected?.request ?? {});
  }, [selected]);
  const requestPayloadText = useMemo(() => formatJsonPayload(requestPayload), [requestPayload]);
  const hasRequestSearchablePayload = useMemo(() => {
    if (!selected) {
      return false;
    }

    if (Array.isArray(selected.requests) && selected.requests.length > 0) {
      return selected.requests.some((item) => hasSearchableContent(unwrapRootPayload(item)));
    }

    return hasSearchableContent(unwrapRootPayload(selected.request));
  }, [selected]);
  const requestSearchRegex = useMemo(
    () => buildSearchRegex(requestSearchQuery, requestSearchOptions),
    [requestSearchOptions, requestSearchQuery],
  );
  const requestMatchRanges = useMemo(
    () => collectMatchRanges(requestPayloadText, requestSearchRegex),
    [requestPayloadText, requestSearchRegex],
  );
  const requestMatchCount = requestMatchRanges.length;
  const responseEntries = useMemo(() => {
    const selectedResponses =
      Array.isArray(selected?.responses) && selected.responses.length > 0 ? selected.responses : [];
    const responsePayloads =
      selectedResponses.length > 0 ? selectedResponses : [selected?.response ?? {}];
    const responseTimestamps = Array.isArray(selected?.responseTimestamps) ? selected.responseTimestamps : [];

    return responsePayloads.map((payload, index) => {
      const unwrappedPayload = unwrapRootPayload(payload);
      return {
      key: `${index}-${String(responseTimestamps[index] || "")}`,
      payload: unwrappedPayload,
      payloadText: formatJsonPayload(unwrappedPayload),
      timestamp: responseTimestamps[index] || (index === 0 ? selected?.timestamp : undefined),
      index,
      };
    });
  }, [selected]);
  const orderedResponseEntries = useMemo(() => [...responseEntries].reverse(), [responseEntries]);
  const hasResponseSearchablePayload = useMemo(() => {
    if (!selected) {
      return false;
    }

    if (Array.isArray(selected.responses) && selected.responses.length > 0) {
      return selected.responses.some((item) => hasSearchableContent(unwrapRootPayload(item)));
    }

    return hasSearchableContent(unwrapRootPayload(selected.response));
  }, [selected]);
  const responseSearchRegex = useMemo(
    () => buildSearchRegex(responseSearchQuery, responseSearchOptions),
    [responseSearchOptions, responseSearchQuery],
  );
  const responseMatchData = useMemo(() => {
    let offset = 0;
    const byEntry = orderedResponseEntries.map((entry) => {
      const ranges = collectMatchRanges(entry.payloadText, responseSearchRegex, offset);
      offset += ranges.length;
      return { key: entry.key, ranges };
    });

    return {
      totalMatches: offset,
      rangesByEntry: new Map(byEntry.map((item) => [item.key, item.ranges])),
    };
  }, [orderedResponseEntries, responseSearchRegex]);
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

  useEffect(() => {
    setShowRequestSearch(false);
    setShowResponseSearch(false);
    setRequestSearchQuery("");
    setResponseSearchQuery("");
    setRequestActiveMatch(-1);
    setResponseActiveMatch(-1);
  }, [selected?.callId, selected?.id]);

  useEffect(() => {
    if (!showRequestSearch) {
      setRequestActiveMatch(-1);
      return;
    }
    if (requestMatchCount === 0) {
      setRequestActiveMatch(-1);
      return;
    }
    setRequestActiveMatch((current) => (current < 0 || current >= requestMatchCount ? 0 : current));
  }, [requestMatchCount, showRequestSearch]);

  useEffect(() => {
    if (!showResponseSearch) {
      setResponseActiveMatch(-1);
      return;
    }
    if (responseMatchData.totalMatches === 0) {
      setResponseActiveMatch(-1);
      return;
    }
    setResponseActiveMatch((current) => (current < 0 || current >= responseMatchData.totalMatches ? 0 : current));
  }, [responseMatchData.totalMatches, showResponseSearch]);

  useEffect(() => {
    if (!showRequestSearch || requestActiveMatch < 0) {
      return;
    }
    const marker = requestSearchContainerRef.current?.querySelector<HTMLElement>(
      `[data-match-index="${requestActiveMatch}"]`,
    );
    marker?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [requestActiveMatch, requestMatchRanges, showRequestSearch]);

  useEffect(() => {
    if (!showResponseSearch || responseActiveMatch < 0) {
      return;
    }
    const marker = responseSearchContainerRef.current?.querySelector<HTMLElement>(
      `[data-match-index="${responseActiveMatch}"]`,
    );
    marker?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [responseActiveMatch, responseMatchData, showResponseSearch]);

  useEffect(() => {
    if (!showResponseSearch || !responseSearchQuery.trim() || orderedResponseEntries.length <= 1) {
      return;
    }
    setExpandedResponseKeys(new Set(orderedResponseEntries.map((entry) => entry.key)));
  }, [orderedResponseEntries, responseSearchQuery, showResponseSearch]);

  useEffect(() => {
    const syncSignals = () => {
      setStubCreatedHistory(getStubCreatedHistory());
      setEditedStubHistory(getStubEditedHistory());
      setStubReplacedHistory(getStubReplacedHistory());
    };
    const onFocus = () => syncSignals();

    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  useEffect(() => {
    setStubCreatedHistory(getStubCreatedHistory());
    setEditedStubHistory(getStubEditedHistory());
    setStubReplacedHistory(getStubReplacedHistory());
  }, [location.pathname]);

  useEffect(() => {
    if (!selectedRequestId || !shouldShowInvalidStubBlock) {
      return;
    }
    if (persistedResolutionKind) {
      return;
    }

    if (shouldShowStubReplacedRetryHint) {
      setStubCallResolutionKind(selectedRequestId, "replaced");
      return;
    }
    if (shouldShowStubEditedRetryHint) {
      setStubCallResolutionKind(selectedRequestId, "edited");
    }
  }, [
    persistedResolutionKind,
    selectedRequestId,
    shouldShowInvalidStubBlock,
    shouldShowStubEditedRetryHint,
    shouldShowStubReplacedRetryHint,
  ]);

  useEffect(() => {
    const service = selectedService.trim();
    const method = selectedMethod.trim();
    if (!service || !method) {
      setHasMethodFromApi(false);
      setHasProtoFromApi(false);
      return;
    }

    let cancelled = false;
    checkProtoStatus(service, method)
      .then(({ hasMethod, hasProto }) => {
        if (cancelled) {
          return;
        }
        setHasMethodFromApi(hasMethod);
        setHasProtoFromApi(hasProto);
      })
      .catch(() => {
        if (!cancelled) {
          setHasMethodFromApi(false);
          setHasProtoFromApi(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [checkProtoStatus, selectedMethod, selectedService]);

  useEffect(() => {
    const peer = selectedPeer.trim();
    if (!peer) {
      setPeerBoundRoom(selectedRoom);
      return;
    }

    let cancelled = false;
    apiClient
      .request<{ room?: string; bound?: boolean }>(`/rooms/peers/status?peer=${encodeURIComponent(peer)}`)
      .then((payload) => {
        if (cancelled) {
          return;
        }
        const boundRoom = String(payload?.room || "").trim();
        setPeerBoundRoom(boundRoom || selectedRoom);
      })
      .catch(() => {
        if (!cancelled) {
          setPeerBoundRoom(selectedRoom);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedPeer, selectedRoom]);

  const handleAssignPeerRoom = useCallback(async () => {
    if (!selectedPeer) {
      notify("Selected call has no peer identifier.", { type: "warning" });
      return;
    }

    if (!suggestedRoom) {
      notify("Select a non-global room first.", { type: "warning" });
      return;
    }

    try {
      await apiClient.request<{ message?: string }>("/rooms/peers", {
        method: "POST",
        body: JSON.stringify({ peer: selectedPeer, room: suggestedRoom }),
      });
      setPeerBoundRoom(suggestedRoom);
      setRecentlyAttachedPeer(selectedPeer);
    } catch (error) {
      notify((error as Error).message || "Failed to assign peer to room", { type: "warning" });
    }
  }, [notify, selectedPeer, suggestedRoom]);

  const handleProtoSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setIsUploadingProto(true);
    try {
      await dataProvider.create("descriptors", { data: { file } });
      const { hasMethod, hasProto } = await checkProtoStatus(selectedService, selectedMethod);
      setHasMethodFromApi(hasMethod);
      setHasProtoFromApi(hasProto);
      notify("Descriptor uploaded.", { type: "success" });
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

  const stepRequestMatch = (direction: 1 | -1) => {
    if (requestMatchCount === 0) {
      return;
    }
    setRequestActiveMatch((current) => {
      const safeCurrent = current < 0 ? 0 : current;
      return (safeCurrent + direction + requestMatchCount) % requestMatchCount;
    });
  };

  const stepResponseMatch = (direction: 1 | -1) => {
    if (responseMatchData.totalMatches === 0) {
      return;
    }
    setResponseActiveMatch((current) => {
      const safeCurrent = current < 0 ? 0 : current;
      return (safeCurrent + direction + responseMatchData.totalMatches) % responseMatchData.totalMatches;
    });
  };

  const toggleSearchOption = (target: "request" | "response", option: keyof SearchOptions) => {
    if (target === "request") {
      setRequestSearchOptions((current) => ({ ...current, [option]: !current[option] }));
      return;
    }
    setResponseSearchOptions((current) => ({ ...current, [option]: !current[option] }));
  };

  const openRequestSearch = useCallback(() => {
    if (!hasRequestSearchablePayload) {
      return;
    }
    setShowRequestSearch(true);
  }, [hasRequestSearchablePayload]);

  const closeRequestSearch = useCallback(() => {
    setShowRequestSearch(false);
    setRequestSearchQuery("");
    setRequestActiveMatch(-1);
  }, []);

  const openResponseSearch = useCallback(() => {
    if (!shouldShowResponsePayloadBlock || !hasResponseSearchablePayload) {
      return;
    }
    setShowResponseSearch(true);
  }, [hasResponseSearchablePayload, shouldShowResponsePayloadBlock]);

  const closeResponseSearch = useCallback(() => {
    setShowResponseSearch(false);
    setResponseSearchQuery("");
    setResponseActiveMatch(-1);
  }, []);

  useEffect(() => {
    if (!showRequestSearch) {
      return;
    }
    requestSearchInputRef.current?.focus();
    requestSearchInputRef.current?.select();
  }, [showRequestSearch]);

  useEffect(() => {
    if (!showResponseSearch) {
      return;
    }
    responseSearchInputRef.current?.focus();
    responseSearchInputRef.current?.select();
  }, [showResponseSearch]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "f" || (!event.metaKey && !event.ctrlKey)) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const isSnifferSearchInputTarget =
        target === requestSearchInputRef.current || target === responseSearchInputRef.current;
      const isEditableTarget =
        target?.isContentEditable ||
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT";
      if (isEditableTarget && !isSnifferSearchInputTarget) {
        return;
      }

      const preferredTarget = activeSearchTarget;
      const canOpenRequest = hasRequestSearchablePayload;
      const canOpenResponse = shouldShowResponsePayloadBlock && hasResponseSearchablePayload;
      if (!canOpenRequest && !canOpenResponse) {
        return;
      }

      event.preventDefault();
      if (preferredTarget === "response") {
        if (canOpenResponse) {
          if (showResponseSearch) {
            closeResponseSearch();
          } else {
            openResponseSearch();
          }
        } else if (canOpenRequest) {
          if (showRequestSearch) {
            closeRequestSearch();
          } else {
            openRequestSearch();
          }
        }
        return;
      }

      if (canOpenRequest) {
        if (showRequestSearch) {
          closeRequestSearch();
        } else {
          openRequestSearch();
        }
      } else if (canOpenResponse) {
        if (showResponseSearch) {
          closeResponseSearch();
        } else {
          openResponseSearch();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    activeSearchTarget,
    closeRequestSearch,
    closeResponseSearch,
    hasRequestSearchablePayload,
    hasResponseSearchablePayload,
    openRequestSearch,
    openResponseSearch,
    showRequestSearch,
    showResponseSearch,
    shouldShowResponsePayloadBlock,
  ]);

  useEffect(() => {
    const stopResize = () => {
      activeResizeRef.current = null;
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
    };

    const handlePointerMove = (event: PointerEvent) => {
      const activeResize = activeResizeRef.current;
      if (!activeResize) {
        return;
      }

      if (activeResize === "rows") {
        const root = rootLayoutRef.current;
        if (!root) {
          return;
        }
        const rect = root.getBoundingClientRect();
        if (rect.height <= 0) {
          return;
        }
        const nextRatio = clampRatio(
          (event.clientY - rect.top) / rect.height,
          MIN_TOP_PANEL_RATIO,
          1 - MIN_BOTTOM_PANEL_RATIO,
        );
        setTopPanelRatio(nextRatio);
        return;
      }

      const details = detailsLayoutRef.current;
      if (!details) {
        return;
      }
      const rect = details.getBoundingClientRect();
      if (rect.width <= 0) {
        return;
      }
      const nextRatio = clampRatio(
        (event.clientX - rect.left) / rect.width,
        MIN_REQUEST_PANEL_RATIO,
        1 - MIN_RESPONSE_PANEL_RATIO,
      );
      setRequestPanelRatio(nextRatio);
    };

    const handlePointerUp = () => stopResize();

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      stopResize();
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, []);

  return (
    <Box
      ref={rootLayoutRef}
      sx={{
        position: "relative",
        display: "grid",
        gridTemplateRows: `minmax(150px, ${topPanelRatio}fr) minmax(150px, ${1 - topPanelRatio}fr)`,
        p: 0,
        height: "100%",
        minHeight: 0,
      }}
    >
      <Paper
        sx={{
          overflow: "hidden",
          borderRadius: `${RADIUS_PX} ${RADIUS_PX} 0 0`,
          border: "1px solid",
          borderColor: "divider",
          borderBottom: 0,
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
            <Chip size="small" variant="outlined" label={`Room: ${activeRoom || "global"}`} />
            <Chip size="small" variant="outlined" label={`${records.length} calls`} />
          </Box>
        </Box>
        <Divider />
        <TableContainer
          sx={{
            maxHeight: "100%",
            height: "100%",
            backgroundImage:
              "repeating-linear-gradient(to bottom, rgba(255,255,255,0.012) 0px, rgba(255,255,255,0.012) 32px, transparent 32px, transparent 64px)",
          }}
        >
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
                <TableCell width="22%">Room</TableCell>
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
                        bgcolor: "rgba(255,255,255,0.028)",
                      },
                      "&.Mui-selected": {
                        bgcolor: "rgba(255,255,255,0.055)",
                      },
                      "&.Mui-selected:hover": {
                        bgcolor: "rgba(255,255,255,0.075)",
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
                    <TableCell>{record.room || "global"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
      <Box
        role="separator"
        aria-label="Resize request list and payload panels"
        onPointerDown={(event) => {
          event.preventDefault();
          activeResizeRef.current = "rows";
          document.body.style.cursor = "row-resize";
          document.body.style.userSelect = "none";
        }}
        sx={{
          position: "absolute",
          left: 0,
          right: 0,
          top: `calc(${(topPanelRatio * 100).toFixed(3)}% - ${RESIZE_HANDLE_SIZE_PX / 2}px)`,
          height: `${RESIZE_HANDLE_SIZE_PX}px`,
          cursor: "row-resize",
          touchAction: "none",
          zIndex: 3,
          backgroundColor: "transparent",
        }}
      />

      {!selected ? (
        <Paper
          sx={{
            borderRadius: `0 0 ${RADIUS_PX} ${RADIUS_PX}`,
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
        <Box
          ref={detailsLayoutRef}
          sx={{
            position: "relative",
            display: "grid",
            gridTemplateColumns: `minmax(220px, ${requestPanelRatio}fr) minmax(220px, ${1 - requestPanelRatio}fr)`,
            gap: 0,
            minHeight: 0,
          }}
        >
          <Paper
            onMouseDownCapture={() => setActiveSearchTarget("request")}
            onFocusCapture={() => setActiveSearchTarget("request")}
            sx={{
              overflow: "hidden",
              borderRadius: `0 0 0 ${RADIUS_PX}`,
              border: "1px solid",
              borderColor: "divider",
              borderRight: 0,
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
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                <Chip
                  size="small"
                  variant="outlined"
                  label={selectedService && selectedMethod ? `${selectedService}.${selectedMethod}` : "No call selected"}
                />
                {hasRequestSearchablePayload ? (
                  <IconButton
                    size="small"
                    onClick={() => {
                      if (showRequestSearch) {
                        closeRequestSearch();
                      } else {
                        openRequestSearch();
                      }
                    }}
                    sx={searchHeaderButtonSx}
                  >
                    <SearchRoundedIcon fontSize="small" />
                  </IconButton>
                ) : null}
              </Box>
            </Box>
            <Divider />
            {showRequestSearch && hasRequestSearchablePayload ? (
              <>
                <Box
                  sx={compactSearchBarSx}
                >
                  <TextField
                    inputRef={requestSearchInputRef}
                    value={requestSearchQuery}
                    onChange={(event) => setRequestSearchQuery(event.target.value)}
                    size="small"
                    fullWidth
                    placeholder="Find"
                    sx={compactSearchInputSx}
                  />
                  <Button
                    size="small"
                    variant={requestSearchOptions.caseSensitive ? "contained" : "text"}
                    onClick={() => toggleSearchOption("request", "caseSensitive")}
                    sx={compactSearchToggleButtonSx}
                  >
                    Aa
                  </Button>
                  <Button
                    size="small"
                    variant={requestSearchOptions.wholeWord ? "contained" : "text"}
                    onClick={() => toggleSearchOption("request", "wholeWord")}
                    sx={compactSearchToggleButtonSx}
                  >
                    ab
                  </Button>
                  <Button
                    size="small"
                    variant={requestSearchOptions.useRegex ? "contained" : "text"}
                    onClick={() => toggleSearchOption("request", "useRegex")}
                    sx={compactSearchToggleButtonSx}
                  >
                    .*
                  </Button>
                  <Typography variant="body2" sx={compactSearchCounterSx}>
                    {requestMatchCount > 0 ? `${requestActiveMatch + 1} of ${requestMatchCount}` : "0 of 0"}
                  </Typography>
                  <IconButton
                    size="small"
                    onClick={() => stepRequestMatch(-1)}
                    disabled={requestMatchCount === 0}
                    sx={compactSearchIconButtonSx}
                  >
                    <KeyboardArrowUpRoundedIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => stepRequestMatch(1)}
                    disabled={requestMatchCount === 0}
                    sx={compactSearchIconButtonSx}
                  >
                    <KeyboardArrowDownRoundedIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => {
                      closeRequestSearch();
                    }}
                    sx={compactSearchIconButtonSx}
                  >
                    <CloseRoundedIcon fontSize="small" />
                  </IconButton>
                </Box>
              </>
            ) : null}
            <Box ref={requestSearchContainerRef} sx={{ flex: 1, minHeight: 0, overflow: "auto", p: 1.25 }}>
              <Box component="pre" sx={jsonTextSx}>
                {renderHighlightedJsonText(requestPayloadText, requestMatchRanges, requestActiveMatch)}
              </Box>
            </Box>
          </Paper>
          <Box
            role="separator"
            aria-label="Resize request and response panels"
            onPointerDown={(event) => {
              event.preventDefault();
              activeResizeRef.current = "columns";
              document.body.style.cursor = "col-resize";
              document.body.style.userSelect = "none";
            }}
            sx={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: `calc(${(requestPanelRatio * 100).toFixed(3)}% - ${RESIZE_HANDLE_SIZE_PX / 2}px)`,
              width: `${RESIZE_HANDLE_SIZE_PX}px`,
              cursor: "col-resize",
              touchAction: "none",
              zIndex: 3,
              backgroundColor: "transparent",
            }}
          />

          <Paper
            onMouseDownCapture={() => setActiveSearchTarget("response")}
            onFocusCapture={() => setActiveSearchTarget("response")}
            sx={{
              overflow: "hidden",
              borderRadius: `0 0 ${RADIUS_PX} 0`,
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
                {shouldShowResponsePayloadBlock && hasResponseSearchablePayload ? (
                  <IconButton
                    size="small"
                    onClick={() => {
                      if (showResponseSearch) {
                        closeResponseSearch();
                      } else {
                        openResponseSearch();
                      }
                    }}
                    sx={searchHeaderButtonSx}
                  >
                    <SearchRoundedIcon fontSize="small" />
                  </IconButton>
                ) : null}
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
                    Upload runtime proto and route the peer to a room to view the content.
                  </Typography>
                  <Box
                    sx={{
                      mt: 2.25,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "center",
                      alignItems: "center",
                      gap: 0.85,
                    }}
                  >
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        gap: 1.25,
                        flexWrap: "wrap",
                      }}
                    >
                      {shouldShowCombinedAttachAndProtoHint ? (
                        <Typography variant="body2" color="success.main" sx={{ fontWeight: 700 }}>
                          {`Protofile uploaded and Room ${attachedRoomLabel} attached - Retry request`}
                        </Typography>
                      ) : shouldShowAttachedRoomInfo ? (
                        <Typography variant="body2" color="success.main" sx={{ fontWeight: 700 }}>
                          {`Room ${attachedRoomLabel} attached`}
                        </Typography>
                      ) : !isPeerBoundToAnyRoom ? (
                        <Button
                          variant="outlined"
                          onClick={handleAssignPeerRoom}
                          disabled={!canAssignPeerRoom}
                          sx={{ textTransform: "none", fontWeight: 700, borderRadius: RADIUS_PX, px: 2.25, py: 0.9 }}
                        >
                          Assign current room
                        </Button>
                      ) : null}
                      {shouldShowCombinedAttachAndProtoHint ? null : shouldShowProtoUploadedHint ? (
                        <Typography variant="body2" color="success.main" sx={{ fontWeight: 700 }}>
                          Protofile uploaded
                        </Typography>
                      ) : (
                        <Button
                          variant="contained"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isUploadingProto}
                          sx={{ textTransform: "none", fontWeight: 700, borderRadius: RADIUS_PX, px: 2.25, py: 0.9 }}
                        >
                          {isUploadingProto ? "Uploading..." : "Upload proto"}
                        </Button>
                      )}
                    </Box>
                  </Box>
                </Box>
              </Box>
            ) : shouldShowInvalidStubBlock ? (
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
                  <ErrorOutlineRoundedIcon sx={{ fontSize: 44, opacity: 0.75, mb: 0.75, color: "error.main" }} />
                  <Typography variant="h5" sx={{ fontWeight: 600, mb: 1 }}>
                    Invalid stub response
                  </Typography>
                  <Typography variant="body1" sx={{ opacity: 0.85 }}>
                    Selected stub response does not match the proto schema.
                  </Typography>
                  <Typography variant="body1" sx={{ opacity: 0.85 }}>
                    Open the selected stub and fix its output payload.
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
                    {shouldShowResolvedReplacedHint ? (
                      <Typography variant="body2" color="success.main" sx={{ fontWeight: 700 }}>
                        Stub replaced - Retry Call
                      </Typography>
                    ) : shouldShowResolvedEditedHint ? (
                      <Typography variant="body2" color="success.main" sx={{ fontWeight: 700 }}>
                        Stub edited - retry call
                      </Typography>
                    ) : selectedStubId ? (
                      <Button
                        variant="contained"
                        component={RouterLink}
                        to={selectedStubEditPath}
                        state={{ returnTo: snifferPath }}
                        sx={{ textTransform: "none", fontWeight: 700, borderRadius: RADIUS_PX, px: 2.25, py: 0.9 }}
                      >
                        Edit selected stub
                      </Button>
                    ) : null}
                    {shouldHideSelectAnotherStubButton ? null : (
                      <Button
                        variant="outlined"
                        component={RouterLink}
                        to={stubsListPath}
                        disabled={!hasMethodFromApi}
                        sx={{ textTransform: "none", fontWeight: 700, borderRadius: RADIUS_PX, px: 2.25, py: 0.9 }}
                      >
                        Select another stub
                      </Button>
                    )}
                  </Box>
                </Box>
              </Box>
            ) : shouldShowMissingStubBlock ? (
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
                  <SearchOffRoundedIcon sx={{ fontSize: 44, opacity: 0.75, mb: 0.75 }} />
                  <Typography variant="h5" sx={{ fontWeight: 600, mb: 1 }}>
                    No stub assigned
                  </Typography>
                  <Typography variant="body1" sx={{ opacity: 0.85 }}>
                    No stub is assigned for this call.
                  </Typography>
                  <Typography variant="body1" sx={{ opacity: 0.85 }}>
                    {hasAnyMatchingStubs
                      ? "Stubs exist for this service/method, but none is assigned to this call. Assign an existing stub or create a new one."
                      : "No stubs exist for this service/method yet. Create one for this call."}
                  </Typography>
                  <Box sx={{ mt: 2.25, display: "flex", justifyContent: "center", alignItems: "center", gap: 1.25 }}>
                    {shouldShowStubCreatedAndAssignedRetryHint ? (
                      <Typography variant="body2" color="success.main" sx={{ fontWeight: 700 }}>
                        Stub created and assigned - retry call
                      </Typography>
                    ) : shouldShowStubAssignedRetryHint ? (
                      <Typography variant="body2" color="success.main" sx={{ fontWeight: 700 }}>
                        Stub assigned - retry call
                      </Typography>
                    ) : shouldShowStubCreatedHint ? (
                      <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 700 }}>
                        Stub created
                      </Typography>
                    ) : null}
                    {shouldShowStubAssignedRetryHint ? null : (
                      <>
                        {hasAnyMatchingStubs ? (
                          <Button
                            variant="outlined"
                            component={RouterLink}
                            to={stubsListPath}
                            state={{ returnTo: snifferPath }}
                            sx={{ textTransform: "none", fontWeight: 700, borderRadius: RADIUS_PX, px: 2.25, py: 0.9 }}
                          >
                            Assign stub
                          </Button>
                        ) : null}
                        {shouldShowStubCreatedHint ? null : (
                          <Button
                            variant="contained"
                            component={RouterLink}
                            to={stubCreatePath}
                            disabled={!canCreateStubFromSelectedCall}
                            state={{
                              returnTo: snifferPath,
                              prefillService: selectedService,
                              prefillMethod: selectedMethod,
                            }}
                            sx={{ textTransform: "none", fontWeight: 700, borderRadius: RADIUS_PX, px: 2.25, py: 0.9 }}
                          >
                            Create stub
                          </Button>
                        )}
                      </>
                    )}
                  </Box>
                </Box>
              </Box>
            ) : (
              <Box sx={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
                {showResponseSearch && hasResponseSearchablePayload ? (
                  <Box
                    sx={compactSearchBarSx}
                  >
                    <TextField
                      inputRef={responseSearchInputRef}
                      value={responseSearchQuery}
                      onChange={(event) => setResponseSearchQuery(event.target.value)}
                      size="small"
                      fullWidth
                      placeholder="Find"
                      sx={compactSearchInputSx}
                    />
                    <Button
                      size="small"
                      variant={responseSearchOptions.caseSensitive ? "contained" : "text"}
                      onClick={() => toggleSearchOption("response", "caseSensitive")}
                      sx={compactSearchToggleButtonSx}
                    >
                      Aa
                    </Button>
                    <Button
                      size="small"
                      variant={responseSearchOptions.wholeWord ? "contained" : "text"}
                      onClick={() => toggleSearchOption("response", "wholeWord")}
                      sx={compactSearchToggleButtonSx}
                    >
                      ab
                    </Button>
                    <Button
                      size="small"
                      variant={responseSearchOptions.useRegex ? "contained" : "text"}
                      onClick={() => toggleSearchOption("response", "useRegex")}
                      sx={compactSearchToggleButtonSx}
                    >
                      .*
                    </Button>
                    <Typography variant="body2" sx={compactSearchCounterSx}>
                      {responseMatchData.totalMatches > 0
                        ? `${responseActiveMatch + 1} of ${responseMatchData.totalMatches}`
                        : "0 of 0"}
                    </Typography>
                    <IconButton
                      size="small"
                      onClick={() => stepResponseMatch(-1)}
                      disabled={responseMatchData.totalMatches === 0}
                      sx={compactSearchIconButtonSx}
                    >
                      <KeyboardArrowUpRoundedIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => stepResponseMatch(1)}
                      disabled={responseMatchData.totalMatches === 0}
                      sx={compactSearchIconButtonSx}
                    >
                      <KeyboardArrowDownRoundedIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => {
                        closeResponseSearch();
                      }}
                      sx={compactSearchIconButtonSx}
                    >
                      <CloseRoundedIcon fontSize="small" />
                    </IconButton>
                  </Box>
                ) : null}
                <Box ref={responseSearchContainerRef} sx={{ flex: 1, minHeight: 0, overflow: "auto", p: 1.25 }}>
                {isSingleResponseView ? (
                  <Box component="pre" sx={jsonTextSx}>
                    {singleResponseEntry ? (
                      renderHighlightedJsonText(
                        singleResponseEntry.payloadText,
                        responseMatchData.rangesByEntry.get(singleResponseEntry.key) || [],
                        responseActiveMatch,
                      )
                    ) : (
                      "No response payload"
                    )}
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
                            {renderHighlightedJsonText(
                              entry.payloadText,
                              responseMatchData.rangesByEntry.get(entry.key) || [],
                              responseActiveMatch,
                            )}
                          </Box>
                        </AccordionDetails>
                      </Accordion>
                    ))}
                  </Box>
                )}
                </Box>
              </Box>
            )}
          </Paper>
        </Box>
      )}
    </Box>
  );
};
