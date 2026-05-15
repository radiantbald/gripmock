import { useEffect, useMemo, useState } from "react";
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
import { useDataProvider, useGetList, useNotify } from "react-admin";

import { ServiceMethodSelectors } from "./components/inputs/ServiceMethodSelectors";
import { clearCurrentRoom, getCurrentRoom, subscribeRoomChanges } from "./utils/room";
import { RoomScopeChip } from "./features/room/components/RoomScopeChip";
import { VerifyResultAlert } from "./features/verify/components/VerifyResultAlert";
import type { VerifyResponse } from "./features/verify/types";
import { resolveRoomRow, type RoomRow } from "./features/room/model";

export const VerifyPage = () => {
  const notify = useNotify();
  const dataProvider = useDataProvider();
  const [stubName, setStubName] = useState("");
  const [service, setService] = useState("");
  const [method, setMethod] = useState("");
  const [expectedCount, setExpectedCount] = useState(1);
  const [result, setResult] = useState<VerifyResponse | null>(null);
  const [isError, setIsError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [room, setRoom] = useState(() => getCurrentRoom());
  const { data: rooms = [] } = useGetList<RoomRow>(
    "rooms",
    { pagination: { page: 1, perPage: 1000 } },
    { retry: false, staleTime: 30_000, refetchOnMount: false, refetchOnWindowFocus: false },
  );
  const roomNameById = useMemo(() => {
    const map = new Map<string, string>();
    rooms.forEach((row) => {
      const resolved = resolveRoomRow(row);
      if (resolved) {
        map.set(resolved.id, resolved.name);
      }
    });
    return map;
  }, [rooms]);

  useEffect(() => subscribeRoomChanges(() => setRoom(getCurrentRoom())), []);

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

  const withGlobalRoom = () => {
    clearCurrentRoom();
    setRoom("");
    notify("Switched to global room", { type: "info" });
  };

  return (
    <Box p={1.5} maxWidth={700}>
      <Card>
        <CardHeader
          title="Verify calls"
          subheader="Counters are cumulative per room. If you see expected 1 but got 4, start a fresh room first."
        />
        <CardContent>
          <Box display="flex" flexDirection="column" gap={2}>
            <Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Active room scope
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <RoomScopeChip room={room} roomName={roomNameById.get(room)} />
                <Button size="small" variant="text" onClick={withGlobalRoom}>
                  Use global
                </Button>
              </Stack>
            </Box>

            <ServiceMethodSelectors
              stubName={stubName}
              onStubNameChange={setStubName}
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
