import {
  Datagrid,
  FunctionField,
  List,
  SearchInput,
  TextField,
  TopToolbar,
  FilterButton,
  ExportButton,
} from "react-admin";
import { useState } from "react";

import { readGridDensity, writeGridDensity, type GridDensity } from "./utils/uiPreferences";
import { DensityToolbarControl } from "./components/table/DensityToolbarControl";
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

const HISTORY_GRID_DENSITY_KEY = "gripmock.ui.history.density";

const HistoryActions = ({
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

export const HistoryList = () => {
  const [density, setDensity] = useState<GridDensity>(() =>
    readGridDensity(HISTORY_GRID_DENSITY_KEY),
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
      filters={historyFilters}
      actions={
        <HistoryActions
          density={density}
          onDensityChange={(next) => {
            setDensity(next);
            writeGridDensity(HISTORY_GRID_DENSITY_KEY, next);
          }}
        />
      }
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
