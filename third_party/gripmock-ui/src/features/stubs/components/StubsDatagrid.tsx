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
import { useState } from "react";
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
        servicePy: 0.2,
        methodPx: 0.4,
        methodPy: 0.2,
        stubPx: 0.9,
        stubPy: 0.3,
        methodIndent: 1.4,
        stubIndent: 2.8,
        text: 12,
      }
    : {
        servicePx: 1.5,
        servicePy: 0.45,
        methodPx: 0.7,
        methodPy: 0.4,
        stubPx: 1.1,
        stubPy: 0.5,
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
  const statusSlotHeight = 24;
  const statusControlSx = {
    width: "100%",
    height: "100%",
    borderRadius: "12px",
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
        borderBottom: "1px solid",
        borderColor: "divider",
        "&::before": { display: "none" },
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon fontSize="small" />}
        sx={{
          px: d.stubPx,
          pl: d.stubIndent,
          py: 0.35,
          minHeight: 0,
          "& .MuiAccordionSummary-content": {
            my: 0,
            minHeight: 44,
            alignItems: "center",
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
            sx={{ minHeight: 36, flexWrap: "nowrap", overflow: "hidden" }}
          >
            <Typography
              variant="body2"
              sx={{
                fontFamily: "monospace",
                color: "text.secondary",
                fontSize: d.text - 1,
                lineHeight: 1,
                minWidth: 16,
                textAlign: "right",
              }}
            >
              {stub.id}
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
            <Typography sx={{ fontWeight: 600, fontSize: d.text * 1.5, lineHeight: 1.1 }}>
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
          <Box sx={{ display: "flex", alignItems: "center", minHeight: 36, flexShrink: 0, gap: 1 }}>
            <OutputKindChip record={stub} />
            <Chip
              size="small"
              variant="outlined"
              label={`code: ${typeof stub.output?.code === "number" ? stub.output.code : 0}`}
            />
            <RecordContextProvider value={stub}>
              <RowActionsField allowDelete={allowDelete} allowClone={allowClone} />
            </RecordContextProvider>
          </Box>
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ px: 0, py: 0 }}>
        <Box sx={{ px: 0.5, pb: 0.5, "& .MuiCard-root": { boxShadow: "none", borderRadius: 1 } }}>
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

  if (isPending) {
    return (
      <Box sx={{ px: 1.5, py: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Loading stubs...
        </Typography>
      </Box>
    );
  }

  const records = data || [];
  const grouped = buildGroupedTree(records);

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
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
      {grouped.map((serviceGroup) => {
        const serviceCount = serviceGroup.methods.reduce(
          (sum, methodGroup) => sum + methodGroup.stubs.length,
          0,
        );

        return (
          <Accordion
            key={serviceGroup.name}
            defaultExpanded
            disableGutters
            sx={{
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 1.5,
              overflow: "hidden",
              bgcolor: "background.paper",
              boxShadow: "none",
              "&::before": { display: "none" },
            }}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              sx={{
                bgcolor: "transparent",
                px: d.servicePx,
                py: d.servicePy,
                minHeight: 0,
                "& .MuiAccordionSummary-content": { my: 0, alignItems: "center" },
              }}
            >
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <Typography sx={{ fontWeight: 600, fontSize: d.text + 1 }}>
                  {serviceGroup.name}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ color: "text.secondary", fontSize: d.text - 2 }}
                >
                  {serviceCount} stubs
                </Typography>
              </Stack>
            </AccordionSummary>

            <AccordionDetails sx={{ p: 0.5 }}>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 0.35 }}>
                {serviceGroup.methods.map((methodGroup) => (
                  <Box
                    key={`${serviceGroup.name}::${methodGroup.name}`}
                    sx={{
                      borderTop: "1px solid",
                      borderColor: "divider",
                    }}
                  >
                    <Stack
                      direction="row"
                      spacing={1}
                      alignItems="center"
                      flexWrap="wrap"
                      useFlexGap
                      sx={{ px: d.methodPx, pl: d.methodIndent, py: d.methodPy }}
                    >
                      <Typography sx={{ fontWeight: 500, fontSize: d.text }}>
                        {methodGroup.name}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{ color: "text.secondary", fontSize: d.text - 2 }}
                      >
                        {methodGroup.stubs.length} stubs
                      </Typography>
                    </Stack>
                    <Box
                      sx={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 0,
                        pl: d.stubIndent - d.stubPx,
                      }}
                    >
                      {methodGroup.stubs.map((stub) => (
                        <StubNode
                          key={stub.id}
                          stub={stub}
                          gridSize={gridSize}
                          allowDelete={allowDelete}
                          allowClone={allowClone}
                        />
                      ))}
                    </Box>
                  </Box>
                ))}
              </Box>
            </AccordionDetails>
          </Accordion>
        );
      })}
    </Box>
  );
};
