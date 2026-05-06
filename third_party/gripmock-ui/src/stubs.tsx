import { Box } from "@mui/material";
import {
  List,
  TextField,
  Create,
  Edit,
  SimpleForm,
  TextInput,
  NumberInput,
  NumberField,
  BooleanField,
  Show,
  SimpleShowLayout,
  SearchInput,
  FilterButton,
  TopToolbar,
  ExportButton,
  CreateButton,
  AutocompleteInput,
  useGetList,
} from "react-admin";
import { JsonField } from "./components/json/JsonField";
import { JsonTextAreaInput } from "./components/json/JsonTextAreaInput";
import { KeyValueTableInput } from "./components/json/KeyValueTableInput";
import { StubMatcherInput } from "./components/json/StubMatcherInput";
import { useState } from "react";
import type { ReactElement } from "react";

import { useJsonTheme } from "./utils/jsonTheme";
import { downloadJsonFile } from "./utils/fileDownload";
import {
  readGridDensity as readStoredGridDensity,
  writeGridDensity,
  type GridDensity,
} from "./utils/uiPreferences";
import { DensityToolbarControl } from "./components/table/DensityToolbarControl";
import { listContentSx } from "./components/table/listStyles";
import { ActiveFiltersSummary } from "./components/table/ActiveFiltersSummary";
import type { StubRecord } from "./types/entities";
import { StubsDatagrid } from "./features/stubs/components/StubsDatagrid";

// Export function for stubs list
const exportStubs = (stubs: object[]) => {
  downloadJsonFile(stubs, "stubs-export.json");
};

const STUB_GRID_DENSITY_KEY = "gripmock.ui.stubs.density";

const readStubsGridDensity = (): GridDensity => {
  return readStoredGridDensity(STUB_GRID_DENSITY_KEY);
};

const useGridDensity = () => {
  const [density, setDensity] = useState<GridDensity>(() => readStubsGridDensity());

  const setNextDensity = (next: GridDensity) => {
    setDensity(next);
    writeGridDensity(STUB_GRID_DENSITY_KEY, next);
  };

  return { density, setNextDensity };
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
  <SearchInput
    key="search"
    source="q"
    placeholder="Search stubs..."
    alwaysOn
  />,
  <ServiceFilter key="service" source="service" label="Service" />,
  <MethodFilter key="method" source="method" label="Method" />,
];

const StubListActions = ({
  density,
  onDensityChange,
}: {
  density: GridDensity;
  onDensityChange: (next: GridDensity) => void;
}) => (
  <TopToolbar>
    <FilterButton />
    <ExportButton />
    <CreateButton />
    <DensityToolbarControl density={density} onChange={onDensityChange} />
  </TopToolbar>
);

// Custom toolbar for used/unused stubs (without create button)
const UsedUnusedStubListActions = ({
  density,
  onDensityChange,
}: {
  density: GridDensity;
  onDensityChange: (next: GridDensity) => void;
}) => (
  <TopToolbar>
    <FilterButton />
    <ExportButton />
    <DensityToolbarControl density={density} onChange={onDensityChange} />
  </TopToolbar>
);

const StubsListPage = ({
  actions,
  density,
  allowDelete,
  allowClone,
}: {
  actions: ReactElement;
  density: GridDensity;
  allowDelete?: boolean;
  allowClone?: boolean;
}) => {
  const gridSize = density === "compact" ? "small" : "medium";

  return (
    <List
      filters={stubFilters}
      actions={actions}
      exporter={exportStubs}
      filterDefaultValues={{ q: "" }}
      perPage={25}
      sx={listContentSx}
    >
      <ActiveFiltersSummary />
      <StubsDatagrid
        gridSize={gridSize}
        allowDelete={allowDelete}
        allowClone={allowClone}
      />
    </List>
  );
};

// Stub List component
export const StubList = () => {
  const { density, setNextDensity } = useGridDensity();

  return (
    <StubsListPage
      actions={<StubListActions density={density} onDensityChange={setNextDensity} />}
      density={density}
      allowDelete
      allowClone
    />
  );
};

// Used Stubs List component
export const UsedStubList = () => {
  const { density, setNextDensity } = useGridDensity();

  return (
    <StubsListPage
      actions={
        <UsedUnusedStubListActions
          density={density}
          onDensityChange={setNextDensity}
        />
      }
      density={density}
    />
  );
};

// Unused Stubs List component
export const UnusedStubList = () => {
  const { density, setNextDensity } = useGridDensity();

  return (
    <StubsListPage
      actions={
        <UsedUnusedStubListActions
          density={density}
          onDensityChange={setNextDensity}
        />
      }
      density={density}
    />
  );
};

// Stub Create component
export const StubCreate = () => {
  return (
    <Create>
      <SimpleForm
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
            gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(280px, 420px))" },
            gap: 2,
            alignItems: "start",
            justifyContent: "start",
          }}
        >
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
            borderRadius: 1.5,
            p: 1.5,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            alignSelf: "start",
          }}
        >
          <Box sx={{ width: "100%", fontSize: 16, fontWeight: 600, color: "primary.main", mb: 1 }}>
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
              source="headers"
              label="Request headers"
              helperText="Matcher for incoming request metadata."
              maxTableHeight={140}
            />
            <StubMatcherInput mode="create" minRows={8} />
          </Box>
        </Box>
        <Box
          sx={{
            width: "100%",
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 1.5,
            p: 1.5,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            alignSelf: "start",
          }}
        >
          <Box sx={{ width: "100%", fontSize: 16, fontWeight: 600, color: "primary.main", mb: 1 }}>
            Response Stub
          </Box>
          <Box
            sx={{
              width: "100%",
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "minmax(220px, 320px)" },
              gap: 2,
              alignItems: "start",
              justifyContent: "start",
            }}
          >
            <NumberInput source="priority" fullWidth />
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
              label="Output"
              minRows={8}
            />
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
            gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(280px, 420px))" },
            gap: 2,
            alignItems: "start",
            justifyContent: "start",
          }}
        >
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
            borderRadius: 1.5,
            p: 1.5,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <Box sx={{ width: "100%", fontSize: 16, fontWeight: 600, color: "primary.main", mb: 1 }}>
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
              source="headers"
              label="Request headers"
              helperText="Matcher for incoming request metadata."
              maxTableHeight={140}
            />
            <StubMatcherInput mode="edit" minRows={8} />
          </Box>
        </Box>
        <Box
          sx={{
            width: "100%",
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 1.5,
            p: 1.5,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <Box sx={{ width: "100%", fontSize: 16, fontWeight: 600, color: "primary.main", mb: 1 }}>
            Response Stub
          </Box>
          <Box
            sx={{
              width: "100%",
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "minmax(220px, 320px)" },
              gap: 2,
              alignItems: "start",
              justifyContent: "start",
            }}
          >
            <NumberInput source="priority" fullWidth />
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
              label="Output"
              minRows={8}
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
        <TextField source="service" />
        <TextField source="method" />
        <TextField source="priority" />
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
