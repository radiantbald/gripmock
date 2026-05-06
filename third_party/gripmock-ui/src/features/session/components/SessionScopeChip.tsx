import { Chip } from "@mui/material";

export const SessionScopeChip = ({ session }: { session: string }) => (
  <Chip
    color={session ? "primary" : "default"}
    variant={session ? "filled" : "outlined"}
    label={session || "Global (no X-GripMock-Session)"}
    sx={{
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      maxWidth: "100%",
    }}
  />
);
