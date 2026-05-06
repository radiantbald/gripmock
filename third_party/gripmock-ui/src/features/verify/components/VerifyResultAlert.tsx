import { Alert, Button, Typography } from "@mui/material";

import type { VerifyResponse } from "../types";

export const VerifyResultAlert = ({
  result,
  isError,
  onUseActual,
}: {
  result: VerifyResponse;
  isError: boolean;
  onUseActual: (value: number) => void;
}) => (
  <Alert severity={isError ? "error" : "success"}>
    <Typography variant="body2">{result.message || "ok"}</Typography>
    {typeof result.expected === "number" && (
      <Typography variant="body2">Expected: {result.expected}</Typography>
    )}
    {typeof result.actual === "number" && (
      <Typography variant="body2">Actual: {result.actual}</Typography>
    )}
    {isError && typeof result.actual === "number" && (
      <Button size="small" sx={{ mt: 1 }} onClick={() => onUseActual(result.actual || 0)}>
        Use actual as expected
      </Button>
    )}
  </Alert>
);
