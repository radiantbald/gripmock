import {
  Datagrid,
  List,
  SearchInput,
  TextField,
  TopToolbar,
  ExportButton,
} from "react-admin";

import { listContentSx } from "./components/table/listStyles";
import { ActiveFiltersSummary } from "./components/table/ActiveFiltersSummary";

const ClientsListActions = () => (
  <TopToolbar>
    <ExportButton />
  </TopToolbar>
);

const clientsFilters = [
  <SearchInput key="search" source="q" placeholder="Search clients..." alwaysOn />,
];

export const ClientsList = () => {
  const gridSize = "small";
  const gridDensitySx = {
    "& .RaDatagrid-rowCell": { py: 0.35, fontSize: 12 },
    "& .RaDatagrid-headerCell": { py: 0.65 },
  };

  return (
    <List
      filters={clientsFilters}
      actions={<ClientsListActions />}
      filterDefaultValues={{ q: "" }}
      perPage={25}
      sx={listContentSx}
    >
      <ActiveFiltersSummary />
      <Datagrid bulkActionButtons={false} size={gridSize} sx={gridDensitySx}>
        <TextField source="client" sortable />
        <TextField source="session" sortable />
      </Datagrid>
    </List>
  );
};
