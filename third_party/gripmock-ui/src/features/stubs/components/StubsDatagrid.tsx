import { Typography } from "@mui/material";
import { BooleanField, Datagrid, FunctionField, NumberField, TextField, useRecordContext } from "react-admin";

import type { StubRecord } from "../../../types/entities";
import { RowActionsField } from "./RowActionsField";
import { MatcherField, OutputKindField, StubDetails } from "./StubVisuals";

const IdField = () => {
  const record = useRecordContext<StubRecord>();

  if (!record?.id) return <span>-</span>;

  return (
    <Typography
      variant="body2"
      sx={{
        fontFamily: "monospace",
        fontSize: "0.8rem",
      }}
    >
      {record.id}
    </Typography>
  );
};

export const StubsDatagrid = ({
  gridSize,
  allowDelete,
  allowClone,
}: {
  gridSize: "small" | "medium";
  allowDelete?: boolean;
  allowClone?: boolean;
}) => (
  <Datagrid
    rowClick="expand"
    expandSingle
    bulkActionButtons={false}
    expand={<StubDetails />}
    size={gridSize}
    sx={
      gridSize === "small"
        ? {
            "& .RaDatagrid-rowCell": {
              py: 0.35,
              fontSize: 12,
            },
            "& .RaDatagrid-headerCell": {
              py: 0.65,
            },
          }
        : {
            "& .RaDatagrid-rowCell": {
              py: 1.15,
              fontSize: 14,
            },
            "& .RaDatagrid-headerCell": {
              py: 1.1,
            },
          }
    }
  >
    <IdField />
    <TextField source="service" sortable />
    <TextField source="method" sortable />
    <TextField source="priority" sortable />
    <NumberField source="options.times" label="times" sortable />
    <BooleanField source="input.ignoreArrayOrder" label="unordered" />
    <FunctionField label="matcher" render={() => <MatcherField />} />
    <FunctionField label="output" render={() => <OutputKindField />} />
    <FunctionField
      label="actions"
      render={() => (
        <RowActionsField allowDelete={allowDelete} allowClone={allowClone} />
      )}
    />
  </Datagrid>
);
