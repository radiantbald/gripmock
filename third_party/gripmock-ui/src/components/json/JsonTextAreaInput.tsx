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
import { InputProps, useInput } from "react-admin";
import { useFormContext, useWatch } from "react-hook-form";

type JsonTextAreaInputProps = {
  source: string;
  label?: string;
  helperText?: string;
  minRows?: number;
  syncNestedFields?: string[];
  visibleKeys?: string[];
  placeholder?: string;
} & InputProps;

const prettyJson = (value: unknown) => {
  if (value === undefined || value === null) {
    return "";
  }

  return JSON.stringify(value, null, 2);
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return !!value && typeof value === "object" && !Array.isArray(value);
};

const projectVisibleValue = (value: unknown, visibleKeys: string[]): unknown => {
  if (visibleKeys.length === 0 || !isRecord(value)) {
    return value;
  }

  const projected: Record<string, unknown> = {};
  for (const key of visibleKeys) {
    if (Object.hasOwn(value, key) && value[key] !== undefined) {
      projected[key] = value[key];
    }
  }

  if (Object.keys(projected).length === 0) {
    return undefined;
  }

  return projected;
};

const mergeVisibleValue = (
  currentValue: unknown,
  parsedValue: unknown,
  visibleKeys: string[],
): unknown => {
  if (visibleKeys.length === 0 || !isRecord(parsedValue)) {
    return parsedValue;
  }

  const next = isRecord(currentValue) ? { ...currentValue } : {};
  for (const key of visibleKeys) {
    delete next[key];
  }

  for (const key of visibleKeys) {
    if (Object.hasOwn(parsedValue, key)) {
      next[key] = parsedValue[key];
    }
  }

  return next;
};

export const JsonTextAreaInput = (props: JsonTextAreaInputProps) => {
  const {
    source,
    label,
    helperText,
    minRows = 10,
    syncNestedFields = [],
    visibleKeys = [],
    placeholder = "{}",
  } = props;
  const { getValues } = useFormContext();

  const {
    field: { value, onChange },
    fieldState: { isTouched, error },
    formState: { isSubmitted },
    isRequired,
  } = useInput(props);

  const initialText = useMemo(
    () => prettyJson(projectVisibleValue(value, visibleKeys)),
    [value, visibleKeys],
  );
  const [text, setText] = useState(initialText);
  const [parseError, setParseError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const syncFieldNames = useMemo(
    () => syncNestedFields.map((field) => `${source}.${field}`),
    [source, syncNestedFields],
  );
  const watchedSyncValues = useWatch({
    name: syncFieldNames,
  });

  useEffect(() => {
    if (isFocused) {
      return;
    }

    setText((prev) => (prev === initialText ? prev : initialText));
  }, [initialText, isFocused]);

  useEffect(() => {
    if (syncFieldNames.length === 0) {
      return;
    }
    if (isFocused) {
      return;
    }

    const latest = getValues(source);
    const nextText = prettyJson(projectVisibleValue(latest, visibleKeys));
    const currentTextFromValue = prettyJson(projectVisibleValue(value, visibleKeys));

    if (currentTextFromValue !== nextText) {
      onChange(latest);
    }

    setText((prev) => (prev === nextText ? prev : nextText));
  }, [
    getValues,
    onChange,
    source,
    syncFieldNames.length,
    value,
    visibleKeys,
    watchedSyncValues,
    isFocused,
  ]);

  const updateValueFromText = (nextText: string) => {
    const trimmed = nextText.trim();
    if (trimmed.length === 0) {
      setParseError(null);
      onChange(undefined);
      return;
    }

    try {
      const parsed = JSON.parse(nextText);
      setParseError(null);
      onChange(mergeVisibleValue(value, parsed, visibleKeys));
    } catch {
      setParseError("Invalid JSON. Fix syntax and try again.");
    }
  };

  const handleTextChange = (nextText: string) => {
    setText(nextText);
    updateValueFromText(nextText);
  };

  const handleBeautify = () => {
    const trimmed = text.trim();
    if (!trimmed) {
      setText("{}");
      setParseError(null);
      onChange({});
      return;
    }

    try {
      const parsed = JSON.parse(text);
      const formatted = JSON.stringify(parsed, null, 2);
      setText(formatted);
      setParseError(null);
      onChange(mergeVisibleValue(value, parsed, visibleKeys));
    } catch {
      setParseError("Beautify failed: JSON is invalid.");
    }
  };

  return (
    <div>
      <Stack spacing={1}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Typography variant="body2" color="text.secondary">
            {label || source}
            {isRequired ? " *" : ""}
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
            placeholder={placeholder}
            onFocusCapture={() => {
              setIsFocused(true);
            }}
            onBlurCapture={() => {
              setIsFocused(false);
            }}
            onChange={(event) => {
              handleTextChange(event.target.value);
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
        </Stack>
      </Stack>
      <FormHelperText
        error={!!parseError || ((isTouched || isSubmitted) && !!error)}
      >
        {parseError || error?.message || helperText}
      </FormHelperText>
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
              {label || source}
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
              placeholder={placeholder}
              onFocusCapture={() => {
                setIsFocused(true);
              }}
              onBlurCapture={() => {
                setIsFocused(false);
              }}
              onChange={(event) => {
                handleTextChange(event.target.value);
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
