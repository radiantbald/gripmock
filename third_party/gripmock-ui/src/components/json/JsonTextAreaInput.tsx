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

type JsonTextAreaInputProps = {
  source: string;
  label?: string;
  helperText?: string;
  minRows?: number;
} & InputProps;

const prettyJson = (value: unknown) => {
  if (value === undefined || value === null) {
    return "{}";
  }

  return JSON.stringify(value, null, 2);
};

export const JsonTextAreaInput = (props: JsonTextAreaInputProps) => {
  const { source, label, helperText, minRows = 10 } = props;

  const {
    field: { value, onChange },
    fieldState: { isTouched, error },
    formState: { isSubmitted },
    isRequired,
  } = useInput(props);

  const initialText = useMemo(() => prettyJson(value), [value]);
  const [text, setText] = useState(initialText);
  const [parseError, setParseError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setText(initialText);
  }, [initialText]);

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
      onChange(parsed);
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
      onChange(parsed);
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
