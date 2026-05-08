import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Chip,
  Stack,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
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
const LIST_ROW_HEIGHT_PX = 30;

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
  allowDelete,
  allowClone,
}: {
  stub: StubRecord;
  gridSize: "small" | "medium";
  allowDelete?: boolean;
  allowClone?: boolean;
}) => {
  const d = densitySx(gridSize);
  const notify = useNotify();
  const refresh = useRefresh();
  const [updateOne, { isPending: isUpdating }] = useUpdate();
  const [isStatusHovered, setIsStatusHovered] = useState(false);
  const isDisabled = stub.enabled === false;
  const nextEnabled = isDisabled;
  const statusLabel = isDisabled ? "Disabled" : "Enabled";
  const statusActionLabel = isDisabled ? "Enable" : "Disable";
  const statusActionColor = isDisabled ? "success" : "error";
  const statusSlotWidth = 92;
  const statusSlotHeight = 22;
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

    try {
      await updateOne("stubs", {
        id: stub.id,
        data: { ...stub, enabled: nextEnabled },
        previousData: stub,
      });
      notify(nextEnabled ? "Stub enabled" : "Stub disabled", { type: "success" });
      refresh();
    } catch (error) {
      notify((error as Error).message, { type: "error" });
    }
  };

  return (
    <Accordion
      disableGutters
      elevation={0}
      sx={{
        bgcolor: "transparent",
        borderRadius: 0,
        "&::before": { display: "none" },
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon fontSize="small" />}
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
            <Typography sx={{ fontWeight: 600, fontSize: d.text, lineHeight: 1.2 }}>
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
              gap: 1,
            }}
          >
            <OutputKindChip record={stub} />
            <Chip
              size="small"
              variant="outlined"
              label={`code: ${typeof stub.output?.code === "number" ? stub.output.code : 0}`}
              sx={{ borderRadius: RADIUS_PX }}
            />
            <RecordContextProvider value={stub}>
              <RowActionsField allowDelete={allowDelete} allowClone={allowClone} />
            </RecordContextProvider>
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
  allowDelete,
  allowClone,
}: {
  gridSize: "small" | "medium";
  allowDelete?: boolean;
  allowClone?: boolean;
}) => {
  const { data, isPending } = useListContext<StubRecord>();
  const d = densitySx(gridSize);
  const [selectedServiceName, setSelectedServiceName] = useState<string>("");
  const [selectedMethodName, setSelectedMethodName] = useState<string>("");

  const records = data || [];
  const grouped = buildGroupedTree(records);

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
        gridTemplateColumns: "minmax(210px, 0.85fr) minmax(230px, 1fr) minmax(520px, 2fr)",
        gap: 0,
        height: "calc(100vh - 180px)",
        minHeight: 0,
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
        }}
      >
        <Box sx={{ px: 1.25, py: 0.75, borderBottom: "1px solid", borderColor: "divider" }}>
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
                  borderColor: isSelected ? "primary.main" : "transparent",
                  bgcolor: isSelected ? "action.selected" : "transparent",
                  "&:hover": {
                    bgcolor: isSelected ? "action.selected" : "action.hover",
                  },
                }}
              >
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                  <Typography sx={{ fontWeight: 600, fontSize: d.text, lineHeight: 1.2 }} noWrap>
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
        }}
      >
        <Box sx={{ px: 1.25, py: 0.75, borderBottom: "1px solid", borderColor: "divider" }}>
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
                  borderColor: isSelected ? "primary.main" : "transparent",
                  bgcolor: isSelected ? "action.selected" : "transparent",
                  "&:hover": {
                    bgcolor: isSelected ? "action.selected" : "action.hover",
                  },
                }}
              >
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                  <Typography sx={{ fontWeight: 600, fontSize: d.text, lineHeight: 1.2 }} noWrap>
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
        <Box sx={{ px: 1.25, py: 0.75, borderBottom: "1px solid", borderColor: "divider" }}>
          <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.2, textTransform: "uppercase" }}>
            Stubs
          </Typography>
        </Box>
        <Box sx={{ display: "flex", flexDirection: "column", p: 0.35, gap: 0.2, minHeight: 0, overflow: "auto" }}>
          {stubs.map((stub) => (
            <StubNode
              key={stub.id}
              stub={stub}
              gridSize={gridSize}
              allowDelete={allowDelete}
              allowClone={allowClone}
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
