import {
  Datagrid,
  FunctionField,
  List,
  TextField,
  useGetList,
  useNotify,
  useRecordContext,
  useRefresh,
} from "react-admin";
import SaveIcon from "@mui/icons-material/Save";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { alpha, Box, IconButton, MenuItem, Select, TextField as MuiTextField, Tooltip, Typography, type SelectChangeEvent } from "@mui/material";
import { useEffect, useMemo, useState } from "react";

import { listContentSx } from "./components/table/listStyles";
import { ActiveFiltersSummary } from "./components/table/ActiveFiltersSummary";
import { apiClient } from "./dataProvider/apiClient";
import { resolveRoomRow, type RoomRow } from "./features/room/model";

type ClientRecord = {
  id: number;
  peerHost?: string;
  room?: string;
  name?: string;
  user?: string;
  userAgent?: string;
};

const formatRoomOptionLabel = (room: { id: string; name: string }): string => {
  const roomID = String(room.id || "").trim();
  const roomName = String(room.name || "").trim();
  return roomName ? `#${roomID} ${roomName}` : `#${roomID}`;
};


const unifiedControlBaseSx = {
  width: "100%",
  minWidth: 220,
  maxWidth: 220,
  position: "relative",
  "& .MuiInputBase-root": {
    minHeight: 30,
    height: 30,
    fontSize: 12,
    fontWeight: 500,
    lineHeight: 1.3,
    borderRadius: 1,
    bgcolor: alpha("#ffffff", 0.03),
    alignItems: "center",
  },
  "& .MuiOutlinedInput-notchedOutline": {
    borderColor: alpha("#ffffff", 0.16),
  },
  "& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline": {
    borderColor: alpha("#ffffff", 0.28),
  },
  "& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline": {
    borderColor: "#FF6C37",
    borderWidth: 2,
  },
} as const;

const roomSelectSx = {
  width: "fit-content",
  maxWidth: "100%",
  minWidth: 0,
  display: "inline-flex",
  color: "#FF6C37",
  backgroundColor: "transparent !important",
  boxShadow: "none",
  "&, &.MuiInputBase-root, &.MuiOutlinedInput-root": {
    backgroundColor: "transparent !important",
    boxShadow: "none",
    borderRadius: 0,
    color: "#FF6C37",
    fontSize: "12px",
    fontWeight: 700,
    letterSpacing: 0.15,
    lineHeight: 1.4,
    transition: "color 120ms ease",
  },
  "&:hover, &.Mui-focused": {
    color: "#FF6C37",
    backgroundColor: "transparent !important",
  },
  "&::before, &::after": {
    borderBottom: "none !important",
  },
  "&:hover:not(.Mui-disabled)::before": {
    borderBottom: "none !important",
  },
  "& fieldset, & .MuiOutlinedInput-notchedOutline": {
    border: "none !important",
  },
  "&:hover fieldset, &.Mui-focused fieldset": {
    border: "none !important",
  },
  "& .MuiSelect-select": {
    width: "auto",
    minWidth: 0,
    maxWidth: "100%",
    padding: "0 20px 0 0 !important",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "flex-start",
    height: 30,
    fontSize: "12px",
    fontWeight: 500,
    lineHeight: "30px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: "#FF6C37 !important",
    backgroundColor: "transparent !important",
    boxShadow: "none",
  },
  "& .MuiSelect-select:focus": {
    backgroundColor: "transparent !important",
  },
  "& .MuiSelect-icon": {
    right: 0,
    color: "currentColor",
    fontSize: 16,
    transition: "color 120ms ease, transform 120ms ease",
  },
  "& .MuiSelect-iconOpen": { transform: "rotate(180deg)" },
} as const;

const saveIconButtonSx = {
  color: "primary.main",
  width: 24,
  height: 24,
  "& .MuiSvgIcon-root": {
    fontSize: 16,
  },
} as const;

const saveIconSlotSx = {
  width: 24,
  height: 24,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
} as const;

const deleteRowActionButtonSx = {
  color: "text.disabled",
  width: 24,
  height: 24,
  "& .MuiSvgIcon-root": {
    fontSize: 16,
  },
  "&:hover": {
    color: "error.main",
    backgroundColor: "transparent",
  },
  "&.Mui-focusVisible": {
    color: "error.main",
    backgroundColor: "transparent",
  },
} as const;

const rowControlContainerSx = {
  display: "flex",
  width: "100%",
  justifyContent: "flex-start",
  alignItems: "center",
  gap: 1,
  height: 30,
  minHeight: 30,
  my: "auto",
} as const;

const clientNameInputSx = {
  ...unifiedControlBaseSx,
  m: 0,
  alignSelf: "center",
  "& .MuiInputBase-root": {
    backgroundColor: "transparent !important",
    boxShadow: "none",
  },
  "& .MuiOutlinedInput-notchedOutline": {
    border: "none !important",
  },
  "& .MuiOutlinedInput-root": {
    "&:hover .MuiOutlinedInput-notchedOutline": {
      border: "none !important",
    },
    "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
      border: "none !important",
    },
  },
  "& .MuiInputBase-input": {
    py: 0.4,
    px: 0,
    fontSize: "12px",
    fontWeight: 500,
    lineHeight: 1.3,
    letterSpacing: 0,
    fontFamily: "inherit",
    overflow: "hidden",
    textOverflow: "ellipsis",
    color: "#FF6C37",
    "&::placeholder": {
      opacity: 1,
      color: "text.secondary",
    },
  },
} as const;

const ClientRoomChangeCell = ({
  roomChoices,
  onSaved,
}: {
  roomChoices: Array<{ id: string; name: string }>;
  onSaved: () => void;
}) => {
  const record = useRecordContext<ClientRecord>();
  const notify = useNotify();
  const [selectedRoom, setSelectedRoom] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSelectedRoom(String(record?.room || "").trim());
  }, [record?.room]);

  if (!record) {
    return null;
  }

  const clientID = record.id;
  const currentRoom = String(record.room || "").trim();
  const hasRoomChoices = roomChoices.length > 0;
  const selectedRoomExists = roomChoices.some((item) => item.id === selectedRoom);
  const canApply =
    hasRoomChoices &&
    Number.isInteger(clientID) &&
    clientID > 0 &&
    selectedRoom.length > 0 &&
    selectedRoomExists &&
    selectedRoom !== currentRoom &&
    !saving;

  const applyRoomViaClientsAPI = async () => {
    if (!canApply) {
      return;
    }

    setSaving(true);
    try {
      await apiClient.request(`/clients?client=${encodeURIComponent(String(clientID))}`, {
        method: "PATCH",
        skipRoomHeader: true,
        body: JSON.stringify({
          room: selectedRoom,
        }),
      });
      notify(`Client ${clientID} moved to room ${selectedRoom}`, { type: "success" });
      onSaved();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Failed to move client to room", { type: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={rowControlContainerSx}>
      <Select
        size="small"
        variant="outlined"
        value={selectedRoom}
        displayEmpty
        onChange={(event: SelectChangeEvent) => setSelectedRoom(event.target.value)}
        sx={roomSelectSx}
        disabled={saving || !hasRoomChoices}
      >
        {roomChoices.map((item) => (
          <MenuItem key={item.id} value={item.id}>
            <Typography variant="body2" noWrap sx={{ fontSize: "12px" }}>
              {formatRoomOptionLabel(item)}
            </Typography>
          </MenuItem>
        ))}
      </Select>
      {canApply ? (
        <Box sx={saveIconSlotSx}>
          <Tooltip title="Apply room change">
            <IconButton
              size="small"
              sx={saveIconButtonSx}
              onClick={() => {
                void applyRoomViaClientsAPI();
              }}
            >
              <SaveIcon />
            </IconButton>
          </Tooltip>
        </Box>
      ) : (
        <Box sx={saveIconSlotSx} />
      )}
    </Box>
  );
};

const ClientNameCell = ({
  onSaved,
}: {
  onSaved: () => void;
}) => {
  const record = useRecordContext<ClientRecord>();
  const notify = useNotify();
  const [draftName, setDraftName] = useState("");
  const [saving, setSaving] = useState(false);

  const clientID = record?.id ?? 0;
  const currentName = String(record?.name || "").trim();

  useEffect(() => {
    setDraftName(currentName);
  }, [currentName]);

  if (!record || !Number.isInteger(clientID) || clientID <= 0) {
    return null;
  }

  const normalizedDraft = draftName.trim();
  const normalizedCurrent = currentName.trim();
  const hasChanges = normalizedDraft !== normalizedCurrent && !saving;

  const saveName = async () => {
    setSaving(true);
    try {
      await apiClient.request(`/clients?client=${encodeURIComponent(String(clientID))}`, {
        method: "PATCH",
        skipRoomHeader: true,
        body: JSON.stringify({
          name: normalizedDraft,
        }),
      });
      notify(`Name saved for client ${clientID}`, { type: "success" });
      onSaved();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Failed to save client name", { type: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={rowControlContainerSx}>
      <MuiTextField
        size="small"
        variant="outlined"
        value={draftName}
        placeholder="Client name"
        disabled={saving}
        onChange={(event) => setDraftName(event.target.value)}
        sx={clientNameInputSx}
      />
      {hasChanges ? (
        <Box sx={saveIconSlotSx}>
          <Tooltip title="Save name">
            <IconButton
              size="small"
              sx={saveIconButtonSx}
              onClick={() => {
                void saveName();
              }}
            >
              <SaveIcon />
            </IconButton>
          </Tooltip>
        </Box>
      ) : (
        <Box sx={saveIconSlotSx} />
      )}
    </Box>
  );
};

const ClientDeleteActionCell = ({ onDeleted }: { onDeleted: () => void }) => {
  const record = useRecordContext<ClientRecord>();
  const notify = useNotify();
  const [deleting, setDeleting] = useState(false);
  const clientID = record?.id ?? 0;

  if (!record || !Number.isInteger(clientID) || clientID <= 0) {
    return null;
  }

  return (
    <Box className="client-row-delete-action" sx={{ display: "inline-flex", alignItems: "center" }}>
      <Tooltip title="Delete client">
        <IconButton
          size="small"
          sx={deleteRowActionButtonSx}
          disabled={deleting}
          onClick={async (event) => {
            event.stopPropagation();
            setDeleting(true);
            try {
              await apiClient.request(`/clients?client=${encodeURIComponent(String(clientID))}`, {
                method: "DELETE",
                skipRoomHeader: true,
              });
              notify(`Client ${clientID} deleted`, { type: "success" });
              onDeleted();
            } catch (error) {
              notify(error instanceof Error ? error.message : "Failed to delete client", { type: "error" });
            } finally {
              setDeleting(false);
            }
          }}
          aria-label={`Delete client ${clientID}`}
        >
          <DeleteOutlineIcon />
        </IconButton>
      </Tooltip>
    </Box>
  );
};

export const ClientsList = () => {
  const refresh = useRefresh();
  const gridSize = "small";
  const gridDensitySx = {
    "& .RaDatagrid-table": {
      tableLayout: "fixed",
      width: "100%",
    },
    "& .RaDatagrid-headerCell": {
      py: 0.4,
      fontSize: "12px",
      textAlign: "left",
    },
    "& .RaDatagrid-headerCell .MuiTableSortLabel-root": {
      justifyContent: "flex-start",
    },
    "& .RaDatagrid-tbody .MuiTableRow-root": {
      height: 30,
      maxHeight: 30,
    },
    "& .RaDatagrid-tbody .MuiTableCell-root": {
      height: 30,
      minHeight: 30,
      maxHeight: 30,
      py: 0,
      px: 2,
      fontSize: "12px",
      lineHeight: "16px",
      verticalAlign: "middle",
      textAlign: "left",
      boxSizing: "border-box",
    },
    "& .RaDatagrid-rowCell.column-id, & .RaDatagrid-rowCell.column-peerHost, & .RaDatagrid-rowCell.column-userAgent, & .RaDatagrid-rowCell.column-name, & .RaDatagrid-rowCell.column-room, & .RaDatagrid-rowCell.column-user": {
      textAlign: "left",
    },
    "& .RaDatagrid-rowCell.column-actions": {
      textAlign: "left",
    },
    "& .RaDatagrid-tbody .MuiTableRow-root .client-row-delete-action": {
      opacity: 0,
      pointerEvents: "none",
      transition: "opacity 140ms ease",
    },
    "& .RaDatagrid-tbody .MuiTableRow-root:hover .client-row-delete-action, & .RaDatagrid-tbody .MuiTableRow-root:focus-within .client-row-delete-action": {
      opacity: 1,
      pointerEvents: "auto",
    },
    "& .RaDatagrid-headerCell.column-id, & .RaDatagrid-rowCell.column-id": {
      width: "7%",
      maxWidth: "7%",
    },
    "& .RaDatagrid-headerCell.column-peerHost, & .RaDatagrid-rowCell.column-peerHost": {
      width: "16%",
      maxWidth: "16%",
    },
    "& .RaDatagrid-headerCell.column-userAgent, & .RaDatagrid-rowCell.column-userAgent": {
      width: "24%",
      maxWidth: "24%",
    },
    "& .RaDatagrid-headerCell.column-name, & .RaDatagrid-rowCell.column-name": {
      width: "16%",
      maxWidth: "16%",
    },
    "& .RaDatagrid-headerCell.column-room, & .RaDatagrid-rowCell.column-room": {
      width: "16%",
      maxWidth: "16%",
    },
    "& .RaDatagrid-headerCell.column-user, & .RaDatagrid-rowCell.column-user": {
      width: "17%",
      maxWidth: "17%",
    },
    "& .RaDatagrid-headerCell.column-actions, & .RaDatagrid-rowCell.column-actions": {
      width: 44,
      maxWidth: 44,
      px: 1,
    },
    "& .RaDatagrid-tbody .MuiTableCell-root .RaField, & .RaDatagrid-tbody .MuiTableCell-root .RaField *": {
      fontSize: "12px",
      lineHeight: "16px",
    },
    "& .RaDatagrid-tbody .MuiTableCell-root .RaField-value, & .RaDatagrid-tbody .MuiTableCell-root .MuiTypography-root, & .RaDatagrid-tbody .MuiTableCell-root .MuiInputBase-input, & .RaDatagrid-tbody .MuiTableCell-root .MuiSelect-select": {
      fontSize: "12px !important",
      lineHeight: "16px",
    },
  };
  const refreshClients = () => {
    refresh();
  };

  const { data: rooms = [] } = useGetList<RoomRow>(
    "rooms",
    { pagination: { page: 1, perPage: 1000 } },
    { retry: false, staleTime: 0, refetchOnMount: true, refetchOnWindowFocus: true },
  );
  const roomChoices = useMemo(
    () =>
      rooms
        .map((row) => resolveRoomRow(row))
        .filter((item): item is { id: string; name: string } => item !== null),
    [rooms],
  );

  return (
    <List
      actions={false}
      pagination={false}
      sx={listContentSx}
    >
      <ActiveFiltersSummary />
      <Datagrid bulkActionButtons={false} size={gridSize} sx={gridDensitySx}>
        <TextField source="id" sortable />
        <TextField source="peerHost" label="Peer" sortable={false} />
        <TextField source="userAgent" label="User-Agent" sortable={false} />
        <FunctionField
          source="name"
          label="Name"
          render={() => (
            <ClientNameCell
              onSaved={refreshClients}
            />
          )}
          sortable={false}
        />
        <FunctionField
          source="room"
          label="Room"
          render={() => (
            <ClientRoomChangeCell
              roomChoices={roomChoices}
              onSaved={refreshClients}
            />
          )}
          sortable={false}
        />
        <TextField source="user" label="User" sortable={false} />
        <FunctionField
          source="actions"
          label=""
          render={() => <ClientDeleteActionCell onDeleted={refreshClients} />}
          sortable={false}
        />
      </Datagrid>
    </List>
  );
};

