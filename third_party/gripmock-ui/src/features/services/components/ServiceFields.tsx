import { Box, Chip } from "@mui/material";
import { DeleteButton, useCreatePath, useNotify, useRecordContext } from "react-admin";
import { Functions } from "@mui/icons-material";
import { Link as RouterLink } from "react-router-dom";

import type { ServiceMethod, ServiceRecord } from "../../../types/entities";

export const buildStubsFilter = (service: string, method?: string) => {
  const filter = method ? { service, method } : { service };
  return encodeURIComponent(JSON.stringify(filter));
};

export const methodLabel = (method: ServiceMethod) =>
  method?.name || method?.id?.split("/").pop() || "Unknown";

export const getMethodMeta = (method: ServiceMethod) => {
  const requestType = method?.requestType || method?.inputType || method?.request || null;
  const responseType = method?.responseType || method?.outputType || method?.response || null;
  const clientStreaming = Boolean(method?.clientStreaming || method?.isClientStreaming);
  const serverStreaming = Boolean(method?.serverStreaming || method?.isServerStreaming);

  return { requestType, responseType, clientStreaming, serverStreaming };
};

export const MethodsCountField = () => {
  const record = useRecordContext<ServiceRecord>();
  if (!record?.methods) return <span>0</span>;
  return <span>{record.methods.length}</span>;
};

export const MethodsField = () => {
  const record = useRecordContext<ServiceRecord>();
  const createPath = useCreatePath();

  if (!record?.methods || record.methods.length === 0) {
    return <span style={{ color: "#999" }}>No methods</span>;
  }

  return (
    <Box display="flex" flexWrap="wrap" gap={0.5}>
      {record.methods.map((method, index: number) => (
        <Chip
          key={index}
          label={methodLabel(method)}
          size="small"
          variant="outlined"
          icon={<Functions fontSize="small" />}
          component={RouterLink}
          clickable
          to={`${createPath({ resource: "stubs", type: "list" })}?filter=${buildStubsFilter(String(record.id), methodLabel(method))}`}
        />
      ))}
    </Box>
  );
};

export const ServiceDeleteField = () => {
  const notify = useNotify();

  const formatDeleteError = (error: unknown): string => {
    const message = error instanceof Error ? error.message : "";
    if (message.toLowerCase().includes("not found")) {
      return "Service is not removable (startup service) or already removed";
    }

    return message || "Unable to delete service";
  };

  return (
    <DeleteButton
      mutationMode="pessimistic"
      confirmTitle="Delete service"
      confirmContent="Delete dynamic service loaded from descriptors"
      mutationOptions={{
        onError: (error: unknown) =>
          notify(formatDeleteError(error), {
            type: "error",
          }),
      }}
    />
  );
};
