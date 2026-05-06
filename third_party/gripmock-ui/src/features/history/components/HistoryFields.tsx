import { Box, Card, CardContent, CardHeader, Chip, Typography } from "@mui/material";
import { useRecordContext } from "react-admin";

import { JsonField } from "../../../components/json/JsonField";
import type { HistoryRecord } from "../../../types/entities";
import { useJsonTheme } from "../../../utils/jsonTheme";

export const ErrorChipField = ({ record }: { record?: HistoryRecord }) => {
  if (!record?.error) {
    return <Chip color="success" size="small" label="ok" />;
  }

  return <Chip color="error" size="small" label="error" />;
};

export const RequestPreviewField = ({ record }: { record: HistoryRecord }) => {
  const request = record?.request;
  const size = request ? JSON.stringify(request).length : 0;
  const keys =
    request && typeof request === "object"
      ? Object.keys(request).slice(0, 3).join(", ")
      : "";

  return (
    <Typography variant="caption" color="text.secondary">
      {size > 0 ? `${size}b${keys ? ` (${keys})` : ""}` : "empty"}
    </Typography>
  );
};

export const HistoryDetails = ({ record }: { record?: HistoryRecord }) => {
  const jsonTheme = useJsonTheme();
  const contextRecord = useRecordContext<HistoryRecord>();
  const resolvedRecord = record || contextRecord;

  if (!resolvedRecord) {
    return null;
  }

  return (
    <Card sx={{ m: 1, backgroundColor: "action.hover" }}>
      <CardHeader title="Call details" />
      <CardContent>
        <Box display="flex" flexDirection="column" gap={1.25}>
          <Typography variant="body2">Service: {resolvedRecord.service || "-"}</Typography>
          <Typography variant="body2">Method: {resolvedRecord.method || "-"}</Typography>
          <Typography variant="body2">Stub ID: {resolvedRecord.stubId || "-"}</Typography>
          <Typography variant="body2">Timestamp: {resolvedRecord.timestamp || "-"}</Typography>
          <Box>
            <Typography variant="subtitle2">Request</Typography>
            <JsonField
              source="request"
              reactJsonOptions={{ theme: jsonTheme, collapsed: 1 }}
            />
          </Box>
          <Box>
            <Typography variant="subtitle2">Response</Typography>
            <JsonField
              source="response"
              reactJsonOptions={{ theme: jsonTheme, collapsed: 1 }}
            />
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};
