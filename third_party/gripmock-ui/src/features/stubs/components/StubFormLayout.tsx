import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import { Box, FormControl, MenuItem, Select } from "@mui/material";
import { SelectInput, TextInput } from "react-admin";
import { useEffect, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { reflectionHostInputSx } from "../../../components/inputs/reflectionHostInputSx";
import { JsonTextAreaInput } from "../../../components/json/JsonTextAreaInput";
import { KeyValueTableInput } from "../../../components/json/KeyValueTableInput";
import { StubMatcherInput } from "../../../components/json/StubMatcherInput";

const CARD_RADIUS_PX = "10px";

type OutputPayloadType = "data" | "stream";

type StubFormLayoutMode = "create" | "edit";

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
  const outputData = useWatch({ name: "output.data" });
  const outputStream = useWatch({ name: "output.stream" });
  const outputCode = useWatch({ name: "output.code" });
  const [outputPayloadType, setOutputPayloadType] = useState<OutputPayloadType>("data");
  const [outputTypeInitialized, setOutputTypeInitialized] = useState(false);
  const parsedOutputCode = typeof outputCode === "string" ? Number(outputCode.trim() || "0") : Number(outputCode);
  const hasNonZeroStatusCode = Number.isFinite(parsedOutputCode) && parsedOutputCode !== 0;

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

  return (
    <>
      <Box
        sx={{
          width: "100%",
          display: "grid",
          gridTemplateColumns: showId
            ? { xs: "1fr", md: "repeat(4, minmax(180px, 1fr))" }
            : { xs: "1fr", md: "repeat(3, minmax(220px, 320px))" },
          gap: 2,
          alignItems: "start",
          justifyContent: "start",
          flexShrink: 0,
        }}
      >
        {showId ? (
          <TextInput
            source="id"
            label="Stub ID"
            variant="outlined"
            fullWidth
            disabled
            sx={stubPrimaryInputSx}
          />
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
          <Box sx={{ width: "100%", fontSize: 16, fontWeight: 600, color: "#FF6C37", mb: 1 }}>
            Request Match
          </Box>
          <Box
            sx={{
              width: "100%",
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "minmax(220px, 1fr) minmax(0, 3fr)" },
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
            <StubMatcherInput
              mode={mode}
              minRows={8}
            />
          </Box>
        </Box>

        <Box sx={{ ...sectionCardSx, alignSelf: "start" }}>
          <Box sx={{ width: "100%", fontSize: 16, fontWeight: 600, color: "#FF6C37", mb: 1 }}>
            Response Stub
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
                gap: 0,
                minHeight: 0,
              }}
            >
              <Box
                sx={{
                  width: "100%",
                  display: "flex",
                  alignItems: "stretch",
                  gap: hasNonZeroStatusCode ? 1 : 0,
                  overflow: "hidden",
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
    </>
  );
};
