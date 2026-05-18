import { useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  Typography,
  Box,
  Button,
  Alert,
  List,
  ListItem,
  ListItemText,
  Chip,
  TextField,
} from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import RefreshIcon from "@mui/icons-material/Refresh";
import {
  useDataProvider,
  useGetList,
  useNotify,
  useRefresh,
} from "react-admin";

type UploadResult = {
  message?: string;
  time?: string;
  serviceIDs?: string[];
};

export const DescriptorList = () => {
  const notify = useNotify();
  const refresh = useRefresh();
  const dataProvider = useDataProvider();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [reflectionSource, setReflectionSource] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isReflecting, setIsReflecting] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);

  const { data, isLoading, error } = useGetList("descriptors", {
    pagination: { page: 1, perPage: 500 },
    sort: { field: "serviceID", order: "ASC" },
    filter: {},
  });

  const serviceIDs = useMemo(
    () => (data || []).map((item) => item.serviceID),
    [data],
  );
  const dataReady = isLoading === false;
  const hasError = Boolean(error);
  const hasServiceIDs = serviceIDs.length > 0;

  const handleUpload = async () => {
    if (!selectedFile) {
      notify("Select a .pb descriptor file first", { type: "warning" });
      return;
    }

    setIsUploading(true);
    try {
      const response = await dataProvider.create("descriptors", {
        data: { file: selectedFile },
      });
      setResult(response.data as UploadResult);
      notify("Descriptor uploaded", { type: "success" });
      refresh();
    } catch (uploadError) {
      notify((uploadError as Error).message, { type: "error" });
    } finally {
      setIsUploading(false);
    }
  };

  const handleReflectionLoad = async () => {
    const source = reflectionSource.trim();
    if (!source) {
      notify("Enter a grpc:// or grpcs:// reflection source first", {
        type: "warning",
      });
      return;
    }

    setIsReflecting(true);
    try {
      const response = await dataProvider.create("descriptors", {
        data: { source },
      });
      setResult(response.data as UploadResult);
      notify("Descriptors loaded from reflection", { type: "success" });
      refresh();
    } catch (reflectionError) {
      notify((reflectionError as Error).message, { type: "error" });
    } finally {
      setIsReflecting(false);
    }
  };

  return (
    <Box p={1.5} display="flex" flexDirection="column" gap={1.5}>
      <Card>
        <CardHeader title="Runtime descriptors" />
        <CardContent>
          <Box display="flex" flexDirection="column" gap={1.5}>
            <Box display="flex" alignItems="center" gap={1}>
              <TextField
                size="small"
                fullWidth
                label="gRPC reflection source"
                placeholder="grpc://localhost:50051"
                value={reflectionSource}
                onChange={(event) => setReflectionSource(event.target.value)}
              />
              <Button
                variant="contained"
                onClick={handleReflectionLoad}
                disabled={isReflecting || !reflectionSource.trim()}
              >
                {isReflecting ? "Loading..." : "Load reflection"}
              </Button>
            </Box>
            <Typography variant="body2" color="text.secondary">
              Use server reflection when a proto upload fails because its
              imports are not available locally.
            </Typography>

            <Box display="flex" alignItems="center" gap={1}>
              <input
                type="file"
                accept=".pb"
                onChange={(event) =>
                  setSelectedFile(event.target.files?.[0] || null)
                }
              />
              {selectedFile && (
                <Chip size="small" color="info" label={selectedFile.name} />
              )}
              <Button
                variant="contained"
                onClick={handleUpload}
                disabled={isUploading || !selectedFile}
                startIcon={<UploadFileIcon />}
              >
                Upload descriptor
              </Button>
              <Button
                variant="outlined"
                onClick={() => refresh()}
                startIcon={<RefreshIcon />}
              >
                Refresh
              </Button>
            </Box>

            {result && (
              <Alert severity="success">
                {result.message || "ok"}
                {result.time ? ` at ${result.time}` : ""}
              </Alert>
            )}
          </Box>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Registered service IDs" subheader={`${serviceIDs.length} loaded`} />
        <CardContent>
          {isLoading && <Typography>Loading...</Typography>}
          {error && <Alert severity="error">{(error as Error).message}</Alert>}
          {dataReady && !hasError && !hasServiceIDs && (
            <Typography color="text.secondary">
              No runtime descriptors loaded
            </Typography>
          )}
          {dataReady && !hasError && hasServiceIDs && (
            <List dense>
              {serviceIDs.map((serviceID) => (
                <ListItem key={serviceID} disablePadding>
                  <ListItemText primary={serviceID} />
                </ListItem>
              ))}
            </List>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};
