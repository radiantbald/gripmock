import {
  Datagrid,
  List,
  TextField,
  SearchInput,
  FilterButton,
  TopToolbar,
  ExportButton,
} from "react-admin";
import { listContentSx } from "./components/table/listStyles";
import { ActiveFiltersSummary } from "./components/table/ActiveFiltersSummary";
import { ServiceDetails } from "./features/services/components/ServiceDetails";
import {
  MethodsCountField,
  MethodsField,
  ServiceDeleteField,
} from "./features/services/components/ServiceFields";

// Custom toolbar
const ServiceListActions = () => (
  <TopToolbar>
    <FilterButton />
    <ExportButton />
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
  const gridSize = "small";
  const gridDensitySx = {
    "& .RaDatagrid-rowCell": { py: 0.35, fontSize: 12 },
    "& .RaDatagrid-headerCell": { py: 0.65 },
  };

  return (
    <List
      filters={serviceFilters}
      actions={<ServiceListActions />}
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
