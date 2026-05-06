import AutoFixHighRoundedIcon from "@mui/icons-material/AutoFixHighRounded";
import OpenInFullRoundedIcon from "@mui/icons-material/OpenInFullRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import {
  Box,
  FormHelperText,
  IconButton,
  Modal,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useFormContext } from "react-hook-form";
import { useRecordContext } from "react-admin";

type StubMatcherInputProps = {
  inputSource?: string;
  inputsSource?: string;
  label?: string;
  helperText?: string;
  minRows?: number;
  mode: "create" | "edit";
};

const prettyJson = (value: unknown) => {
  if (value === undefined || value === null) {
    return "";
  }

  if (Array.isArray(value) && value.length === 0) {
    return "";
  }

  if (typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) {
    return "";
  }

  return JSON.stringify(value, null, 2);
};

const matcherPlaceholder = `{
  "ignoreArrayOrder": true,
  "equals": {
    "userId": "42"
  },
  "contains": {
    "profile": {
      "name": "john"
    }
  },
  "matches": {
    "email": ".*@example\\\\.com$"
  },
  "glob": {
    "path": "/api/*"
  },
  "anyOf": [
    {
      "equals": {
        "role": "admin"
      }
    },
    {
      "contains": {
        "tags": [
          "beta"
        ]
      }
    }
  ]
}`;

export const StubMatcherInput = ({
  inputSource = "input",
  inputsSource = "inputs",
  label = "Input / Inputs",
  helperText,
  minRows = 10,
  mode,
}: StubMatcherInputProps) => {
  const record = useRecordContext();
  const { setValue } = useFormContext();
  const [text, setText] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [isInitialized, setInitialized] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const initialValue = useMemo(() => {
    if (Array.isArray(record?.[inputsSource])) {
      return record?.[inputsSource];
    }

    if (
      record?.[inputSource] &&
      typeof record[inputSource] === "object" &&
      !Array.isArray(record[inputSource])
    ) {
      return record[inputSource];
    }

    return undefined;
  }, [inputSource, inputsSource, record]);

  useEffect(() => {
    if (isInitialized) {
      return;
    }

    if (mode === "edit" && !record) {
      return;
    }

    const nextText =
      mode === "create" && prettyJson(initialValue).trim().length === 0
        ? matcherPlaceholder
        : prettyJson(initialValue);
    setText(nextText);
    applyParsedValue(nextText);
    setInitialized(true);
  }, [initialValue, isInitialized, mode, record]);

  const applyParsedValue = (nextText: string) => {
    const trimmed = nextText.trim();

    if (!trimmed) {
      setParseError(null);
      setValue(inputSource, undefined, { shouldDirty: true });
      setValue(inputsSource, undefined, { shouldDirty: true });
      return;
    }

    try {
      const parsed = JSON.parse(nextText);

      if (Array.isArray(parsed)) {
        setValue(inputsSource, parsed, { shouldDirty: true });
        setValue(inputSource, undefined, { shouldDirty: true });
        setParseError(null);
        return;
      }

      if (parsed && typeof parsed === "object") {
        setValue(inputSource, parsed, { shouldDirty: true });
        setValue(inputsSource, undefined, { shouldDirty: true });
        setParseError(null);
        return;
      }

      setParseError("JSON must be an object or an array.");
    } catch {
      setParseError("Invalid JSON. Fix syntax and try again.");
    }
  };

  const handleChange = (nextText: string) => {
    setText(nextText);
    applyParsedValue(nextText);
  };

  const handleBeautify = () => {
    const trimmed = text.trim();
    if (!trimmed) {
      setText("{}");
      setValue(inputSource, {}, { shouldDirty: true });
      setValue(inputsSource, undefined, { shouldDirty: true });
      setParseError(null);
      return;
    }

    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed) && (!parsed || typeof parsed !== "object")) {
        setParseError("Beautify failed: JSON must be an object or an array.");
        return;
      }

      const formatted = JSON.stringify(parsed, null, 2);
      setText(formatted);
      applyParsedValue(formatted);
    } catch {
      setParseError("Beautify failed: JSON is invalid.");
    }
  };

  return (
    <div>
      <Stack spacing={1}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Typography variant="body2" color="text.secondary">
            {label || inputSource}
          </Typography>
          <IconButton
            size="small"
            aria-label="Expand editor"
            onClick={() => {
              setExpanded(true);
            }}
            sx={{
              m: 0,
              p: 0,
              width: 14,
              height: 14,
              borderRadius: 0,
              bgcolor: "transparent",
              color: "text.secondary",
              transition: "color 0.15s ease",
              "&:hover": {
                color: "primary.main",
                bgcolor: "transparent",
              },
            }}
          >
            <OpenInFullRoundedIcon sx={{ fontSize: 12, display: "block" }} />
          </IconButton>
        </Box>
        <Stack spacing={1}>
          <TextField
            multiline
            fullWidth
            rows={minRows}
            value={text}
            placeholder={matcherPlaceholder}
            onChange={(event) => {
              handleChange(event.target.value);
            }}
            variant="outlined"
            slotProps={{
              input: {
                endAdornment: (
                  <Tooltip title="Beautify JSON">
                    <IconButton
                      size="small"
                      onClick={handleBeautify}
                      sx={{
                        alignSelf: "flex-start",
                        m: 0,
                        width: 16,
                        height: 16,
                        p: 0,
                        color: "text.secondary",
                        "&:hover": {
                          bgcolor: "transparent",
                          color: "primary.main",
                        },
                      }}
                      aria-label="Beautify JSON"
                    >
                      <AutoFixHighRoundedIcon
                        sx={{ fontSize: 14, display: "block" }}
                      />
                    </IconButton>
                  </Tooltip>
                ),
                sx: {
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                  fontSize: 13,
                  lineHeight: 1.5,
                  p: "14px",
                  alignItems: "flex-start",
                  "& textarea": {
                    overflowY: "auto !important",
                    resize: "none",
                  },
                },
              },
            }}
          />
          {helperText ? <FormHelperText>{helperText}</FormHelperText> : null}
        </Stack>
      </Stack>
      <FormHelperText error={!!parseError}>{parseError}</FormHelperText>
      <Modal
        open={expanded}
        onClose={() => {
          setExpanded(false);
        }}
      >
        <Box
          sx={{
            position: "fixed",
            top: 20,
            right: 20,
            width: { xs: "calc(100vw - 24px)", md: "max(33vw, 400px)" },
            height: "calc(100dvh - 40px)",
            bgcolor: "background.paper",
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 1.5,
            p: 1.5,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {label || inputSource}
            </Typography>
            <IconButton
              size="small"
              aria-label="Close editor"
              onClick={() => {
                setExpanded(false);
              }}
              sx={{
                m: 0,
                p: 0,
                width: 14,
                height: 14,
                borderRadius: 0,
                bgcolor: "transparent",
                color: "text.secondary",
                transition: "color 0.15s ease",
                "&:hover": {
                  color: "primary.main",
                  bgcolor: "transparent",
                },
              }}
            >
              <CloseRoundedIcon sx={{ fontSize: 12, display: "block" }} />
            </IconButton>
          </Box>
          <Box sx={{ flex: 1, minHeight: 0 }}>
            <TextField
              multiline
              fullWidth
              value={text}
              placeholder={matcherPlaceholder}
              onChange={(event) => {
                handleChange(event.target.value);
              }}
              variant="outlined"
              sx={{ height: "100%" }}
              slotProps={{
                input: {
                  endAdornment: (
                    <Tooltip title="Beautify JSON">
                      <IconButton
                        size="small"
                        onClick={handleBeautify}
                        sx={{
                          alignSelf: "flex-start",
                          m: 0,
                          width: 16,
                          height: 16,
                          p: 0,
                          color: "text.secondary",
                          "&:hover": {
                            bgcolor: "transparent",
                            color: "primary.main",
                          },
                        }}
                        aria-label="Beautify JSON"
                      >
                        <AutoFixHighRoundedIcon sx={{ fontSize: 14, display: "block" }} />
                      </IconButton>
                    </Tooltip>
                  ),
                  sx: {
                    height: "100%",
                    fontFamily:
                      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                    fontSize: 13,
                    lineHeight: 1.5,
                    p: "14px",
                    alignItems: "flex-start",
                    "& textarea": {
                      height: "100% !important",
                      overflowY: "auto !important",
                      resize: "none",
                    },
                  },
                },
              }}
            />
          </Box>
        </Box>
      </Modal>
    </div>
  );
};
