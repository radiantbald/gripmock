import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import {
  Alert,
  Box,
  Button,
  FormControl,
  IconButton,
  MenuItem,
  Modal,
  Select,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { SelectInput, TextInput } from "react-admin";
import { useEffect, useMemo, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { reflectionHostInputSx } from "../../../components/inputs/reflectionHostInputSx";
import { JsonTextAreaInput } from "../../../components/json/JsonTextAreaInput";
import { KeyValueTableInput } from "../../../components/json/KeyValueTableInput";
import { StubMatcherInput } from "../../../components/json/StubMatcherInput";

const CARD_RADIUS_PX = "10px";

type OutputPayloadType = "data" | "stream";

type StubFormLayoutMode = "create" | "edit";
type RawPreviewTarget = "matcher" | "response" | null;

type StubFormLayoutProps = {
  mode: StubFormLayoutMode;
  showId?: boolean;
};

const grpcStatusCodeChoices = [
  { id: 0, name: "0 OK" },
  { id: 1, name: "1 CANCELLED" },
  { id: 2, name: "2 UNKNOWN" },
  { id: 3, name: "3 INVALID_ARGUMENT" },
  { id: 4, name: "4 DEADLINE_EXCEEDED" },
  { id: 5, name: "5 NOT_FOUND" },
  { id: 6, name: "6 ALREADY_EXISTS" },
  { id: 7, name: "7 PERMISSION_DENIED" },
  { id: 8, name: "8 RESOURCE_EXHAUSTED" },
  { id: 9, name: "9 FAILED_PRECONDITION" },
  { id: 10, name: "10 ABORTED" },
  { id: 11, name: "11 OUT_OF_RANGE" },
  { id: 12, name: "12 UNIMPLEMENTED" },
  { id: 13, name: "13 INTERNAL" },
  { id: 14, name: "14 UNAVAILABLE" },
  { id: 15, name: "15 DATA_LOSS" },
  { id: 16, name: "16 UNAUTHENTICATED" },
] as const;

const sectionCardSx = {
  width: "100%",
  border: "1px solid",
  borderColor: "divider",
  borderRadius: CARD_RADIUS_PX,
  p: 1.25,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
} as const;

const responseTypeHeaderSelectSx = {
  width: "auto",
  minWidth: 0,
  m: 0,
  p: 0,
  "& .MuiInputBase-root": {
    width: "auto",
    minHeight: "unset",
    margin: 0,
    padding: 0,
    display: "inline-flex",
    alignItems: "center",
    color: "#FF6C37 !important",
    backgroundColor: "transparent",
    borderRadius: 0,
    fontSize: "inherit",
    fontWeight: "inherit",
    lineHeight: "inherit",
  },
  "& .MuiInputBase-root::before, & .MuiInputBase-root::after": {
    borderBottom: "none !important",
  },
  "& .MuiInputBase-root:hover:not(.Mui-disabled)::before": {
    borderBottom: "none !important",
  },
  "& .MuiOutlinedInput-notchedOutline": {
    border: "none",
  },
  "& .MuiSelect-select": {
    minWidth: "unset !important",
    minHeight: "unset !important",
    padding: "0 20px 0 0 !important",
    display: "inline-flex",
    alignItems: "center",
    backgroundColor: "transparent !important",
    boxShadow: "none",
    color: "#FF6C37 !important",
    fontSize: "inherit",
    fontWeight: "inherit",
    lineHeight: "inherit",
  },
  "& .MuiOutlinedInput-input, & .MuiSelect-select.MuiOutlinedInput-input": {
    padding: "0 20px 0 0 !important",
  },
  "& .MuiSelect-select:focus": {
    backgroundColor: "transparent !important",
  },
  "& .MuiSelect-icon": {
    right: 0,
    color: "#FF6C37 !important",
    fontSize: 16,
  },
  "& .MuiSelect-iconOpen": { transform: "rotate(180deg)" },
} as const;

const stubPrimaryInputSx = {
  ...reflectionHostInputSx,
  width: "100%",
  maxWidth: "100%",
  m: 0,
  "& .MuiFormControl-root": {
    margin: 0,
  },
} as const;

const responseMetaInputSx = {
  ...stubPrimaryInputSx,
  "& .MuiFormControl-root": {
    width: "100%",
  },
  "& input[type=number]": {
    MozAppearance: "textfield",
  },
  "& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button": {
    WebkitAppearance: "none",
    margin: 0,
  },
} as const;

const MATCHER_ANY_OF_MODE_KEY = "__anyOfEnabled";
const MATCHER_SCALAR_KEYS = ["equals", "contains"] as const;
const MATCHER_KEYS = new Set(["equals", "contains", "matches", "glob", "anyOf", "ignoreArrayOrder"]);

const isRecordValue = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stripMatcherUiKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) => stripMatcherUiKeys(entry));
  }
  if (!isRecordValue(value)) {
    return value;
  }

  const next: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (key === MATCHER_ANY_OF_MODE_KEY) {
      continue;
    }
    next[key] = stripMatcherUiKeys(raw);
  }

  return next;
};

const serializeMatcherForPreview = (value: unknown): unknown => {
  const stripped = stripMatcherUiKeys(value);
  if (!isRecordValue(value) || !isRecordValue(stripped)) {
    return stripped;
  }

  const anyOfEnabled = value[MATCHER_ANY_OF_MODE_KEY] === true;
  if (!anyOfEnabled) {
    delete stripped.anyOf;
    return stripped;
  }

  const anyOfRules: Record<string, unknown>[] = [];
  for (const key of MATCHER_SCALAR_KEYS) {
    const section = stripped[key];
    if (!isRecordValue(section) || Object.keys(section).length === 0) {
      continue;
    }
    anyOfRules.push({ [key]: section });
    delete stripped[key];
  }

  if (anyOfRules.length > 0) {
    stripped.anyOf = anyOfRules;
  } else {
    delete stripped.anyOf;
  }

  return stripped;
};

const isEmptyObject = (value: unknown): boolean => isRecordValue(value) && Object.keys(value).length === 0;

const formatPreviewJson = (value: unknown): string => {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return "{}";
  }
};

const isMatcherObject = (value: unknown): value is Record<string, unknown> =>
  isRecordValue(value) && Object.keys(value).some((key) => MATCHER_KEYS.has(key));

const normalizeInputMatcher = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (!isRecordValue(item)) {
        return item;
      }

      return isMatcherObject(item) ? item : { equals: item };
    });
  }

  if (!isRecordValue(value)) {
    return value;
  }

  return isMatcherObject(value) ? value : { equals: value };
};

const normalizeMatcherForFields = (value: unknown): Record<string, unknown> => {
  if (!isRecordValue(value)) {
    return {};
  }

  const normalized: Record<string, unknown> = {};

  if (value.ignoreArrayOrder === true) {
    normalized.ignoreArrayOrder = true;
  }

  for (const key of MATCHER_SCALAR_KEYS) {
    const section = value[key];
    if (!isRecordValue(section)) {
      continue;
    }
    normalized[key] = {
      ...(isRecordValue(normalized[key]) ? (normalized[key] as Record<string, unknown>) : {}),
      ...section,
    };
  }

  if (Array.isArray(value.anyOf)) {
    for (const rule of value.anyOf) {
      if (!isRecordValue(rule)) {
        continue;
      }
      if (rule.ignoreArrayOrder === true) {
        normalized.ignoreArrayOrder = true;
      }
      for (const key of MATCHER_SCALAR_KEYS) {
        const section = rule[key];
        if (!isRecordValue(section)) {
          continue;
        }
        normalized[key] = {
          ...(isRecordValue(normalized[key]) ? (normalized[key] as Record<string, unknown>) : {}),
          ...section,
        };
      }
    }
  }

  for (const [key, rawValue] of Object.entries(value)) {
    if (!MATCHER_KEYS.has(key) && rawValue !== undefined && key !== MATCHER_ANY_OF_MODE_KEY) {
      normalized[key] = rawValue;
    }
  }

  const explicitAnyOfMode = value[MATCHER_ANY_OF_MODE_KEY];
  normalized[MATCHER_ANY_OF_MODE_KEY] =
    typeof explicitAnyOfMode === "boolean"
      ? explicitAnyOfMode
      : Array.isArray(value.anyOf) && value.anyOf.length > 0;

  return normalized;
};

const normalizeHeadersForFields = (value: unknown): Record<string, unknown> | undefined => {
  if (!isRecordValue(value) || isEmptyObject(value)) {
    return undefined;
  }
  if (isRecordValue(value.equals) || isRecordValue(value.contains)) {
    return value;
  }
  return { equals: value };
};

export const stubFormSx = {
  height: "100%",
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  gap: 0,
  "&.MuiCardContent-root": {
    height: "100%",
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    px: 1.25,
    pt: 1.25,
    pb: 0,
  },
  "& form": {
    height: "100%",
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    gap: 1.25,
  },
  "& .RaToolbar-root": {
    mt: "auto",
    px: 0.25,
    py: 0.25,
    minHeight: 52,
    flexShrink: 0,
  },
} as const;

export const StubFormLayout = ({ mode, showId = false }: StubFormLayoutProps) => {
  const { setValue } = useFormContext();
  const stubIdValue = useWatch({ name: "id" });
  const matcherHeaders = useWatch({ name: "headers" });
  const matcherInput = useWatch({ name: "input" });
  const matcherInputs = useWatch({ name: "inputs" });
  const outputValue = useWatch({ name: "output" });
  const outputData = useWatch({ name: "output.data" });
  const outputStream = useWatch({ name: "output.stream" });
  const outputCode = useWatch({ name: "output.code" });
  const [outputPayloadType, setOutputPayloadType] = useState<OutputPayloadType>("data");
  const [outputTypeInitialized, setOutputTypeInitialized] = useState(false);
  const [rawPreviewTarget, setRawPreviewTarget] = useState<RawPreviewTarget>(null);
  const [rawEditorText, setRawEditorText] = useState("");
  const [rawEditorError, setRawEditorError] = useState<string | null>(null);
  const parsedOutputCode = typeof outputCode === "string" ? Number(outputCode.trim() || "0") : Number(outputCode);
  const hasNonZeroStatusCode = Number.isFinite(parsedOutputCode) && parsedOutputCode !== 0;

  const matcherPreviewPayload = useMemo(() => {
    const payload: Record<string, unknown> = {};

    if (isRecordValue(matcherHeaders) && !isEmptyObject(matcherHeaders)) {
      payload.headers = matcherHeaders;
    }

    const normalizedInput = serializeMatcherForPreview(matcherInput);
    const normalizedInputs = serializeMatcherForPreview(matcherInputs);
    if (Array.isArray(normalizedInputs) && normalizedInputs.length > 0) {
      payload.inputs = normalizedInputs;
    } else if (isRecordValue(normalizedInput) && !isEmptyObject(normalizedInput)) {
      payload.input = normalizedInput;
    }

    return payload;
  }, [matcherHeaders, matcherInput, matcherInputs]);

  const responsePreviewPayload = useMemo(() => {
    if (isRecordValue(outputValue)) {
      return outputValue;
    }

    return {};
  }, [outputValue]);

  const previewTitle = rawPreviewTarget === "matcher" ? "Request Match Raw JSON" : "Response Stub Raw JSON";
  const previewText = formatPreviewJson(rawPreviewTarget === "matcher" ? matcherPreviewPayload : responsePreviewPayload);

  useEffect(() => {
    if (outputTypeInitialized) {
      return;
    }

    if (outputStream !== undefined && outputStream !== null && (outputData === undefined || outputData === null)) {
      setOutputPayloadType("stream");
    } else {
      setOutputPayloadType("data");
    }
    setOutputTypeInitialized(true);
  }, [outputData, outputStream, outputTypeInitialized]);

  const handleOutputPayloadTypeChange = (nextType: OutputPayloadType) => {
    const unsetValue = mode === "edit" ? null : undefined;
    setOutputPayloadType(nextType);
    if (nextType === "data") {
      setValue("output.stream", unsetValue, { shouldDirty: true });
      return;
    }

    setValue("output.data", unsetValue, { shouldDirty: true });
  };

  const openRawEditor = (target: RawPreviewTarget) => {
    if (target === null) {
      return;
    }
    setRawEditorError(null);
    setRawEditorText(formatPreviewJson(target === "matcher" ? matcherPreviewPayload : responsePreviewPayload));
    setRawPreviewTarget(target);
  };

  const applyMatcherPreview = (value: unknown) => {
    if (!isRecordValue(value)) {
      throw new Error("Matcher JSON must be an object.");
    }

    const unsetValue = mode === "edit" ? null : undefined;
    const headers = normalizeHeadersForFields(value.headers);
    setValue("headers", headers ?? unsetValue, { shouldDirty: true });

    let nextMatcher: unknown = value.input;
    if (nextMatcher === undefined && Array.isArray(value.inputs) && value.inputs.length > 0) {
      nextMatcher = value.inputs.find((item) => isRecordValue(item)) ?? value.inputs[0];
    }

    const normalizedInputMatcher = normalizeInputMatcher(nextMatcher);
    if (isRecordValue(normalizedInputMatcher)) {
      setValue("input", normalizeMatcherForFields(normalizedInputMatcher), { shouldDirty: true });
    } else {
      setValue("input", unsetValue, { shouldDirty: true });
    }
    setValue("inputs", unsetValue, { shouldDirty: true });
  };

  const applyResponsePreview = (value: unknown) => {
    if (!isRecordValue(value)) {
      throw new Error("Response JSON must be an object.");
    }

    setValue("output", value, { shouldDirty: true });
    const hasStream = Array.isArray(value.stream) && value.stream.length > 0;
    const hasData = value.data !== undefined && value.data !== null;
    setOutputPayloadType(hasStream && !hasData ? "stream" : "data");
  };

  const applyRawEditorParsedValue = (parsed: unknown) => {
    if (rawPreviewTarget === "matcher") {
      applyMatcherPreview(parsed);
    } else if (rawPreviewTarget === "response") {
      applyResponsePreview(parsed);
    }
  };

  const handleRawEditorTextChange = (nextText: string) => {
    setRawEditorText(nextText);
    const trimmed = nextText.trim();
    if (!trimmed) {
      setRawEditorError("JSON cannot be empty.");
      return;
    }

    try {
      const parsed = JSON.parse(nextText) as unknown;
      applyRawEditorParsedValue(parsed);
      setRawEditorError(null);
    } catch (error) {
      setRawEditorError((error as Error).message || "Invalid JSON");
    }
  };

  return (
    <>
      <Box
        sx={{
          width: "100%",
          display: "grid",
          gridTemplateColumns: showId
            ? { xs: "1fr", md: "auto repeat(3, minmax(0, 1fr))" }
            : { xs: "1fr", md: "repeat(3, minmax(0, 1fr))" },
          pt: 0.5,
          pb: 1,
          gap: 2,
          alignItems: "start",
          flexShrink: 0,
          "& .ra-input": {
            marginTop: 0,
            marginBottom: 0,
          },
          "& .MuiFormControl-root": {
            marginTop: 0,
            marginBottom: 0,
          },
        }}
      >
        {showId ? (
          <Box
            sx={{
              width: "100%",
              minHeight: 40,
              display: "flex",
              alignItems: "center",
            }}
          >
            <Typography
              sx={{
                color: "#FF6C37",
                fontWeight: 800,
                fontSize: 28,
                lineHeight: 1.1,
              }}
            >
              {stubIdValue ?? ""}
            </Typography>
          </Box>
        ) : null}
        <TextInput source="name" label="Stub Name" variant="outlined" fullWidth sx={stubPrimaryInputSx} />
        <TextInput source="service" variant="outlined" fullWidth sx={stubPrimaryInputSx} />
        <TextInput source="method" variant="outlined" fullWidth sx={stubPrimaryInputSx} />
      </Box>

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          width: "100%",
          display: "flex",
          flexDirection: "column",
          gap: 1.25,
          overflowY: "auto",
          pr: 0,
          pb: 0,
        }}
      >
        <Box sx={sectionCardSx}>
          <Box sx={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "flex-start", mb: 1, gap: 0.5 }}>
            <Box sx={{ fontSize: 16, fontWeight: 600, color: "#FF6C37" }}>
              Request Match
            </Box>
            <Tooltip title="View matcher raw JSON">
              <Button
                size="small"
                variant="text"
                aria-label="View matcher raw JSON"
                startIcon={<VisibilityOutlinedIcon sx={{ fontSize: 16 }} />}
                onClick={() => {
                  openRawEditor("matcher");
                }}
                sx={{
                  color: "text.secondary",
                  minWidth: "unset",
                  width: 22,
                  height: 22,
                  p: 0,
                  borderRadius: 1,
                  backgroundColor: "transparent",
                  "& .MuiButton-startIcon": { m: 0 },
                  "&:hover": {
                    color: "#FF6C37",
                    backgroundColor: "transparent",
                  },
                }}
              />
            </Tooltip>
          </Box>
          <Box
            sx={{
              width: "100%",
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) 250px minmax(0, 1fr)" },
              gap: 2,
              alignItems: "start",
              minHeight: 0,
              "& > *": { minHeight: 0 },
            }}
          >
            <KeyValueTableInput
              source="headers.equals"
              label="Request metadata"
              helperText={undefined}
              maxTableHeight={140}
            />
            <Box sx={{ width: "100%", minHeight: 0, gridColumn: { xs: "span 1", md: "2 / 4" } }}>
              <StubMatcherInput
                mode={mode}
                minRows={8}
              />
            </Box>
          </Box>
        </Box>

        <Box sx={{ ...sectionCardSx, alignSelf: "start", overflow: "visible" }}>
          <Box sx={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "flex-start", mb: 1, gap: 0.5 }}>
            <Box sx={{ fontSize: 16, fontWeight: 600, color: "#FF6C37" }}>
              Response Stub
            </Box>
            <Tooltip title="View response raw JSON">
              <Button
                size="small"
                variant="text"
                aria-label="View response raw JSON"
                startIcon={<VisibilityOutlinedIcon sx={{ fontSize: 16 }} />}
                onClick={() => {
                  openRawEditor("response");
                }}
                sx={{
                  color: "text.secondary",
                  minWidth: "unset",
                  width: 22,
                  height: 22,
                  p: 0,
                  borderRadius: 1,
                  backgroundColor: "transparent",
                  "& .MuiButton-startIcon": { m: 0 },
                  "&:hover": {
                    color: "#FF6C37",
                    backgroundColor: "transparent",
                  },
                }}
              />
            </Tooltip>
          </Box>
          <Box
            sx={{
              width: "100%",
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) minmax(0, 1fr) 250px" },
              gap: 2,
              minHeight: 0,
            }}
          >
            <Box
              sx={{
                width: "100%",
                display: "flex",
                flexDirection: "column",
                pt: 0.5,
                gap: 1,
                minHeight: 0,
              }}
            >
              <Box
                sx={{
                  width: "100%",
                  display: "flex",
                  alignItems: "stretch",
                  gap: hasNonZeroStatusCode ? 1 : 0,
                  overflow: "visible",
                  transition: "gap 220ms ease",
                }}
              >
                <Box
                  sx={{
                    flex: hasNonZeroStatusCode ? "0 0 40%" : "1 1 100%",
                    minWidth: 0,
                    transition: "flex-basis 220ms ease, flex-grow 220ms ease, flex-shrink 220ms ease",
                  }}
                >
                  <SelectInput
                    source="output.code"
                    label="gRPC status code"
                    variant="outlined"
                    choices={grpcStatusCodeChoices}
                    optionText="name"
                    optionValue="id"
                    emptyText={false}
                    parse={(value) => Number(value)}
                    format={(value) => String(value ?? 0)}
                    helperText={false}
                    fullWidth
                    sx={responseMetaInputSx}
                  />
                </Box>
                <Box
                  sx={{
                    flex: hasNonZeroStatusCode ? "1 1 60%" : "0 0 0px",
                    minWidth: 0,
                    maxWidth: hasNonZeroStatusCode ? "100%" : 0,
                    opacity: hasNonZeroStatusCode ? 1 : 0,
                    overflow: "hidden",
                    pointerEvents: hasNonZeroStatusCode ? "auto" : "none",
                    transition:
                      "flex-basis 220ms ease, flex-grow 220ms ease, flex-shrink 220ms ease, max-width 220ms ease, opacity 180ms ease",
                  }}
                >
                  <TextInput
                    source="output.error"
                    label="gRPC error"
                    variant="outlined"
                    helperText={false}
                    fullWidth
                    sx={responseMetaInputSx}
                  />
                </Box>
              </Box>
              <TextInput
                source="output.delay"
                label="Delay"
                variant="outlined"
                helperText={false}
                fullWidth
                sx={responseMetaInputSx}
              />
              <KeyValueTableInput
                source="output.headers"
                label="Response metadata"
                helperText={undefined}
                maxTableHeight={140}
              />
            </Box>
            <Box sx={{ width: "100%", minHeight: 0, mt: { xs: 0, md: "-23px" } }}>
              {outputPayloadType === "data" ? (
                <JsonTextAreaInput
                  source="output.data"
                  label={(
                    <FormControl size="small" sx={responseTypeHeaderSelectSx}>
                      <Select
                        value={outputPayloadType}
                        variant="standard"
                        disableUnderline
                        IconComponent={KeyboardArrowDownRoundedIcon}
                        onChange={(event) => {
                          handleOutputPayloadTypeChange(event.target.value as OutputPayloadType);
                        }}
                      >
                        <MenuItem value="data">Data</MenuItem>
                        <MenuItem value="stream">Stream</MenuItem>
                      </Select>
                    </FormControl>
                  )}
                  minRows={12}
                  placeholder="{}"
                />
              ) : (
                <JsonTextAreaInput
                  source="output.stream"
                  label={(
                    <FormControl size="small" sx={responseTypeHeaderSelectSx}>
                      <Select
                        value={outputPayloadType}
                        variant="standard"
                        disableUnderline
                        IconComponent={KeyboardArrowDownRoundedIcon}
                        onChange={(event) => {
                          handleOutputPayloadTypeChange(event.target.value as OutputPayloadType);
                        }}
                      >
                        <MenuItem value="data">Data</MenuItem>
                        <MenuItem value="stream">Stream</MenuItem>
                      </Select>
                    </FormControl>
                  )}
                  minRows={12}
                  placeholder="[]"
                />
              )}
            </Box>
            <Box sx={{ width: "100%", minHeight: 0, mt: { xs: 0, md: "-23px" } }}>
              <JsonTextAreaInput
                source="output.details"
                label="Details"
                minRows={12}
                placeholder="[]"
              />
            </Box>
          </Box>
        </Box>
      </Box>
      <Modal
        open={rawPreviewTarget !== null}
        onClose={() => {
          setRawPreviewTarget(null);
          setRawEditorError(null);
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
            <Typography variant="body2" sx={{ color: "#FF6C37", fontWeight: 500 }}>
              {previewTitle}
            </Typography>
            <IconButton
              size="small"
              aria-label="Close raw editor"
              onClick={() => {
                setRawPreviewTarget(null);
                setRawEditorError(null);
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
              value={rawEditorText}
              onChange={(event) => {
                handleRawEditorTextChange(event.target.value);
              }}
              multiline
              fullWidth
              placeholder={previewText}
              variant="outlined"
              sx={{ height: "100%" }}
              slotProps={{
                input: {
                  sx: {
                    height: "100%",
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
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
          {rawEditorError ? (
            <Alert severity="error" sx={{ mt: 1, py: 0 }}>
              {rawEditorError}
            </Alert>
          ) : null}
        </Box>
      </Modal>
    </>
  );
};
