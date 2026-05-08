import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import { Box, IconButton, Tooltip } from "@mui/material";
import { useState } from "react";
import { useCreatePath, useDataProvider, useNotify, useRecordContext, useRefresh } from "react-admin";
import { Link as RouterLink } from "react-router-dom";

import type { StubRecord } from "../../../types/entities";

const CLONE_SUFFIX = " (clone)";
const ACTION_ICON_SX = { fontSize: 18 } as const;
const ACTION_BUTTON_SX = {
  color: "text.secondary",
  "&:hover": {
    backgroundColor: "transparent",
    color: "#FF6C37",
  },
  "&.Mui-focusVisible": {
    backgroundColor: "transparent",
    color: "#FF6C37",
  },
} as const;

const buildCloneName = (name: unknown): string => {
  const normalizedName = typeof name === "string" ? name.trim() : "";
  if (!normalizedName) {
    return CLONE_SUFFIX.trim();
  }

  return normalizedName.endsWith(CLONE_SUFFIX) ? normalizedName : `${normalizedName}${CLONE_SUFFIX}`;
};

const buildClonePayload = (record: StubRecord) => ({
  name: buildCloneName(record?.name),
  service: record?.service,
  method: record?.method,
  enabled: record?.enabled,
  headers: record?.headers,
  input: record?.input,
  inputs: record?.inputs,
  output: record?.output,
  options: record?.options,
});

export const RowActionsField = ({
  allowClone = false,
}: {
  allowClone?: boolean;
}) => {
  const record = useRecordContext<StubRecord>();
  const createPath = useCreatePath();
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();
  const [isCloning, setIsCloning] = useState(false);

  if (!record?.id) {
    return null;
  }

  const editPath = createPath({ resource: "stubs", type: "edit", id: record.id });
  const handleClone = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (isCloning) {
      return;
    }

    try {
      setIsCloning(true);
      await dataProvider.create("stubs", { data: buildClonePayload(record) });
      notify("Stub cloned", { type: "success" });
      refresh();
    } catch (error) {
      notify((error as Error).message, { type: "error" });
    } finally {
      setIsCloning(false);
    }
  };

  return (
    <Box display="flex" alignItems="center" gap={0.5}>
      {allowClone ? (
        <Tooltip title="Clone stub">
          <IconButton
            size="small"
            onClick={handleClone}
            disabled={isCloning}
            sx={ACTION_BUTTON_SX}
          >
            <ContentCopyOutlinedIcon sx={ACTION_ICON_SX} />
          </IconButton>
        </Tooltip>
      ) : null}
      <Tooltip title="Edit stub">
        <IconButton
          size="small"
          component={RouterLink}
          to={editPath}
          onClick={(event) => event.stopPropagation()}
          sx={ACTION_BUTTON_SX}
        >
          <EditOutlinedIcon sx={ACTION_ICON_SX} />
        </IconButton>
      </Tooltip>
    </Box>
  );
};
