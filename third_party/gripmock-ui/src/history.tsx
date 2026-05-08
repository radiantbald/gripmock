import {
  Datagrid,
  FunctionField,
  List,
  SearchInput,
  TextField,
  TopToolbar,
  ExportButton,
} from "react-admin";
import { listContentSx } from "./components/table/listStyles";
import { ActiveFiltersSummary } from "./components/table/ActiveFiltersSummary";
import type { HistoryRecord } from "./types/entities";
import {
  ErrorChipField,
  HistoryDetails,
  RequestPreviewField,
} from "./features/history/components/HistoryFields";

const historyFilters = [
  <SearchInput
    key="search"
    source="q"
    alwaysOn
    placeholder="Search calls..."
  />,
];

const HistoryActions = () => (
  <TopToolbar>
    <ExportButton />
  </TopToolbar>
);

export const HistoryList = () => {
  const gridSize = "small";
  const gridDensitySx = {
    "& .RaDatagrid-rowCell": { py: 0.35, fontSize: 12 },
    "& .RaDatagrid-headerCell": { py: 0.65 },
  };

  return (
    <List
      filters={historyFilters}
      actions={<HistoryActions />}
      perPage={25}
      sx={listContentSx}
    >
      <ActiveFiltersSummary />
      <Datagrid
        expand={<HistoryDetails />}
        bulkActionButtons={false}
        size={gridSize}
        rowClick="expand"
        expandSingle
        sx={gridDensitySx}
      >
        <TextField source="service" />
        <TextField source="method" />
        <TextField source="stubId" />
        <TextField source="timestamp" />
        <ErrorChipField />
        <FunctionField
          label="request"
          render={(record: HistoryRecord) => <RequestPreviewField record={record} />}
        />
      </Datagrid>
    </List>
  );
};
