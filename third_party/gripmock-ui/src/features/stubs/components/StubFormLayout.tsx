import { Box } from "@mui/material";
import { NumberInput, TextInput } from "react-admin";
import { JsonTextAreaInput } from "../../../components/json/JsonTextAreaInput";
import { KeyValueTableInput } from "../../../components/json/KeyValueTableInput";
import { StubMatcherInput } from "../../../components/json/StubMatcherInput";

const CARD_RADIUS_PX = "10px";

const OUTPUT_PLACEHOLDER_TEMPLATE = `{
  "data": {
    "message": "ok"
  },
  "stream": [
    {
      "message": "part-1"
    }
  ],
  "details": [
    {
      "@type": "type.googleapis.com/google.rpc.ErrorInfo",
      "reason": "EXAMPLE_REASON",
      "domain": "example.service"
    }
  ]
}`;

type StubFormLayoutMode = "create" | "edit";

type StubFormLayoutProps = {
  mode: StubFormLayoutMode;
  showId?: boolean;
};

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
        {showId ? <TextInput source="id" label="Stub ID" fullWidth disabled /> : null}
        <TextInput source="name" label="Stub Name" fullWidth />
        <TextInput source="service" fullWidth />
        <TextInput source="method" fullWidth />
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
              gridTemplateColumns: { xs: "1fr", md: "2fr 3fr" },
              gap: 2,
              alignItems: "start",
              minHeight: 0,
              "& > *": { minHeight: 0 },
            }}
          >
            <KeyValueTableInput
              source="headers.equals"
              label="Request headers"
              helperText="Matcher for incoming request metadata."
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
              display: "flex",
              flexDirection: "column",
              gap: 2,
              minHeight: 0,
            }}
          >
            <Box
              sx={{
                width: "100%",
                display: "grid",
                gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(180px, 1fr))" },
                gap: 2,
                alignItems: "start",
              }}
            >
              <NumberInput
                source="output.code"
                label="gRPC status code"
                min={0}
                max={16}
                step={1}
                helperText="Optional status code (0..16). Use non-zero with error responses."
                fullWidth
              />
              <TextInput
                source="output.error"
                label="gRPC error"
                helperText="Optional error text (for non-zero status codes)."
                fullWidth
              />
              <TextInput
                source="output.delay"
                label="Delay"
                helperText="Optional response delay in milliseconds (e.g. 100)."
                fullWidth
              />
            </Box>
            <Box
              sx={{
                width: "100%",
                display: "grid",
                gridTemplateColumns: { xs: "1fr", md: "2fr 3fr" },
                gap: 2,
                alignItems: "start",
                minHeight: 0,
                "& > *": { minHeight: 0 },
              }}
            >
              <KeyValueTableInput
                source="output.headers"
                label="Response headers"
                helperText="Metadata returned to client."
                maxTableHeight={140}
              />
              <JsonTextAreaInput
                source="output"
                label="Data / Stream / Details"
                minRows={8}
                syncNestedFields={["code", "error", "delay", "headers"]}
                visibleKeys={["data", "stream", "details"]}
                placeholder={OUTPUT_PLACEHOLDER_TEMPLATE}
              />
            </Box>
          </Box>
        </Box>
      </Box>
    </>
  );
};
