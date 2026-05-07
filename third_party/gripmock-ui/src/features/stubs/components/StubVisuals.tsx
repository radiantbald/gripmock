import { Box, Card, CardContent, Chip, Divider, Stack, Tooltip, Typography } from "@mui/material";
import { Code, Functions } from "@mui/icons-material";
import { useRecordContext } from "react-admin";

import { JsonField } from "../../../components/json/JsonField";
import { useJsonTheme } from "../../../utils/jsonTheme";
import type { StubRecord } from "../../../types/entities";

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
        color="default"
        variant="outlined"
        label={`stream x${output.stream.length}`}
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
        <Chip size="small" color="success" variant="outlined" label="data" />
      </Tooltip>
    );
  }

  if (typeof output.error === "string" && output.error.length > 0) {
    return <Chip size="small" color="warning" variant="outlined" label="error" />;
  }

  return <Chip size="small" label="empty" variant="outlined" />;
};

export const MatcherField = () => {
  const record = useRecordContext<StubRecord>();
  return <MatcherChip record={record} />;
};

export const OutputKindField = () => {
  const record = useRecordContext<StubRecord>();
  return <OutputKindChip record={record} />;
};

const JsonDetailsSection = ({
  title,
  source,
  isEmpty,
  emptyLabel,
}: {
  title: string;
  source: keyof StubRecord;
  isEmpty: boolean;
  emptyLabel: string;
}) => {
  const jsonTheme = useJsonTheme();

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        {title}
      </Typography>
      {!isEmpty ? (
        <JsonField
          source={source}
          reactJsonOptions={{
            theme: jsonTheme,
            collapsed: 2,
            displayDataTypes: false,
            displayObjectSize: false,
          }}
        />
      ) : (
        <Typography variant="body2" color="textSecondary">
          {emptyLabel}
        </Typography>
      )}
    </Box>
  );
};

export const StubDetails = ({ record }: { record?: StubRecord }) => {
  const contextRecord = useRecordContext<StubRecord>();
  const resolvedRecord = record || contextRecord;
  const hasInputs = Array.isArray(resolvedRecord?.inputs) && resolvedRecord.inputs.length > 0;

  if (!resolvedRecord) return null;

  return (
    <Card sx={{ m: 1, backgroundColor: "action.hover" }}>
      <CardContent>
        <Box display="flex" flexDirection="column" gap={1.5}>
          <Box>
            <Typography variant="h6" gutterBottom>
              Stub Details
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Box display="flex" alignItems="center" gap={1}>
                <Typography variant="body2">
                  <strong>ID:</strong> {resolvedRecord.id}
                </Typography>
              </Box>
              {resolvedRecord.name ? (
                <Box display="flex" alignItems="center" gap={1}>
                  <Typography variant="body2">
                    <strong>Name:</strong> {resolvedRecord.name}
                  </Typography>
                </Box>
              ) : null}
              <Box display="flex" alignItems="center" gap={1}>
                <Code fontSize="small" />
                <Typography variant="body2">
                  <strong>Service:</strong> {resolvedRecord.service}
                </Typography>
              </Box>
              <Box display="flex" alignItems="center" gap={1}>
                <Functions fontSize="small" />
                <Typography variant="body2">
                  <strong>Method:</strong> {resolvedRecord.method}
                </Typography>
              </Box>
              <Box display="flex" alignItems="center" gap={1}>
                <Typography variant="body2">
                  <strong>Enabled:</strong> {resolvedRecord.enabled !== false ? "yes" : "no"}
                </Typography>
              </Box>
              <MatcherChip record={resolvedRecord} />
              <OutputKindChip record={resolvedRecord} />
            </Stack>
          </Box>

          <Divider />

          <JsonDetailsSection
            title="Headers"
            source="headers"
            isEmpty={!resolvedRecord.headers}
            emptyLabel="No headers"
          />
          <JsonDetailsSection
            title="Input"
            source="input"
            isEmpty={hasInputs || !resolvedRecord.input}
            emptyLabel={hasInputs ? "Ignored because inputs[] is configured" : "No input data"}
          />
          <JsonDetailsSection
            title="Inputs (Array)"
            source="inputs"
            isEmpty={!Array.isArray(resolvedRecord.inputs) || resolvedRecord.inputs.length === 0}
            emptyLabel="No inputs data"
          />
          <JsonDetailsSection
            title="Output"
            source="output"
            isEmpty={!resolvedRecord.output}
            emptyLabel="No output data"
          />
        </Box>
      </CardContent>
    </Card>
  );
};
