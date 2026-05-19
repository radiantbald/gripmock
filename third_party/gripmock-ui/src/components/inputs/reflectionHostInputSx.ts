import { alpha } from "@mui/material/styles";

export const reflectionHostInputSx = {
  width: { xs: "100%", sm: 280 },
  maxWidth: "100%",
  minWidth: 0,
  position: "relative",
  "& .MuiInputBase-root": {
    minHeight: 40,
    height: 40,
    fontSize: 13,
    fontWeight: 500,
    lineHeight: 1.3,
    borderRadius: 1,
    bgcolor: alpha("#ffffff", 0.03),
    alignItems: "center",
  },
  "& .MuiInputBase-input": {
    py: 0.55,
    px: 1,
    fontSize: 13,
    fontWeight: 500,
    lineHeight: 1.3,
    letterSpacing: 0,
    fontFamily: "inherit",
    overflow: "hidden",
    textOverflow: "ellipsis",
    "&::placeholder": {
      opacity: 1,
      color: "text.secondary",
    },
  },
  "& .MuiInputLabel-root": {
    fontSize: 13,
    color: "text.secondary",
  },
  "& .MuiOutlinedInput-notchedOutline": {
    borderColor: alpha("#ffffff", 0.16),
  },
  "& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline": {
    borderColor: alpha("#ffffff", 0.28),
  },
  "& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline": {
    borderColor: "#FF6C37",
    borderWidth: 2,
  },
  "& .MuiOutlinedInput-root.Mui-error .MuiOutlinedInput-notchedOutline": {
    borderColor: "error.main",
  },
  "& .MuiInputLabel-root.Mui-focused": {
    color: "#FF6C37",
  },
  "& .MuiInputLabel-root.Mui-error": {
    color: "error.main",
  },
  "& .MuiFormHelperText-root": {
    position: "absolute",
    left: 0,
    top: "100%",
    mx: 0,
    mt: 0.25,
    fontSize: 12,
    lineHeight: 1.2,
    textAlign: "left",
    whiteSpace: "nowrap",
    pointerEvents: "none",
  },
} as const;
