import { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Stack,
  TextField,
} from "@mui/material";
import VerifiedUserIcon from "@mui/icons-material/VerifiedUser";

import { apiClient } from "../../../dataProvider/apiClient";

type Props = {
  onActivate: (phone: string) => void;
};

export const SessionEntryGate = ({ onActivate }: Props) => {
  const [phone, setPhone] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [verifyInProgress, setVerifyInProgress] = useState(false);
  const [error, setError] = useState<string>("");

  const normalizedPhone = useMemo(
    () => phone.replace(/[^\d+]/g, "").trim(),
    [phone],
  );

  const requestCode = async (): Promise<boolean> => {
    if (!normalizedPhone || normalizedPhone.replace(/\D/g, "").length < 10) {
      setError("Enter a valid phone number");
      return false;
    }

    try {
      setError("");
      await apiClient.request<{ ok: boolean; phone: string; expiresInSeconds: number }>(
        "/auth/code/request",
        {
          method: "POST",
          body: JSON.stringify({ phone: normalizedPhone }),
        },
      );
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to request verification code");
      return false;
    }
  };

  const activate = async () => {
    const normalizedCode = verificationCode.replace(/\D/g, "").slice(0, 4);
    if (normalizedCode.length !== 4) {
      setError("Enter the 4-digit verification code");
      return;
    }

    try {
      setError("");
      setVerifyInProgress(true);
      const requestOk = await requestCode();
      if (!requestOk) {
        return;
      }
      const payload = await apiClient.request<{ ok: boolean; phone: string }>(
        "/auth/code/verify",
        {
          method: "POST",
          body: JSON.stringify({
            phone: normalizedPhone,
            code: normalizedCode,
          }),
        },
      );

      const verifiedPhone = payload?.phone?.trim() || normalizedPhone;
      onActivate(verifiedPhone);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to verify code");
    } finally {
      setVerifyInProgress(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: 2,
        bgcolor: "background.default",
      }}
    >
      <Card
        sx={{
          width: "100%",
          maxWidth: 760,
          borderRadius: 1,
          border: "1px solid",
          borderColor: "divider",
          boxShadow: "none",
          backgroundColor: "background.paper",
        }}
      >
        <CardHeader
          title="Phone authorization"
          subheader="Sign in with phone number and confirm with a verification code."
          sx={{
            pb: 1,
            "& .MuiCardHeader-title": {
              fontSize: 18,
              lineHeight: 1.3,
              fontWeight: 600,
              letterSpacing: 0.1,
            },
            "& .MuiCardHeader-subheader": {
              mt: 0.5,
              fontSize: 13,
              lineHeight: 1.4,
              color: "text.secondary",
            },
          }}
        />
        <CardContent sx={{ pt: 0 }}>
          <Stack spacing={1.5}>
            {error ? <Alert severity="warning">{error}</Alert> : null}

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <TextField
                fullWidth
                autoFocus
                label="Phone number"
                placeholder="+7 900 123-45-67"
                size="small"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                sx={{
                  "& .MuiInputBase-input": {
                    fontSize: 12,
                    lineHeight: 1.4,
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  },
                  "& .MuiInputLabel-root": {
                    fontSize: 12,
                  },
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 1,
                  },
                }}
              />
            </Stack>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <TextField
                fullWidth
                label="Verification code"
                placeholder="Last 4 digits"
                size="small"
                value={verificationCode}
                onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 4))}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    activate();
                  }
                }}
                sx={{
                  "& .MuiInputBase-input": {
                    fontSize: 12,
                    lineHeight: 1.4,
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  },
                  "& .MuiInputLabel-root": {
                    fontSize: 12,
                  },
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 1,
                  },
                }}
              />
              <Button
                variant="contained"
                startIcon={<VerifiedUserIcon />}
                onClick={activate}
                disabled={verifyInProgress}
                size="small"
                sx={{
                  minWidth: 170,
                  borderRadius: 1,
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: 0.3,
                  px: 1.75,
                }}
              >
                {verifyInProgress ? "Verifying..." : "Sign In"}
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
};
