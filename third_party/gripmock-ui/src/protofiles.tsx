import {
  Datagrid,
  DateField,
  List,
  NumberField,
  SearchInput,
  TextField,
  TopToolbar,
  ExportButton,
} from "react-admin";

import { listContentSx } from "./components/table/listStyles";
import { ActiveFiltersSummary } from "./components/table/ActiveFiltersSummary";

const ProtofilesListActions = () => (
  <TopToolbar>
    <ExportButton />
  </TopToolbar>
);

const protofilesFilters = [
  <SearchInput key="search" source="q" placeholder="Search proto files..." alwaysOn />,
];

export const ProtofilesList = () => {
  const gridSize = "small";
  const gridDensitySx = {
    "& .RaDatagrid-rowCell": { py: 0.35, fontSize: 12 },
    "& .RaDatagrid-headerCell": { py: 0.65 },
  };

  return (
    <List
      filters={protofilesFilters}
      actions={<ProtofilesListActions />}
      filterDefaultValues={{ q: "" }}
      perPage={25}
      sx={listContentSx}
    >
      <ActiveFiltersSummary />
      <Datagrid bulkActionButtons={false} size={gridSize} sx={gridDensitySx}>
        <TextField source="name" sortable />
        <NumberField source="version" sortable />
        <TextField source="source" sortable />
        <TextField source="hash" sortable />
        <DateField source="updatedAt" showTime sortable />
        <DateField source="createdAt" showTime sortable />
      </Datagrid>
    </List>
  );
};
