import { Code, Functions, Info, OpenInNew } from "@mui/icons-material";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Stack,
  Typography,
} from "@mui/material";
import { useCreatePath, useGetOne, useRecordContext } from "react-admin";
import { Link as RouterLink } from "react-router-dom";

import type { ProtoFieldSchema, ProtoMessageSchema, ServiceRecord } from "../../../types/entities";
import { buildStubsFilter, getMethodMeta, methodLabel } from "./ServiceFields";

const cardinalityLabel: Record<ProtoFieldSchema["cardinality"], string> = {
  optional: "optional",
  required: "required",
  repeated: "repeated",
};

const fieldTypeLabel = (field: ProtoFieldSchema): string => {
  if (field.map) {
    const key = field.mapKeyKind || "unknown";
    const value = field.mapValueTypeName || field.mapValueKind || "unknown";
    return `map<${key}, ${value}>`;
  }

  if (field.typeName) {
    return field.typeName;
  }

  return field.kind;
};

const SchemaFieldsTable = ({
  schema,
  depth = 0,
}: {
  schema: ProtoMessageSchema;
  depth?: number;
}) => (
  <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.5, overflow: "hidden", mt: 0.5 }}>
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "minmax(150px, 1fr) minmax(240px, 1.5fr) 110px",
        px: 1,
        py: 0.7,
        bgcolor: "action.hover",
        borderBottom: "1px solid",
        borderColor: "divider",
      }}
    >
      <Typography variant="caption" fontWeight={700}>Field</Typography>
      <Typography variant="caption" fontWeight={700}>Type</Typography>
      <Typography variant="caption" fontWeight={700}>Mode</Typography>
    </Box>

    {schema.fields.map((field) => (
      <Box key={`${schema.typeName}-${field.number}-${field.name}`}>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "minmax(150px, 1fr) minmax(240px, 1.5fr) 110px",
            px: 1,
            py: 0.7,
            borderBottom: "1px solid",
            borderColor: "divider",
            alignItems: "center",
          }}
        >
          <Box>
            <Typography variant="body2">{field.name}</Typography>
            <Typography variant="caption" color="text.secondary">#{field.number} {field.jsonName}</Typography>
          </Box>
          <Box>
            <Typography variant="body2" sx={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
              {fieldTypeLabel(field)}
            </Typography>
            {field.oneof ? (
              <Typography variant="caption" color="text.secondary">oneof: {field.oneof}</Typography>
            ) : null}
            {field.enumValues && field.enumValues.length > 0 ? (
              <Typography variant="caption" color="text.secondary">
                enum: {field.enumValues.join(", ")}
              </Typography>
            ) : null}
          </Box>
          <Typography variant="caption">{cardinalityLabel[field.cardinality]}</Typography>
        </Box>

        {field.message && depth < 2 ? (
          <Box sx={{ pl: 2.5, pr: 1, pb: 0.8, pt: 0.3, bgcolor: "background.default" }}>
            <Typography variant="caption" color="text.secondary">
              Nested message: {field.message.typeName}
            </Typography>
            <SchemaFieldsTable schema={field.message} depth={depth + 1} />
          </Box>
        ) : null}
      </Box>
    ))}

    {schema.recursiveRef ? (
      <Box sx={{ px: 1, py: 0.75, bgcolor: "warning.light" }}>
        <Typography variant="caption">Recursive reference truncated for this branch.</Typography>
      </Box>
    ) : null}
  </Box>
);

const MethodReflection = ({
  serviceID,
  method,
  detail,
  loading,
  hasError,
}: {
  serviceID: string;
  method: NonNullable<ServiceRecord["methods"]>[number];
  detail?: NonNullable<ServiceRecord["methods"]>[number];
  loading: boolean;
  hasError: boolean;
}) => {
  const localRequestSchema = detail?.requestSchema || method.requestSchema;
  const localResponseSchema = detail?.responseSchema || method.responseSchema;
  const shouldFetchMethod = !localRequestSchema && !localResponseSchema && Boolean(method.name);
  const {
    data: methodDetails,
    isLoading: methodLoading,
    error: methodError,
  } = useGetOne<NonNullable<ServiceRecord["methods"]>[number] & { id: string }>(
    `services/${serviceID}/methods`,
    { id: method.name || "" },
    { retry: false, staleTime: 60_000, enabled: shouldFetchMethod },
  );

  if (loading) {
    return (
      <Box display="flex" alignItems="center" gap={1} mt={1}>
        <CircularProgress size={14} />
        <Typography variant="caption" color="text.secondary">
          Loading method reflection
        </Typography>
      </Box>
    );
  }

  if (hasError) {
    return (
      <Typography variant="caption" color="error" mt={1}>
        Failed to load method reflection details.
      </Typography>
    );
  }

  if (methodLoading) {
    return (
      <Box display="flex" alignItems="center" gap={1} mt={1}>
        <CircularProgress size={14} />
        <Typography variant="caption" color="text.secondary">
          Loading method reflection
        </Typography>
      </Box>
    );
  }

  if (methodError) {
    return (
      <Typography variant="caption" color="error" mt={1}>
        Failed to load method reflection details.
      </Typography>
    );
  }

  const requestSchema = localRequestSchema || methodDetails?.requestSchema;
  const responseSchema = localResponseSchema || methodDetails?.responseSchema;

  if (!requestSchema && !responseSchema) {
    return (
      <Typography variant="caption" color="text.secondary" mt={1}>
        Reflection schema is not available for this method.
      </Typography>
    );
  }

  return (
    <Stack spacing={1} mt={1.25}>
      {requestSchema ? (
        <Box>
          <Typography variant="caption" color="text.secondary">
            Request schema: {requestSchema.typeName}
          </Typography>
          <SchemaFieldsTable schema={requestSchema} />
        </Box>
      ) : null}
      {responseSchema ? (
        <Box>
          <Typography variant="caption" color="text.secondary">
            Response schema: {responseSchema.typeName}
          </Typography>
          <SchemaFieldsTable schema={responseSchema} />
        </Box>
      ) : null}
    </Stack>
  );
};

export const ServiceDetails = ({ record }: { record?: ServiceRecord }) => {
  const createPath = useCreatePath();
  const contextRecord = useRecordContext<ServiceRecord>();
  const resolvedRecord = record || contextRecord;
  const {
    data: detailedService,
    isLoading: reflectionLoading,
    error: reflectionError,
  } = useGetOne<ServiceRecord & { id: string }>(
    "services",
    { id: resolvedRecord?.id || "" },
    { retry: false, staleTime: 60_000, enabled: Boolean(resolvedRecord?.id) },
  );

  if (!resolvedRecord) return null;

  return (
    <Card sx={{ m: 1, backgroundColor: "action.hover" }}>
      <CardContent>
        <Box display="flex" flexDirection="column" gap={1.5}>
          <Box>
            <Typography variant="h6" gutterBottom>
              Service Information
            </Typography>
            <Box display="flex" flexDirection="column" gap={1}>
              <Box display="flex" alignItems="center" gap={1}>
                <Code fontSize="small" />
                <Typography variant="body2">
                  <strong>Package:</strong> {resolvedRecord.package}
                </Typography>
              </Box>
              <Box display="flex" alignItems="center" gap={1}>
                <Info fontSize="small" />
                <Typography variant="body2">
                  <strong>Name:</strong> {resolvedRecord.name}
                </Typography>
              </Box>
              <Box display="flex" alignItems="center" gap={1}>
                <Functions fontSize="small" />
                <Typography variant="body2">
                  <strong>Methods:</strong> {resolvedRecord.methods?.length || 0}
                </Typography>
              </Box>
            </Box>
          </Box>
          <Box>
            <Typography variant="h6" gutterBottom>
              Methods
            </Typography>
            {resolvedRecord.methods && resolvedRecord.methods.length > 0 ? (
              <Stack spacing={1}>
                {resolvedRecord.methods.map((method, index: number) => {
                  const meta = getMethodMeta(method);
                  const label = methodLabel(method);
                  const detail = detailedService?.methods?.find(
                    (item) =>
                      item.id === method.id ||
                      item.name === method.name ||
                      item.name === label ||
                      item.id?.endsWith(`/${label}`),
                  );

                  return (
                    <Card key={index} variant="outlined" sx={{ p: 1.5 }}>
                      <Box display="flex" alignItems="center" justifyContent="space-between" gap={2}>
                        <Box>
                          <Typography variant="subtitle2">{methodLabel(method)}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {method.id || `${resolvedRecord.id}/${methodLabel(method)}`}
                          </Typography>
                        </Box>
                        <Button
                          size="small"
                          component={RouterLink}
                          to={`${createPath({ resource: "stubs", type: "list" })}?filter=${buildStubsFilter(resolvedRecord.id, methodLabel(method))}`}
                          startIcon={<OpenInNew fontSize="small" />}
                        >
                          Open stubs
                        </Button>
                      </Box>
                      <>
                        <Divider sx={{ my: 1 }} />
                        <Box display="flex" flexWrap="wrap" gap={0.75}>
                          {method.methodType && <Chip size="small" color="primary" label={method.methodType} />}
                          {meta.requestType && <Chip size="small" label={`request: ${meta.requestType}`} />}
                          {meta.responseType && <Chip size="small" label={`response: ${meta.responseType}`} />}
                          {meta.clientStreaming && <Chip size="small" color="info" label="client-stream" />}
                          {meta.serverStreaming && <Chip size="small" color="info" label="server-stream" />}
                        </Box>
                        <MethodReflection
                          serviceID={resolvedRecord.id}
                          method={method}
                          detail={detail}
                          loading={reflectionLoading}
                          hasError={Boolean(reflectionError)}
                        />
                      </>
                    </Card>
                  );
                })}
              </Stack>
            ) : (
              <Typography variant="body2" color="textSecondary">
                No methods available
              </Typography>
            )}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};
