import {
  Datagrid,
  List,
  TextField,
  SearchInput,
  FilterButton,
  TopToolbar,
  ExportButton,
} from "react-admin";
import { useState } from "react";
import { readGridDensity, writeGridDensity, type GridDensity } from "./utils/uiPreferences";
import { DensityToolbarControl } from "./components/table/DensityToolbarControl";
import { listContentSx } from "./components/table/listStyles";
import { ActiveFiltersSummary } from "./components/table/ActiveFiltersSummary";
import { ServiceDetails } from "./features/services/components/ServiceDetails";
import {
  MethodsCountField,
  MethodsField,
  ServiceDeleteField,
} from "./features/services/components/ServiceFields";

// Custom toolbar
const SERVICES_GRID_DENSITY_KEY = "gripmock.ui.services.density";

const ServiceListActions = ({
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

// Filters
const serviceFilters = [
  <SearchInput
    key="search"
    source="q"
    placeholder="Search services..."
    alwaysOn
  />,
];

// Service List component
export const ServiceList = () => {
  const [density, setDensity] = useState<GridDensity>(() =>
    readGridDensity(SERVICES_GRID_DENSITY_KEY),
  );
  const gridSize = density === "compact" ? "small" : "medium";
  const gridDensitySx =
    gridSize === "small"
      ? {
          "& .RaDatagrid-rowCell": { py: 0.35, fontSize: 12 },
          "& .RaDatagrid-headerCell": { py: 0.65 },
        }
      : {
          "& .RaDatagrid-rowCell": { py: 1.15, fontSize: 14 },
          "& .RaDatagrid-headerCell": { py: 1.1 },
        };

  return (
    <List
      filters={serviceFilters}
      actions={
        <ServiceListActions
          density={density}
          onDensityChange={(next) => {
            setDensity(next);
            writeGridDensity(SERVICES_GRID_DENSITY_KEY, next);
          }}
        />
      }
      filterDefaultValues={{ q: "" }}
      perPage={25}
      sx={listContentSx}
    >
      <ActiveFiltersSummary />
      <Datagrid
        rowClick="expand"
        expandSingle
        bulkActionButtons={false}
        expand={<ServiceDetails />}
        size={gridSize}
        sx={gridDensitySx}
      >
        <TextField source="id" sortable />
        <TextField source="package" sortable />
        <TextField source="name" sortable />
        <MethodsCountField />
        <MethodsField />
        <ServiceDeleteField />
      </Datagrid>
    </List>
  );
};
