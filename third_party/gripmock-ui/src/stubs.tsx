import { Alert, Box } from "@mui/material";
import {
  List,
  TextField,
  Create,
  Edit,
  SimpleForm,
  Toolbar,
  SaveButton,
  TextInput,
  BooleanInput,
  NumberField,
  BooleanField,
  Show,
  SimpleShowLayout,
  TopToolbar,
  ExportButton,
  CreateButton,
  AutocompleteInput,
  useGetList,
  NumberInput,
} from "react-admin";
import { JsonField } from "./components/json/JsonField";
import { JsonTextAreaInput } from "./components/json/JsonTextAreaInput";
import { KeyValueTableInput } from "./components/json/KeyValueTableInput";
import { StubMatcherInput } from "./components/json/StubMatcherInput";
import { useEffect, useState } from "react";
import type { ReactElement } from "react";

import { useJsonTheme } from "./utils/jsonTheme";
import { downloadJsonFile } from "./utils/fileDownload";
import { listContentSx } from "./components/table/listStyles";
import { ActiveFiltersSummary } from "./components/table/ActiveFiltersSummary";
import type { StubRecord } from "./types/entities";
import { StubsDatagrid } from "./features/stubs/components/StubsDatagrid";
import { getCurrentSession, subscribeSessionChanges } from "./utils/session";
import type { SessionRow } from "./features/session/model";

const RADIUS_PX = "10px";
const stubsListSx = {
  ...listContentSx,
  height: "100%",
  "& .RaList-toolbar": {
    minHeight: 40,
    height: 40,
    paddingTop: 0,
    paddingBottom: 0,
    alignItems: "center",
  },
  "& .RaList-actions": {
    minHeight: 40,
    height: 40,
    paddingTop: 0,
    paddingBottom: 0,
    marginTop: 0,
    marginBottom: 0,
    display: "flex",
    alignItems: "center",
  },
  "& .RaList-actions .MuiToolbar-root": {
    minHeight: "32px !important",
    height: 32,
    paddingTop: 0,
    paddingBottom: 0,
  },
  "& .RaList-main": {
    height: "100%",
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
  },
  "& .RaList-content": {
    ...listContentSx["& .RaList-content"],
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
} as const;

// Export function for stubs list
const exportStubs = (stubs: object[]) => {
  downloadJsonFile(stubs, "stubs-export.json");
};

const PLAIN_MILLISECONDS_RE = /^\d+(\.\d+)?$/;

const normalizeDelayValue = (value: unknown): unknown => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return "";
  }

  if (!PLAIN_MILLISECONDS_RE.test(trimmed)) {
    return trimmed;
  }

  const numericMilliseconds = Number.parseFloat(trimmed);
  return Number.isNaN(numericMilliseconds) ? trimmed : numericMilliseconds;
};

const normalizeStubDelay = <T extends Record<string, unknown>>(data: T): T => {
  const output = data.output;
  if (!output || typeof output !== "object") {
    return data;
  }

  return {
    ...data,
    output: {
      ...(output as Record<string, unknown>),
      delay: normalizeDelayValue((output as Record<string, unknown>).delay),
    },
  };
};

const DEFAULT_OUTPUT_TEMPLATE = {
  data: {
    message: "ok",
    userId: "42",
  },
  stream: [
    {
      message: "part-1",
    },
    {
      message: "part-2",
    },
  ],
  headers: {},
  error: "",
  code: 0,
  details: [
    {
      type: "type.googleapis.com/google.rpc.ErrorInfo",
      reason: "EXAMPLE_REASON",
      domain: "example.service",
    },
  ],
};

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

const useActiveSession = (): string => {
  const [session, setSession] = useState(() => getCurrentSession());

  useEffect(() => subscribeSessionChanges(() => setSession(getCurrentSession())), []);

  return session.trim();
};

const useSessionFromDatabase = (activeSession: string): boolean => {
  const { data: sessions = [], refetch: refetchSessions } = useGetList<SessionRow>(
    "sessions",
    { pagination: { page: 1, perPage: 1000 } },
    { retry: false, staleTime: 0, refetchOnMount: "always", refetchOnWindowFocus: true },
  );

  useEffect(() => {
    if (!activeSession) {
      return;
    }

    void refetchSessions();
  }, [activeSession, refetchSessions]);

  if (!activeSession) {
    return false;
  }

  return sessions.some((row) => {
    const value = String(row?.id || row?.session || row?.name || "").trim();
    return value !== "" && value === activeSession;
  });
};

// Service Autocomplete Filter
const NameFilter = (props: Record<string, unknown>) => {
  const { data: stubs, isLoading } = useGetList<StubRecord>("stubs", {
    pagination: { page: 1, perPage: 1000 },
  });

  if (isLoading) return <TextInput {...props} source="name" label="Name" />;

  const names = Array.from(
    new Set(stubs?.map((stub) => stub.name).filter(Boolean) || []),
  );

  return (
    <AutocompleteInput
      {...props}
      source="name"
      label="Name"
      choices={names.map((name) => ({ id: name, name }))}
    />
  );
};

// Service Autocomplete Filter
const ServiceFilter = (props: Record<string, unknown>) => {
  const { data: stubs, isLoading } = useGetList<StubRecord>("stubs", {
    pagination: { page: 1, perPage: 1000 },
  });

  if (isLoading) return <TextInput {...props} source="service" label="Service" />;

  // Extract unique services from stubs
  const services = Array.from(
    new Set(stubs?.map((stub) => stub.service).filter(Boolean) || []),
  );

  return (
    <AutocompleteInput
      {...props}
      source="service"
      label="Service"
      choices={services.map((service) => ({ id: service, name: service }))}
    />
  );
};

// Method Autocomplete Filter
const MethodFilter = (props: Record<string, unknown>) => {
  const { data: stubs, isLoading } = useGetList<StubRecord>("stubs", {
    pagination: { page: 1, perPage: 1000 },
  });

  if (isLoading) return <TextInput {...props} source="method" label="Method" />;

  // Extract unique methods from stubs
  const methods = Array.from(
    new Set(stubs?.map((stub) => stub.method).filter(Boolean) || []),
  );

  return (
    <AutocompleteInput
      {...props}
      source="method"
      label="Method"
      choices={methods.map((method) => ({ id: method, name: method }))}
    />
  );
};

// Filters for stubs
const stubFilters = [
  <NameFilter key="name" source="name" label="Name" />,
  <ServiceFilter key="service" source="service" label="Service" />,
  <MethodFilter key="method" source="method" label="Method" />,
];

const StubListActions = () => (
  <TopToolbar>
    <ExportButton />
    <CreateButton />
  </TopToolbar>
);

// Custom toolbar for used/unused stubs (without create button)
const UsedUnusedStubListActions = () => (
  <TopToolbar>
    <ExportButton />
  </TopToolbar>
);

const CreateStubToolbar = () => (
  <Toolbar
    sx={{
      width: "100%",
      display: "flex",
      justifyContent: "flex-end",
      alignItems: "center",
      height: 72,
      py: 0,
      gap: 2,
      "& .ra-input": {
        my: 0,
      },
      "& .ra-input-enable": {
        my: 0,
        display: "flex",
        alignItems: "center",
        height: "100%",
      },
      "& .MuiFormControlLabel-root": {
        my: 0,
        height: "100%",
        display: "flex",
        alignItems: "center",
      },
      "& .MuiSwitch-root": {
        my: 0,
      },
      "& .MuiFormControlLabel-label": {
        lineHeight: 1,
      },
    }}
  >
    <BooleanInput
      source="enabled"
      label="Enable Stub"
      helperText={false}
      defaultValue
      sx={{ my: 0 }}
    />
    <SaveButton sx={{ ml: 0 }} />
  </Toolbar>
);

const StubsListPage = ({
  actions,
  allowClone,
}: {
  actions: ReactElement;
  allowClone?: boolean;
}) => {
  const gridSize = "small";

  return (
    <List
      filters={stubFilters}
      actions={actions}
      exporter={exportStubs}
      perPage={1000}
      pagination={false}
      sx={stubsListSx}
    >
      <ActiveFiltersSummary />
      <StubsDatagrid
        gridSize={gridSize}
        allowClone={allowClone}
      />
    </List>
  );
};

// Stub List component
export const StubList = () => {
  const session = useActiveSession();
  const sessionExistsInDb = useSessionFromDatabase(session);

  if (!session || !sessionExistsInDb) {
    return (
      <Box p={1.5}>
        <Alert severity="info">
          Select an active session from the database in Session Scope to access the Stubs list.
        </Alert>
      </Box>
    );
  }

  return (
    <StubsListPage
      actions={<StubListActions />}
      allowClone
    />
  );
};

// Used Stubs List component
export const UsedStubList = () => {
  const session = useActiveSession();
  const sessionExistsInDb = useSessionFromDatabase(session);

  if (!session || !sessionExistsInDb) {
    return (
      <Box p={1.5}>
        <Alert severity="info">
          Select an active session from the database in Session Scope to access the Stubs list.
        </Alert>
      </Box>
    );
  }

  return (
    <StubsListPage
      actions={<UsedUnusedStubListActions />}
    />
  );
};

// Unused Stubs List component
export const UnusedStubList = () => {
  const session = useActiveSession();
  const sessionExistsInDb = useSessionFromDatabase(session);

  if (!session || !sessionExistsInDb) {
    return (
      <Box p={1.5}>
        <Alert severity="info">
          Select an active session from the database in Session Scope to access the Stubs list.
        </Alert>
      </Box>
    );
  }

  return (
    <StubsListPage
      actions={<UsedUnusedStubListActions />}
    />
  );
};

// Stub Create component
export const StubCreate = () => {
  return (
    <Create redirect="list">
      <SimpleForm
        toolbar={<CreateStubToolbar />}
        transform={normalizeStubDelay}
        defaultValues={{
          output: DEFAULT_OUTPUT_TEMPLATE,
        }}
        sx={{
          height: "100%",
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          gap: 1,
        }}
      >
        <Box
          sx={{
            width: "100%",
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(220px, 320px))" },
            gap: 2,
            alignItems: "start",
            justifyContent: "start",
          }}
        >
          <TextInput source="name" label="Stub Name" fullWidth />
          <TextInput source="service" fullWidth />
          <TextInput source="method" fullWidth />
        </Box>
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            width: "100%",
            display: "grid",
            gridTemplateRows: "auto 1fr",
            gap: 1,
          }}
        >
        <Box
          sx={{
            width: "100%",
            border: "1px solid",
            borderColor: "divider",
            borderRadius: RADIUS_PX,
            p: 1.5,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            alignSelf: "start",
          }}
        >
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
              mode="create"
              minRows={8}
            />
          </Box>
        </Box>
        <Box
          sx={{
            width: "100%",
            border: "1px solid",
            borderColor: "divider",
            borderRadius: RADIUS_PX,
            p: 1.5,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            alignSelf: "start",
          }}
        >
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
      </SimpleForm>
    </Create>
  );
};

// Stub Edit component
export const StubEdit = () => {
  return (
    <Edit>
      <SimpleForm
        transform={normalizeStubDelay}
        sx={{
          height: "100%",
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          gap: 1,
        }}
      >
        <TextInput source="id" fullWidth disabled />
        <Box
          sx={{
            width: "100%",
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(220px, 320px))" },
            gap: 2,
            alignItems: "start",
            justifyContent: "start",
          }}
        >
          <TextInput source="name" label="Stub Name" fullWidth />
          <TextInput source="service" fullWidth />
          <TextInput source="method" fullWidth />
        </Box>
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            width: "100%",
            display: "grid",
            gridTemplateRows: "auto 1fr",
            gap: 1,
          }}
        >
        <Box
          sx={{
            width: "100%",
            border: "1px solid",
            borderColor: "divider",
            borderRadius: RADIUS_PX,
            p: 1.5,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
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
              mode="edit"
              minRows={8}
            />
          </Box>
        </Box>
        <Box
          sx={{
            width: "100%",
            border: "1px solid",
            borderColor: "divider",
            borderRadius: RADIUS_PX,
            p: 1.5,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <Box sx={{ width: "100%", fontSize: 16, fontWeight: 600, color: "#FF6C37", mb: 1 }}>
            Response Stub
          </Box>
          <Box
            sx={{
              width: "100%",
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(220px, 320px))" },
              gap: 2,
              alignItems: "start",
              justifyContent: "start",
            }}
          >
            <BooleanInput source="enabled" fullWidth />
            <NumberInput
              source="output.code"
              label="gRPC status code"
              min={0}
              max={16}
              step={1}
              helperText="Optional status code (0..16). Use non-zero with error responses."
              fullWidth
            />
          </Box>
          <Box
            sx={{
              width: "100%",
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(220px, 420px))" },
              gap: 2,
              alignItems: "start",
              justifyContent: "start",
            }}
          >
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
      </SimpleForm>
    </Edit>
  );
};

// Stub Show component
export const StubShow = () => {
  const jsonTheme = useJsonTheme();

  return (
    <Show>
      <SimpleShowLayout>
        <TextField source="id" />
        <TextField source="name" />
        <TextField source="service" />
        <TextField source="method" />
        <BooleanField source="enabled" />
        <NumberField source="options.times" label="times" />
        <BooleanField
          source="input.ignoreArrayOrder"
          label="ignoreArrayOrder"
        />
        <JsonField source="headers" reactJsonOptions={{ theme: jsonTheme }} />
        <JsonField source="input" reactJsonOptions={{ theme: jsonTheme }} />
        <JsonField source="inputs" reactJsonOptions={{ theme: jsonTheme }} />
        <JsonField source="output" reactJsonOptions={{ theme: jsonTheme }} />
      </SimpleShowLayout>
    </Show>
  );
};
