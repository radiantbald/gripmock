import {
  ChangeEvent,
  Fragment,
  MouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  alpha,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  FormControl,
  IconButton,
  Chip,
  Divider,
  MenuItem,
  Paper,
  Popover,
  Select,
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
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import SearchOffRoundedIcon from "@mui/icons-material/SearchOffRounded";
import {
  useCreatePath,
  useDataProvider,
  useGetList,
  useNotify,
} from "react-admin";
import { Link as RouterLink, useLocation } from "react-router-dom";

import { API_CONFIG } from "./constants/api";
import { reflectionHostInputSx } from "./components/inputs/reflectionHostInputSx";
import { apiClient } from "./dataProvider/apiClient";
import { resolveRoomRow, type RoomRow } from "./features/room/model";
import {
  getCurrentRoom,
  setCurrentRoom,
  subscribeRoomChanges,
} from "./utils/room";
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

type CallTableFilterField =
  | "client"
  | "service"
  | "method"
  | "code"
  | "servedBy"
  | "room";
type CallTableFilterValue = {
  query: string;
  selected: string[];
};
type CallTableFilters = Record<CallTableFilterField, CallTableFilterValue>;
type CallTableFilterMenuState = {
  field: CallTableFilterField;
  anchorEl: HTMLElement;
};
type CallTableColumnKey =
  | "room"
  | "client"
  | "service"
  | "method"
  | "code"
  | "receivedByServer"
  | "source"
  | "servedBy";
type SnifferSource = "proto" | "reflection";
type ReflectionServedBy = "stub" | "proxy";
const defaultReflectionServedBy: ReflectionServedBy = "proxy";
type ResponsePanelMode = "response" | "nextResponse";
type ReflectionHostRecord = {
  id?: string | number;
  host?: string;
  source?: string;
};
type ProtofileRecord = {
  id?: string | number;
  name?: string;
  version?: number;
  source?: string;
};
type ProtofileOption = {
  name: string;
  label: string;
};
type ClientLookupRow = {
  id?: string | number;
  name?: string;
  peerHost?: string;
  userAgent?: string;
};
type SnifferSourceChange = {
  source: SnifferSource;
  changedAtMs: number | null;
  recordId?: string;
};
type SnifferRecord = HistoryRecord & {
  originalSource?: SnifferSource;
};

const SNIFFER_ROUTE_SOURCES_KEY = "gripmock.sniffer.routeSources";
const SNIFFER_ROUTE_SOURCE_CHANGES_KEY = "gripmock.sniffer.routeSourceChanges";
const SNIFFER_REFLECTION_SERVED_BY_KEY = "gripmock.sniffer.reflectionServedBy";

const RADIUS_PX = "10px";
const RESIZE_HANDLE_SIZE_PX = 10;
const MIN_TOP_PANEL_RATIO = 0.2;
const MIN_BOTTOM_PANEL_RATIO = 0.25;
const MIN_REQUEST_PANEL_RATIO = 0.2;
const MIN_RESPONSE_PANEL_RATIO = 0.2;
const CALL_TABLE_COLUMN_RESIZE_HANDLE_WIDTH_PX = 8;
const CALL_TABLE_DEFAULT_COLUMN_WIDTHS: Record<CallTableColumnKey, number> = {
  room: 108,
  client: 220,
  service: 190,
  method: 200,
  code: 96,
  receivedByServer: 180,
  source: 118,
  servedBy: 114,
};
const CALL_TABLE_MIN_COLUMN_WIDTHS: Record<CallTableColumnKey, number> = {
  room: 72,
  client: 120,
  service: 120,
  method: 120,
  code: 72,
  receivedByServer: 140,
  source: 96,
  servedBy: 96,
};
const clampRatio = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const panelHeaderSx = {
  px: 1.25,
  py: 0.875,
  height: 42,
  boxSizing: "border-box",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  overflow: "hidden",
};

const panelTitleSx = { fontSize: 13, fontWeight: 700, letterSpacing: 0.15 };
const postmanLikeSelectSx = {
  width: "auto",
  minWidth: 0,
  "& .MuiInputBase-root": {
    width: "auto",
    color: "#FF6C37",
    backgroundColor: "transparent",
    borderRadius: 0,
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: 0.15,
    lineHeight: 1.4,
    transition: "color 120ms ease",
  },
  "& .MuiInputBase-root:hover": {
    color: "#FF6C37",
    backgroundColor: "transparent !important",
  },
  "& .Mui-focused": {
    color: "#FF6C37",
    backgroundColor: "transparent !important",
  },
  "& .MuiInputBase-root::before, & .MuiInputBase-root::after": {
    borderBottom: "none !important",
  },
  "& .MuiInputBase-root:hover:not(.Mui-disabled)::before": {
    borderBottom: "none !important",
  },
  "& .MuiOutlinedInput-notchedOutline": {
    border: "none",
  },
  "& .MuiSelect-select": {
    width: "auto",
    minWidth: "unset !important",
    padding: "0 20px 0 0 !important",
    display: "inline-flex",
    alignItems: "center",
    backgroundColor: "transparent !important",
    boxShadow: "none",
  },
  "& .MuiSelect-select:focus": {
    backgroundColor: "transparent !important",
  },
  "& .MuiSelect-icon": {
    right: 0,
    color: "#FF6C37",
    fontSize: 16,
    transition: "color 120ms ease, transform 120ms ease",
  },
  "& .MuiSelect-iconOpen": { transform: "rotate(180deg)" },
} as const;
const jsonTextSx = {
  m: 0,
  p: 0,
  whiteSpace: "pre",
  fontFamily:
    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
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
    bgcolor: alpha("#ffffff", 0.03),
    color: "text.primary",
    borderRadius: 1,
    alignItems: "center",
  },
  "& .MuiInputBase-input": {
    fontSize: 12,
    py: 0.35,
    px: 1,
    lineHeight: 1.3,
    "&::placeholder": {
      opacity: 1,
      color: "text.secondary",
    },
  },
  "& .MuiOutlinedInput-notchedOutline": {
    borderColor: alpha("#ffffff", 0.16),
  },
  "& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline": {
    borderColor: alpha("#ffffff", 0.28),
  },
  "& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline": {
    borderColor: "#FF6C37",
  },
  "& .MuiInputBase-input:-webkit-autofill": {
    WebkitTextFillColor: "#e8ebf2",
    WebkitBoxShadow: "0 0 0 100px rgba(255,255,255,0.03) inset",
    transition: "background-color 9999s ease-out 0s",
    caretColor: "#e8ebf2",
  },
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
const clearRequestsButtonSx = {
  border: "none",
  borderRadius: 1,
  color: "text.secondary",
  transition: "color 120ms ease",
  "&:hover": {
    backgroundColor: "transparent",
    color: "#FF6C37",
  },
  "&.Mui-disabled": {
    color: "text.disabled",
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
const ROOM_ASSIGN_CONTROL_WIDTH_PX = 260;
const roomAssignControlWidthSx = {
  width: `min(100%, ${ROOM_ASSIGN_CONTROL_WIDTH_PX}px)`,
  maxWidth: "100%",
} as const;
const roomAssignSelectorSx = {
  height: 34,
  display: "block",
  width: "100%",
  maxWidth: ROOM_ASSIGN_CONTROL_WIDTH_PX,
  m: 0,
  p: 0,
  "& .MuiOutlinedInput-root": {
    width: "100%",
    height: "100%",
    borderRadius: 1.5,
    backgroundColor: alpha("#ffffff", 0.06),
    p: 0,
  },
  "& .MuiOutlinedInput-notchedOutline": {
    border: "none",
  },
  "& .MuiOutlinedInput-input": {
    padding: "0 !important",
  },
  "& .MuiSelect-select": {
    display: "flex",
    alignItems: "center",
    textAlign: "left",
    height: "100%",
    boxSizing: "border-box",
    minHeight: "unset !important",
    padding: "0 32px 0 10px !important",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    WebkitMaskImage: "linear-gradient(to right, #000 86%, transparent 100%)",
    maskImage: "linear-gradient(to right, #000 86%, transparent 100%)",
  },
  "& .MuiSelect-icon": {
    right: 8,
  },
  "& .MuiInputBase-input, & .MuiSelect-select": {
    fontSize: 13,
    fontWeight: 500,
    lineHeight: 1.3,
    textAlign: "left",
  },
} as const;
const roomAssignButtonSx = {
  textTransform: "none",
  fontWeight: 700,
  width: "100%",
  maxWidth: ROOM_ASSIGN_CONTROL_WIDTH_PX,
  minHeight: 34,
  height: 34,
  minWidth: 108,
  flexShrink: 0,
  justifyContent: "center",
  borderRadius: 1.5,
  px: 1.4,
  py: 0.45,
  fontSize: 12.5,
  lineHeight: 1.2,
  whiteSpace: "normal",
  overflowWrap: "anywhere",
  boxShadow: "none",
} as const;
const stateBlockContainerSx = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  px: { xs: 1.25, sm: 2 },
  py: { xs: 1.25, sm: 2 },
  color: "text.secondary",
  minWidth: 0,
  minHeight: 0,
  overflowY: "auto",
} as const;
const stateBlockCardSx = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  width: "100%",
  maxWidth: { xs: "100%", sm: 520 },
  maxHeight: "100%",
  overflowY: "auto",
  pr: 0.25,
  overflowWrap: "anywhere",
  wordBreak: "break-word",
} as const;
const stateBlockTitleSx = {
  fontWeight: 600,
  mb: 1,
  fontSize: "clamp(1.05rem, 1.6vw, 1.5rem)",
  lineHeight: 1.25,
  "@container response-panel (max-height: 340px)": {
    display: "none",
  },
} as const;
const stateBlockBodySx = {
  opacity: 0.85,
  fontSize: "clamp(0.85rem, 1.25vw, 1rem)",
  lineHeight: 1.35,
  overflowWrap: "anywhere",
  "@container response-panel (max-height: 340px)": {
    display: "none",
  },
} as const;
const stateBlockActionsSx = {
  mt: 2.25,
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  gap: { xs: 0.75, sm: 1.25 },
  flexWrap: "wrap",
  width: "100%",
  "@container response-panel (max-height: 340px)": {
    mt: 0.5,
  },
} as const;
const stateBlockHintSx = {
  fontWeight: 700,
  fontSize: "clamp(0.75rem, 1.1vw, 0.875rem)",
  lineHeight: 1.35,
  overflowWrap: "anywhere",
} as const;
const stateBlockActionButtonSx = {
  textTransform: "none",
  fontWeight: 700,
  borderRadius: RADIUS_PX,
  px: { xs: 1.5, sm: 2.25 },
  py: 0.9,
  maxWidth: "100%",
  fontSize: "clamp(0.78rem, 1.15vw, 0.92rem)",
  lineHeight: 1.2,
  whiteSpace: "normal",
  overflowWrap: "anywhere",
} as const;
const nextResponseContainerSx = {
  ...stateBlockContainerSx,
  flexDirection: "column",
  alignItems: "stretch",
  justifyContent: "flex-start",
  px: 1,
  py: 0,
  overflow: "visible",
} as const;
const nextResponseViewportSx = {
  minHeight: "100%",
  minWidth: 0,
  width: "100%",
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "safe center",
  py: 1,
} as const;
const nextResponseCardSx = {
  ...stateBlockCardSx,
  maxWidth: 460,
  width: "100%",
  maxHeight: "none",
  boxSizing: "border-box",
  overflow: "visible",
  overflowY: "visible",
  gap: 0.75,
  px: 0.25,
  pr: 0.5,
} as const;
const nextResponseTitleSx = {
  ...stateBlockTitleSx,
  mb: 0,
  fontSize: "clamp(1rem, 1.25vw, 1.15rem)",
  lineHeight: 1.2,
} as const;
const nextResponseBodySx = {
  ...stateBlockBodySx,
  fontSize: "clamp(0.78rem, 1vw, 0.875rem)",
  lineHeight: 1.25,
} as const;
const nextResponseControlsSx = {
  mt: 0,
  width: "100%",
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 1,
  overflow: "visible",
} as const;
const nextResponseControlSx = {
  width: "min(100%, 260px)",
  maxWidth: "100%",
  minWidth: 0,
  "& .MuiInputBase-root": {
    height: 34,
    minHeight: 34,
    backgroundColor: alpha("#ffffff", 0.06),
    borderRadius: 1,
    fontSize: 13,
    boxSizing: "border-box",
  },
  "& .MuiSelect-select": {
    minHeight: "unset !important",
    py: "0 !important",
    pl: "10px !important",
    pr: "32px !important",
    lineHeight: "34px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  "& .MuiOutlinedInput-input": {
    py: "0 !important",
    px: "10px !important",
    height: 34,
    lineHeight: "34px",
    boxSizing: "border-box",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
} as const;
const nextResponseDropdownSx = {
  width: "fit-content",
  maxWidth: "100%",
  minWidth: 0,
  display: "inline-flex",
  "& .MuiInputBase-root": {
    width: "auto",
    maxWidth: "100%",
    color: "#FF6C37",
    backgroundColor: "transparent",
    borderRadius: 0,
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: 0.15,
    lineHeight: 1.4,
    transition: "color 120ms ease",
  },
  "& .MuiInputBase-root:hover": {
    color: "#FF6C37",
    backgroundColor: "transparent !important",
  },
  "& .Mui-focused": {
    color: "#FF6C37",
    backgroundColor: "transparent !important",
  },
  "& .MuiInputBase-root::before, & .MuiInputBase-root::after": {
    borderBottom: "none !important",
  },
  "& .MuiInputBase-root:hover:not(.Mui-disabled)::before": {
    borderBottom: "none !important",
  },
  "& .MuiOutlinedInput-notchedOutline": {
    border: "none",
  },
  "& .MuiSelect-select": {
    width: "auto",
    minWidth: 0,
    maxWidth: "100%",
    padding: "0 20px 0 0 !important",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    backgroundColor: "transparent !important",
    boxShadow: "none",
  },
  "& .MuiSelect-select:focus": {
    backgroundColor: "transparent !important",
  },
  "& .MuiSelect-icon": {
    right: 0,
    color: "#FF6C37",
    fontSize: 16,
    transition: "color 120ms ease, transform 120ms ease",
  },
  "& .MuiSelect-iconOpen": { transform: "rotate(180deg)" },
} as const;
const nextResponseTextInputSx = reflectionHostInputSx;
const reflectionHostPulseSx = {
  "@keyframes reflectionHostErrorPulse": {
    "0%, 100%": {
      borderColor: alpha("#ff8a80", 0.6),
      boxShadow: "0 0 0 0 rgba(255, 138, 128, 0.0)",
    },
    "50%": {
      borderColor: "#ff8a80",
      boxShadow: "0 0 0 3px rgba(255, 138, 128, 0.22)",
    },
  },
  "& .MuiOutlinedInput-root .MuiOutlinedInput-notchedOutline": {
    animation: "reflectionHostErrorPulse 320ms ease-in-out 0s 3",
  },
} as const;
const reflectionHostSuccessPulseSx = {
  "@keyframes reflectionHostSuccessPulse": {
    "0%, 100%": {
      borderColor: alpha("#7ae7b0", 0.6),
      boxShadow: "0 0 0 0 rgba(122, 231, 176, 0.0)",
    },
    "50%": {
      borderColor: "#7ae7b0",
      boxShadow: "0 0 0 3px rgba(122, 231, 176, 0.22)",
    },
  },
  "& .MuiOutlinedInput-root .MuiOutlinedInput-notchedOutline": {
    animation: "reflectionHostSuccessPulse 320ms ease-in-out 0s 3",
  },
  "& .MuiInputLabel-root": {
    color: "#9df2c5",
  },
  "& .MuiInputLabel-root.Mui-focused": {
    color: "#9df2c5",
  },
} as const;
const reflectionHostSetSx = {
  "& .MuiOutlinedInput-root": {
    backgroundColor: alpha("#7ae7b0", 0.12),
  },
  "& .MuiOutlinedInput-root .MuiOutlinedInput-notchedOutline": {
    borderColor: "success.main",
    borderWidth: 2,
  },
  "& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline": {
    borderColor: "#7ae7b0",
  },
  "& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline": {
    borderColor: "#7ae7b0",
    borderWidth: 2,
  },
  "& .MuiInputBase-input": {
    color: "text.primary",
    caretColor: "text.primary",
  },
  "& .MuiInputLabel-root": {
    color: "#9df2c5",
  },
  "& .MuiInputLabel-root.Mui-focused": {
    color: "#9df2c5",
  },
} as const;
const reflectionHostSetErrorSx = {
  "& .MuiOutlinedInput-root": {
    backgroundColor: alpha("#ff8a80", 0.1),
  },
  "& .MuiOutlinedInput-root .MuiOutlinedInput-notchedOutline": {
    borderColor: "error.main",
    borderWidth: 2,
  },
  "& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline": {
    borderColor: "#ff8a80",
  },
  "& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline": {
    borderColor: "#ff8a80",
    borderWidth: 2,
  },
  "& .MuiInputBase-input": {
    color: "text.primary",
    caretColor: "text.primary",
  },
  "& .MuiInputLabel-root": {
    color: "text.secondary",
  },
  "& .MuiInputLabel-root.Mui-focused": {
    color: "text.primary",
  },
} as const;
const nextResponseReflectionHostSx = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  columnGap: 1,
  rowGap: 0.75,
  width: "100%",
  maxWidth: "100%",
  flex: "1 1 100%",
  minWidth: 0,
  flexWrap: "nowrap",
  overflowX: "visible",
  mx: "auto",
  "@media (min-width: 600px)": {
    maxWidth: 700,
  },
} as const;
const nextResponseReflectionHostInputSx = {
  ...nextResponseTextInputSx,
  width: "auto",
  maxWidth: 280,
  minWidth: 0,
  flex: "1 1 280px",
} as const;
const nextResponseProtoActionsRowSx = {
  ...nextResponseReflectionHostSx,
  justifyContent: "center",
  flexWrap: "wrap",
} as const;
const nextResponseInlineSeparatorSx = {
  fontSize: 13,
  fontWeight: 700,
  color: "text.secondary",
  textTransform: "lowercase",
} as const;
const nextResponseActionButtonSx = {
  ...stateBlockActionButtonSx,
  minHeight: 34,
  height: 34,
  py: 0.45,
  px: 1.4,
  fontSize: 12.5,
  minWidth: 108,
  flexShrink: 0,
  justifyContent: "center",
} as const;
const nextResponseCheckIconButtonSx = {
  width: 28,
  height: 28,
  borderRadius: 1,
  color: "text.secondary",
  transition: "color 120ms ease",
  "&:hover": {
    color: "#FF6C37",
    backgroundColor: "transparent",
  },
  "&.Mui-disabled": {
    color: "text.disabled",
  },
} as const;
const nextResponseSetButtonSx = {
  ...nextResponseActionButtonSx,
  minWidth: 56,
  px: 1.15,
} as const;
const nextResponseStubControlSx = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 0.75,
  width: "100%",
  minWidth: 0,
  overflow: "visible",
} as const;
const nextResponseActionsSx = {
  ...stateBlockActionsSx,
  mt: 0.75,
  gap: 0.75,
} as const;
const reflectionHostControlContainerSx = {
  ...nextResponseControlsSx,
  mt: 0,
  gap: 0,
} as const;
const responseStateCardSx = {
  ...stateBlockCardSx,
  gap: 0.75,
  px: 0.25,
  pr: 0.5,
} as const;
const responseStateActionsSx = {
  ...stateBlockActionsSx,
  mt: 0.75,
  gap: 0.75,
} as const;
const tableFilterInputSx = {
  "& .MuiInputBase-root": {
    minHeight: 34,
    height: 34,
    fontSize: 13,
    fontWeight: 500,
    lineHeight: 1.3,
    borderRadius: 1,
    bgcolor: alpha("#ffffff", 0.03),
    alignItems: "center",
  },
  "& .MuiInputBase-input": {
    py: 0.55,
    px: 0.75,
    fontSize: 13,
    fontWeight: 500,
    lineHeight: 1.3,
    letterSpacing: 0,
    fontFamily: "inherit",
    "&::placeholder": {
      opacity: 1,
      fontSize: 13,
      fontWeight: 500,
      lineHeight: 1.3,
      color: "text.secondary",
    },
  },
  "& .MuiSvgIcon-root": {
    fontSize: 18,
  },
} as const;
const tableFilterTextSx = {
  fontSize: 13,
  fontWeight: 500,
  lineHeight: 1.3,
  letterSpacing: 0,
  fontFamily: "inherit",
} as const;
const tableFilterClearButtonSx = {
  minWidth: 0,
  px: 0.75,
  textTransform: "none",
  fontSize: 13,
  fontWeight: 500,
  lineHeight: 1.3,
  letterSpacing: 0,
  fontFamily: "inherit",
} as const;
const tableFilterTriggerButtonSx = {
  minWidth: 0,
  px: 0,
  py: 0,
  lineHeight: 1.2,
  justifyContent: "flex-start",
  textTransform: "none",
  fontSize: 11,
  fontWeight: 600,
  color: "inherit",
  opacity: 0.9,
  "&:hover": {
    backgroundColor: "transparent",
    color: "#FF6C37",
    opacity: 1,
  },
} as const;
const callTableFilterLabels: Record<CallTableFilterField, string> = {
  client: "client",
  service: "service",
  method: "method",
  code: "code",
  servedBy: "served by",
  room: "room",
};

const MAX_ITEMS = 500;
const EMPTY_CALL_TABLE_FILTERS: CallTableFilters = {
  client: { query: "", selected: [] },
  service: { query: "", selected: [] },
  method: { query: "", selected: [] },
  code: { query: "", selected: [] },
  servedBy: { query: "", selected: [] },
  room: { query: "", selected: [] },
};
const codeToChipColor = (code?: number) =>
  code === undefined || code === 0 ? "success" : "error";
const protoMissingErrorMarkers = [
  "unknown service/method",
  "method not found",
  "message descriptor not found",
  "not a message descriptor",
];
const missingStubErrorMarkers = [
  "no matching stub found",
  "stub not found",
  "can't find stub",
  "no stub found",
];
const responseSchemaErrorMarkers = [
  "failed to unmarshal json into dynamic message",
  "failed to convert response to dynamic message",
  "failed to marshal map to json",
  "proto:",
];
const notFoundCode = 5;
const defaultSnifferSource: SnifferSource = "reflection";
const snifferSourceLabels: Record<SnifferSource, string> = {
  proto: "proto",
  reflection: "reflection",
};
const responsePanelModeLabels: Record<ResponsePanelMode, string> = {
  response: "Response",
  nextResponse: "Set next response",
};
const servedByLabels = {
  proxy: "proxy",
  stub: "stub",
} as const;
type ServedBy = keyof typeof servedByLabels;
const getServedBy = (record: HistoryRecord): ServedBy => {
  if (record.transport === "proxy") {
    return "proxy";
  }

  return "stub";
};
const servedByChipColor = (servedBy: ServedBy) => {
  if (servedBy === "proxy") {
    return "info";
  }

  return "success";
};
const normalizeReflectionSource = (value: string): string => {
  const normalized = value.trim();
  if (!normalized) {
    return "";
  }

  if (normalized.startsWith(":")) {
    return `grpc://127.0.0.1${normalized}`;
  }

  const withScheme = normalized.includes("://")
    ? normalized.replace("://:", "://127.0.0.1:")
    : `grpc://${normalized}`;

  return withScheme.replace("://localhost:", "://127.0.0.1:");
};
const buildSnifferRouteKey = (
  room: string | undefined,
  service: string | undefined,
  method: string | undefined,
): string => {
  const normalizedRoom = String(room || "").trim() || "global";
  const normalizedService = String(service || "").trim();
  const normalizedMethod = String(method || "").trim();

  if (!normalizedService || !normalizedMethod) {
    return "";
  }

  return `${normalizedRoom}|${normalizedService}|${normalizedMethod}`;
};
const parseSnifferRouteKey = (
  routeKey: string,
): { room: string; service: string; method: string } | null => {
  const [rawRoom, rawService, rawMethod] = routeKey.split("|");
  const service = String(rawService || "").trim();
  const method = String(rawMethod || "").trim();
  if (!service || !method) {
    return null;
  }

  const roomCandidate = String(rawRoom || "").trim();
  return {
    room: roomCandidate === "global" ? "" : roomCandidate,
    service,
    method,
  };
};
const readSnifferRouteSources = (): Record<string, SnifferSource> => {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(SNIFFER_ROUTE_SOURCES_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.entries(parsed).reduce<Record<string, SnifferSource>>(
      (acc, [key, value]) => {
        if (value === "proto" || value === "reflection") {
          acc[key] = value;
        }

        return acc;
      },
      {},
    );
  } catch {
    return {};
  }
};
const writeSnifferRouteSources = (
  sources: Record<string, SnifferSource>,
): void => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      SNIFFER_ROUTE_SOURCES_KEY,
      JSON.stringify(sources),
    );
  } catch {
    // Ignore storage failures (private mode, quota, etc.).
  }
};
const readReflectionServedByRoutes = (): Record<string, ReflectionServedBy> => {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(SNIFFER_REFLECTION_SERVED_BY_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.entries(parsed).reduce<Record<string, ReflectionServedBy>>(
      (acc, [key, value]) => {
        if (value === "stub" || value === "proxy") {
          acc[key] = value;
        }

        return acc;
      },
      {},
    );
  } catch {
    return {};
  }
};
const writeReflectionServedByRoutes = (
  routes: Record<string, ReflectionServedBy>,
): void => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      SNIFFER_REFLECTION_SERVED_BY_KEY,
      JSON.stringify(routes),
    );
  } catch {
    // Ignore storage failures (private mode, quota, etc.).
  }
};
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

const parseSnifferSourceChange = (
  value: unknown,
): SnifferSourceChange | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const row = value as Record<string, unknown>;
  const source = row.source;
  if (source !== "proto" && source !== "reflection") {
    return null;
  }

  const changedAtMs =
    typeof row.changedAtMs === "number" && Number.isFinite(row.changedAtMs)
      ? row.changedAtMs
      : null;
  const recordId = typeof row.recordId === "string" ? row.recordId.trim() : "";

  return {
    source,
    changedAtMs,
    ...(recordId ? { recordId } : {}),
  };
};

const readSnifferRouteSourceChanges = (): Record<
  string,
  SnifferSourceChange[]
> => {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(SNIFFER_ROUTE_SOURCE_CHANGES_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.entries(parsed).reduce<Record<string, SnifferSourceChange[]>>(
      (acc, [key, value]) => {
        const changes = Array.isArray(value)
          ? value
              .map(parseSnifferSourceChange)
              .filter((item): item is SnifferSourceChange => item !== null)
          : [parseSnifferSourceChange(value)].filter(
              (item): item is SnifferSourceChange => item !== null,
            );

        if (changes.length > 0) {
          acc[key] = changes;
        }

        return acc;
      },
      {},
    );
  } catch {
    return {};
  }
};

const writeSnifferRouteSourceChanges = (
  changes: Record<string, SnifferSourceChange[]>,
): void => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      SNIFFER_ROUTE_SOURCE_CHANGES_KEY,
      JSON.stringify(changes),
    );
  } catch {
    // Ignore storage failures (private mode, quota, etc.).
  }
};

const findSourceChangeForRecord = (
  record: SnifferRecord | undefined,
  routeKey: string,
  changes: SnifferSourceChange[] | undefined,
): SnifferSourceChange | undefined => {
  if (!record || !routeKey || !changes || changes.length === 0) {
    return undefined;
  }

  const recordReceivedAtMs = parseTimestampToMs(record.timestamp);
  if (recordReceivedAtMs === null) {
    return undefined;
  }

  return changes.reduce<SnifferSourceChange | undefined>((latest, change) => {
    if (
      change.changedAtMs === null ||
      change.changedAtMs >= recordReceivedAtMs
    ) {
      return latest;
    }

    if (!latest || change.changedAtMs >= (latest.changedAtMs ?? 0)) {
      return change;
    }

    return latest;
  }, undefined);
};

const applySourceChangesToRecords = (
  records: SnifferRecord[],
  changes: Record<string, SnifferSourceChange[]>,
): SnifferRecord[] =>
  records.map((record) => {
    const originalSource =
      record.originalSource || record.source || defaultSnifferSource;
    const routeKey = buildSnifferRouteKey(
      record.room,
      record.service,
      record.method,
    );
    const change = findSourceChangeForRecord(
      record,
      routeKey,
      routeKey ? changes[routeKey] : undefined,
    );

    if (!change) {
      return record.originalSource ? record : { ...record, originalSource };
    }

    return {
      ...record,
      originalSource,
      source: change.source,
    };
  });

const toSnifferRecord = (record: HistoryRecord): SnifferRecord => {
  const callId = String(record.callId || record.id || "").trim();

  return {
    ...record,
    callId,
    id: callId || record.id,
    originalSource: record.source || defaultSnifferSource,
    request:
      record.request ||
      (Array.isArray(record.requests) && record.requests.length > 0
        ? record.requests[0]
        : undefined),
    response:
      record.response ||
      (Array.isArray(record.responses) && record.responses.length > 0
        ? record.responses[0]
        : undefined),
  };
};

const pushRecord = (
  records: SnifferRecord[],
  nextRecord: HistoryRecord,
): SnifferRecord[] => {
  const normalized = toSnifferRecord(nextRecord);
  const dedupeKey = normalized.callId || normalized.id;
  if (!dedupeKey) {
    return [normalized, ...records].slice(0, MAX_ITEMS);
  }

  const filtered = records.filter(
    (item) => (item.callId || item.id) !== dedupeKey,
  );
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

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const normalizeValue = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";
const normalizeFilterQuery = (value: string): string =>
  value.trim().toLowerCase();
const buildDistinctFilterOptions = (values: string[]): string[] =>
  Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort(
    (left, right) =>
      left.localeCompare(right, undefined, {
        sensitivity: "base",
        numeric: true,
      }),
  );
const includesNormalized = (values: string[], target: string): boolean => {
  const normalizedTarget = normalizeFilterQuery(target);
  if (!normalizedTarget) {
    return false;
  }

  return values.some(
    (value) => normalizeFilterQuery(value) === normalizedTarget,
  );
};
const shortServiceName = (
  service: string,
): { short: string; hasDot: boolean } => {
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

const buildSearchRegex = (
  query: string,
  options: SearchOptions,
): RegExp | null => {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return null;
  }

  const source = options.useRegex
    ? normalizedQuery
    : escapeRegExp(normalizedQuery);
  const boundedSource = options.wholeWord ? `\\b(?:${source})\\b` : source;
  const flags = options.caseSensitive ? "g" : "gi";

  try {
    return new RegExp(boundedSource, flags);
  } catch {
    return null;
  }
};

const collectMatchRanges = (
  text: string,
  matcher: RegExp | null,
  offset = 0,
): MatchRange[] => {
  if (!matcher) {
    return [];
  }

  const ranges: MatchRange[] = [];
  const regex = new RegExp(
    matcher.source,
    matcher.flags.includes("g") ? matcher.flags : `${matcher.flags}g`,
  );
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

const renderHighlightedJsonText = (
  text: string,
  ranges: MatchRange[],
  activeMatchIndex: number,
): ReactNode => {
  if (!ranges.length) {
    return text;
  }

  const nodes: ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((range, idx) => {
    if (range.start > cursor) {
      nodes.push(
        <Fragment key={`plain-${idx}`}>
          {text.slice(cursor, range.start)}
        </Fragment>,
      );
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
  return (
    protoMissingErrorMarkers.some((marker) =>
      normalizedError.includes(marker),
    ) || normalizedError.length > 0
  );
};

const hasMissingStubError = (record?: HistoryRecord): boolean => {
  if (!record || record.code !== notFoundCode) {
    return false;
  }

  const normalizedError = String(record.error || "").toLowerCase();
  if (!normalizedError) {
    return false;
  }

  return missingStubErrorMarkers.some((marker) =>
    normalizedError.includes(marker),
  );
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
    return responseSchemaErrorMarkers.some((marker) =>
      normalizedError.includes(marker),
    );
  }

  const response = unwrapRootPayload(record.response);
  const isEmptyResponseObject =
    isPlainObject(response) && Object.keys(response).length === 0;
  const hasNoResponsePayload = response === undefined || response === null;

  // Some invalid stub payload cases come back with stub-defined non-zero
  // gRPC code, no explicit error text and no response payload.
  // The code value itself is not a validator here.
  return (
    (record.code ?? 0) !== 0 &&
    !normalizedError &&
    (isEmptyResponseObject || hasNoResponsePayload)
  );
};

const subscribeHistoryStream = (
  room: string,
  handlers: StreamHandlers,
): (() => void) => {
  const eventSource = new EventSource(buildStreamUrl(room));

  const onMessage = (event: MessageEvent<string>) => {
    const parsed = parseEvent(event);
    if (parsed) {
      handlers.onCall(parsed);
    }
  };
  const onCall = onMessage as Parameters<EventSource["addEventListener"]>[1];

  eventSource.addEventListener("call", onCall);
  eventSource.onerror = () => handlers.onError();

  return () => {
    eventSource.removeEventListener("call", onCall);
    eventSource.close();
  };
};

export const SnifferPage = () => {
  const notify = useNotify();
  const dataProvider = useDataProvider();
  const createPath = useCreatePath();
  const location = useLocation();
  const [records, setRecords] = useState<SnifferRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [activeRoom, setActiveRoom] = useState(() => getCurrentRoom());
  const [hasProtoFromApi, setHasProtoFromApi] = useState(false);
  const [hasMethodFromApi, setHasMethodFromApi] = useState(false);
  const [peerBoundRoom, setPeerBoundRoom] = useState("");
  const [roomForAttachment, setRoomForAttachment] = useState("");
  const [recentlyAttachedPeer, setRecentlyAttachedPeer] = useState("");
  const [streamRevision, setStreamRevision] = useState(0);
  const [expandedResponseKeys, setExpandedResponseKeys] = useState<Set<string>>(
    new Set(),
  );
  const [stubCreatedHistory, setStubCreatedHistory] = useState(() =>
    getStubCreatedHistory(),
  );
  const [editedStubHistory, setEditedStubHistory] = useState(() =>
    getStubEditedHistory(),
  );
  const [stubReplacedHistory, setStubReplacedHistory] = useState(() =>
    getStubReplacedHistory(),
  );
  const [showRequestSearch, setShowRequestSearch] = useState(false);
  const [showResponseSearch, setShowResponseSearch] = useState(false);
  const [requestSearchQuery, setRequestSearchQuery] = useState("");
  const [requestSearchOptions, setRequestSearchOptions] =
    useState<SearchOptions>({
      caseSensitive: false,
      wholeWord: false,
      useRegex: false,
    });
  const [requestActiveMatch, setRequestActiveMatch] = useState(-1);
  const [responseSearchQuery, setResponseSearchQuery] = useState("");
  const [responseSearchOptions, setResponseSearchOptions] =
    useState<SearchOptions>({
      caseSensitive: false,
      wholeWord: false,
      useRegex: false,
    });
  const [responseActiveMatch, setResponseActiveMatch] = useState(-1);
  const [activeSearchTarget, setActiveSearchTarget] = useState<
    "request" | "response"
  >("request");
  const [topPanelRatio, setTopPanelRatio] = useState(0.5);
  const [requestPanelRatio, setRequestPanelRatio] = useState(0.5);
  const [callTableColumnWidths, setCallTableColumnWidths] = useState<
    Record<CallTableColumnKey, number>
  >(CALL_TABLE_DEFAULT_COLUMN_WIDTHS);
  const [responsePanelMode, setResponsePanelMode] =
    useState<ResponsePanelMode>("response");
  const [callTableFilters, setCallTableFilters] = useState<CallTableFilters>(
    EMPTY_CALL_TABLE_FILTERS,
  );
  const [callTableFilterMenu, setCallTableFilterMenu] =
    useState<CallTableFilterMenuState | null>(null);
  const [routeSources, setRouteSources] = useState<
    Record<string, SnifferSource>
  >(() => readSnifferRouteSources());
  const [reflectionServedByRoutes, setReflectionServedByRoutes] = useState<
    Record<string, ReflectionServedBy>
  >(() => readReflectionServedByRoutes());
  const [sourceChangeMarkers, setSourceChangeMarkers] = useState<
    Record<string, SnifferSourceChange[]>
  >(() => readSnifferRouteSourceChanges());
  const [reflectionHost, setReflectionHost] = useState("");
  const [reflectionHostError, setReflectionHostError] = useState("");
  const [reflectionHostErrorPulse, setReflectionHostErrorPulse] = useState(0);
  const [reflectionHostSuccessPulse, setReflectionHostSuccessPulse] =
    useState(0);
  const [reflectionHostSetSuccess, setReflectionHostSetSuccess] =
    useState(false);
  const [reflectionHostSetError, setReflectionHostSetError] = useState(false);
  const [reflectionHosts, setReflectionHosts] = useState<
    ReflectionHostRecord[]
  >([]);
  const [availableProtofiles, setAvailableProtofiles] = useState<
    ProtofileRecord[]
  >([]);
  const [isLoadingProtofiles, setIsLoadingProtofiles] = useState(false);
  const [selectedProtofilesByRoute, setSelectedProtofilesByRoute] = useState<
    Record<string, string>
  >({});
  const [isCheckingReflection, setIsCheckingReflection] = useState(false);
  const [isSettingReflection, setIsSettingReflection] = useState(false);
  const [isUploadingProto, setIsUploadingProto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const requestSearchInputRef = useRef<HTMLInputElement | null>(null);
  const responseSearchInputRef = useRef<HTMLInputElement | null>(null);
  const requestSearchContainerRef = useRef<HTMLDivElement | null>(null);
  const responseSearchContainerRef = useRef<HTMLDivElement | null>(null);
  const callTableContainerRef = useRef<HTMLDivElement | null>(null);
  const rootLayoutRef = useRef<HTMLDivElement | null>(null);
  const detailsLayoutRef = useRef<HTMLDivElement | null>(null);
  const [viewportBoundHeightPx, setViewportBoundHeightPx] = useState<number>(0);
  const activeResizeRef = useRef<"rows" | "columns" | "callTableColumns" | null>(
    null,
  );
  const activeCallTableColumnResizeRef = useRef<{
    leftKey: CallTableColumnKey;
    rightKey: CallTableColumnKey;
    startX: number;
    startLeftWidth: number;
    startRightWidth: number;
  } | null>(null);
  const sourceChangeMarkersRef = useRef(sourceChangeMarkers);
  const syncedReflectionServedByRef = useRef<
    Record<string, ReflectionServedBy>
  >({});
  const bootstrappedReflectionRouteModesRef = useRef<
    Record<string, ReflectionServedBy>
  >({});

  useEffect(() => {
    sourceChangeMarkersRef.current = sourceChangeMarkers;
  }, [sourceChangeMarkers]);

  const checkProtoStatus = useCallback(
    async (
      service: string,
      method: string,
    ): Promise<{ hasMethod: boolean; hasProto: boolean }> => {
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
        apiClient.request<{ exists?: boolean }>(
          `/proto-metadata/status?${query.toString()}`,
        ),
      ]);

      const hasMethod = methodResult.status === "fulfilled";
      const hasProto =
        protoStatusResult.status === "fulfilled"
          ? Boolean(protoStatusResult.value?.exists)
          : false;

      return { hasMethod, hasProto };
    },
    [],
  );

  const loadAvailableProtofiles = useCallback(
    async (service: string, method: string): Promise<ProtofileRecord[]> => {
      const normalizedService = service.trim();
      const normalizedMethod = method.trim();
      if (!normalizedService || !normalizedMethod) {
        setAvailableProtofiles([]);
        return [];
      }

      const query = new URLSearchParams();
      query.set("service", normalizedService);
      query.set("method", normalizedMethod);

      setIsLoadingProtofiles(true);
      try {
        const payload = await apiClient.request<ProtofileRecord[]>(
          `/protofiles?${query.toString()}`,
        );
        const next = Array.isArray(payload) ? payload : [];
        setAvailableProtofiles(next);
        return next;
      } catch {
        setAvailableProtofiles([]);
        return [];
      } finally {
        setIsLoadingProtofiles(false);
      }
    },
    [],
  );

  useEffect(
    () => subscribeRoomChanges(() => setActiveRoom(getCurrentRoom())),
    [],
  );

  const loadReflectionHosts = useCallback(async () => {
    const hosts =
      await apiClient.request<ReflectionHostRecord[]>("/reflection-hosts");
    setReflectionHosts(hosts);
    setReflectionHost((current) => {
      if (current.trim()) {
        return current;
      }

      return hosts[0]?.source || hosts[0]?.host || "";
    });
  }, []);

  useEffect(() => {
    loadReflectionHosts().catch(() => {
      setReflectionHosts([]);
    });
  }, [loadReflectionHosts]);

  const loadHistorySnapshot = useCallback(async () => {
    const params = new URLSearchParams();
    if (activeRoom) {
      params.set("room", activeRoom);
    }

    const query = params.toString();
    const payload = await apiClient.request<HistoryRecord[]>(
      `/history${query ? `?${query}` : ""}`,
    );
    const normalized = applySourceChangesToRecords(
      payload.map(toSnifferRecord).reverse().slice(0, MAX_ITEMS),
      sourceChangeMarkersRef.current,
    );
    setRecords(normalized);
    setSelectedId((current) => {
      const normalizedCurrent = String(current || "").trim();
      if (normalizedCurrent) {
        const stillExists = normalized.some(
          (item) => (item.callId || item.id) === normalizedCurrent,
        );
        if (stillExists) {
          return normalizedCurrent;
        }
      }

      return normalized[0]?.callId || normalized[0]?.id || "";
    });
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
        setRecords((current) =>
          applySourceChangesToRecords(
            pushRecord(current, record),
            sourceChangeMarkersRef.current,
          ),
        );
        const nextId = String(record.callId || record.id || "").trim();
        if (nextId) {
          // Keep details panel synchronized with the most recent stream item.
          setSelectedId(nextId);
        }
      },
      onError: () => {
        // SSE reconnects automatically; UI keeps last snapshot.
      },
    });

    return unsubscribe;
  }, [activeRoom, streamRevision]);

  const selected = useMemo(
    () =>
      records.find((item) => (item.callId || item.id) === selectedId) ||
      records[0],
    [records, selectedId],
  );
  const selectedRequestId = String(
    selected?.callId || selected?.id || "",
  ).trim();
  const showMissingProtoHint = hasMissingProtoError(selected);
  const showMissingStubHint = hasMissingStubError(selected);
  const selectedStubId = String(selected?.stubId || "").trim();
  const showResponseSchemaHint = hasResponseSchemaError(selected);
  const selectedRoom = String(selected?.room || "").trim();
  const selectedSetupRoom =
    selectedRoom.toLowerCase() === "global" ? "" : selectedRoom;
  const selectedCallReceivedAtMs = parseTimestampToMs(selected?.timestamp);
  const latestEditedStubEventForSelected = editedStubHistory.find(
    (item) => item.stubId === selectedStubId,
  );
  const latestEditedStubSavedAt =
    latestEditedStubEventForSelected?.savedAt ?? 0;
  const isEditedSignalFreshForSelectedCall =
    latestEditedStubSavedAt === 0 ||
    selectedCallReceivedAtMs === null ||
    latestEditedStubSavedAt >= selectedCallReceivedAtMs;
  const suggestedRoom = activeRoom.trim();
  const isInGlobalScope = suggestedRoom.length === 0;
  const selectedPeer = String(selected?.client || "").trim();
  const selectedService = String(selected?.service || "").trim();
  const selectedMethod = String(selected?.method || "").trim();
  const selectedCode = selected?.code;
  const selectedServedBy = selected ? getServedBy(selected) : "stub";
  const selectedRouteKey = buildSnifferRouteKey(
    selectedRoom,
    selectedService,
    selectedMethod,
  );
  const selectedHistorySource = selected?.source || defaultSnifferSource;
  const selectedNextResponseSource =
    (selectedRouteKey ? routeSources[selectedRouteKey] : undefined) ||
    selectedHistorySource;
  const selectedResponseSource = selectedHistorySource;
  const selectedReflectionServedBy =
    (selectedRouteKey
      ? reflectionServedByRoutes[selectedRouteKey]
      : undefined) || defaultReflectionServedBy;
  const hasSelectedSourceChanged =
    selectedRouteKey.length > 0 &&
    selectedNextResponseSource !== selectedHistorySource;
  const resolvedPeerRoom = (selectedPeer ? peerBoundRoom : selectedRoom).trim();
  const isPeerBoundToAnyRoom = resolvedPeerRoom.length > 0;
  const isGlobalRoomCall = !!selected && selectedRoom.length === 0;
  const showMissingRoomHint = isGlobalRoomCall && !isPeerBoundToAnyRoom;
  const { data: backendRooms = [] } = useGetList<RoomRow>(
    "rooms",
    { pagination: { page: 1, perPage: 1000 } },
    { retry: false, staleTime: 30_000, refetchOnWindowFocus: false },
  );
  const { data: clientsLookup = [] } = useGetList<ClientLookupRow>(
    "clients",
    { pagination: { page: 1, perPage: 2000 } },
    { retry: false, staleTime: 10_000, refetchOnWindowFocus: true },
  );
  const clientNameByKey = useMemo(() => {
    const map = new Map<string, string>();
    clientsLookup.forEach((item) => {
      const peerHost = String(item.peerHost || "").trim();
      const userAgent = String(item.userAgent || "").trim();
      const key = `${peerHost}|${userAgent}`;
      const name = String(item.name || "").trim();
      if ((peerHost === "" && userAgent === "") || !name) {
        return;
      }

      map.set(key, name);
    });
    return map;
  }, [clientsLookup]);
  const getClientDisplayName = useCallback(
    (record: HistoryRecord): string => {
      const clientKey = String(record.client || "").trim();
      if (!clientKey) {
        return "-";
      }

      return clientNameByKey.get(clientKey) || clientKey;
    },
    [clientNameByKey],
  );
  const availableRoomsForAttachment = useMemo(
    () =>
      backendRooms
        .map((item) => resolveRoomRow(item))
        .filter((item): item is { id: string; name: string } => item !== null),
    [backendRooms],
  );
  const selectedAttachmentRoom = useMemo(() => {
    if (!isInGlobalScope) {
      return suggestedRoom;
    }

    const normalized = roomForAttachment.trim();
    return normalized;
  }, [isInGlobalScope, roomForAttachment, suggestedRoom]);
  const canAssignPeerRoom =
    !isPeerBoundToAnyRoom && !!selectedAttachmentRoom && !!selectedPeer;
  const expectedAttachedRoom = (
    isInGlobalScope ? selectedAttachmentRoom : suggestedRoom
  ).trim();
  const isPeerAttachedToExpectedRoom =
    !!expectedAttachedRoom && resolvedPeerRoom === expectedAttachedRoom;
  const shouldShowProtoUploadedHint = hasProtoFromApi && showMissingProtoHint;
  const hasProtoForSelectedCall = Boolean(
    selectedService && selectedMethod && hasProtoFromApi,
  );
  const shouldShowAttachedRoomInfo =
    isGlobalRoomCall &&
    isPeerBoundToAnyRoom &&
    isPeerAttachedToExpectedRoom &&
    !!selectedPeer &&
    recentlyAttachedPeer === selectedPeer;
  const shouldShowCombinedAttachAndProtoHint =
    shouldShowAttachedRoomInfo && shouldShowProtoUploadedHint;
  const attachedRoomLabel = expectedAttachedRoom || resolvedPeerRoom;
  const shouldHideResponsePayload =
    showMissingProtoHint || showMissingRoomHint || shouldShowAttachedRoomInfo;
  const shouldShowMissingStubBlock =
    !shouldHideResponsePayload && showMissingStubHint;
  const shouldShowInvalidStubBlock =
    !shouldHideResponsePayload && showResponseSchemaHint;
  const shouldShowProxyNextResponseBlock =
    responsePanelMode === "response" &&
    selectedNextResponseSource === "reflection" &&
    selectedReflectionServedBy === "proxy" &&
    !shouldHideResponsePayload &&
    (shouldShowInvalidStubBlock || shouldShowMissingStubBlock);
  const shouldShowResponsePayloadBlock =
    !shouldHideResponsePayload &&
    !shouldShowProxyNextResponseBlock &&
    !shouldShowInvalidStubBlock &&
    !shouldShowMissingStubBlock;
  const shouldPromptEnterRoomToSetup =
    isInGlobalScope &&
    !!selectedSetupRoom &&
    (showMissingProtoHint || showMissingStubHint || showResponseSchemaHint);
  const shouldShowSourceChangedRetryBanner =
    hasSelectedSourceChanged &&
    !shouldHideResponsePayload &&
    !shouldPromptEnterRoomToSetup;
  const latestReplacedSignalForSelectedCall = stubReplacedHistory.find(
    (item) =>
      sameServiceAlias(item.service, selectedService) &&
      normalizeValue(item.method) === normalizeValue(selectedMethod),
  );
  const latestReplacedSavedAt =
    latestReplacedSignalForSelectedCall?.savedAt ?? 0;
  const shouldShowStubEditedRetryHint =
    shouldShowInvalidStubBlock &&
    isEditedSignalFreshForSelectedCall &&
    latestEditedStubSavedAt > 0;
  const shouldShowStubReplacedRetryHint =
    shouldShowInvalidStubBlock &&
    latestReplacedSavedAt > 0 &&
    (selectedCallReceivedAtMs === null ||
      latestReplacedSavedAt >= selectedCallReceivedAtMs);
  const persistedResolutionKind = getStubCallResolutionKind(selectedRequestId);
  const resolvedRetryHintKind =
    persistedResolutionKind ||
    (shouldShowStubReplacedRetryHint
      ? "replaced"
      : shouldShowStubEditedRetryHint
        ? "edited"
        : "");
  const shouldShowResolvedReplacedHint =
    shouldShowInvalidStubBlock && resolvedRetryHintKind === "replaced";
  const shouldShowResolvedEditedHint =
    shouldShowInvalidStubBlock && resolvedRetryHintKind === "edited";
  const shouldHideSelectAnotherStubButton =
    shouldShowResolvedReplacedHint || shouldShowResolvedEditedHint;
  const stubsListPath = useMemo(() => {
    const basePath = createPath({ resource: "stubs", type: "list" });
    if (!selectedService || !selectedMethod) {
      return basePath;
    }

    const filter = encodeURIComponent(
      JSON.stringify({ service: selectedService, method: selectedMethod }),
    );
    return `${basePath}?filter=${filter}`;
  }, [createPath, selectedMethod, selectedService]);
  const snifferPath = useMemo(
    () => createPath({ resource: "sniffer", type: "list" }),
    [createPath],
  );
  const selectedStubEditPath = useMemo(() => {
    if (!selectedStubId) {
      return createPath({ resource: "stubs", type: "list" });
    }

    return createPath({ resource: "stubs", type: "edit", id: selectedStubId });
  }, [createPath, selectedStubId]);
  const stubCreatePath = useMemo(
    () => createPath({ resource: "stubs", type: "create" }),
    [createPath],
  );
  const selectedServiceAndMethodFilter = useMemo(
    () => ({ service: selectedService, method: selectedMethod }),
    [selectedMethod, selectedService],
  );
  const shouldFetchMatchingStubs = Boolean(selectedService && selectedMethod);
  const { data: matchingStubs = [], total: matchingStubsTotal } =
    useGetList<StubRecord>(
      "stubs",
      {
        pagination: { page: 1, perPage: 1 },
        sort: { field: "id", order: "DESC" },
        filter: selectedServiceAndMethodFilter,
      },
      {
        enabled: shouldFetchMatchingStubs,
        retry: false,
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
    );
  const hasAnyMatchingStubs = (matchingStubsTotal ?? matchingStubs.length) > 0;
  const hasSelectedRouteStub = Boolean(selectedStubId) && hasAnyMatchingStubs;
  const selectedProtofileName =
    (selectedRouteKey ? selectedProtofilesByRoute[selectedRouteKey] : "") || "";
  const protofileOptions = useMemo<ProtofileOption[]>(() => {
    const deduped = new Map<string, ProtofileOption>();
    availableProtofiles.forEach((item) => {
      const name = String(item.name || item.id || "").trim();
      if (!name || deduped.has(name)) {
        return;
      }
      const version =
        typeof item.version === "number" && item.version > 0
          ? ` v${item.version}`
          : "";
      deduped.set(name, { name, label: `${name}${version}` });
    });
    return Array.from(deduped.values());
  }, [availableProtofiles]);
  const selectedProtofileOption = useMemo(
    () =>
      protofileOptions.find((option) => option.name === selectedProtofileName) ??
      null,
    [protofileOptions, selectedProtofileName],
  );
  const routeStubId = String(matchingStubs[0]?.id || "").trim();
  const routeStubEditPath = useMemo(() => {
    if (!routeStubId) {
      return createPath({ resource: "stubs", type: "list" });
    }

    return createPath({ resource: "stubs", type: "edit", id: routeStubId });
  }, [createPath, routeStubId]);
  const canCreateStubFromSelectedCall = Boolean(
    selectedService && selectedMethod,
  );
  const latestCreatedSignalForSelectedCall = stubCreatedHistory.find(
    (item) =>
      sameServiceAlias(item.service, selectedService) &&
      normalizeValue(item.method) === normalizeValue(selectedMethod),
  );
  const latestCreatedSavedAt = latestCreatedSignalForSelectedCall?.savedAt ?? 0;
  const shouldShowStubCreatedHint =
    shouldShowMissingStubBlock &&
    latestCreatedSavedAt > 0 &&
    (selectedCallReceivedAtMs === null ||
      latestCreatedSavedAt >= selectedCallReceivedAtMs);
  const shouldShowStubAssignedRetryHint =
    shouldShowMissingStubBlock &&
    latestReplacedSavedAt > 0 &&
    (selectedCallReceivedAtMs === null ||
      latestReplacedSavedAt >= selectedCallReceivedAtMs);
  const shouldShowStubCreatedAndAssignedRetryHint =
    shouldShowStubCreatedHint && shouldShowStubAssignedRetryHint;
  const callTableFilterOptions = useMemo(
    () => ({
      client: buildDistinctFilterOptions(
        records.map((record) => getClientDisplayName(record)),
      ),
      service: buildDistinctFilterOptions(
        records.map((record) => String(record.service || "-").trim() || "-"),
      ),
      method: buildDistinctFilterOptions(
        records.map((record) => String(record.method || "-").trim() || "-"),
      ),
      code: buildDistinctFilterOptions(
        records.map((record) => String(record.code ?? 0)),
      ),
      servedBy: buildDistinctFilterOptions(
        records.map((record) => servedByLabels[getServedBy(record)]),
      ),
      room: buildDistinctFilterOptions(
        records.map(
          (record) => String(record.room || "global").trim() || "global",
        ),
      ),
    }),
    [records, getClientDisplayName],
  );
  const filteredRecords = useMemo(() => {
    const clientQuery = normalizeFilterQuery(callTableFilters.client.query);
    const serviceQuery = normalizeFilterQuery(callTableFilters.service.query);
    const methodQuery = normalizeFilterQuery(callTableFilters.method.query);
    const codeQuery = normalizeFilterQuery(callTableFilters.code.query);
    const servedByQuery = normalizeFilterQuery(callTableFilters.servedBy.query);
    const roomQuery = normalizeFilterQuery(callTableFilters.room.query);
    const selectedClients =
      callTableFilters.client.selected.map(normalizeFilterQuery);
    const selectedServices =
      callTableFilters.service.selected.map(normalizeFilterQuery);
    const selectedMethods =
      callTableFilters.method.selected.map(normalizeFilterQuery);
    const selectedCodes =
      callTableFilters.code.selected.map(normalizeFilterQuery);
    const selectedServedBy =
      callTableFilters.servedBy.selected.map(normalizeFilterQuery);
    const selectedRooms =
      callTableFilters.room.selected.map(normalizeFilterQuery);

    return records.filter((record) => {
      const clientValue = getClientDisplayName(record);
      if (clientQuery && !clientValue.toLowerCase().includes(clientQuery)) {
        return false;
      }
      if (
        selectedClients.length > 0 &&
        !selectedClients.includes(normalizeFilterQuery(clientValue))
      ) {
        return false;
      }

      const serviceValue = String(record.service || "-").trim() || "-";
      if (serviceQuery && !serviceValue.toLowerCase().includes(serviceQuery)) {
        return false;
      }
      if (
        selectedServices.length > 0 &&
        !selectedServices.includes(normalizeFilterQuery(serviceValue))
      ) {
        return false;
      }

      const methodValue = String(record.method || "-").trim() || "-";
      if (methodQuery && !methodValue.toLowerCase().includes(methodQuery)) {
        return false;
      }
      if (
        selectedMethods.length > 0 &&
        !selectedMethods.includes(normalizeFilterQuery(methodValue))
      ) {
        return false;
      }

      const codeValue = String(record.code ?? 0);
      if (codeQuery && !codeValue.toLowerCase().includes(codeQuery)) {
        return false;
      }
      if (
        selectedCodes.length > 0 &&
        !selectedCodes.includes(normalizeFilterQuery(codeValue))
      ) {
        return false;
      }

      const servedByValue = servedByLabels[getServedBy(record)];
      if (
        servedByQuery &&
        !servedByValue.toLowerCase().includes(servedByQuery)
      ) {
        return false;
      }
      if (
        selectedServedBy.length > 0 &&
        !selectedServedBy.includes(normalizeFilterQuery(servedByValue))
      ) {
        return false;
      }

      const roomValue = String(record.room || "global").trim() || "global";
      if (roomQuery && !roomValue.toLowerCase().includes(roomQuery)) {
        return false;
      }
      if (
        selectedRooms.length > 0 &&
        !selectedRooms.includes(normalizeFilterQuery(roomValue))
      ) {
        return false;
      }

      return true;
    });
  }, [callTableFilters, records, getClientDisplayName]);
  const hasActiveCallTableFilters = useMemo(
    () =>
      Object.values(callTableFilters).some(
        (value) => value.query.trim().length > 0 || value.selected.length > 0,
      ),
    [callTableFilters],
  );

  const setCallTableFilterQuery = useCallback(
    (field: CallTableFilterField, value: string) => {
      setCallTableFilters((current) => ({
        ...current,
        [field]: { ...current[field], query: value },
      }));
    },
    [],
  );
  const toggleCallTableFilterSelection = useCallback(
    (field: CallTableFilterField, value: string) => {
      setCallTableFilters((current) => {
        const selected = current[field].selected;
        const exists = includesNormalized(selected, value);
        const nextSelected = exists
          ? selected.filter(
              (item) =>
                normalizeFilterQuery(item) !== normalizeFilterQuery(value),
            )
          : [...selected, value.trim()];
        return {
          ...current,
          [field]: { ...current[field], selected: nextSelected },
        };
      });
    },
    [],
  );
  const pinCallTableFilterValue = useCallback(
    (field: CallTableFilterField, value: string) => {
      const normalizedValue = value.trim();
      if (!normalizedValue) {
        return;
      }
      setCallTableFilters((current) => {
        const selected = current[field].selected;
        if (includesNormalized(selected, normalizedValue)) {
          return current;
        }
        return {
          ...current,
          [field]: {
            ...current[field],
            selected: [...selected, normalizedValue],
          },
        };
      });
    },
    [],
  );
  const isCallTableFilterFieldActive = useCallback(
    (field: CallTableFilterField) =>
      callTableFilters[field].query.trim().length > 0 ||
      callTableFilters[field].selected.length > 0,
    [callTableFilters],
  );
  const clearCallTableFilters = useCallback(() => {
    setCallTableFilters(EMPTY_CALL_TABLE_FILTERS);
  }, []);
  const callTableTotalMinWidth = useMemo(
    () =>
      (Object.keys(callTableColumnWidths) as CallTableColumnKey[]).reduce(
        (total, key) => total + callTableColumnWidths[key],
        0,
      ),
    [callTableColumnWidths],
  );
  const getCallTableColumnSx = useCallback(
    (key: CallTableColumnKey) => ({
      position: "relative",
      width: `${callTableColumnWidths[key]}px`,
      minWidth: `${callTableColumnWidths[key]}px`,
      maxWidth: `${callTableColumnWidths[key]}px`,
      boxSizing: "border-box",
    }),
    [callTableColumnWidths],
  );
  const startCallTableColumnResize = useCallback(
    (leftKey: CallTableColumnKey, rightKey: CallTableColumnKey) =>
      (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      activeResizeRef.current = "callTableColumns";
      activeCallTableColumnResizeRef.current = {
        leftKey,
        rightKey,
        startX: event.clientX,
        startLeftWidth: callTableColumnWidths[leftKey],
        startRightWidth: callTableColumnWidths[rightKey],
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [callTableColumnWidths],
  );
  const openCallTableFilterMenu = useCallback(
    (field: CallTableFilterField) => (event: MouseEvent<HTMLElement>) => {
      setCallTableFilterMenu({ field, anchorEl: event.currentTarget });
    },
    [],
  );
  const closeCallTableFilterMenu = useCallback(() => {
    setCallTableFilterMenu(null);
  }, []);
  const clearCallTableFilterField = useCallback(
    (field: CallTableFilterField) => {
      setCallTableFilters((current) => ({
        ...current,
        [field]: { query: "", selected: [] },
      }));
    },
    [],
  );
  const openedCallTableFilterField = callTableFilterMenu?.field ?? null;
  const openedCallTableFilterOptions = openedCallTableFilterField
    ? callTableFilterOptions[openedCallTableFilterField]
    : [];
  const openedCallTableFilterQuery = openedCallTableFilterField
    ? callTableFilters[openedCallTableFilterField].query
    : "";
  const openedCallTableFilterSelected = openedCallTableFilterField
    ? callTableFilters[openedCallTableFilterField].selected
    : [];
  const pinnedOnlySelectedOptions = useMemo(
    () =>
      openedCallTableFilterSelected.filter(
        (item) => !includesNormalized(openedCallTableFilterOptions, item),
      ),
    [openedCallTableFilterOptions, openedCallTableFilterSelected],
  );
  const allOpenedCallTableFilterOptions = useMemo(
    () => [...pinnedOnlySelectedOptions, ...openedCallTableFilterOptions],
    [openedCallTableFilterOptions, pinnedOnlySelectedOptions],
  );
  const canPinOpenedCallTableFilterValue = useMemo(() => {
    const normalizedQuery = openedCallTableFilterQuery.trim();
    if (!normalizedQuery) {
      return false;
    }
    return !includesNormalized(openedCallTableFilterSelected, normalizedQuery);
  }, [openedCallTableFilterQuery, openedCallTableFilterSelected]);
  const openedCallTableFilteredOptions = useMemo(() => {
    const normalizedQuery = normalizeFilterQuery(openedCallTableFilterQuery);
    if (!normalizedQuery) {
      return allOpenedCallTableFilterOptions;
    }
    return allOpenedCallTableFilterOptions.filter((item) =>
      item.toLowerCase().includes(normalizedQuery),
    );
  }, [allOpenedCallTableFilterOptions, openedCallTableFilterQuery]);

  useEffect(() => {
    if (!isInGlobalScope) {
      setRoomForAttachment(suggestedRoom);
      return;
    }

    setRoomForAttachment((current) => {
      const normalizedCurrent = current.trim();
      if (
        normalizedCurrent &&
        availableRoomsForAttachment.some(
          (item) => item.id === normalizedCurrent,
        )
      ) {
        return normalizedCurrent;
      }

      return availableRoomsForAttachment[0]?.id || "";
    });
  }, [availableRoomsForAttachment, isInGlobalScope, suggestedRoom]);
  const requestPayload = useMemo(() => {
    if (selected?.requests && selected.requests.length > 1) {
      return selected.requests.map((item) => unwrapRootPayload(item));
    }

    return unwrapRootPayload(selected?.request ?? {});
  }, [selected]);
  const requestPayloadText = useMemo(
    () => formatJsonPayload(requestPayload),
    [requestPayload],
  );
  const hasRequestSearchablePayload = useMemo(() => {
    if (!selected) {
      return false;
    }

    if (Array.isArray(selected.requests) && selected.requests.length > 0) {
      return selected.requests.some((item) =>
        hasSearchableContent(unwrapRootPayload(item)),
      );
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
      Array.isArray(selected?.responses) && selected.responses.length > 0
        ? selected.responses
        : [];
    const responsePayloads =
      selectedResponses.length > 0
        ? selectedResponses
        : [selected?.response ?? {}];
    const responseTimestamps = Array.isArray(selected?.responseTimestamps)
      ? selected.responseTimestamps
      : [];

    return responsePayloads.map((payload, index) => {
      const unwrappedPayload = unwrapRootPayload(payload);
      return {
        key: `${index}-${String(responseTimestamps[index] || "")}`,
        payload: unwrappedPayload,
        payloadText: formatJsonPayload(unwrappedPayload),
        timestamp:
          responseTimestamps[index] ||
          (index === 0 ? selected?.timestamp : undefined),
        index,
      };
    });
  }, [selected]);
  const orderedResponseEntries = useMemo(
    () => [...responseEntries].reverse(),
    [responseEntries],
  );
  const hasResponseSearchablePayload = useMemo(() => {
    if (!selected) {
      return false;
    }

    if (Array.isArray(selected.responses) && selected.responses.length > 0) {
      return selected.responses.some((item) =>
        hasSearchableContent(unwrapRootPayload(item)),
      );
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
      const ranges = collectMatchRanges(
        entry.payloadText,
        responseSearchRegex,
        offset,
      );
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
    ? formatServerReceivedAt(
        singleResponseEntry?.timestamp || selected?.timestamp,
      )
    : undefined;
  const isResponseViewMode = responsePanelMode === "response";

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
    setResponsePanelMode("response");
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
    setRequestActiveMatch((current) =>
      current < 0 || current >= requestMatchCount ? 0 : current,
    );
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
    setResponseActiveMatch((current) =>
      current < 0 || current >= responseMatchData.totalMatches ? 0 : current,
    );
  }, [responseMatchData.totalMatches, showResponseSearch]);

  useEffect(() => {
    if (!showRequestSearch || requestActiveMatch < 0) {
      return;
    }
    const marker =
      requestSearchContainerRef.current?.querySelector<HTMLElement>(
        `[data-match-index="${requestActiveMatch}"]`,
      );
    marker?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [requestActiveMatch, requestMatchRanges, showRequestSearch]);

  useEffect(() => {
    if (!showResponseSearch || responseActiveMatch < 0) {
      return;
    }
    const marker =
      responseSearchContainerRef.current?.querySelector<HTMLElement>(
        `[data-match-index="${responseActiveMatch}"]`,
      );
    marker?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [responseActiveMatch, responseMatchData, showResponseSearch]);

  useEffect(() => {
    if (
      !showResponseSearch ||
      !responseSearchQuery.trim() ||
      orderedResponseEntries.length <= 1
    ) {
      return;
    }
    setExpandedResponseKeys(
      new Set(orderedResponseEntries.map((entry) => entry.key)),
    );
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
    const service = selectedService.trim();
    const method = selectedMethod.trim();
    if (!service || !method) {
      setAvailableProtofiles([]);
      setIsLoadingProtofiles(false);
      return;
    }

    const query = new URLSearchParams();
    query.set("service", service);
    query.set("method", method);

    let cancelled = false;
    setIsLoadingProtofiles(true);
    apiClient
      .request<ProtofileRecord[]>(`/protofiles?${query.toString()}`)
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setAvailableProtofiles(Array.isArray(payload) ? payload : []);
      })
      .catch(() => {
        if (!cancelled) {
          setAvailableProtofiles([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingProtofiles(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedMethod, selectedService]);

  useEffect(() => {
    if (!selectedRouteKey || availableProtofiles.length === 0) {
      return;
    }

    const current = selectedProtofilesByRoute[selectedRouteKey];
    const hasCurrent = availableProtofiles.some(
      (item) => String(item.name || item.id || "").trim() === current,
    );
    if (current && hasCurrent) {
      return;
    }

    const firstName = String(
      availableProtofiles[0]?.name || availableProtofiles[0]?.id || "",
    ).trim();
    if (!firstName) {
      return;
    }
    setSelectedProtofilesByRoute((currentByRoute) => ({
      ...currentByRoute,
      [selectedRouteKey]: firstName,
    }));
  }, [availableProtofiles, selectedProtofilesByRoute, selectedRouteKey]);

  useEffect(() => {
    const peer = selectedPeer.trim();
    if (!peer) {
      setPeerBoundRoom("");
      return;
    }

    let cancelled = false;
    apiClient
      .request<{ room?: string; bound?: boolean }>(
        `/rooms/peers/status?peer=${encodeURIComponent(peer)}`,
      )
      .then((payload) => {
        if (cancelled) {
          return;
        }
        const boundRoom = String(payload?.room || "").trim();
        setPeerBoundRoom(boundRoom);
      })
      .catch(() => {
        if (!cancelled) {
          setPeerBoundRoom("");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedPeer]);

  const handleAssignPeerRoom = useCallback(async () => {
    if (!selectedPeer) {
      notify("Selected call has no peer identifier.", { type: "warning" });
      return;
    }

    const targetRoom = selectedAttachmentRoom.trim();
    if (!targetRoom) {
      notify("Select a room first.", { type: "warning" });
      return;
    }

    try {
      await apiClient.request<{ message?: string }>("/rooms/peers", {
        method: "POST",
        body: JSON.stringify({ peer: selectedPeer, room: targetRoom }),
      });
      setPeerBoundRoom(targetRoom);
      setRecentlyAttachedPeer(selectedPeer);
    } catch (error) {
      notify((error as Error).message || "Failed to assign peer to room", {
        type: "warning",
      });
    }
  }, [notify, selectedAttachmentRoom, selectedPeer]);

  const handleEnterSelectedRoomForSetup = useCallback(() => {
    if (!selectedSetupRoom) {
      return;
    }

    setCurrentRoom(selectedSetupRoom);
    setActiveRoom(selectedSetupRoom);
    notify(`Entered room ${selectedSetupRoom}`, { type: "info" });
  }, [notify, selectedSetupRoom]);

  const ensureReflectionProxyReady = useCallback(async () => {
    const source = normalizeReflectionSource(reflectionHost);
    if (!source) {
      throw new Error("Enter reflection host");
    }

    await dataProvider.create("descriptors", {
      data: { source },
    });
    const { hasMethod, hasProto } = await checkProtoStatus(
      selectedService,
      selectedMethod,
    );
    setHasMethodFromApi(hasMethod);
    setHasProtoFromApi(hasProto);
    await loadHistorySnapshot().catch(() => {
      // Keep current snapshot on refresh failure.
    });
    setStreamRevision((current) => current + 1);
  }, [
    checkProtoStatus,
    dataProvider,
    loadHistorySnapshot,
    reflectionHost,
    selectedMethod,
    selectedService,
  ]);

  const handleResponseSourceChange = async (
    source: SnifferSource,
    servedBy?: ReflectionServedBy,
    options?: { skipReflectionBootstrap?: boolean },
  ) => {
    if (!selectedRouteKey) {
      return;
    }

    const resolvedServedBy =
      source === "reflection"
        ? (servedBy || defaultReflectionServedBy)
        : undefined;
    if (
      source === "reflection" &&
      resolvedServedBy === "proxy" &&
      !options?.skipReflectionBootstrap
    ) {
      await ensureReflectionProxyReady();
    }

    if (selectedService && selectedMethod) {
      await apiClient.request("/sniffer/route-source", {
        method: "POST",
        body: JSON.stringify({
          service: selectedService,
          method: selectedMethod,
          room: selectedRoom,
          source,
          ...(source === "reflection" ? { servedBy: resolvedServedBy } : {}),
        }),
      });
    }

    const nextChange: SnifferSourceChange = {
      source,
      changedAtMs: Date.now(),
    };

    setRouteSources((current) => {
      const next = {
        ...current,
        [selectedRouteKey]: source,
      };
      writeSnifferRouteSources(next);

      return next;
    });
    const nextSourceChangeMarkers = {
      ...sourceChangeMarkersRef.current,
      [selectedRouteKey]: [
        ...(sourceChangeMarkersRef.current[selectedRouteKey] || []),
        nextChange,
      ],
    };
    sourceChangeMarkersRef.current = nextSourceChangeMarkers;
    writeSnifferRouteSourceChanges(nextSourceChangeMarkers);
    setSourceChangeMarkers(nextSourceChangeMarkers);
  };

  const persistReflectionServedByRoute = (
    routeKey: string,
    servedBy: ReflectionServedBy,
  ) => {
    setReflectionServedByRoutes((current) => {
      const next = {
        ...current,
        [routeKey]: servedBy,
      };
      writeReflectionServedByRoutes(next);

      return next;
    });
  };

  const handleReflectionServedByChange = async (
    servedBy: ReflectionServedBy,
  ) => {
    if (!selectedRouteKey) {
      return;
    }

    const previousServedBy = selectedReflectionServedBy;
    persistReflectionServedByRoute(selectedRouteKey, servedBy);
    try {
      await handleResponseSourceChange("reflection", servedBy);
    } catch (error) {
      persistReflectionServedByRoute(selectedRouteKey, previousServedBy);
      throw error;
    }
  };

  const runReflectionWithMode = async (persistHost: boolean) => {
    if (!selectedRouteKey) {
      return;
    }

    const source = normalizeReflectionSource(reflectionHost);
    if (!source) {
      setReflectionHostError("Enter reflection host");
      setReflectionHostErrorPulse((current) => current + 1);
      return;
    }

    setReflectionHostError("");
    if (!persistHost) {
      setReflectionHostSuccessPulse(0);
    }
    if (persistHost) {
      setIsSettingReflection(true);
    } else {
      setIsCheckingReflection(true);
    }
    try {
      let configuredSource = source;
      if (persistHost) {
        const saved = await apiClient.request<ReflectionHostRecord>(
          "/reflection-hosts",
          {
            method: "POST",
            body: JSON.stringify({ host: reflectionHost.trim(), source }),
          },
        );
        configuredSource = saved.source || source;
        setReflectionHost(configuredSource);
        await loadReflectionHosts().catch(() => {
          // Keep the manually entered host if refreshing the list fails.
        });
      }

      await dataProvider.create("descriptors", {
        data: { source: configuredSource },
      });
      const { hasMethod, hasProto } = await checkProtoStatus(
        selectedService,
        selectedMethod,
      );
      setHasMethodFromApi(hasMethod);
      setHasProtoFromApi(hasProto);
      await loadHistorySnapshot().catch(() => {
        // Keep current snapshot on refresh failure.
      });
      setStreamRevision((current) => current + 1);
      await handleResponseSourceChange("reflection", selectedReflectionServedBy, {
        skipReflectionBootstrap: true,
      });
      setReflectionHostSuccessPulse((current) => current + 1);
      if (persistHost) {
        setReflectionHostSetError(false);
        setReflectionHostSetSuccess(true);
      }
    } catch {
      setReflectionHostError("Reflection host/port is unavailable");
      setReflectionHostErrorPulse((current) => current + 1);
      setReflectionHostSetSuccess(false);
      if (persistHost) {
        setReflectionHostSetError(true);
      }
    } finally {
      if (persistHost) {
        setIsSettingReflection(false);
      } else {
        setIsCheckingReflection(false);
      }
    }
  };
  const handleCheckReflection = async () => runReflectionWithMode(false);
  const handleSetReflection = async () => runReflectionWithMode(true);

  useEffect(() => {
    const reflectionRouteEntries = Object.entries(routeSources).filter(
      ([, source]) => source === "reflection",
    );
    if (reflectionRouteEntries.length === 0) {
      return;
    }

    const pending = reflectionRouteEntries.filter(([routeKey]) => {
      const servedBy =
        reflectionServedByRoutes[routeKey] || defaultReflectionServedBy;
      return bootstrappedReflectionRouteModesRef.current[routeKey] !== servedBy;
    });
    if (pending.length === 0) {
      return;
    }

    let cancelled = false;
    void (async () => {
      if (
        pending.some(
          ([routeKey]) =>
            (reflectionServedByRoutes[routeKey] || defaultReflectionServedBy) ===
            "proxy",
        )
      ) {
        await ensureReflectionProxyReady();
      }

      await Promise.all(
        pending.map(async ([routeKey]) => {
          const parsed = parseSnifferRouteKey(routeKey);
          if (!parsed) {
            return;
          }

          const servedBy =
            reflectionServedByRoutes[routeKey] || defaultReflectionServedBy;
          await apiClient.request("/sniffer/route-source", {
            method: "POST",
            body: JSON.stringify({
              service: parsed.service,
              method: parsed.method,
              room: parsed.room,
              source: "reflection",
              servedBy,
            }),
          });
        }),
      );

      if (cancelled) {
        return;
      }

      pending.forEach(([routeKey]) => {
        bootstrappedReflectionRouteModesRef.current[routeKey] =
          reflectionServedByRoutes[routeKey] || defaultReflectionServedBy;
      });
    })().catch(() => {
      // Keep local selection; user can still apply manually via selector.
    });

    return () => {
      cancelled = true;
    };
  }, [
    ensureReflectionProxyReady,
    reflectionServedByRoutes,
    routeSources,
  ]);

  useEffect(() => {
    if (
      selectedNextResponseSource !== "reflection" ||
      !selectedRouteKey ||
      !selectedService ||
      !selectedMethod
    ) {
      return;
    }

    if (
      syncedReflectionServedByRef.current[selectedRouteKey] ===
      selectedReflectionServedBy
    ) {
      return;
    }

    syncedReflectionServedByRef.current[selectedRouteKey] =
      selectedReflectionServedBy;
    void (async () => {
      if (selectedReflectionServedBy === "proxy") {
        await ensureReflectionProxyReady();
      }
      await apiClient.request("/sniffer/route-source", {
        method: "POST",
        body: JSON.stringify({
          service: selectedService,
          method: selectedMethod,
          room: selectedRoom,
          source: "reflection",
          servedBy: selectedReflectionServedBy,
        }),
      })
        .catch(() => {
          throw new Error("Failed to sync reflection route mode");
        });
    })().catch(() => {
        delete syncedReflectionServedByRef.current[selectedRouteKey];
      });
  }, [
    ensureReflectionProxyReady,
    selectedMethod,
    selectedNextResponseSource,
    selectedReflectionServedBy,
    selectedRoom,
    selectedRouteKey,
    selectedService,
  ]);

  const handleProtoSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setIsUploadingProto(true);
    try {
      await dataProvider.create("descriptors", { data: { file } });
      const { hasMethod, hasProto } = await checkProtoStatus(
        selectedService,
        selectedMethod,
      );
      setHasMethodFromApi(hasMethod);
      setHasProtoFromApi(hasProto);
      await loadAvailableProtofiles(selectedService, selectedMethod);
      await handleResponseSourceChange("proto");
      notify("Descriptor uploaded.", { type: "success" });
      await loadHistorySnapshot().catch(() => {
        // Keep current snapshot on refresh failure.
      });
      setStreamRevision((current) => current + 1);
    } catch (error) {
      notify((error as Error).message || "Failed to upload descriptor", {
        type: "error",
      });
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setIsUploadingProto(false);
    }
  };

  const reflectionHostOptions = Array.from(
    new Set(
      reflectionHosts
        .map((item) => item.source || item.host || "")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );

  const reflectionHostControl = (
    <Box sx={nextResponseReflectionHostSx}>
      <Autocomplete
        freeSolo
        disableClearable
        options={reflectionHostOptions}
        inputValue={reflectionHost}
        onInputChange={(_, value) => {
          setReflectionHost(value);
          if (reflectionHostError) {
            setReflectionHostError("");
          }
          if (reflectionHostSetError) {
            setReflectionHostSetError(false);
          }
          if (reflectionHostSetSuccess) {
            setReflectionHostSetSuccess(false);
          }
          if (reflectionHostSuccessPulse) {
            setReflectionHostSuccessPulse(0);
          }
        }}
        sx={[
          nextResponseReflectionHostInputSx,
          reflectionHostError ? reflectionHostPulseSx : null,
          !reflectionHostError && reflectionHostSuccessPulse
            ? reflectionHostSuccessPulseSx
            : null,
          !reflectionHostError && reflectionHostSetSuccess
            ? reflectionHostSetSx
            : null,
          reflectionHostSetError ? reflectionHostSetErrorSx : null,
        ]}
        renderInput={(params) => (
          <TextField
            {...params}
            key={`${reflectionHostErrorPulse}:${reflectionHostSuccessPulse}`}
            size="small"
            variant="outlined"
            label="Reflection host"
            placeholder="localhost:50051"
            error={Boolean(reflectionHostError)}
            helperText={reflectionHostError}
            InputProps={{
              ...params.InputProps,
              endAdornment: (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.25,
                  }}
                >
                  {params.InputProps.endAdornment}
                  <IconButton
                    onClick={handleCheckReflection}
                    disabled={
                      isCheckingReflection ||
                      isSettingReflection ||
                      !reflectionHost.trim()
                    }
                    sx={nextResponseCheckIconButtonSx}
                  >
                    <Box
                      sx={{
                        position: "relative",
                        width: 16,
                        height: 16,
                      }}
                    >
                      <SearchRoundedIcon
                        sx={{
                          fontSize: 16,
                          position: "absolute",
                          top: 0,
                          left: 0,
                        }}
                      />
                      <Box
                        component="span"
                        sx={{
                          position: "absolute",
                          right: -1,
                          top: -4,
                          fontSize: 9,
                          fontWeight: 700,
                          lineHeight: 1,
                        }}
                      >
                        ?
                      </Box>
                    </Box>
                  </IconButton>
                </Box>
              ),
            }}
          />
        )}
      />
      <Button
        variant="contained"
        onClick={handleSetReflection}
        disabled={
          isSettingReflection ||
          isCheckingReflection ||
          !reflectionHost.trim()
        }
        sx={nextResponseSetButtonSx}
      >
        {isSettingReflection ? "..." : "Set"}
      </Button>
    </Box>
  );
  const reflectionHostControlBlock = (
    <Box sx={reflectionHostControlContainerSx}>{reflectionHostControl}</Box>
  );

  const protoUploadControl = (
    <Button
      variant="contained"
      onClick={() => fileInputRef.current?.click()}
      disabled={isUploadingProto}
      sx={nextResponseActionButtonSx}
    >
      {isUploadingProto ? "Uploading..." : "Upload proto"}
    </Button>
  );

  const nextResponseStubControl = (
    <Box sx={nextResponseStubControlSx}>
      <Typography variant="h6" sx={nextResponseTitleSx}>
        Stub for next response
      </Typography>
      <Typography variant="body1" sx={nextResponseBodySx}>
        Choose the stub that should serve the next request, or edit the selected
        one.
      </Typography>
      <Box sx={nextResponseActionsSx}>
        {hasSelectedRouteStub ? (
          <Button
            variant="contained"
            component={RouterLink}
            to={selectedStubEditPath}
            state={{ returnTo: snifferPath }}
            sx={nextResponseActionButtonSx}
          >
            Edit selected stub
          </Button>
        ) : (
          <>
            {hasAnyMatchingStubs ? (
              <Button
                variant="outlined"
                component={RouterLink}
                to={stubsListPath}
                disabled={!canCreateStubFromSelectedCall}
                sx={nextResponseActionButtonSx}
              >
                Select stub
              </Button>
            ) : null}
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
              sx={nextResponseActionButtonSx}
            >
              Create stub
            </Button>
          </>
        )}
        {hasSelectedRouteStub ? (
          <Button
            variant="outlined"
            component={RouterLink}
            to={stubsListPath}
            disabled={!canCreateStubFromSelectedCall}
            sx={nextResponseActionButtonSx}
          >
            Select another stub
          </Button>
        ) : null}
      </Box>
    </Box>
  );

  const nextResponseSetupBlock = (
    <Box sx={nextResponseContainerSx}>
      <Box sx={nextResponseViewportSx}>
        <Box sx={nextResponseCardSx}>
          <Typography variant="h5" sx={nextResponseTitleSx}>
            Set next response
          </Typography>
          <Typography variant="body1" sx={nextResponseBodySx}>
            Configure what will serve the next call for the selected
            service/method.
          </Typography>
          <Box sx={nextResponseControlsSx}>
            <FormControl size="small" sx={nextResponseDropdownSx}>
              <Select
                value={selectedNextResponseSource}
                sx={{
                  "& .MuiSelect-icon": {
                    color: "#FF6C37",
                  },
                }}
                onChange={(event) => {
                  const nextSource = event.target.value as SnifferSource;
                  const servedBy =
                    nextSource === "reflection"
                      ? selectedReflectionServedBy
                      : undefined;
                  void handleResponseSourceChange(nextSource, servedBy).catch(
                    (error) => {
                      notify(
                        (error as Error).message ||
                          "Failed to set response source",
                        { type: "error" },
                      );
                    },
                  );
                }}
                displayEmpty
              >
                <MenuItem value="proto">proto</MenuItem>
                <MenuItem value="reflection">server reflection</MenuItem>
              </Select>
            </FormControl>

            {selectedNextResponseSource === "proto" ? (
              <>
                <Box sx={nextResponseProtoActionsRowSx}>
                  {protofileOptions.length > 0 ? (
                    <>
                      <Autocomplete
                        disableClearable
                        forcePopupIcon={false}
                        selectOnFocus={false}
                        options={protofileOptions}
                        value={selectedProtofileOption}
                        onChange={(_, option) => {
                          if (!selectedRouteKey || !option?.name) {
                            return;
                          }
                          setSelectedProtofilesByRoute((current) => ({
                            ...current,
                            [selectedRouteKey]: option.name,
                          }));
                        }}
                        getOptionLabel={(option) => option.label}
                        isOptionEqualToValue={(option, value) =>
                          option.name === value.name
                        }
                        sx={nextResponseTextInputSx}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            size="small"
                            variant="outlined"
                            label="Protofile"
                            placeholder="Search protofile"
                          />
                        )}
                      />
                      <Typography
                        variant="body2"
                        sx={nextResponseInlineSeparatorSx}
                      >
                        or
                      </Typography>
                    </>
                  ) : (
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={stateBlockHintSx}
                    >
                      No protofiles for selected method
                    </Typography>
                  )}
                  {protoUploadControl}
                </Box>
                {isLoadingProtofiles ? (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={stateBlockHintSx}
                  >
                    Loading protofiles...
                  </Typography>
                ) : null}
                {nextResponseStubControl}
              </>
            ) : (
              <>
                {reflectionHostControlBlock}
                <FormControl size="small" sx={nextResponseDropdownSx}>
                  <Select
                    value={selectedReflectionServedBy}
                    sx={{
                      "& .MuiSelect-icon": {
                        color: "#FF6C37",
                      },
                    }}
                    onChange={(event) => {
                      const servedBy = event.target.value as ReflectionServedBy;
                      void handleReflectionServedByChange(servedBy).catch(
                        (error) => {
                          notify(
                            (error as Error).message ||
                              "Failed to set reflection mode",
                            { type: "error" },
                          );
                        },
                      );
                    }}
                  >
                    <MenuItem value="stub">stub</MenuItem>
                    <MenuItem value="proxy">proxy</MenuItem>
                  </Select>
                </FormControl>
                {selectedReflectionServedBy === "stub" ? (
                  nextResponseStubControl
                ) : (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={stateBlockHintSx}
                  >
                    The next response will be served by proxy.
                  </Typography>
                )}
              </>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );

  const handleClearCurrentRoomRequests = useCallback(() => {
    const room = activeRoom.trim();
    if (!room) {
      notify("Global room requests cannot be cleared.", { type: "warning" });
      return;
    }

    apiClient
      .request<{ deletedCount?: number }>("/history/room", { method: "DELETE" })
      .then(async (payload) => {
        await loadHistorySnapshot().catch(() => {
          setRecords([]);
          setSelectedId("");
        });
        setStreamRevision((current) => current + 1);
        const deletedCount = Number(payload?.deletedCount || 0);
        notify(
          `Cleared ${deletedCount} request${deletedCount === 1 ? "" : "s"} in room: ${room}`,
          { type: "success" },
        );
      })
      .catch((error) => {
        notify(
          (error as Error).message ||
            "Failed to clear requests for current room",
          { type: "error" },
        );
      });
  }, [activeRoom, loadHistorySnapshot, notify]);

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
      return (
        (safeCurrent + direction + responseMatchData.totalMatches) %
        responseMatchData.totalMatches
      );
    });
  };

  const toggleSearchOption = (
    target: "request" | "response",
    option: keyof SearchOptions,
  ) => {
    if (target === "request") {
      setRequestSearchOptions((current) => ({
        ...current,
        [option]: !current[option],
      }));
      return;
    }
    setResponseSearchOptions((current) => ({
      ...current,
      [option]: !current[option],
    }));
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
      if (
        event.key.toLowerCase() !== "f" ||
        (!event.metaKey && !event.ctrlKey)
      ) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const isSnifferSearchInputTarget =
        target === requestSearchInputRef.current ||
        target === responseSearchInputRef.current;
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
      const canOpenResponse =
        shouldShowResponsePayloadBlock && hasResponseSearchablePayload;
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
      activeCallTableColumnResizeRef.current = null;
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
      if (activeResize === "callTableColumns") {
        const activeColumnResize = activeCallTableColumnResizeRef.current;
        if (!activeColumnResize) {
          return;
        }
        const deltaX = Math.round(event.clientX - activeColumnResize.startX);
        const minDelta =
          CALL_TABLE_MIN_COLUMN_WIDTHS[activeColumnResize.leftKey] -
          activeColumnResize.startLeftWidth;
        const maxDelta =
          activeColumnResize.startRightWidth -
          CALL_TABLE_MIN_COLUMN_WIDTHS[activeColumnResize.rightKey];
        const boundedDelta = Math.min(maxDelta, Math.max(minDelta, deltaX));
        const nextLeftWidth = activeColumnResize.startLeftWidth + boundedDelta;
        const nextRightWidth = activeColumnResize.startRightWidth - boundedDelta;
        setCallTableColumnWidths((current) => {
          if (
            current[activeColumnResize.leftKey] === nextLeftWidth &&
            current[activeColumnResize.rightKey] === nextRightWidth
          ) {
            return current;
          }
          return {
            ...current,
            [activeColumnResize.leftKey]: nextLeftWidth,
            [activeColumnResize.rightKey]: nextRightWidth,
          };
        });
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

  useLayoutEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let frameId = 0;
    const updateViewportBoundHeight = () => {
      cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        const root = rootLayoutRef.current;
        if (!root) {
          return;
        }
        const rect = root.getBoundingClientRect();
        const top = Number.isFinite(rect.top) ? Math.max(rect.top, 0) : 0;
        const next = Math.max(0, Math.floor(window.innerHeight - top));
        setViewportBoundHeightPx((current) => (current === next ? current : next));
      });
    };

    updateViewportBoundHeight();
    window.addEventListener("resize", updateViewportBoundHeight);
    window.addEventListener("scroll", updateViewportBoundHeight, true);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", updateViewportBoundHeight);
      window.removeEventListener("scroll", updateViewportBoundHeight, true);
    };
  }, []);

  return (
    <Box
      ref={rootLayoutRef}
      sx={{
        position: "relative",
        display: "grid",
        gridTemplateRows: `minmax(150px, ${topPanelRatio}fr) minmax(150px, ${1 - topPanelRatio}fr)`,
        flex: 1,
        boxSizing: "border-box",
        p: 0,
        pb: 0,
        mb: 0,
        height: viewportBoundHeightPx > 0 ? `${viewportBoundHeightPx}px` : "100%",
        maxHeight:
          viewportBoundHeightPx > 0 ? `${viewportBoundHeightPx}px` : "100%",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <Paper
        sx={{
          overflow: "hidden",
          borderRadius: 0,
          border: "1px solid",
          borderColor: "divider",
          borderBottom: 0,
          boxShadow: "0 10px 28px rgba(0,0,0,0.16)",
        }}
      >
        <Box sx={panelHeaderSx}>
          {activeRoom.trim() ? (
            <IconButton
              size="small"
              aria-label={`Clear requests in room ${activeRoom}`}
              onClick={handleClearCurrentRoomRequests}
              disabled={records.length === 0}
              sx={clearRequestsButtonSx}
            >
              <DeleteOutlineRoundedIcon fontSize="small" />
            </IconButton>
          ) : null}
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
            <Chip
              size="small"
              variant="outlined"
              label={`Room: ${activeRoom || "global"}`}
            />
            <Chip
              size="small"
              variant="outlined"
              label={
                hasActiveCallTableFilters
                  ? `${filteredRecords.length}/${records.length} calls`
                  : `${records.length} calls`
              }
            />
            {hasActiveCallTableFilters ? (
              <Button
                size="small"
                color="inherit"
                onClick={clearCallTableFilters}
                sx={{ minWidth: 0, px: 0.75 }}
              >
                Clear filters
              </Button>
            ) : null}
          </Box>
        </Box>
        <Divider />
        <TableContainer
          ref={callTableContainerRef}
          sx={{
            maxHeight: "100%",
            height: "100%",
            overflowX: "auto",
            overflowY: "auto",
            backgroundImage:
              "repeating-linear-gradient(to bottom, rgba(255,255,255,0.012) 0px, rgba(255,255,255,0.012) 32px, transparent 32px, transparent 64px)",
          }}
        >
          <Table
            stickyHeader
            size="small"
            sx={{
              tableLayout: "fixed",
              width: "100%",
              minWidth: `${callTableTotalMinWidth}px`,
              "& .MuiTableCell-root": {
                py: 0.2,
                px: 1,
              },
              "& .MuiTableCell-head": {
                py: 0.55,
                fontSize: 11,
              },
              "& .MuiTableCell-body": {
                fontSize: 12,
                lineHeight: 1.25,
              },
              "& .MuiTableBody-root .MuiTableRow-root": {
                height: 30,
                minHeight: 30,
                maxHeight: 30,
              },
              "& .MuiTableBody-root .MuiTableCell-root": {
                height: 30,
                boxSizing: "border-box",
              },
              "& .MuiTableBody-root .MuiTypography-root": {
                fontSize: 12,
                lineHeight: 1.25,
              },
              "& .MuiTableBody-root .MuiChip-root": {
                height: 20,
              },
              "& .MuiTableBody-root .MuiChip-label": {
                fontSize: 12,
              },
            }}
          >
            <TableHead>
              <TableRow>
                <TableCell sx={getCallTableColumnSx("room")}>
                  <Button
                    size="small"
                    endIcon={<KeyboardArrowDownRoundedIcon fontSize="small" />}
                    onClick={openCallTableFilterMenu("room")}
                    sx={tableFilterTriggerButtonSx}
                  >
                    {`${callTableFilterLabels.room}${isCallTableFilterFieldActive("room") ? " *" : ""}`}
                  </Button>
                </TableCell>
                <TableCell sx={getCallTableColumnSx("client")}>
                  <Button
                    size="small"
                    endIcon={<KeyboardArrowDownRoundedIcon fontSize="small" />}
                    onClick={openCallTableFilterMenu("client")}
                    sx={tableFilterTriggerButtonSx}
                  >
                    {`${callTableFilterLabels.client}${isCallTableFilterFieldActive("client") ? " *" : ""}`}
                  </Button>
                  <Box
                    role="separator"
                    aria-label="Resize client column"
                    onPointerDown={startCallTableColumnResize("room", "client")}
                    sx={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: `${CALL_TABLE_COLUMN_RESIZE_HANDLE_WIDTH_PX}px`,
                      height: "100%",
                      cursor: "col-resize",
                      zIndex: 3,
                    }}
                  />
                </TableCell>
                <TableCell sx={getCallTableColumnSx("service")}>
                  <Button
                    size="small"
                    endIcon={<KeyboardArrowDownRoundedIcon fontSize="small" />}
                    onClick={openCallTableFilterMenu("service")}
                    sx={tableFilterTriggerButtonSx}
                  >
                    {`${callTableFilterLabels.service}${isCallTableFilterFieldActive("service") ? " *" : ""}`}
                  </Button>
                  <Box
                    role="separator"
                    aria-label="Resize service column"
                    onPointerDown={startCallTableColumnResize("client", "service")}
                    sx={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: `${CALL_TABLE_COLUMN_RESIZE_HANDLE_WIDTH_PX}px`,
                      height: "100%",
                      cursor: "col-resize",
                      zIndex: 3,
                    }}
                  />
                </TableCell>
                <TableCell sx={getCallTableColumnSx("method")}>
                  <Button
                    size="small"
                    endIcon={<KeyboardArrowDownRoundedIcon fontSize="small" />}
                    onClick={openCallTableFilterMenu("method")}
                    sx={tableFilterTriggerButtonSx}
                  >
                    {`${callTableFilterLabels.method}${isCallTableFilterFieldActive("method") ? " *" : ""}`}
                  </Button>
                  <Box
                    role="separator"
                    aria-label="Resize method column"
                    onPointerDown={startCallTableColumnResize("service", "method")}
                    sx={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: `${CALL_TABLE_COLUMN_RESIZE_HANDLE_WIDTH_PX}px`,
                      height: "100%",
                      cursor: "col-resize",
                      zIndex: 3,
                    }}
                  />
                </TableCell>
                <TableCell sx={getCallTableColumnSx("code")}>
                  <Button
                    size="small"
                    endIcon={<KeyboardArrowDownRoundedIcon fontSize="small" />}
                    onClick={openCallTableFilterMenu("code")}
                    sx={tableFilterTriggerButtonSx}
                  >
                    {`${callTableFilterLabels.code}${isCallTableFilterFieldActive("code") ? " *" : ""}`}
                  </Button>
                  <Box
                    role="separator"
                    aria-label="Resize code column"
                    onPointerDown={startCallTableColumnResize("method", "code")}
                    sx={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: `${CALL_TABLE_COLUMN_RESIZE_HANDLE_WIDTH_PX}px`,
                      height: "100%",
                      cursor: "col-resize",
                      zIndex: 3,
                    }}
                  />
                </TableCell>
                <TableCell sx={getCallTableColumnSx("receivedByServer")}>
                  <Typography
                    component="span"
                    sx={{
                      ...tableFilterTriggerButtonSx,
                      display: "inline-flex",
                      alignItems: "center",
                    }}
                  >
                    received by server
                  </Typography>
                  <Box
                    role="separator"
                    aria-label="Resize received by server column"
                    onPointerDown={startCallTableColumnResize(
                      "code",
                      "receivedByServer",
                    )}
                    sx={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: `${CALL_TABLE_COLUMN_RESIZE_HANDLE_WIDTH_PX}px`,
                      height: "100%",
                      cursor: "col-resize",
                      zIndex: 3,
                    }}
                  />
                </TableCell>
                <TableCell sx={getCallTableColumnSx("source")}>
                  <Typography
                    component="span"
                    sx={{
                      ...tableFilterTriggerButtonSx,
                      display: "inline-flex",
                      alignItems: "center",
                    }}
                  >
                    source
                  </Typography>
                  <Box
                    role="separator"
                    aria-label="Resize source column"
                    onPointerDown={startCallTableColumnResize(
                      "receivedByServer",
                      "source",
                    )}
                    sx={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: `${CALL_TABLE_COLUMN_RESIZE_HANDLE_WIDTH_PX}px`,
                      height: "100%",
                      cursor: "col-resize",
                      zIndex: 3,
                    }}
                  />
                </TableCell>
                <TableCell sx={getCallTableColumnSx("servedBy")}>
                  <Button
                    size="small"
                    endIcon={<KeyboardArrowDownRoundedIcon fontSize="small" />}
                    onClick={openCallTableFilterMenu("servedBy")}
                    sx={tableFilterTriggerButtonSx}
                  >
                    {`${callTableFilterLabels.servedBy}${isCallTableFilterFieldActive("servedBy") ? " *" : ""}`}
                  </Button>
                  <Box
                    role="separator"
                    aria-label="Resize served by column"
                    onPointerDown={startCallTableColumnResize("source", "servedBy")}
                    sx={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: `${CALL_TABLE_COLUMN_RESIZE_HANDLE_WIDTH_PX}px`,
                      height: "100%",
                      cursor: "col-resize",
                      zIndex: 3,
                    }}
                  />
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredRecords.map((record) => {
                const id = record.callId || record.id || "";
                const clientLabel = getClientDisplayName(record);
                const selectedRow =
                  !!id && id === (selected?.callId || selected?.id);
                const recordSource = record.source || defaultSnifferSource;
                const servedBy = getServedBy(record);
                return (
                  <TableRow
                    hover
                    key={
                      id ||
                      `${record.timestamp || ""}-${record.service || ""}-${record.method || ""}`
                    }
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
                    <TableCell sx={getCallTableColumnSx("room")}>
                      {record.room || "global"}
                    </TableCell>
                    <TableCell
                      sx={getCallTableColumnSx("client")}
                      title={clientLabel}
                    >
                      <Typography variant="body2" noWrap>
                        {clientLabel}
                      </Typography>
                    </TableCell>
                    <TableCell sx={getCallTableColumnSx("service")}>
                      {record.service || "-"}
                    </TableCell>
                    <TableCell sx={getCallTableColumnSx("method")}>
                      {record.method || "-"}
                    </TableCell>
                    <TableCell sx={getCallTableColumnSx("code")}>
                      <Chip
                        size="small"
                        color={codeToChipColor(record.code)}
                        label={record.code ?? 0}
                      />
                    </TableCell>
                    <TableCell
                      sx={getCallTableColumnSx("receivedByServer")}
                      title={record.timestamp || "-"}
                    >
                      {formatServerReceivedAt(record.timestamp)}
                    </TableCell>
                    <TableCell sx={getCallTableColumnSx("source")}>
                      <Chip
                        size="small"
                        variant="outlined"
                        color={
                          recordSource === "reflection" ? "info" : "default"
                        }
                        label={snifferSourceLabels[recordSource]}
                      />
                    </TableCell>
                    <TableCell sx={getCallTableColumnSx("servedBy")}>
                      <Chip
                        size="small"
                        variant="outlined"
                        color={servedByChipColor(servedBy)}
                        label={servedByLabels[servedBy]}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
              {hasActiveCallTableFilters && filteredRecords.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8}>
                    <Typography variant="body2" color="text.secondary">
                      No calls match current filters.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </TableContainer>
        <Popover
          open={Boolean(callTableFilterMenu)}
          anchorEl={callTableFilterMenu?.anchorEl || null}
          onClose={closeCallTableFilterMenu}
          anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
          transformOrigin={{ vertical: "top", horizontal: "left" }}
          PaperProps={{
            sx: {
              mt: 0.25,
              p: 1,
              width: 360,
              maxWidth: "min(92vw, 520px)",
              borderRadius: RADIUS_PX,
              border: "1px solid",
              borderColor: "divider",
              boxShadow: "0 10px 28px rgba(0,0,0,0.24)",
            },
          }}
        >
          {openedCallTableFilterField ? (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0 }}>
              <TextField
                autoFocus
                variant="outlined"
                size="small"
                value={openedCallTableFilterQuery}
                onChange={(event) =>
                  setCallTableFilterQuery(
                    openedCallTableFilterField,
                    event.target.value,
                  )
                }
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    canPinOpenedCallTableFilterValue
                  ) {
                    event.preventDefault();
                    pinCallTableFilterValue(
                      openedCallTableFilterField,
                      openedCallTableFilterQuery,
                    );
                  }
                }}
                placeholder={`Search / select ${callTableFilterLabels[openedCallTableFilterField]}`}
                sx={tableFilterInputSx}
              />
              {canPinOpenedCallTableFilterValue ? (
                <Button
                  size="small"
                  onClick={() =>
                    pinCallTableFilterValue(
                      openedCallTableFilterField,
                      openedCallTableFilterQuery,
                    )
                  }
                  sx={{ alignSelf: "flex-start", minWidth: 0, px: 0.75 }}
                >
                  {`Pin "${openedCallTableFilterQuery.trim()}"`}
                </Button>
              ) : null}
              <Box
                sx={{
                  maxHeight: 220,
                  overflowY: "auto",
                  border: "none",
                  borderRadius: 1,
                  py: 0,
                }}
              >
                {openedCallTableFilteredOptions.length > 0 ? (
                  openedCallTableFilteredOptions.map((option) => {
                    const checked = includesNormalized(
                      openedCallTableFilterSelected,
                      option,
                    );
                    const isPinnedOnly = pinnedOnlySelectedOptions.some(
                      (item) =>
                        normalizeFilterQuery(item) ===
                        normalizeFilterQuery(option),
                    );
                    return (
                      <Box
                        key={option}
                        role="button"
                        tabIndex={0}
                        onClick={() =>
                          toggleCallTableFilterSelection(
                            openedCallTableFilterField,
                            option,
                          )
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            toggleCallTableFilterSelection(
                              openedCallTableFilterField,
                              option,
                            );
                          }
                        }}
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 0.75,
                          px: 0.5,
                          py: 0,
                          cursor: "pointer",
                          minWidth: 0,
                          "&:hover": {
                            bgcolor: "action.hover",
                          },
                        }}
                      >
                        <Checkbox
                          size="small"
                          checked={checked}
                          sx={{ p: 0.5 }}
                        />
                        <Typography
                          variant="body2"
                          sx={{
                            ...tableFilterTextSx,
                            minWidth: 0,
                            flex: 1,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {option}
                        </Typography>
                        {isPinnedOnly ? (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ ...tableFilterTextSx, ml: "auto" }}
                          >
                            pinned
                          </Typography>
                        ) : null}
                      </Box>
                    );
                  })
                ) : (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ ...tableFilterTextSx, px: 1, py: 0 }}
                  >
                    No matching values
                  </Typography>
                )}
              </Box>
              <Box
                sx={{ display: "flex", justifyContent: "flex-end", gap: 0.5 }}
              >
                <Button
                  size="small"
                  onClick={() =>
                    clearCallTableFilterField(openedCallTableFilterField)
                  }
                  disabled={
                    !openedCallTableFilterQuery.trim() &&
                    openedCallTableFilterSelected.length === 0
                  }
                  sx={tableFilterClearButtonSx}
                >
                  Clear
                </Button>
              </Box>
            </Box>
          ) : null}
        </Popover>
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
            borderRadius: 0,
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
            <SearchOffRoundedIcon
              sx={{ fontSize: 78, opacity: 0.55, mb: 1.1 }}
            />
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
            gridTemplateColumns: `minmax(0, ${requestPanelRatio}fr) minmax(0, ${1 - requestPanelRatio}fr)`,
            gap: 0,
            minHeight: 0,
          }}
        >
          <Paper
            onMouseDownCapture={() => setActiveSearchTarget("request")}
            onFocusCapture={() => setActiveSearchTarget("request")}
            sx={{
              overflow: "hidden",
              borderRadius: 0,
              border: "1px solid",
              borderColor: "divider",
              borderRight: 0,
              display: "flex",
              flexDirection: "column",
              minWidth: 0,
              minHeight: 0,
              boxShadow: "0 10px 28px rgba(0,0,0,0.16)",
            }}
          >
            <Box sx={panelHeaderSx}>
              <Typography variant="subtitle2" sx={panelTitleSx}>
                Request
              </Typography>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.75,
                  minWidth: 0,
                  flex: 1,
                  justifyContent: "flex-end",
                  overflow: "hidden",
                }}
              >
                <Chip
                  size="small"
                  variant="outlined"
                  sx={{
                    maxWidth: "100%",
                    "& .MuiChip-label": {
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    },
                  }}
                  label={
                    selectedService && selectedMethod
                      ? `${selectedService}.${selectedMethod}`
                      : "No call selected"
                  }
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
                <Box sx={compactSearchBarSx}>
                  <TextField
                    inputRef={requestSearchInputRef}
                    value={requestSearchQuery}
                    onChange={(event) =>
                      setRequestSearchQuery(event.target.value)
                    }
                    size="small"
                    fullWidth
                    placeholder="Find"
                    sx={compactSearchInputSx}
                  />
                  <Button
                    size="small"
                    variant={
                      requestSearchOptions.caseSensitive ? "contained" : "text"
                    }
                    onClick={() =>
                      toggleSearchOption("request", "caseSensitive")
                    }
                    sx={compactSearchToggleButtonSx}
                  >
                    Aa
                  </Button>
                  <Button
                    size="small"
                    variant={
                      requestSearchOptions.wholeWord ? "contained" : "text"
                    }
                    onClick={() => toggleSearchOption("request", "wholeWord")}
                    sx={compactSearchToggleButtonSx}
                  >
                    ab
                  </Button>
                  <Button
                    size="small"
                    variant={
                      requestSearchOptions.useRegex ? "contained" : "text"
                    }
                    onClick={() => toggleSearchOption("request", "useRegex")}
                    sx={compactSearchToggleButtonSx}
                  >
                    .*
                  </Button>
                  <Typography variant="body2" sx={compactSearchCounterSx}>
                    {requestMatchCount > 0
                      ? `${requestActiveMatch + 1} of ${requestMatchCount}`
                      : "0 of 0"}
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
            <Box
              ref={requestSearchContainerRef}
              sx={{ flex: 1, minHeight: 0, overflow: "auto", p: 1.25 }}
            >
              <Box component="pre" sx={jsonTextSx}>
                {renderHighlightedJsonText(
                  requestPayloadText,
                  requestMatchRanges,
                  requestActiveMatch,
                )}
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
              containerType: "size",
              containerName: "response-panel",
              overflow: "hidden",
              borderRadius: 0,
              border: "1px solid",
              borderColor: "divider",
              display: "flex",
              flexDirection: "column",
              minWidth: 0,
              minHeight: 0,
              boxShadow: "0 10px 28px rgba(0,0,0,0.16)",
            }}
          >
            <Box sx={panelHeaderSx}>
              <FormControl size="small" sx={postmanLikeSelectSx}>
                <Select
                  value={responsePanelMode}
                  sx={{
                    "& .MuiSelect-icon": {
                      color: "#D7DCE2",
                    },
                  }}
                  onChange={(event) => {
                    setResponsePanelMode(event.target.value as ResponsePanelMode);
                    if (event.target.value === "nextResponse") {
                      closeResponseSearch();
                    }
                  }}
                  variant="outlined"
                >
                  <MenuItem value="response">
                    {isSingleResponseView
                      ? responsePanelModeLabels.response
                      : "Responses"}
                  </MenuItem>
                  <MenuItem value="nextResponse">
                    {responsePanelModeLabels.nextResponse}
                  </MenuItem>
                </Select>
              </FormControl>
              {isResponseViewMode ? (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.75,
                  minWidth: 0,
                  flex: 1,
                  justifyContent: "flex-end",
                  overflowX: "auto",
                  overflowY: "hidden",
                }}
              >
                <Chip
                  size="small"
                  color={codeToChipColor(selectedCode)}
                  variant="outlined"
                  label={`Code: ${selectedCode ?? 0}`}
                />
                <Chip
                  size="small"
                  color={servedByChipColor(selectedServedBy)}
                  variant="outlined"
                  label={`Served: ${servedByLabels[selectedServedBy]}`}
                />
                {isResponseViewMode && isSingleResponseView ? (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ whiteSpace: "nowrap" }}
                  >
                    {responseHeaderTimestamp}
                  </Typography>
                ) : isResponseViewMode ? (
                  <Chip
                    size="small"
                    variant="outlined"
                    label={`${orderedResponseEntries.length} items`}
                  />
                ) : null}
                {shouldShowResponsePayloadBlock &&
                hasResponseSearchablePayload &&
                isResponseViewMode ? (
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
              ) : null}
            </Box>
            <Divider />
            {shouldShowSourceChangedRetryBanner ? (
              <Alert
                severity="info"
                variant="outlined"
                sx={{
                  alignItems: "center",
                  borderRadius: 0,
                  borderLeft: 0,
                  borderRight: 0,
                  py: 0.25,
                  "& .MuiAlert-icon": {
                    alignItems: "center",
                    py: 0,
                  },
                  "& .MuiAlert-message": {
                    display: "flex",
                    alignItems: "center",
                    py: 0,
                    minHeight: 32,
                    fontSize: 13,
                    fontWeight: 700,
                  },
                }}
              >
                Source changed
              </Alert>
            ) : null}
            <input
              ref={fileInputRef}
              type="file"
              accept=".proto,.pb"
              style={{ display: "none" }}
              onChange={handleProtoSelect}
            />
            {responsePanelMode === "nextResponse" ? (
              nextResponseSetupBlock
            ) : shouldPromptEnterRoomToSetup ? (
              <Box sx={stateBlockContainerSx}>
                <Box
                  sx={[responseStateCardSx, { maxWidth: { xs: "100%", sm: 540 } }]}
                >
                  <LockOutlinedIcon
                    sx={{
                      fontSize: { xs: 36, sm: 44 },
                      opacity: 0.7,
                      mb: 0.75,
                    }}
                  />
                  <Typography variant="h5" sx={nextResponseTitleSx}>
                    Enter the room to set up
                  </Typography>
                  <Typography variant="body1" sx={nextResponseBodySx}>
                    This request belongs to room {selectedSetupRoom}. Enter this
                    room first, then continue setup.
                  </Typography>
                  <Box sx={responseStateActionsSx}>
                    <Button
                      variant="contained"
                      onClick={handleEnterSelectedRoomForSetup}
                      sx={nextResponseActionButtonSx}
                    >
                      {`Enter room ${selectedSetupRoom}`}
                    </Button>
                  </Box>
                </Box>
              </Box>
            ) : shouldHideResponsePayload ? (
              <Box sx={stateBlockContainerSx}>
                <Box sx={responseStateCardSx}>
                  <LockOutlinedIcon
                    sx={{
                      fontSize: { xs: 36, sm: 44 },
                      opacity: 0.7,
                      mb: 0.75,
                    }}
                  />
                  <Typography variant="h5" sx={nextResponseTitleSx}>
                    Response payload locked
                  </Typography>
                  <Typography variant="body1" sx={nextResponseBodySx}>
                    This response cannot be decoded yet.
                  </Typography>
                  <Typography variant="body1" sx={nextResponseBodySx}>
                    {selectedResponseSource === "proto"
                      ? hasProtoForSelectedCall
                        ? "Route the peer to a room to view the content."
                        : "Upload runtime proto and route the peer to a room to view the content."
                      : hasProtoForSelectedCall
                        ? "Route the peer to a room to view the content."
                        : "Set a reflection host and route the peer to a room to view the content."}
                  </Typography>
                  <Box
                    sx={{
                      mt: 0.75,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "center",
                      alignItems: "center",
                      gap: 0.85,
                      width: "100%",
                    }}
                  >
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        gap: 0.75,
                        flexWrap: "wrap",
                        width: "100%",
                      }}
                    >
                      {shouldShowCombinedAttachAndProtoHint ? (
                        <Typography
                          variant="body2"
                          color="success.main"
                          sx={stateBlockHintSx}
                        >
                          {`Room ${attachedRoomLabel} attached and Protofile already available - Retry request`}
                        </Typography>
                      ) : shouldShowAttachedRoomInfo ? (
                        <Typography
                          variant="body2"
                          color="success.main"
                          sx={stateBlockHintSx}
                        >
                          {`Room ${attachedRoomLabel} attached - Retry request`}
                        </Typography>
                      ) : !isPeerBoundToAnyRoom ? (
                        <Box
                          sx={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: 0.75,
                            justifyContent: "center",
                            width: "100%",
                          }}
                        >
                          <Box
                            sx={{
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              gap: 0.75,
                              width: "100%",
                            }}
                          >
                            {isInGlobalScope ? (
                              <Box
                                sx={{ ...roomAssignControlWidthSx, mx: "auto" }}
                              >
                                <FormControl
                                  margin="none"
                                  sx={[
                                    roomAssignSelectorSx,
                                    roomAssignControlWidthSx,
                                  ]}
                                >
                                  <Select
                                    value={roomForAttachment}
                                    onChange={(event) =>
                                      setRoomForAttachment(event.target.value)
                                    }
                                    variant="outlined"
                                    displayEmpty={false}
                                    sx={roomAssignControlWidthSx}
                                  >
                                    {availableRoomsForAttachment.map((item) => (
                                      <MenuItem key={item.id} value={item.id}>
                                        {`#${item.id} ${item.name}`}
                                      </MenuItem>
                                    ))}
                                  </Select>
                                </FormControl>
                              </Box>
                            ) : null}
                            <Button
                              variant="contained"
                              onClick={handleAssignPeerRoom}
                              disabled={!canAssignPeerRoom}
                              sx={[
                                roomAssignButtonSx,
                                roomAssignControlWidthSx,
                                { mx: "auto" },
                              ]}
                            >
                              {isInGlobalScope
                                ? "Assign selected room"
                                : "Assign current room"}
                            </Button>
                          </Box>
                          {shouldShowCombinedAttachAndProtoHint ? null : hasProtoForSelectedCall ? (
                            <Box
                              sx={{
                                minHeight: 40,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                width: "100%",
                                px: 0.25,
                              }}
                            >
                              <Typography
                                variant="body2"
                                color="success.main"
                                sx={stateBlockHintSx}
                              >
                                {shouldShowProtoUploadedHint
                                  ? "Protofile uploaded - retry call"
                                  : "Protofile already available"}
                              </Typography>
                            </Box>
                          ) : (
                            <Box
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                width: "100%",
                              }}
                            >
                              {selectedNextResponseSource === "proto"
                                ? protoUploadControl
                                : reflectionHostControlBlock}
                            </Box>
                          )}
                        </Box>
                      ) : null}
                      {shouldShowCombinedAttachAndProtoHint ||
                      !isPeerBoundToAnyRoom ? null : hasProtoForSelectedCall ? (
                        <Typography
                          variant="body2"
                          color="success.main"
                          sx={stateBlockHintSx}
                        >
                          {shouldShowProtoUploadedHint
                            ? "Protofile uploaded - retry call"
                            : "Protofile already available"}
                        </Typography>
                      ) : selectedNextResponseSource === "proto" ? (
                        protoUploadControl
                      ) : (
                        reflectionHostControlBlock
                      )}
                    </Box>
                  </Box>
                </Box>
              </Box>
            ) : shouldShowProxyNextResponseBlock ? (
              <Box sx={stateBlockContainerSx}>
                <Box sx={responseStateCardSx}>
                  <Typography variant="h5" sx={nextResponseTitleSx}>
                    Proxy selected for next response
                  </Typography>
                  <Typography variant="body1" sx={nextResponseBodySx}>
                    Proxy mode is selected for this route.
                  </Typography>
                  <Typography variant="body1" sx={nextResponseBodySx}>
                    The next request will be forwarded to the server and served by its response.
                  </Typography>
                </Box>
              </Box>
            ) : shouldShowInvalidStubBlock ? (
              <Box sx={stateBlockContainerSx}>
                <Box sx={responseStateCardSx}>
                  <ErrorOutlineRoundedIcon
                    sx={{
                      fontSize: { xs: 36, sm: 44 },
                      opacity: 0.75,
                      mb: 0.75,
                      color: "error.main",
                    }}
                  />
                  <Typography variant="h5" sx={nextResponseTitleSx}>
                    Invalid stub response
                  </Typography>
                  <Typography variant="body1" sx={nextResponseBodySx}>
                    Selected stub response does not match the proto schema.
                  </Typography>
                  <Typography variant="body1" sx={nextResponseBodySx}>
                    Open the selected stub and fix its output payload.
                  </Typography>
                  <Box sx={responseStateActionsSx}>
                    {shouldShowResolvedReplacedHint ? (
                      <Typography
                        variant="body2"
                        color="success.main"
                        sx={stateBlockHintSx}
                      >
                        Stub replaced - Retry Call
                      </Typography>
                    ) : shouldShowResolvedEditedHint ? (
                      <Typography
                        variant="body2"
                        color="success.main"
                        sx={stateBlockHintSx}
                      >
                        Stub edited - retry call
                      </Typography>
                    ) : selectedStubId ? (
                      <Button
                        variant="contained"
                        component={RouterLink}
                        to={selectedStubEditPath}
                        state={{ returnTo: snifferPath }}
                        sx={nextResponseActionButtonSx}
                      >
                        Edit selected stub
                      </Button>
                    ) : null}
                    {shouldHideSelectAnotherStubButton ? null : (
                      <Button
                        variant="outlined"
                        component={RouterLink}
                        to={stubsListPath}
                        disabled={!canCreateStubFromSelectedCall}
                        sx={nextResponseActionButtonSx}
                      >
                        Select another stub
                      </Button>
                    )}
                  </Box>
                </Box>
              </Box>
            ) : shouldShowMissingStubBlock ? (
              <Box sx={stateBlockContainerSx}>
                <Box sx={responseStateCardSx}>
                  <SearchOffRoundedIcon
                    sx={{
                      fontSize: { xs: 36, sm: 44 },
                      opacity: 0.75,
                      mb: 0.75,
                    }}
                  />
                  <Typography variant="h5" sx={nextResponseTitleSx}>
                    {hasSelectedRouteStub
                      ? "Stub did not match request"
                      : "No stub assigned"}
                  </Typography>
                  <Typography variant="body1" sx={nextResponseBodySx}>
                    {hasSelectedRouteStub
                      ? "A stub exists for this route, but this request did not match its input or headers."
                      : "No stub is assigned for this call."}
                  </Typography>
                  <Typography variant="body1" sx={nextResponseBodySx}>
                    {hasSelectedRouteStub
                      ? "Edit the route stub or select another stub for this request."
                      : hasAnyMatchingStubs
                        ? "Select an existing stub for this route, or create a new one for this call."
                        : "No stubs exist for this service/method yet. Create one for this call."}
                  </Typography>
                  <Box sx={responseStateActionsSx}>
                    {shouldShowStubCreatedAndAssignedRetryHint ? (
                      <Typography
                        variant="body2"
                        color="success.main"
                        sx={stateBlockHintSx}
                      >
                        Stub created and assigned - retry call
                      </Typography>
                    ) : shouldShowStubAssignedRetryHint ? (
                      <Typography
                        variant="body2"
                        color="success.main"
                        sx={stateBlockHintSx}
                      >
                        Stub assigned - retry call
                      </Typography>
                    ) : shouldShowStubCreatedHint ? (
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={stateBlockHintSx}
                      >
                        Stub created
                      </Typography>
                    ) : null}
                    {shouldShowStubAssignedRetryHint ? null : (
                      <>
                        {hasSelectedRouteStub ? (
                          <Button
                            variant="contained"
                            component={RouterLink}
                            to={routeStubEditPath}
                            state={{ returnTo: snifferPath }}
                            sx={nextResponseActionButtonSx}
                          >
                            Edit stub
                          </Button>
                        ) : null}
                        {hasSelectedRouteStub ? (
                          <Button
                            variant="outlined"
                            component={RouterLink}
                            to={stubsListPath}
                            disabled={!canCreateStubFromSelectedCall}
                            sx={nextResponseActionButtonSx}
                          >
                            Select another stub
                          </Button>
                        ) : shouldShowStubCreatedHint ? null : (
                          <>
                            {hasAnyMatchingStubs ? (
                              <Button
                                variant="outlined"
                                component={RouterLink}
                                to={stubsListPath}
                                disabled={!canCreateStubFromSelectedCall}
                                sx={nextResponseActionButtonSx}
                              >
                                Select stub
                              </Button>
                            ) : null}
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
                              sx={nextResponseActionButtonSx}
                            >
                              Create stub
                            </Button>
                          </>
                        )}
                      </>
                    )}
                  </Box>
                </Box>
              </Box>
            ) : (
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  minHeight: 0,
                  flex: 1,
                }}
              >
                {showResponseSearch && hasResponseSearchablePayload ? (
                  <Box sx={compactSearchBarSx}>
                    <TextField
                      inputRef={responseSearchInputRef}
                      value={responseSearchQuery}
                      onChange={(event) =>
                        setResponseSearchQuery(event.target.value)
                      }
                      size="small"
                      fullWidth
                      placeholder="Find"
                      sx={compactSearchInputSx}
                    />
                    <Button
                      size="small"
                      variant={
                        responseSearchOptions.caseSensitive
                          ? "contained"
                          : "text"
                      }
                      onClick={() =>
                        toggleSearchOption("response", "caseSensitive")
                      }
                      sx={compactSearchToggleButtonSx}
                    >
                      Aa
                    </Button>
                    <Button
                      size="small"
                      variant={
                        responseSearchOptions.wholeWord ? "contained" : "text"
                      }
                      onClick={() =>
                        toggleSearchOption("response", "wholeWord")
                      }
                      sx={compactSearchToggleButtonSx}
                    >
                      ab
                    </Button>
                    <Button
                      size="small"
                      variant={
                        responseSearchOptions.useRegex ? "contained" : "text"
                      }
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
                <Box
                  ref={responseSearchContainerRef}
                  sx={{ flex: 1, minHeight: 0, overflow: "auto", p: 1.25 }}
                >
                  {isSingleResponseView ? (
                    <Box component="pre" sx={jsonTextSx}>
                      {singleResponseEntry
                        ? renderHighlightedJsonText(
                            singleResponseEntry.payloadText,
                            responseMatchData.rangesByEntry.get(
                              singleResponseEntry.key,
                            ) || [],
                            responseActiveMatch,
                          )
                        : "No response payload"}
                    </Box>
                  ) : (
                    <Box
                      sx={{ display: "flex", flexDirection: "column", gap: 1 }}
                    >
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
                            expandIcon={
                              <ExpandMoreRoundedIcon
                                fontSize="small"
                                sx={{ color: "#D7DCE2" }}
                              />
                            }
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
                              "& .MuiAccordionSummary-content.Mui-expanded": {
                                my: 0.4,
                              },
                            }}
                          >
                            <Box
                              sx={{
                                minWidth: 0,
                                display: "flex",
                                alignItems: "center",
                                gap: 0.75,
                              }}
                            >
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{
                                  minWidth: 0,
                                  display: "block",
                                  fontFamily:
                                    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                  maxWidth: "100%",
                                }}
                              >
                                {formatJsonInlinePayload(entry.payload)}
                              </Typography>
                            </Box>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ whiteSpace: "nowrap" }}
                            >
                              {formatServerReceivedAt(
                                entry.timestamp || selected?.timestamp,
                              )}
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
                                responseMatchData.rangesByEntry.get(
                                  entry.key,
                                ) || [],
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
