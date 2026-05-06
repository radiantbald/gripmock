import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useDataProvider, useNotify } from "react-admin";

import { ServiceMethodSelectors } from "./components/inputs/ServiceMethodSelectors";
import { clearCurrentSession, getCurrentSession, subscribeSessionChanges } from "./utils/session";
import { SessionScopeChip } from "./features/session/components/SessionScopeChip";
import { VerifyResultAlert } from "./features/verify/components/VerifyResultAlert";
import type { VerifyResponse } from "./features/verify/types";

export const VerifyPage = () => {
  const notify = useNotify();
  const dataProvider = useDataProvider();
  const [service, setService] = useState("");
  const [method, setMethod] = useState("");
  const [expectedCount, setExpectedCount] = useState(1);
  const [result, setResult] = useState<VerifyResponse | null>(null);
  const [isError, setIsError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [session, setSession] = useState(() => getCurrentSession());

  useEffect(() => subscribeSessionChanges(() => setSession(getCurrentSession())), []);

  const onSubmit = async () => {
    setIsSubmitting(true);

    try {
      const response = await dataProvider.create("verify", {
        data: { service, method, expectedCount },
      });
      setResult(response.data as VerifyResponse);
      setIsError(false);
      notify("Verification passed", { type: "success" });
    } catch (error) {
      setResult({ message: (error as Error).message });
      setIsError(true);
      notify((error as Error).message, { type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const withGlobalSession = () => {
    clearCurrentSession();
    setSession("");
    notify("Switched to global session", { type: "info" });
  };

  return (
    <Box p={1.5} maxWidth={700}>
      <Card>
        <CardHeader
          title="Verify calls"
          subheader="Counters are cumulative per session. If you see expected 1 but got 4, start a fresh session first."
        />
        <CardContent>
          <Box display="flex" flexDirection="column" gap={2}>
            <Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Active session scope
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <SessionScopeChip session={session} />
                <Button size="small" variant="text" onClick={withGlobalSession}>
                  Use global
                </Button>
              </Stack>
            </Box>

            <ServiceMethodSelectors
              service={service}
              method={method}
              onServiceChange={setService}
              onMethodChange={setMethod}
            />

            <TextField
              label="Expected count"
              type="number"
              value={expectedCount}
              onChange={(event) =>
                setExpectedCount(Math.max(0, Number(event.target.value || 0)))
              }
              inputProps={{ min: 0, step: 1 }}
              fullWidth
            />
            <Stack direction="row" spacing={1}>
              {[0, 1, 2, 3].map((value) => (
                <Chip
                  key={value}
                  label={value}
                  clickable
                  color={expectedCount === value ? "primary" : "default"}
                  onClick={() => setExpectedCount(value)}
                />
              ))}
            </Stack>
            <Button
              variant="contained"
              onClick={onSubmit}
              disabled={!service || !method || isSubmitting}
            >
              {isSubmitting ? "Verifying..." : "Verify"}
            </Button>

            {result && (
              <VerifyResultAlert
                result={result}
                isError={isError}
                onUseActual={(value) => setExpectedCount(value)}
              />
            )}
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};
