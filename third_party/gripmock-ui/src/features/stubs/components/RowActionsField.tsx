import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { Box, IconButton, Tooltip } from "@mui/material";
import { useCreatePath, useDelete, useNotify, useRecordContext, useRefresh } from "react-admin";
import { Link as RouterLink } from "react-router-dom";

import type { StubRecord } from "../../../types/entities";

const buildClonePayload = (record: StubRecord) => ({
  service: record?.service,
  method: record?.method,
  priority: record?.priority,
  headers: record?.headers,
  input: record?.input,
  inputs: record?.inputs,
  output: record?.output,
  options: record?.options,
});

export const RowActionsField = ({
  allowDelete = false,
  allowClone = false,
}: {
  allowDelete?: boolean;
  allowClone?: boolean;
}) => {
  const record = useRecordContext<StubRecord>();
  const notify = useNotify();
  const refresh = useRefresh();
  const createPath = useCreatePath();
  const [deleteOne, { isPending }] = useDelete();

  if (!record?.id) {
    return null;
  }

  const showPath = createPath({ resource: "stubs", type: "show", id: record.id });
  const clonePath = `${createPath({ resource: "stubs", type: "create" })}?source=${encodeURIComponent(
    JSON.stringify(buildClonePayload(record)),
  )}`;

  return (
    <Box display="flex" alignItems="center" gap={0.5}>
      {allowClone ? (
        <Tooltip title="Clone stub">
          <IconButton
            size="small"
            component={RouterLink}
            to={clonePath}
            onClick={(event) => event.stopPropagation()}
          >
            <ContentCopyIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ) : null}
      <Tooltip title="Open full details">
        <IconButton
          size="small"
          component={RouterLink}
          to={showPath}
          onClick={(event) => event.stopPropagation()}
        >
          <OpenInNewIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      {allowDelete ? (
        <Tooltip title="Delete stub">
          <IconButton
            size="small"
            color="error"
            disabled={isPending}
            onClick={async (event) => {
              event.stopPropagation();
              try {
                await deleteOne("stubs", {
                  id: record.id,
                  previousData: record,
                });
                notify("Stub deleted", { type: "success" });
                refresh();
              } catch (error) {
                notify((error as Error).message, { type: "error" });
              }
            }}
          >
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ) : null}
    </Box>
  );
};
