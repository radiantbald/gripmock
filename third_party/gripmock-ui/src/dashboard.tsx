import { useEffect, useState } from "react";
import { Box, Chip, Grid, Paper, Stack, Typography } from "@mui/material";
import AutoGraphIcon from "@mui/icons-material/AutoGraph";
import HubIcon from "@mui/icons-material/Hub";

import {
  ApiInfoCard,
  HealthCheckCard,
  QuickActionsCard,
  StatisticsCard,
} from "./features/dashboard/components/DashboardCards";
import { getCurrentSession, subscribeSessionChanges } from "./utils/session";

export const Dashboard = () => {
  const [session, setSession] = useState(() => getCurrentSession() || "global");

  useEffect(
    () => subscribeSessionChanges(() => setSession(getCurrentSession() || "global")),
    [],
  );

  return (
    <Box p={1.25}>
      <Paper
        elevation={0}
        sx={{
          p: { xs: 1.5, md: 2 },
          mb: 1.5,
          borderRadius: 2,
          border: "1px solid",
          borderColor: "divider",
          background:
            "linear-gradient(120deg, rgba(15,76,129,0.14) 0%, rgba(15,76,129,0.06) 40%, rgba(234,88,12,0.06) 100%)",
        }}
      >
        <Stack spacing={0.75}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <AutoGraphIcon color="primary" fontSize="small" />
            <Typography variant="h5">Dashboard</Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary">
            Centralized operational view of runtime health, service activity, and quick debug actions.
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip
              icon={<HubIcon fontSize="small" />}
              label={`Session: ${session}`}
              size="small"
              sx={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
            />
          </Stack>
        </Stack>
      </Paper>

      <Grid container spacing={1.5}>
        <Grid size={{ xs: 12, lg: 7 }}>
          <HealthCheckCard />
        </Grid>
        <Grid size={{ xs: 12, lg: 5 }}>
          <ApiInfoCard />
        </Grid>

        <Grid size={{ xs: 12, lg: 8 }}>
          <StatisticsCard />
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <QuickActionsCard />
        </Grid>
      </Grid>
    </Box>
  );
};
