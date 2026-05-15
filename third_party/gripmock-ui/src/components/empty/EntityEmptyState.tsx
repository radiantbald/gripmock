import type { ReactNode } from "react";
import type { SxProps, Theme } from "@mui/material";
import { alpha, Box, Button, Stack, Typography } from "@mui/material";

type EntityEmptyStateProps = {
  icon: ReactNode;
  title: string;
  description: string;
  actionLabel: string;
  actionStartIcon?: ReactNode;
  actionVariant?: "text" | "outlined" | "contained";
  actionSx?: SxProps<Theme>;
  onAction: () => void;
  actionDisabled?: boolean;
};

export const EntityEmptyState = ({
  icon,
  title,
  description,
  actionLabel,
  actionStartIcon,
  actionVariant = "contained",
  actionSx,
  onAction,
  actionDisabled = false,
}: EntityEmptyStateProps) => (
  <Box
    sx={{
      flex: 1,
      minHeight: 260,
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "center",
      px: 2,
      pt: { xs: 6, md: 7 },
    }}
  >
    <Stack spacing={1.2} alignItems="center" sx={{ width: "100%", maxWidth: 320, textAlign: "center" }}>
      <Box
        sx={{
          color: alpha("#ffffff", 0.5),
          lineHeight: 1,
          "& .MuiSvgIcon-root": {
            fontSize: "clamp(104px, 12vw, 148px)",
          },
        }}
      >
        {icon}
      </Box>
      <Typography
        sx={{
          fontSize: "clamp(26px, 3.6vw, 40px)",
          lineHeight: 1.12,
          fontWeight: 500,
          color: alpha("#ffffff", 0.56),
          letterSpacing: 0,
        }}
      >
        {title}
      </Typography>
      <Typography
        sx={{
          fontSize: "clamp(14px, 2vw, 22px)",
          lineHeight: 1.25,
          fontWeight: 400,
          color: alpha("#ffffff", 0.5),
        }}
      >
        {description}
      </Typography>
      <Button
        variant={actionVariant}
        color="primary"
        startIcon={actionStartIcon}
        disabled={actionDisabled}
        onClick={onAction}
        sx={[
          {
            mt: 0.2,
            whiteSpace: "nowrap",
            minWidth: 128,
            height: 36,
            px: 2,
            borderRadius: "8px",
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: 0.6,
            textTransform: "uppercase",
            "& .MuiButton-startIcon": {
              mr: 0.65,
            },
            "& .MuiSvgIcon-root": {
              fontSize: 20,
            },
          },
          actionSx,
        ]}
      >
        {actionLabel}
      </Button>
    </Stack>
  </Box>
);
