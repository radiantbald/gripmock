import { Box, Card, CardContent, Chip, Divider, Table, TableBody, TableCell, TableHead, TableRow, Tooltip, Typography } from "@mui/material";
import { useRecordContext } from "react-admin";

import type { StubRecord } from "../../../types/entities";

const META_CHIP_SX = {
  borderRadius: "10px",
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
const THIN_BORDER_WIDTH = 1;
const neutralMetaChipSx = {
  ...META_CHIP_SX,
  color: "text.secondary",
  borderColor: "rgba(255, 255, 255, 0.45)",
} as const;

export const MatcherChip = ({ record }: { record?: StubRecord }) => {
  const flags: string[] = [];
  const hasInputs = Array.isArray(record?.inputs) && record.inputs.length > 0;

  if (record?.headers) flags.push("headers");
  if (hasInputs) {
    flags.push("inputs[]");
  } else if (record?.input) {
    flags.push("input");
  }

  if (flags.length === 0) {
    return <Chip size="small" label="none" variant="outlined" />;
  }

  return <Chip size="small" label={flags.join(" + ")} variant="outlined" />;
};

export const OutputKindChip = ({ record }: { record?: StubRecord }) => {
  const output = record?.output || {};

  if (Array.isArray(output.stream) && output.stream.length > 0) {
    return (
      <Chip
        size="small"
        variant="outlined"
        label={`stream x${output.stream.length}`}
        sx={neutralMetaChipSx}
      />
    );
  }

  if (output.data) {
    const dataPreview = (() => {
      try {
        return JSON.stringify(output.data, null, 2) ?? String(output.data);
      } catch {
        return String(output.data);
      }
    })();

    return (
      <Tooltip
        arrow
        placement="bottom-start"
        title={
          <Box
            component="pre"
            sx={{
              m: 0,
              p: 0,
              fontFamily: "monospace",
              fontSize: 12,
              lineHeight: 1.35,
              whiteSpace: "pre-wrap",
              maxWidth: 420,
              maxHeight: 280,
              overflow: "auto",
            }}
          >
            {dataPreview}
          </Box>
        }
      >
        <Chip
          size="small"
          variant="outlined"
          label="data"
          sx={neutralMetaChipSx}
        />
      </Tooltip>
    );
  }

  if (typeof output.error === "string" && output.error.length > 0) {
    return <Chip size="small" color="warning" variant="outlined" label="error" sx={META_CHIP_SX} />;
  }

  return <Chip size="small" label="empty" variant="outlined" sx={META_CHIP_SX} />;
};

export const MatcherField = () => {
  const record = useRecordContext<StubRecord>();
  return <MatcherChip record={record} />;
};

export const OutputKindField = () => {
  const record = useRecordContext<StubRecord>();
  return <OutputKindChip record={record} />;
};

const panelTitleSx = { fontSize: 13, fontWeight: 700, letterSpacing: 0.15 } as const;
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
const nestedPanelTitleSx = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 0.12,
  textTransform: "uppercase",
  color: "#ffffff",
} as const;
const sectionContainerSx = {
  width: "100%",
  borderRadius: "10px",
  overflow: "hidden",
  bgcolor: "background.paper",
} as const;
const sectionHeaderSx = {
  px: 1.25,
  py: 0.25,
  display: "flex",
  alignItems: "center",
} as const;
const nestedPanelSx = {
  border: "1px solid",
  borderWidth: THIN_BORDER_WIDTH,
  borderColor: "divider",
  borderRadius: "10px",
  overflow: "hidden",
  bgcolor: "background.paper",
} as const;
const nestedPanelHeaderSx = {
  px: 1,
  py: 0.7,
  minHeight: 34,
  display: "flex",
  alignItems: "center",
  bgcolor: "background.paper",
  borderBottomStyle: "solid",
  borderBottomWidth: THIN_BORDER_WIDTH,
  borderColor: "divider",
} as const;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasOwnEntries = (value: unknown): boolean => isPlainObject(value) && Object.keys(value).length > 0;

const pickMatcherMap = (value: unknown): Record<string, unknown> | null => {
  if (!isPlainObject(value)) {
    return null;
  }

  const matcherOrder = ["equals", "contains", "matches", "glob"] as const;
  for (const key of matcherOrder) {
    const candidate = value[key];
    if (hasOwnEntries(candidate)) {
      return candidate as Record<string, unknown>;
    }
  }

  if (hasOwnEntries(value)) {
    return value;
  }

  return null;
};

const pickMatcherPayload = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => pickMatcherPayload(item));
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const matcherOrder = ["equals", "contains", "matches", "glob"] as const;
  for (const key of matcherOrder) {
    const candidate = value[key];
    if (hasOwnEntries(candidate)) {
      return candidate;
    }
  }

  if (Array.isArray(value.anyOf) && value.anyOf.length > 0) {
    return value.anyOf.map((item) => pickMatcherPayload(item));
  }

  if (value.ignoreArrayOrder === true) {
    return { ignoreArrayOrder: true };
  }

  return hasOwnEntries(value) ? value : {};
};

const isEmptyPayload = (value: unknown): boolean => {
  if (value === undefined || value === null) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.length === 0 || value.every((item) => isEmptyPayload(item));
  }

  if (isPlainObject(value)) {
    return Object.keys(value).length === 0;
  }

  return false;
};

const formatJsonPayload = (value: unknown): string => {
  const normalized = value ?? {};
  try {
    return JSON.stringify(normalized, null, 2);
  } catch {
    return "{}";
  }
};

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

const normalizeHeaderRows = (headers: unknown): Array<{ key: string; value: string }> => {
  const matcherHeaders = pickMatcherMap(headers);
  if (!matcherHeaders) {
    return [];
  }

  return Object.entries(matcherHeaders).map(([key, value]) => ({
    key,
    value: typeof value === "string" ? value : JSON.stringify(value),
  }));
};

export const StubDetails = ({ record }: { record?: StubRecord }) => {
  const contextRecord = useRecordContext<StubRecord>();
  const resolvedRecord = record || contextRecord;
  const hasInputs = Array.isArray(resolvedRecord?.inputs) && resolvedRecord.inputs.length > 0;
  const headerRows = normalizeHeaderRows(resolvedRecord?.headers);
  const rawMatcherPayload = hasInputs ? resolvedRecord?.inputs : resolvedRecord?.input;
  const matcherPayload = pickMatcherPayload(rawMatcherPayload);
  const matcherPayloadText = formatJsonPayload(unwrapRootPayload(matcherPayload ?? {}));
  const isRequestMatchEmpty = headerRows.length === 0 && isEmptyPayload(matcherPayload);
  const outputHeaderRows = normalizeHeaderRows(resolvedRecord?.output?.headers);
  const hasStreamPayload = Array.isArray(resolvedRecord?.output?.stream) && resolvedRecord.output.stream.length > 0;
  const responsePayloadTitle = hasStreamPayload ? "Stream" : "Data";
  const responsePayload = hasStreamPayload ? resolvedRecord?.output?.stream : resolvedRecord?.output?.data;
  const isResponsePayloadEmpty = isEmptyPayload(responsePayload);
  const responsePayloadText = formatJsonPayload(unwrapRootPayload(responsePayload ?? {}));
  const isResponseStubEmpty = outputHeaderRows.length === 0 && isResponsePayloadEmpty;

  if (!resolvedRecord) return null;

  return (
    <Card
      sx={{
        m: 1,
        backgroundColor: "background.paper",
        border: "1px solid",
        borderWidth: THIN_BORDER_WIDTH,
        borderColor: "divider",
      }}
    >
      <CardContent>
        <Box display="flex" flexDirection="column" gap={1.5}>
          <Box>
            <Box display="flex" flexDirection="column" gap={0.5}>
              <Typography variant="body2">
                <strong>Service:</strong> {resolvedRecord.service}
              </Typography>
              <Typography variant="body2">
                <strong>Method:</strong> {resolvedRecord.method}
              </Typography>
            </Box>
          </Box>

          <Divider sx={{ borderBottomWidth: THIN_BORDER_WIDTH, borderColor: "divider" }} />

          <Box sx={sectionContainerSx}>
            <Box
              sx={{
                ...sectionHeaderSx,
              }}
            >
              <Typography variant="subtitle2" sx={{ ...panelTitleSx, color: "#FF6C37" }}>
                Request Match
              </Typography>
            </Box>
            {!isRequestMatchEmpty ? (
              <Box
                sx={{
                  width: "100%",
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", md: "2fr 3fr" },
                  gap: 2,
                  alignItems: "start",
                  p: 0,
                }}
              >
                <Box sx={nestedPanelSx}>
                  <Box sx={nestedPanelHeaderSx}>
                    <Typography variant="subtitle2" sx={nestedPanelTitleSx}>
                      Headers
                    </Typography>
                  </Box>
                  {headerRows.length > 0 ? (
                    <Table
                      size="small"
                      sx={{
                        tableLayout: "fixed",
                        borderCollapse: "collapse",
                        "& .MuiTableCell-root": {
                          borderBottomStyle: "solid",
                          borderBottomWidth: THIN_BORDER_WIDTH,
                          borderColor: "divider",
                          px: 1,
                          py: 0.5,
                        },
                        "& .MuiTableBody-root .MuiTableRow-root:last-child .MuiTableCell-root": {
                          borderBottom: "none",
                        },
                      }}
                    >
                      <TableHead>
                        <TableRow>
                          <TableCell
                            sx={{ width: "35%", fontSize: 11, textTransform: "uppercase", color: "text.secondary" }}
                          >
                            Key
                          </TableCell>
                          <TableCell
                            sx={{ width: "65%", fontSize: 11, textTransform: "uppercase", color: "text.secondary" }}
                          >
                            Value
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {headerRows.map((header) => (
                          <TableRow key={header.key}>
                            <TableCell>
                              <Typography variant="body2">{header.key}</Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" sx={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                                {header.value}
                              </Typography>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <Box sx={{ p: 1 }}>
                      <Typography variant="body2" color="textSecondary">
                        No headers
                      </Typography>
                    </Box>
                  )}
                </Box>
                <Box sx={{ ...nestedPanelSx, minWidth: 0 }}>
                  <Box sx={nestedPanelHeaderSx}>
                    <Typography variant="subtitle2" sx={nestedPanelTitleSx}>
                      Input
                    </Typography>
                  </Box>
                  <Box sx={{ maxHeight: 300, overflow: "auto", p: 1, bgcolor: "background.paper" }}>
                    <Box component="pre" sx={jsonTextSx}>
                      {matcherPayloadText}
                    </Box>
                  </Box>
                </Box>
              </Box>
            ) : (
              <Box sx={{ px: 1.25, pt: 0.6, pb: 1.25 }}>
                <Typography variant="body2" color="textSecondary">
                  This stub matches every request.
                </Typography>
              </Box>
            )}
          </Box>

          <Box sx={sectionContainerSx}>
            <Box
              sx={{
                ...sectionHeaderSx,
              }}
            >
              <Typography variant="subtitle2" sx={{ ...panelTitleSx, color: "#FF6C37" }}>
                Response Stub
              </Typography>
            </Box>
            {!isResponseStubEmpty ? (
              <Box
                sx={{
                  width: "100%",
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", md: "2fr 3fr" },
                  gap: 2,
                  alignItems: "start",
                  p: 0,
                }}
              >
                <Box sx={nestedPanelSx}>
                  <Box sx={nestedPanelHeaderSx}>
                    <Typography variant="subtitle2" sx={nestedPanelTitleSx}>
                      Headers
                    </Typography>
                  </Box>
                  {outputHeaderRows.length > 0 ? (
                    <Table
                      size="small"
                      sx={{
                        tableLayout: "fixed",
                        borderCollapse: "collapse",
                        "& .MuiTableCell-root": {
                          borderBottomStyle: "solid",
                          borderBottomWidth: THIN_BORDER_WIDTH,
                          borderColor: "divider",
                          px: 1,
                          py: 0.5,
                        },
                        "& .MuiTableBody-root .MuiTableRow-root:last-child .MuiTableCell-root": {
                          borderBottom: "none",
                        },
                      }}
                    >
                      <TableHead>
                        <TableRow>
                          <TableCell
                            sx={{ width: "35%", fontSize: 11, textTransform: "uppercase", color: "text.secondary" }}
                          >
                            Key
                          </TableCell>
                          <TableCell
                            sx={{ width: "65%", fontSize: 11, textTransform: "uppercase", color: "text.secondary" }}
                          >
                            Value
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {outputHeaderRows.map((header) => (
                          <TableRow key={header.key}>
                            <TableCell>
                              <Typography variant="body2">{header.key}</Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" sx={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                                {header.value}
                              </Typography>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <Box sx={{ p: 1 }}>
                      <Typography variant="body2" color="textSecondary">
                        No headers
                      </Typography>
                    </Box>
                  )}
                </Box>
                <Box sx={{ ...nestedPanelSx, minWidth: 0 }}>
                  <Box sx={nestedPanelHeaderSx}>
                    <Typography variant="subtitle2" sx={nestedPanelTitleSx}>
                      {responsePayloadTitle}
                    </Typography>
                  </Box>
                  {!isResponsePayloadEmpty ? (
                    <Box sx={{ maxHeight: 300, overflow: "auto", p: 1, bgcolor: "background.paper" }}>
                      <Box component="pre" sx={jsonTextSx}>
                        {responsePayloadText}
                      </Box>
                    </Box>
                  ) : (
                    <Box sx={{ p: 1 }}>
                      <Typography variant="body2" color="textSecondary">
                        No data or stream
                      </Typography>
                    </Box>
                  )}
                </Box>
              </Box>
            ) : (
              <Box sx={{ p: 1.25 }}>
                <Typography variant="body2" color="textSecondary">
                  No response headers, data, or stream
                </Typography>
              </Box>
            )}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};
