import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import { useCreatePath, useGetList, useGetOne, Loading } from "react-admin";
import { CheckCircle, Error as ErrorIcon, Warning } from "@mui/icons-material";
import { Link as RouterLink } from "react-router-dom";

import { API_CONFIG } from "../../../constants/api";
import { getCurrentSession, subscribeSessionChanges } from "../../../utils/session";
import type { Dashboard } from "../types";

type StatItemProps = {
  label: string;
  value?: number;
  loading?: boolean;
  color?: string;
};

const StatItem = ({ label, value, loading, color = "primary" }: StatItemProps) => (
  <Box
    textAlign="center"
    flex={1}
    minWidth={110}
    sx={{
      p: 0.9,
      borderRadius: 1.5,
      border: "1px solid",
      borderColor: "divider",
      backgroundColor: "background.paper",
    }}
  >
    {loading ? (
      <Skeleton variant="rounded" width={56} height={30} sx={{ mx: "auto" }} />
    ) : (
      <Typography variant="h5" color={color} sx={{ lineHeight: 1.05 }}>
        {value ?? 0}
      </Typography>
    )}
    <Typography variant="caption" color="textSecondary">
      {label}
    </Typography>
  </Box>
);

export const HealthCheckCard = () => {
  const {
    data: liveness,
    isLoading: livenessLoading,
    error: livenessError,
  } = useGetOne("health/liveness", { id: "status" }, { retry: false });

  const {
    data: readiness,
    isLoading: readinessLoading,
    error: readinessError,
  } = useGetOne("health/readiness", { id: "status" }, { retry: false });

  if (livenessLoading || readinessLoading) {
    return (
      <Card>
        <CardHeader title="System Health" />
        <CardContent>
          <Loading />
        </CardContent>
      </Card>
    );
  }

  if (livenessError || readinessError)
    return (
      <Card>
        <CardHeader title="System Health" />
        <CardContent>
          <Typography color="error" variant="body2">
            Health endpoints are unavailable. Check `/api/health/liveness` and
            `/api/health/readiness`.
          </Typography>
        </CardContent>
      </Card>
    );

  const livenessStatus = liveness ? "healthy" : "unhealthy";
  const readinessStatus = readiness ? "ready" : "not ready";

  return (
    <Card sx={{ height: "100%" }}>
      <CardHeader title="System Health" subheader="Liveness and readiness probes" />
      <CardContent>
        <Stack direction={{ xs: "column", sm: "row" }} gap={1.25}>
          <Box display="flex" alignItems="center" gap={1} flex={1}>
            {livenessStatus === "healthy" ? (
              <CheckCircle color="success" />
            ) : (
              <ErrorIcon color="error" />
            )}
            <Typography variant="body2">Liveness: {livenessStatus}</Typography>
          </Box>
          <Box display="flex" alignItems="center" gap={1} flex={1}>
            {readinessStatus === "ready" ? (
              <CheckCircle color="success" />
            ) : (
              <Warning color="warning" />
            )}
            <Typography variant="body2">Readiness: {readinessStatus}</Typography>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
};

export const StatisticsCard = () => {
  const [historyEnabled, setHistoryEnabled] = useState(false);
  const createPath = useCreatePath();

  const {
    data: statistics,
    isLoading: statisticsLoading,
    error: statisticsError,
  } = useGetOne<Dashboard & { id: string }>("dashboard", { id: "summary" }, { retry: false });

  const statisticsReady = statisticsLoading === false;
  const hasStatisticsError = Boolean(statisticsError);
  const useBackendStatistics = statisticsReady && !hasStatisticsError && Boolean(statistics);
  const loadFallbackLists = statisticsReady && !useBackendStatistics;

  const { data: services, isLoading: servicesLoading } = useGetList(
    "services",
    { pagination: { page: 1, perPage: 9999 } },
    { enabled: loadFallbackLists },
  );
  const { data: stubs, isLoading: stubsLoading } = useGetList(
    "stubs",
    { pagination: { page: 1, perPage: 9999 } },
    { enabled: loadFallbackLists },
  );
  const { data: usedStubs, isLoading: usedStubsLoading } = useGetList(
    "stubs/used",
    { pagination: { page: 1, perPage: 9999 } },
    { enabled: loadFallbackLists },
  );
  const { data: descriptors, isLoading: descriptorsLoading } = useGetList(
    "descriptors",
    { pagination: { page: 1, perPage: 9999 } },
    { enabled: loadFallbackLists },
  );
  const { data: history, isLoading: historyLoading } = useGetList(
    "history",
    { pagination: { page: 1, perPage: 9999 } },
    { enabled: historyEnabled },
  );
  const { data: sessions, isLoading: sessionsLoading } = useGetList(
    "sessions",
    { pagination: { page: 1, perPage: 9999 } },
    { enabled: loadFallbackLists },
  );

  const totalServices = useBackendStatistics
    ? Number(statistics?.totalServices || 0)
    : services?.length || 0;
  const totalStubs = useBackendStatistics
    ? Number(statistics?.totalStubs || 0)
    : stubs?.length || 0;
  const usedStubsCount = useBackendStatistics
    ? Number(statistics?.usedStubs || 0)
    : usedStubs?.length || 0;
  const unusedStubsCount = useBackendStatistics
    ? Number(statistics?.unusedStubs || Math.max(totalStubs - usedStubsCount, 0))
    : Math.max(totalStubs - usedStubsCount, 0);
  const descriptorsCount = useBackendStatistics
    ? Number(statistics?.runtimeDescriptors || 0)
    : descriptors?.length || 0;
  const sessionsCount = useBackendStatistics
    ? Number(statistics?.totalSessions || 0)
    : sessions?.length || 0;
  const totalHistory = useBackendStatistics
    ? Number(statistics?.totalHistory || 0)
    : historyEnabled
      ? history?.length || 0
      : 0;
  const historyErrors = useBackendStatistics
    ? Number(statistics?.historyErrors || 0)
    : historyEnabled
      ? history?.filter((item) => item.error).length || 0
      : 0;

  const loadingByList =
    loadFallbackLists &&
    (servicesLoading || stubsLoading || usedStubsLoading || descriptorsLoading || sessionsLoading);
  const historyMetricsLoading =
    useBackendStatistics ? false : historyEnabled && historyLoading;

  return (
    <Card sx={{ height: "100%" }}>
      <CardHeader
        title="Traffic & Storage"
        subheader="Aggregated counters of services, stubs, descriptors, and call history"
      />
      <CardContent>
        <Box
          display="grid"
          gap={1}
          sx={{
            gridTemplateColumns: "repeat(auto-fit, minmax(115px, 1fr))",
          }}
        >
          <StatItem
            label="Services"
            value={totalServices}
            loading={statisticsLoading || loadingByList}
            color="primary"
          />
          <StatItem
            label="Total Stubs"
            value={totalStubs}
            loading={statisticsLoading || loadingByList}
            color="primary"
          />
          <StatItem
            label="Used Stubs"
            value={usedStubsCount}
            loading={statisticsLoading || loadingByList}
            color="success.main"
          />
          <StatItem
            label="Unused Stubs"
            value={unusedStubsCount}
            loading={statisticsLoading || loadingByList}
            color="warning.main"
          />
          <StatItem
            label="Runtime Descriptors"
            value={descriptorsCount}
            loading={statisticsLoading || loadingByList}
            color="secondary.main"
          />
          <StatItem
            label="Sessions"
            value={sessionsCount}
            loading={statisticsLoading || loadingByList}
            color="info.main"
          />
          <StatItem
            label="History Calls"
            value={totalHistory}
            loading={historyMetricsLoading}
            color="info.main"
          />
          <StatItem
            label="History Errors"
            value={historyErrors}
            loading={historyMetricsLoading}
            color="error.main"
          />
        </Box>
        {useBackendStatistics === false && historyEnabled === false && (
          <Box mt={2}>
            <Button
              size="small"
              variant="text"
              onClick={() => setHistoryEnabled(true)}
            >
              Load history metrics
            </Button>
          </Box>
        )}
        <Box mt={1.25} display="flex" gap={0.75} flexWrap="wrap">
          <Button size="small" component={RouterLink} to={createPath({ resource: "stubs", type: "list" })}>
            Open stubs
          </Button>
          <Button size="small" component={RouterLink} to={createPath({ resource: "history", type: "list" })}>
            Open history
          </Button>
          <Button size="small" component={RouterLink} to={createPath({ resource: "services", type: "list" })}>
            Open services
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
};

export const ApiInfoCard = () => {
  const [session, setSession] = useState(() => getCurrentSession() || "none");
  const { data, isLoading, error } = useGetOne<Dashboard & { id: string }>(
    "dashboard",
    { id: "runtime" },
    { retry: false },
  );

  useEffect(
    () => subscribeSessionChanges(() => setSession(getCurrentSession() || "none")),
    [],
  );

  return (
    <Card sx={{ height: "100%" }}>
      <CardHeader title="Application Information" />
      <CardContent>
        {isLoading ? <Loading /> : null}
        {isLoading === false && Boolean(error) ? (
          <Typography color="error" variant="body2" mb={1}>
            Failed to load runtime info from `/api/dashboard`.
          </Typography>
        ) : null}
        <Box display="flex" flexDirection="column" gap={0.9}>
          <Box display="flex" alignItems="center" gap={1}>
            <Typography variant="body2" fontWeight="bold">
              Base URL:
            </Typography>
            <Chip label={API_CONFIG.BASE_URL} size="small" />
          </Box>
          <Box display="flex" alignItems="center" gap={1}>
            <Typography variant="body2" fontWeight="bold">
              App:
            </Typography>
            <Chip label={String(data?.appName || "gripmock")} size="small" />
            <Chip
              label={`v${String(data?.version || "unknown")}`}
              color="primary"
              size="small"
            />
          </Box>
          <Box display="flex" alignItems="center" gap={1}>
            <Typography variant="body2" fontWeight="bold">
              Go Runtime:
            </Typography>
            <Chip
              label={`${String(data?.goVersion || "unknown")} / ${String(data?.compiler || "unknown")}`}
              size="small"
            />
          </Box>
          <Box display="flex" alignItems="center" gap={1}>
            <Typography variant="body2" fontWeight="bold">
              Platform:
            </Typography>
            <Chip
              label={`${String(data?.goos || "unknown")}/${String(data?.goarch || "unknown")}`}
              size="small"
            />
            <Chip label={`CPU ${String(data?.numCPU || "-")}`} size="small" />
          </Box>
          <Box display="flex" alignItems="center" gap={1}>
            <Typography variant="body2" fontWeight="bold">
              Process:
            </Typography>
            <Chip
              label={data?.ready ? "ready" : "not ready"}
              color={data?.ready ? "success" : "warning"}
              size="small"
            />
            <Chip
              label={data?.historyEnabled ? "history on" : "history off"}
              color={data?.historyEnabled ? "info" : "default"}
              size="small"
            />
          </Box>
          <Box display="flex" alignItems="center" gap={1}>
            <Typography variant="body2" fontWeight="bold">
              Uptime:
            </Typography>
            <Chip label={`${Number(data?.uptimeSeconds || 0)}s`} size="small" />
            <Chip
              label={String(data?.startedAt || "-")}
              size="small"
              sx={{
                maxWidth: 260,
                "& .MuiChip-label": {
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                },
              }}
            />
          </Box>
          <Box display="flex" alignItems="center" gap={1}>
            <Typography variant="body2" fontWeight="bold">
              Session:
            </Typography>
            <Chip label={session} size="small" />
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};

export const QuickActionsCard = () => {
  const createPath = useCreatePath();

  return (
    <Card sx={{ height: "100%" }}>
      <CardHeader title="Quick Actions" subheader="Operational shortcuts" />
      <CardContent>
        <Stack direction="row" gap={0.75} flexWrap="wrap" useFlexGap>
          <Button size="small" variant="contained" component={RouterLink} to={createPath({ resource: "verify", type: "list" })}>
            Verify calls
          </Button>
          <Button size="small" variant="outlined" component={RouterLink} to={createPath({ resource: "inspect", type: "list" })}>
            Inspect matching
          </Button>
          <Button size="small" variant="outlined" component={RouterLink} to={createPath({ resource: "session", type: "list" })}>
            Session scope
          </Button>
          <Button size="small" variant="outlined" component={RouterLink} to={createPath({ resource: "descriptors", type: "list" })}>
            Runtime descriptors
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
};
