import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Chip,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { useEffect, useState } from "react";
import {
  RecordContextProvider,
  useListContext,
  useNotify,
  useRefresh,
  useUpdate,
} from "react-admin";

import type { StubRecord } from "../../../types/entities";
import { RowActionsField } from "./RowActionsField";
import { OutputKindChip, StubDetails } from "./StubVisuals";

type MethodGroup = {
  name: string;
  stubs: StubRecord[];
};

type ServiceGroup = {
  name: string;
  methods: MethodGroup[];
};

const RADIUS_PX = "10px";
const THIN_CHEVRON_SX = { fontSize: 18 } as const;
const ICON_BUTTON_ACCENT_SX = {
  color: "text.secondary",
  "&:hover": {
    backgroundColor: "transparent",
    color: "#FF6C37",
  },
  "&.Mui-focusVisible": {
    backgroundColor: "transparent",
    color: "#FF6C37",
  },
} as const;
const LIST_ROW_HEIGHT_PX = 30;
const COLUMN_HEADER_HEIGHT_PX = 36;
const META_CHIP_SX = {
  borderRadius: RADIUS_PX,
  fontSize: 12,
  fontWeight: 500,
  letterSpacing: 0,
  "&.MuiChip-outlined": {
    borderWidth: "1px",
  },
  "& .MuiChip-label": {
    px: 1.1,
    lineHeight: 1.2,
  },
} as const;

const GRPC_STATUS_LABELS: Record<number, string> = {
  0: "OK",
  1: "CANCELLED",
  2: "UNKNOWN",
  3: "INVALID_ARGUMENT",
  4: "DEADLINE_EXCEEDED",
  5: "NOT_FOUND",
  6: "ALREADY_EXISTS",
  7: "PERMISSION_DENIED",
  8: "RESOURCE_EXHAUSTED",
  9: "FAILED_PRECONDITION",
  10: "ABORTED",
  11: "OUT_OF_RANGE",
  12: "UNIMPLEMENTED",
  13: "INTERNAL",
  14: "UNAVAILABLE",
  15: "DATA_LOSS",
  16: "UNAUTHENTICATED",
};

const getGrpcStatusChipColor = (code: number): "success" | "error" | "warning" | "default" => {
  if (code === 0) {
    return "success";
  }

  if ([1, 2, 7, 13, 15, 16].includes(code)) {
    return "error";
  }

  if ([3, 4, 5, 6, 8, 9, 10, 11, 14].includes(code)) {
    return "warning";
  }

  return "default";
};

const normalizeValue = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

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

  // Keep parity with backend route matching:
  // two distinct fully-qualified names are not aliases for each other.
  return !leftMeta.hasDot || !rightMeta.hasDot;
};

const sameRoute = (left: StubRecord, right: StubRecord): boolean =>
  sameServiceAlias(left.service, right.service) &&
  normalizeValue(left.method) === normalizeValue(right.method) &&
  normalizeValue((left as StubRecord & { session?: unknown }).session) ===
    normalizeValue((right as StubRecord & { session?: unknown }).session);

const buildGroupedTree = (records: StubRecord[]): ServiceGroup[] => {
  const serviceMap = new Map<string, Map<string, StubRecord[]>>();

  records.forEach((record) => {
    const service = record.service?.trim() || "(no service)";
    const method = record.method?.trim() || "(no method)";

    if (!serviceMap.has(service)) {
      serviceMap.set(service, new Map<string, StubRecord[]>());
    }

    const methodMap = serviceMap.get(service)!;
    if (!methodMap.has(method)) {
      methodMap.set(method, []);
    }

    methodMap.get(method)!.push(record);
  });

  return Array.from(serviceMap.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([serviceName, methodMap]) => {
      const methods = Array.from(methodMap.entries())
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([methodName, stubs]) => ({
          name: methodName,
          stubs: [...stubs].sort((left, right) => {
            const leftName = left.name || left.id;
            const rightName = right.name || right.id;
            return String(leftName).localeCompare(String(rightName));
          }),
        }));

      return { name: serviceName, methods };
    });
};

const densitySx = (gridSize: "small" | "medium") =>
  gridSize === "small"
    ? {
        servicePx: 1.25,
        servicePy: 0.12,
        methodPx: 0.4,
        methodPy: 0.08,
        stubPx: 0.9,
        stubPy: 0.12,
        methodIndent: 1.4,
        stubIndent: 2.8,
        text: 12,
      }
    : {
        servicePx: 1.5,
        servicePy: 0.28,
        methodPx: 0.7,
        methodPy: 0.22,
        stubPx: 1.1,
        stubPy: 0.28,
        methodIndent: 2,
        stubIndent: 4,
        text: 14,
      };

const StubNode = ({
  stub,
  gridSize,
  allowClone,
  isUpdating,
  onToggleEnabled,
}: {
  stub: StubRecord;
  gridSize: "small" | "medium";
  allowClone?: boolean;
  isUpdating?: boolean;
  onToggleEnabled: (stub: StubRecord, nextEnabled: boolean) => Promise<void>;
}) => {
  const d = densitySx(gridSize);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isStubHovered, setIsStubHovered] = useState(false);
  const [isStatusHovered, setIsStatusHovered] = useState(false);
  const grpcStatusCode = typeof stub.output?.code === "number" ? stub.output.code : 0;
  const grpcStatusName = GRPC_STATUS_LABELS[grpcStatusCode] || "UNKNOWN_STATUS";
  const grpcStatusColor = getGrpcStatusChipColor(grpcStatusCode);
  const showGrpcStatusDescription = isExpanded || isStubHovered;
  const showRowActions = isExpanded || isStubHovered;
  const actionCount = 1 + (allowClone ? 1 : 0);
  const actionButtonWidthPx = 32;
  const actionGapPx = 4;
  const actionsSlotWidthPx =
    actionCount * actionButtonWidthPx + Math.max(0, actionCount - 1) * actionGapPx;
  const isDisabled = stub.enabled === false;
  const nextEnabled = isDisabled;
  const statusLabel = isDisabled ? "Disabled" : "Enabled";
  const statusActionLabel = isDisabled ? "Enable" : "Disable";
  const statusActionColor = isDisabled ? "success" : "error";
  const statusSlotWidth = 92;
  const statusSlotHeight = 22;
  const stubNameFontSize = d.text * 1.3;
  const statusControlSx = {
    width: "100%",
    height: "100%",
    borderRadius: RADIUS_PX,
    fontSize: d.text - 2,
    fontWeight: 500,
    letterSpacing: 0,
    textTransform: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  } as const;

  const handleToggleEnabled = async (event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (!isStatusHovered || isUpdating) {
      return;
    }

    await onToggleEnabled(stub, nextEnabled);
  };

  return (
    <Accordion
      disableGutters
      elevation={0}
      expanded={isExpanded}
      onChange={(_, expanded) => setIsExpanded(expanded)}
      sx={{
        bgcolor: "transparent",
        borderRadius: 0,
        "&::before": { display: "none" },
      }}
    >
      <AccordionSummary
        expandIcon={<KeyboardArrowDownIcon sx={THIN_CHEVRON_SX} />}
        onMouseEnter={() => setIsStubHovered(true)}
        onMouseLeave={() => setIsStubHovered(false)}
        sx={{
          px: d.stubPx,
          pl: 0,
          py: 0,
          minHeight: LIST_ROW_HEIGHT_PX,
          borderRadius: RADIUS_PX,
          transition: "background-color 140ms ease, border-color 140ms ease, box-shadow 140ms ease",
          border: "1px solid transparent",
          "&:hover": {
            bgcolor: "action.hover",
            borderColor: "divider",
          },
          "&.Mui-expanded": {
            minHeight: LIST_ROW_HEIGHT_PX,
          },
          "& .MuiAccordionSummary-content": {
            my: 0,
            minHeight: LIST_ROW_HEIGHT_PX,
            alignItems: "center",
          },
          "& .MuiAccordionSummary-content.Mui-expanded": {
            my: 0,
          },
        }}
      >
        <Box
          sx={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1.5,
            minWidth: 0,
          }}
        >
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            useFlexGap
            sx={{ minHeight: LIST_ROW_HEIGHT_PX, flexWrap: "nowrap", overflow: "hidden" }}
          >
            <Typography
              variant="body2"
              sx={{
                fontFamily: "monospace",
                color: "text.secondary",
                fontSize: d.text - 2,
                lineHeight: 1,
                minWidth: 16,
                textAlign: "right",
              }}
            >
              #{stub.id}
            </Typography>
            <Box
              sx={{
                width: statusSlotWidth,
                minWidth: statusSlotWidth,
                height: statusSlotHeight,
                flexShrink: 0,
                alignSelf: "center",
              }}
              onMouseEnter={() => setIsStatusHovered(true)}
              onMouseLeave={() => setIsStatusHovered(false)}
            >
              <Chip
                size="small"
                variant="outlined"
                color={isStatusHovered ? statusActionColor : stub.enabled !== false ? "success" : "default"}
                onClick={handleToggleEnabled}
                clickable
                disabled={isUpdating}
                label={isStatusHovered ? statusActionLabel : statusLabel}
                sx={{
                  ...statusControlSx,
                  "& .MuiChip-label": {
                    px: 0,
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    lineHeight: 1,
                  },
                  cursor: isStatusHovered && !isUpdating ? "pointer" : "default",
                }}
              />
            </Box>
            <Typography
              sx={{
                fontWeight: 600,
                fontSize: stubNameFontSize,
                lineHeight: 1.15,
                color: isExpanded ? "#FF6C37" : "text.primary",
              }}
            >
              {stub.name?.trim() || "(unnamed stub)"}
            </Typography>
            {typeof stub.options?.times === "number" ? (
              <Typography
                variant="caption"
                sx={{ color: "text.secondary", lineHeight: 1, whiteSpace: "nowrap" }}
              >
                times: {stub.options.times}
              </Typography>
            ) : null}
          </Stack>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              minHeight: LIST_ROW_HEIGHT_PX,
              flexShrink: 0,
              gap: 0,
            }}
          >
            <Box sx={{ mr: 1 }}>
              <OutputKindChip record={stub} />
            </Box>
            <Chip
              size="small"
              variant="outlined"
              color={grpcStatusColor}
              label={
                <Box
                  component="span"
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    minWidth: 0,
                    whiteSpace: "nowrap",
                  }}
                >
                  <Box component="span">{grpcStatusCode}</Box>
                  <Box
                    component="span"
                    sx={{
                      maxWidth: showGrpcStatusDescription ? 200 : 0,
                      opacity: showGrpcStatusDescription ? 1 : 0,
                      ml: showGrpcStatusDescription ? 0.5 : 0,
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                      transition:
                        "max-width 180ms ease, opacity 180ms ease, margin-left 180ms ease",
                    }}
                  >
                    - {grpcStatusName}
                  </Box>
                </Box>
              }
              sx={{
                ...META_CHIP_SX,
                mr: showRowActions ? 0.75 : 0,
              }}
            />
            <Box
              sx={{
                width: showRowActions ? `${actionsSlotWidthPx}px` : 0,
                opacity: showRowActions ? 1 : 0,
                pointerEvents: showRowActions ? "auto" : "none",
                overflow: "hidden",
                transform: showRowActions ? "translateX(0)" : "translateX(8px)",
                transition: "width 220ms ease, opacity 180ms ease, transform 220ms ease",
              }}
            >
              <Box sx={{ width: `${actionsSlotWidthPx}px`, display: "flex", justifyContent: "flex-end" }}>
                <RecordContextProvider value={stub}>
                  <RowActionsField allowClone={allowClone} />
                </RecordContextProvider>
              </Box>
            </Box>
          </Box>
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ px: 0, py: 0 }}>
        <Box sx={{ px: 0.5, pb: 0.5, "& .MuiCard-root": { boxShadow: "none", borderRadius: RADIUS_PX } }}>
          <RecordContextProvider value={stub}>
            <StubDetails />
          </RecordContextProvider>
        </Box>
      </AccordionDetails>
    </Accordion>
  );
};

export const StubsDatagrid = ({
  gridSize,
  allowClone,
}: {
  gridSize: "small" | "medium";
  allowClone?: boolean;
}) => {
  const { data, isPending } = useListContext<StubRecord>();
  const notify = useNotify();
  const refresh = useRefresh();
  const [updateOne] = useUpdate();
  const d = densitySx(gridSize);
  const [selectedServiceName, setSelectedServiceName] = useState<string>("");
  const [selectedMethodName, setSelectedMethodName] = useState<string>("");
  const [isStubsExpanded, setIsStubsExpanded] = useState(false);
  const [optimisticEnabledByID, setOptimisticEnabledByID] = useState<Record<string, boolean>>({});
  const [updatingByID, setUpdatingByID] = useState<Record<string, boolean>>({});

  const records = data || [];
  const optimisticRecords = records.map((record) => {
    const optimisticEnabled = optimisticEnabledByID[record.id];
    if (typeof optimisticEnabled !== "boolean") {
      return record;
    }

    return { ...record, enabled: optimisticEnabled };
  });
  const grouped = buildGroupedTree(optimisticRecords);

  useEffect(() => {
    setOptimisticEnabledByID((current) => {
      const byID = new Map(records.map((item) => [item.id, item.enabled !== false]));
      let changed = false;
      const next: Record<string, boolean> = {};

      Object.entries(current).forEach(([id, enabled]) => {
        const actualEnabled = byID.get(id);
        const isUpdating = Boolean(updatingByID[id]);
        if (typeof actualEnabled !== "boolean") {
          changed = true;
          return;
        }

        if (actualEnabled === enabled) {
          changed = true;
          return;
        }

        // Keep optimistic value only while this exact row request is in flight.
        // This prevents stale "enabled" badges from lingering after server state changed.
        if (!isUpdating) {
          changed = true;
          return;
        }
        next[id] = enabled;
      });

      return changed ? next : current;
    });
  }, [records, updatingByID]);

  const handleToggleEnabled = async (stub: StubRecord, nextEnabled: boolean) => {
    let rollbackState: Record<string, boolean> = {};
    setOptimisticEnabledByID((current) => {
      rollbackState = current;
      const nextState = { ...current, [stub.id]: nextEnabled };
      if (nextEnabled) {
        records.forEach((candidate) => {
          if (candidate.id !== stub.id && sameRoute(candidate, stub)) {
            nextState[candidate.id] = false;
          }
        });
      }

      return nextState;
    });
    setUpdatingByID((current) => ({ ...current, [stub.id]: true }));

    try {
      await updateOne("stubs", {
        id: stub.id,
        data: { ...stub, enabled: nextEnabled },
        previousData: stub,
      });
      notify(nextEnabled ? "Stub enabled" : "Stub disabled", { type: "success" });
      refresh();
    } catch (error) {
      setOptimisticEnabledByID(rollbackState);
      notify((error as Error).message, { type: "error" });
    } finally {
      setUpdatingByID((current) => {
        const nextState = { ...current };
        delete nextState[stub.id];
        return nextState;
      });
    }
  };

  useEffect(() => {
    if (grouped.length === 0) {
      setSelectedServiceName("");
      return;
    }

    const hasSelectedService = grouped.some((group) => group.name === selectedServiceName);
    if (!hasSelectedService) {
      setSelectedServiceName(grouped[0].name);
    }
  }, [grouped, selectedServiceName]);

  const selectedService =
    grouped.find((serviceGroup) => serviceGroup.name === selectedServiceName) || grouped[0];
  const methods = selectedService?.methods || [];

  useEffect(() => {
    if (methods.length === 0) {
      setSelectedMethodName("");
      return;
    }

    const hasSelectedMethod = methods.some((methodGroup) => methodGroup.name === selectedMethodName);
    if (!hasSelectedMethod) {
      setSelectedMethodName(methods[0].name);
    }
  }, [methods, selectedMethodName]);

  const selectedMethod =
    methods.find((methodGroup) => methodGroup.name === selectedMethodName) || methods[0];
  const stubs = selectedMethod?.stubs || [];

  if (isPending) {
    return (
      <Box sx={{ px: 1.5, py: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Loading stubs...
        </Typography>
      </Box>
    );
  }

  if (grouped.length === 0) {
    return (
      <Box sx={{ px: 1.5, py: 2 }}>
        <Typography variant="body2" color="text.secondary">
          No stubs found.
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: isStubsExpanded
          ? "minmax(0, 0fr) minmax(0, 0fr) minmax(0, 1fr)"
          : "minmax(0, 0.85fr) minmax(0, 1fr) minmax(0, 2fr)",
        gap: 0,
        height: "100%",
        flex: 1,
        minHeight: 0,
        transition: "grid-template-columns 320ms cubic-bezier(0.22, 1, 0.36, 1)",
      }}
    >
      <Box
        sx={{
          border: "1px solid",
          borderColor: "divider",
          borderRadius: RADIUS_PX,
          overflow: "hidden",
          backgroundColor: "background.paper",
          backgroundImage: "none",
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          opacity: isStubsExpanded ? 0 : 1,
          pointerEvents: isStubsExpanded ? "none" : "auto",
          borderColor: isStubsExpanded ? "transparent" : "divider",
          transition: "opacity 180ms ease, border-color 180ms ease",
          willChange: "opacity",
        }}
      >
        <Box
          sx={{
            px: 1.25,
            py: 0.75,
            borderBottom: "1px solid",
            borderColor: "divider",
            height: COLUMN_HEADER_HEIGHT_PX,
            display: "flex",
            alignItems: "center",
          }}
        >
          <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.2, textTransform: "uppercase" }}>
            Services
          </Typography>
        </Box>
        <Box sx={{ display: "flex", flexDirection: "column", p: 0.35, gap: 0.15, minHeight: 0, overflow: "auto" }}>
          {grouped.map((serviceGroup) => {
            const serviceCount = serviceGroup.methods.reduce(
              (sum, methodGroup) => sum + methodGroup.stubs.length,
              0,
            );
            const isSelected = selectedService?.name === serviceGroup.name;

            return (
              <Box
                key={serviceGroup.name}
                onClick={() => setSelectedServiceName(serviceGroup.name)}
                sx={{
                  px: 1,
                  py: 0,
                  height: LIST_ROW_HEIGHT_PX,
                  display: "flex",
                  alignItems: "center",
                  borderRadius: RADIUS_PX,
                  cursor: "pointer",
                  border: "1px solid",
                  borderColor: "transparent",
                  bgcolor: "transparent",
                  "&:hover": {
                    bgcolor: "action.hover",
                  },
                }}
              >
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                  <Typography
                    sx={{
                      fontWeight: 600,
                      fontSize: d.text,
                      lineHeight: 1.2,
                      color: isSelected ? "#FF6C37" : "text.primary",
                    }}
                    noWrap
                  >
                    {serviceGroup.name}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ color: "text.secondary", fontSize: d.text - 2, whiteSpace: "nowrap", flexShrink: 0 }}
                  >
                    ({serviceCount})
                  </Typography>
                </Box>
              </Box>
            );
          })}
        </Box>
      </Box>

      <Box
        sx={{
          border: "1px solid",
          borderColor: "divider",
          borderRadius: RADIUS_PX,
          overflow: "hidden",
          backgroundColor: "background.paper",
          backgroundImage: "none",
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          opacity: isStubsExpanded ? 0 : 1,
          pointerEvents: isStubsExpanded ? "none" : "auto",
          borderColor: isStubsExpanded ? "transparent" : "divider",
          transition: "opacity 180ms ease, border-color 180ms ease",
          willChange: "opacity",
        }}
      >
        <Box
          sx={{
            px: 1.25,
            py: 0.75,
            borderBottom: "1px solid",
            borderColor: "divider",
            height: COLUMN_HEADER_HEIGHT_PX,
            display: "flex",
            alignItems: "center",
          }}
        >
          <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.2, textTransform: "uppercase" }}>
            Methods
          </Typography>
        </Box>
        <Box sx={{ display: "flex", flexDirection: "column", p: 0.35, gap: 0.15, minHeight: 0, overflow: "auto" }}>
          {methods.map((methodGroup) => {
            const isSelected = selectedMethod?.name === methodGroup.name;
            return (
              <Box
                key={`${selectedService?.name || "service"}::${methodGroup.name}`}
                onClick={() => setSelectedMethodName(methodGroup.name)}
                sx={{
                  px: 1,
                  py: 0,
                  height: LIST_ROW_HEIGHT_PX,
                  display: "flex",
                  alignItems: "center",
                  borderRadius: RADIUS_PX,
                  cursor: "pointer",
                  border: "1px solid",
                  borderColor: "transparent",
                  bgcolor: "transparent",
                  "&:hover": {
                    bgcolor: "action.hover",
                  },
                }}
              >
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                  <Typography
                    sx={{
                      fontWeight: 600,
                      fontSize: d.text,
                      lineHeight: 1.2,
                      color: isSelected ? "#FF6C37" : "text.primary",
                    }}
                    noWrap
                  >
                    {methodGroup.name}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ color: "text.secondary", fontSize: d.text - 2, whiteSpace: "nowrap", flexShrink: 0 }}
                  >
                    ({methodGroup.stubs.length})
                  </Typography>
                </Box>
              </Box>
            );
          })}
          {methods.length === 0 ? (
            <Typography sx={{ px: 1, py: 0.75, color: "text.secondary", fontSize: d.text - 1 }}>
              No methods for selected service.
            </Typography>
          ) : null}
        </Box>
      </Box>

      <Box
        sx={{
          border: "1px solid",
          borderColor: "divider",
          borderRadius: RADIUS_PX,
          overflow: "hidden",
          backgroundColor: "background.paper",
          backgroundImage: "none",
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Box
          sx={{
            px: 1.25,
            py: 0.75,
            borderBottom: "1px solid",
            borderColor: "divider",
            height: COLUMN_HEADER_HEIGHT_PX,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1,
          }}
        >
          <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.2 }}>
            {isStubsExpanded
              ? `${selectedService?.name || "(no service)"} - ${selectedMethod?.name || "(no method)"} - STUBS`
              : "STUBS"}
          </Typography>
          <Tooltip title={isStubsExpanded ? "Show Services and Methods" : "Expand STUBS"}>
            <IconButton
              size="small"
              aria-label={isStubsExpanded ? "Collapse STUBS panel" : "Expand STUBS panel"}
              onClick={() => setIsStubsExpanded((current) => !current)}
              sx={{
                ...ICON_BUTTON_ACCENT_SX,
                transform: isStubsExpanded ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 220ms ease",
              }}
            >
              {isStubsExpanded ? <ChevronRightIcon fontSize="small" /> : <ChevronLeftIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        </Box>
        <Box sx={{ display: "flex", flexDirection: "column", p: 0.35, gap: 0.2, minHeight: 0, overflow: "auto" }}>
          {stubs.map((stub) => (
            <StubNode
              key={stub.id}
              stub={stub}
              gridSize={gridSize}
              allowClone={allowClone}
              isUpdating={Boolean(updatingByID[stub.id])}
              onToggleEnabled={handleToggleEnabled}
            />
          ))}
          {stubs.length === 0 ? (
            <Typography sx={{ px: 1, py: 0.75, color: "text.secondary", fontSize: d.text - 1 }}>
              No stubs for selected method.
            </Typography>
          ) : null}
        </Box>
      </Box>
    </Box>
  );
};
