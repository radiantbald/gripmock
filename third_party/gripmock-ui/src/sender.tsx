import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Divider,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useDataProvider, useNotify } from "react-admin";

import { ServiceMethodSelectors } from "./components/inputs/ServiceMethodSelectors";

type SenderCollection = {
  id: number;
  name: string;
  description?: string;
};

type SenderRequest = {
  id: number;
  collectionId: number;
  name: string;
  targetHost: string;
  service: string;
  method: string;
  schemaSource: "proto" | "reflection";
  metadata?: Record<string, string>;
  payload: Record<string, unknown>;
};

type SenderInvokeResponse = {
  responsePayload: Record<string, unknown>;
  responseMetadata?: Record<string, string>;
  trailers?: Record<string, string>;
  grpcCode: number;
  grpcMessage?: string;
  durationMs: number;
};

const prettyJson = (value: unknown) => JSON.stringify(value ?? {}, null, 2);

const parseObject = (raw: string, field: string): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(raw || "{}");
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new Error(`${field} must be a JSON object`);
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new Error(`${field}: ${(error as Error).message}`);
  }
};

const parseStringMap = (raw: string, field: string): Record<string, string> => {
  const parsed = parseObject(raw, field);
  const result: Record<string, string> = {};
  Object.entries(parsed).forEach(([key, value]) => {
    result[key] = String(value ?? "");
  });
  return result;
};

export const SenderPage = () => {
  const dataProvider = useDataProvider();
  const notify = useNotify();

  const [collections, setCollections] = useState<SenderCollection[]>([]);
  const [requests, setRequests] = useState<SenderRequest[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<number | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null);
  const [newCollectionName, setNewCollectionName] = useState("");

  const [requestName, setRequestName] = useState("");
  const [targetHost, setTargetHost] = useState("grpc://127.0.0.1:4770");
  const [service, setService] = useState("");
  const [method, setMethod] = useState("");
  const [schemaSource, setSchemaSource] = useState<"proto" | "reflection">("proto");
  const [payload, setPayload] = useState("{\n  \"int\": 5\n}");
  const [metadata, setMetadata] = useState("{}");

  const [result, setResult] = useState<SenderInvokeResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedRequest = useMemo(
    () => requests.find((item) => item.id === selectedRequestId) || null,
    [requests, selectedRequestId],
  );

  const loadCollections = async () => {
    const response = await dataProvider.getList("sender/collections", {
      pagination: { page: 1, perPage: 1000 },
      sort: { field: "id", order: "DESC" },
      filter: {},
    });
    const rows = (response.data || []) as SenderCollection[];
    setCollections(rows);
    if (!selectedCollectionId && rows.length > 0) {
      setSelectedCollectionId(rows[0].id);
    }
  };

  const loadRequests = async (collectionId: number | null) => {
    if (!collectionId) {
      setRequests([]);
      return;
    }
    const response = await dataProvider.getList("sender/requests", {
      pagination: { page: 1, perPage: 1000 },
      sort: { field: "id", order: "DESC" },
      filter: { collectionId },
    });
    setRequests((response.data || []) as SenderRequest[]);
  };

  useEffect(() => {
    loadCollections().catch((error) => {
      notify((error as Error).message, { type: "error" });
    });
  }, []);

  useEffect(() => {
    loadRequests(selectedCollectionId).catch((error) => {
      notify((error as Error).message, { type: "error" });
    });
  }, [selectedCollectionId]);

  const resetForm = () => {
    setSelectedRequestId(null);
    setRequestName("");
    setTargetHost("grpc://127.0.0.1:4770");
    setService("");
    setMethod("");
    setSchemaSource("proto");
    setPayload("{\n  \"int\": 5\n}");
    setMetadata("{}");
    setResult(null);
    setErrorMessage(null);
  };

  const applyRequestToForm = (request: SenderRequest) => {
    setSelectedRequestId(request.id);
    setRequestName(request.name);
    setTargetHost(request.targetHost);
    setService(request.service);
    setMethod(request.method);
    setSchemaSource(request.schemaSource || "proto");
    setPayload(prettyJson(request.payload));
    setMetadata(prettyJson(request.metadata || {}));
    setResult(null);
    setErrorMessage(null);
  };

  const createCollection = async () => {
    const name = newCollectionName.trim();
    if (!name) {
      notify("Collection name is required", { type: "warning" });
      return;
    }

    try {
      const response = await dataProvider.create("sender/collections", { data: { name } });
      const created = response.data as SenderCollection;
      setNewCollectionName("");
      await loadCollections();
      setSelectedCollectionId(created.id);
      notify("Collection created", { type: "success" });
    } catch (error) {
      notify((error as Error).message, { type: "error" });
    }
  };

  const saveRequest = async () => {
    if (!selectedCollectionId) {
      notify("Select a collection first", { type: "warning" });
      return;
    }

    try {
      const parsedPayload = parseObject(payload, "Payload");
      const parsedMetadata = parseStringMap(metadata, "Metadata");
      const requestData = {
        collectionId: selectedCollectionId,
        name: requestName.trim() || `${service}/${method}`,
        targetHost: targetHost.trim(),
        service: service.trim(),
        method: method.trim(),
        schemaSource,
        metadata: parsedMetadata,
        payload: parsedPayload,
      };

      if (!requestData.name || !requestData.service || !requestData.method || !requestData.targetHost) {
        notify("Name, host, service and method are required", { type: "warning" });
        return;
      }

      if (selectedRequestId) {
        await dataProvider.update("sender/requests", {
          id: selectedRequestId,
          data: requestData,
          previousData: selectedRequest || {},
        });
      } else {
        const response = await dataProvider.create("sender/requests", { data: requestData });
        setSelectedRequestId((response.data as SenderRequest).id);
      }

      await loadRequests(selectedCollectionId);
      notify("Request saved", { type: "success" });
    } catch (error) {
      notify((error as Error).message, { type: "error" });
    }
  };

  const invoke = async () => {
    try {
      const parsedPayload = parseObject(payload, "Payload");
      const parsedMetadata = parseStringMap(metadata, "Metadata");
      const response = await dataProvider.create("sender/invoke", {
        data: {
          targetHost: targetHost.trim(),
          service: service.trim(),
          method: method.trim(),
          schemaSource,
          metadata: parsedMetadata,
          payload: parsedPayload,
        },
      });
      const invokeResult = response.data as SenderInvokeResponse;
      setResult(invokeResult);
      if (invokeResult.grpcCode !== 0) {
        setErrorMessage(
          invokeResult.grpcMessage
            ? `gRPC ${invokeResult.grpcCode}: ${invokeResult.grpcMessage}`
            : `gRPC ${invokeResult.grpcCode}`,
        );
      } else {
        setErrorMessage(null);
      }
    } catch (error) {
      const message = (error as Error).message;
      setErrorMessage(message);
      setResult(null);
      notify(message, { type: "error" });
    }
  };

  return (
    <Box
      p={1}
      sx={{
        height: "calc(100vh - 84px)",
        minHeight: 640,
        display: "flex",
        gap: 1,
      }}
    >
      <Box
        sx={{
          width: { xs: 240, md: 280 },
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 220,
        }}
      >
        <Box px={1} py={0.75}>
          <Typography variant="caption" color="text.secondary" sx={{ letterSpacing: 0.3 }}>
            COLLECTIONS
          </Typography>
          <Box mt={0.75} display="flex" gap={0.75}>
            <TextField
              size="small"
              value={newCollectionName}
              placeholder="New collection"
              onChange={(event) => setNewCollectionName(event.target.value)}
              fullWidth
            />
            <Button variant="outlined" size="small" onClick={createCollection}>
              +
            </Button>
          </Box>
        </Box>
        <Divider />
        <Box sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          <List dense disablePadding>
            {collections.map((collection) => (
              <Box key={collection.id}>
                <ListItemButton
                  dense
                  selected={collection.id === selectedCollectionId}
                  onClick={() => setSelectedCollectionId(collection.id)}
                  sx={{ px: 1, py: 0.5 }}
                >
                  <ListItemText primary={collection.name} />
                </ListItemButton>
                {collection.id === selectedCollectionId ? (
                  <List dense disablePadding sx={{ pb: 0.5 }}>
                    {requests.map((item) => (
                      <ListItemButton
                        key={item.id}
                        dense
                        selected={item.id === selectedRequestId}
                        onClick={() => applyRequestToForm(item)}
                        sx={{ pl: 2.5, pr: 1, py: 0.4 }}
                      >
                        <ListItemText
                          primary={item.name}
                          secondary={`${item.service}/${item.method}`}
                          primaryTypographyProps={{ variant: "body2" }}
                        />
                      </ListItemButton>
                    ))}
                    <ListItemButton dense onClick={resetForm} sx={{ pl: 2.5, pr: 1, py: 0.4 }}>
                      <ListItemText primary="New request" primaryTypographyProps={{ variant: "body2", color: "text.secondary" }} />
                    </ListItemButton>
                  </List>
                ) : null}
              </Box>
            ))}
          </List>
        </Box>
      </Box>

      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            px: 1,
            py: 0.75,
            display: "flex",
            alignItems: "center",
            gap: 0.75,
            borderBottom: "1px solid",
            borderColor: "divider",
          }}
        >
          <TextField
            size="small"
            value={targetHost}
            onChange={(event) => setTargetHost(event.target.value)}
            placeholder="grpc://127.0.0.1:4770"
            sx={{ minWidth: 240, flex: { xs: 1, md: "0 0 320px" } }}
          />
          <TextField
            size="small"
            value={requestName}
            onChange={(event) => setRequestName(event.target.value)}
            placeholder="Request name"
            sx={{ minWidth: 170, flex: { xs: 1, md: "0 0 220px" } }}
          />
          <TextField
            select
            size="small"
            value={schemaSource}
            onChange={(event) => setSchemaSource(event.target.value as "proto" | "reflection")}
            sx={{ width: 120 }}
          >
            <MenuItem value="proto">proto</MenuItem>
            <MenuItem value="reflection">reflection</MenuItem>
          </TextField>
          <Button variant="outlined" size="small" onClick={saveRequest}>
            Save
          </Button>
          <Button variant="contained" size="small" onClick={invoke} disabled={!service || !method || !targetHost}>
            Invoke
          </Button>
        </Box>

        <Box
          sx={{
            px: 1,
            py: 0.5,
            display: "flex",
            alignItems: "center",
            gap: 2,
            borderBottom: "1px solid",
            borderColor: "divider",
          }}
        >
          <Typography variant="caption" color="text.secondary">Docs</Typography>
          <Typography variant="caption" color="primary.main">Message</Typography>
          <Typography variant="caption" color="text.secondary">Authorization</Typography>
          <Typography variant="caption" color="text.secondary">Metadata</Typography>
          <Typography variant="caption" color="text.secondary">Service definition</Typography>
          <Typography variant="caption" color="text.secondary">Scripts</Typography>
          <Typography variant="caption" color="text.secondary">Settings</Typography>
        </Box>

        <Box sx={{ px: 1, py: 0.75, borderBottom: "1px solid", borderColor: "divider" }}>
          <ServiceMethodSelectors
            service={service}
            method={method}
            onServiceChange={setService}
            onMethodChange={setMethod}
            serviceLabel="Service"
            methodLabel="Method"
          />
        </Box>

        <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <Box sx={{ flex: 6, minHeight: 220, p: 1, display: "grid", gap: 1, gridTemplateColumns: { xs: "1fr", md: "2fr 1fr" } }}>
            <TextField
              label="Request payload"
              value={payload}
              onChange={(event) => setPayload(event.target.value)}
              multiline
              fullWidth
              minRows={12}
              sx={{
                "& .MuiInputBase-input": {
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontSize: 13,
                },
              }}
            />
            <TextField
              label="Metadata"
              value={metadata}
              onChange={(event) => setMetadata(event.target.value)}
              multiline
              fullWidth
              minRows={12}
              sx={{
                "& .MuiInputBase-input": {
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontSize: 13,
                },
              }}
            />
          </Box>

          <Divider />

          <Box sx={{ flex: 4, minHeight: 200, p: 1, overflow: "auto" }}>
            <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.75}>
              <Typography variant="caption" color="text.secondary">
                Response
              </Typography>
              {result ? (
                <Typography variant="caption" color={result.grpcCode === 0 ? "success.main" : "warning.main"}>
                  {result.grpcCode === 0 ? "OK" : `gRPC ${result.grpcCode}`}
                  {` · ${result.durationMs} ms`}
                </Typography>
              ) : null}
            </Box>
            {errorMessage ? <Alert sx={{ mb: 1 }} severity="error">{errorMessage}</Alert> : null}
            {result ? (
              <Stack spacing={1}>
                <TextField
                  label="Payload"
                  value={prettyJson(result.responsePayload || {})}
                  multiline
                  minRows={8}
                  fullWidth
                  InputProps={{ readOnly: true }}
                  sx={{ "& .MuiInputBase-input": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 13 } }}
                />
                <TextField
                  label="gRPC message"
                  value={result.grpcMessage || ""}
                  multiline
                  minRows={2}
                  fullWidth
                  InputProps={{ readOnly: true }}
                  sx={{ "& .MuiInputBase-input": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 13 } }}
                />
                <TextField
                  label="Metadata"
                  value={prettyJson(result.responseMetadata || {})}
                  multiline
                  minRows={3}
                  fullWidth
                  InputProps={{ readOnly: true }}
                  sx={{ "& .MuiInputBase-input": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 13 } }}
                />
                <TextField
                  label="Trailers"
                  value={prettyJson(result.trailers || {})}
                  multiline
                  minRows={3}
                  fullWidth
                  InputProps={{ readOnly: true }}
                  sx={{ "& .MuiInputBase-input": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 13 } }}
                />
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Invoke request to see response body and gRPC status.
              </Typography>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

