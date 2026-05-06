import { defaultDarkTheme, defaultLightTheme } from "react-admin";
import { createTheme } from "@mui/material/styles";

const fontFamily = [
  "Manrope",
  "Inter",
  "-apple-system",
  "BlinkMacSystemFont",
  "Segoe UI",
  "sans-serif",
].join(",");

const baseComponents = {
  MuiCssBaseline: {
    styleOverrides: {
      html: {
        height: "100%",
      },
      body: {
        height: "100%",
        overflow: "hidden",
        backgroundImage: "none",
      },
      "#root": {
        height: "100%",
      },
      ".RaLayout-appFrame": {
        height: "100dvh",
        overflow: "hidden",
      },
      ".RaLayout-contentWithSidebar": {
        height: "100%",
        minHeight: 0,
      },
      ".RaLayout-content": {
        height: "100%",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      },
      "#main-content": {
        flex: 1,
        minHeight: 0,
        overflow: "auto",
      },
      ".RaCreate-main.RaCreate-noActions": {
        paddingTop: 6,
        paddingBottom: 6,
        height: "100%",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      },
      ".RaCreate-main.RaCreate-noActions .RaCreate-card": {
        marginTop: 0,
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      },
      ".RaEdit-main .RaEdit-card": {
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      },
      ".RaCreate-main.RaCreate-noActions .RaSimpleForm-form": {
        gap: 8,
        flex: 1,
        minHeight: 0,
        overflow: "hidden",
      },
      ".RaEdit-main .RaSimpleForm-form": {
        gap: 8,
        flex: 1,
        minHeight: 0,
        overflow: "hidden",
      },
      ".RaCreate-main.RaCreate-noActions .RaSimpleForm-root, .RaEdit-main .RaSimpleForm-root": {
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      },
      ".RaCreate-main.RaCreate-noActions .MuiFormHelperText-root": {
        marginTop: 4,
        marginBottom: 0,
      },
      ".RaToolbar-desktopToolbar": {
        minHeight: "40px !important",
        height: "40px !important",
        padding: "0 12px !important",
      },
      ".RaToolbar-defaultToolbar": {
        marginTop: 4,
      },
    },
  },
  MuiCard: {
    styleOverrides: {
      root: {
        borderRadius: 14,
        border: "1px solid rgba(15, 23, 42, 0.08)",
        boxShadow: "0 8px 30px rgba(15, 23, 42, 0.06)",
      },
    },
  },
  MuiCardHeader: {
    styleOverrides: {
      root: {
        padding: "12px 14px",
      },
      title: {
        fontSize: "1rem",
      },
      subheader: {
        fontSize: "0.8rem",
      },
    },
  },
  MuiCardContent: {
    styleOverrides: {
      root: {
        padding: "12px 14px",
        "&:last-child": {
          paddingBottom: "12px",
        },
      },
    },
  },
  MuiContainer: {
    styleOverrides: {
      root: {
        paddingLeft: 12,
        paddingRight: 12,
      },
    },
  },
  MuiButton: {
    defaultProps: {
      disableElevation: true,
    },
    styleOverrides: {
      root: {
        borderRadius: 8,
        textTransform: "none" as const,
        fontWeight: 600,
      },
    },
  },
  MuiOutlinedInput: {
    styleOverrides: {
      root: {
        borderRadius: 6,
      },
      input: {
        fontSize: 13,
      },
    },
  },
  MuiFormHelperText: {
    styleOverrides: {
      root: {
        fontSize: 12,
        marginTop: 6,
      },
    },
  },
  MuiPaper: {
    styleOverrides: {
      root: {
        backgroundImage: "none",
      },
    },
  },
  MuiChip: {
    styleOverrides: {
      root: {
        borderRadius: 8,
      },
    },
  },
  MuiTableHead: {
    styleOverrides: {
      root: {
        "& .MuiTableCell-root": {
          fontWeight: 700,
          fontSize: 12,
          letterSpacing: 0.4,
          textTransform: "uppercase" as const,
        },
      },
    },
  },
  MuiTableRow: {
    styleOverrides: {
      root: {
        "&:hover": {
          backgroundColor: "rgba(255, 255, 255, 0.04)",
        },
      },
    },
  },
};

export const customTheme = createTheme(defaultLightTheme, {
  typography: {
    fontFamily,
    h4: { fontWeight: 700 },
    h5: { fontWeight: 700 },
    h6: { fontWeight: 700 },
  },
  palette: {
    mode: "light",
    primary: { main: "#0f4c81" },
    secondary: { main: "#ea580c" },
    error: { main: "#dc2626" },
    background: {
      default: "#f3f6fb",
      paper: "#ffffff",
    },
  },
  shape: {
    borderRadius: 12,
  },
  components: baseComponents,
});

export const customDarkTheme = createTheme(defaultDarkTheme, {
  typography: {
    fontFamily,
  },
  palette: {
    mode: "dark",
    primary: { main: "#ff6c37", light: "#ff8a5b", dark: "#e85c2c" },
    secondary: { main: "#8f9bb3" },
    error: { main: "#ff5a52" },
    warning: { main: "#ffb86b" },
    success: { main: "#4ad991" },
    background: {
      default: "#1f2329",
      paper: "#2a2f3a",
    },
    text: {
      primary: "#d7dce2",
      secondary: "#9ea7b3",
    },
    divider: "rgba(255, 255, 255, 0.12)",
  },
  components: {
    ...baseComponents,
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: "#1f2329",
          backgroundImage: "none",
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: "#232833",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          boxShadow: "none",
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: "#232833",
          borderRight: "1px solid rgba(255, 255, 255, 0.08)",
          backgroundImage: "none",
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          border: "1px solid rgba(255, 255, 255, 0.08)",
          boxShadow: "none",
          backgroundColor: "#232833",
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 6,
        },
        outlined: {
          borderColor: "rgba(255, 255, 255, 0.18)",
          "&:hover": {
            borderColor: "rgba(255, 255, 255, 0.28)",
            backgroundColor: "rgba(255, 255, 255, 0.04)",
          },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: "#333a47",
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: "rgba(255, 255, 255, 0.16)",
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "rgba(255, 255, 255, 0.28)",
          },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderColor: "#ff6c37",
          },
        },
        input: {
          color: "#d7dce2",
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          color: "#9ea7b3",
          "&.Mui-focused": {
            color: "#9ea7b3",
          },
          "&.MuiInputLabel-shrink": {
            color: "#9ea7b3",
          },
          "&.Mui-error": {
            color: "#ff5a52",
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
          color: "#c6ced8",
        },
        head: {
          color: "#9ea7b3",
        },
      },
    },
  },
});
