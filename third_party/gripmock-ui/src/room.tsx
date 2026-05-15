import { useEffect, useMemo, useState } from "react";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import InboxOutlinedIcon from "@mui/icons-material/InboxOutlined";
import LogoutOutlinedIcon from "@mui/icons-material/LogoutOutlined";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import {
  alpha,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  List,
  ListItemButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
  Chip,
} from "@mui/material";
import { useGetList, useNotify } from "react-admin";

import {
  clearCurrentRoom,
  getCurrentRoom,
  setCurrentRoom,
  subscribeRoomChanges,
} from "./utils/room";
import { getAuthorizedPhone, subscribeAuthChanges } from "./utils/auth";
import { normalizeRoomId, resolveRoomRow, type RoomRow } from "./features/room/model";
import { apiClient } from "./dataProvider/apiClient";
import { EntityEmptyState } from "./components/empty/EntityEmptyState";

const RADIUS_PX = "10px";
const LIST_ROW_HEIGHT_PX = 30;
const ACTION_BUTTON_WIDTH_PX = 32;
const ACTION_BUTTON_GAP_PX = 4;
const ACTION_ICON_SX = { fontSize: 18 } as const;
const ROW_ACTION_BUTTON_SX = {
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
const ROOM_CREATE_BUTTON_SX = {
  color: "#ff6c37",
  textTransform: "none",
  fontWeight: 500,
  fontSize: 13,
  letterSpacing: 0,
  minHeight: "auto",
  borderRadius: 1,
  px: 0.625,
  py: 0.5,
  whiteSpace: "nowrap",
  "&:hover": {
    backgroundColor: alpha("#ff6c37", 0.08),
  },
  "& .MuiButton-startIcon": {
    mr: 0.65,
  },
  "& .MuiSvgIcon-root": {
    fontSize: 22,
  },
} as const;

const toDigits = (value: string): string => value.replace(/\D/g, "");
const isMyRoom = (roomId: string, phone: string): boolean => {
  const phoneDigits = toDigits(phone);
  if (!phoneDigits) {
    return false;
  }

  const roomDigits = toDigits(roomId);
  if (!roomDigits) {
    return false;
  }

  return roomDigits.includes(phoneDigits);
};

export const RoomScopePage = () => {
  const notify = useNotify();
  const [room, setRoom] = useState(() => getCurrentRoom());
  const [authorizedPhone, setAuthorizedPhone] = useState(() => getAuthorizedPhone());
  const [roomToDelete, setRoomToDelete] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteInProgress, setDeleteInProgress] = useState(false);
  const [createInProgress, setCreateInProgress] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [rooms, setRooms] = useState<Array<{ id: string; name: string }>>([]);
  const { data: backendRooms = [] } = useGetList<RoomRow>(
    "rooms",
    { pagination: { page: 1, perPage: 1000 } },
    { retry: false, staleTime: 30_000, refetchOnMount: false, refetchOnWindowFocus: false },
  );

  const allRooms = useMemo(
    () =>
      backendRooms
        .map((row) => resolveRoomRow(row))
        .filter((item): item is { id: string; name: string } => item !== null),
    [backendRooms],
  );

  useEffect(
    () =>
      subscribeRoomChanges(() => {
        setRoom(getCurrentRoom());
      }),
    [],
  );
  useEffect(() => subscribeAuthChanges(() => setAuthorizedPhone(getAuthorizedPhone())), []);
  useEffect(() => setRooms(allRooms), [allRooms]);

  const activateRoom = (value: string) => {
    const normalized = normalizeRoomId(value);
    if (!normalized) {
      return;
    }

    setCurrentRoom(normalized);
    setRoom(normalized);
    notify(`Room set: ${normalized}`, { type: "info" });
  };

  const activateGlobal = () => {
    clearCurrentRoom();
    setRoom("");
    notify("Switched to global room", { type: "info" });
  };

  const createRoom = async () => {
    if (createInProgress) {
      return;
    }

    const normalizedName = normalizeRoomId(newRoomName);
    if (!normalizedName) {
      notify("Enter room name", { type: "warning" });
      return;
    }

    setCreateInProgress(true);
    try {
      const created = await apiClient.request<{ id?: string; name?: string }>("/rooms", {
        method: "POST",
        body: JSON.stringify({ name: normalizedName }),
      });
      const createdID = String(created?.id || "").trim();
      if (!createdID) {
        throw new Error("Failed to create room: missing id");
      }

      const createdName = String(created?.name || normalizedName).trim() || normalizedName;
      setRooms((previous) => {
        const existingIndex = previous.findIndex((item) => item.id === createdID);
        if (existingIndex >= 0) {
          return previous.map((item) => (item.id === createdID ? { id: createdID, name: createdName } : item));
        }

        return [...previous, { id: createdID, name: createdName }];
      });
      setCurrentRoom(createdID);
      setRoom(createdID);
      setCreateDialogOpen(false);
      setNewRoomName("");
      notify(`Room created: ${normalizedName} (#${createdID})`, { type: "info" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create room";
      notify(message, { type: "warning" });
    } finally {
      setCreateInProgress(false);
    }
  };

  const deleteRoomData = async () => {
    const targetRoom = roomToDelete;
    if (!targetRoom) {
      return;
    }

    setDeleteInProgress(true);
    try {
      type RoomDeleteResponse = {
        deletedCount?: number;
        deletedHistoryCount?: number;
        deletedRoomRows?: number;
      };

      const payload = await apiClient.request<RoomDeleteResponse>(`/rooms/${encodeURIComponent(targetRoom)}`, {
        method: "DELETE",
      });

      const deletedStubs = Number(payload?.deletedCount || 0);
      const deletedHistory = Number(payload?.deletedHistoryCount || 0);
      const deletedRoomRows = Number(payload?.deletedRoomRows || 0);

      if (room === targetRoom) {
        activateGlobal();
      }
      setRooms((previous) => previous.filter((item) => item.id !== targetRoom));
      notify(
        `Room data deleted: ${deletedStubs} stubs, ${deletedHistory} history records, ${deletedRoomRows} room rows`,
        { type: "info" },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete room data";
      notify(message, { type: "warning" });
    } finally {
      setDeleteInProgress(false);
      setRoomToDelete(null);
    }
  };

  return (
    <Box p={1.5} width="100%" height="100%" sx={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
      {rooms.length === 0 ? (
        <EntityEmptyState
          icon={<InboxOutlinedIcon />}
          title="No Rooms yet."
          description="Do you want to add one?"
          actionLabel="Create"
          actionStartIcon={<AddIcon />}
          actionVariant="text"
          actionSx={ROOM_CREATE_BUTTON_SX}
          onAction={() => setCreateDialogOpen(true)}
        />
      ) : (
        <>
          <Box sx={{ display: "flex", justifyContent: "flex-end", pb: 1 }}>
            <Button
              variant="text"
              startIcon={<AddIcon />}
              onClick={() => setCreateDialogOpen(true)}
              sx={ROOM_CREATE_BUTTON_SX}
            >
              Create
            </Button>
          </Box>
          <List
            disablePadding
            sx={{
              border: "1px solid",
              borderColor: "divider",
              borderRadius: RADIUS_PX,
              p: 0.35,
              gap: 0.2,
              bgcolor: "background.paper",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {rooms.map((item) => {
              const active = item.id === room;
              const showLeaveAction = active;
              const actionCount = 1 + (showLeaveAction ? 1 : 0);
              const actionsSlotWidthPx =
                actionCount * ACTION_BUTTON_WIDTH_PX + Math.max(0, actionCount - 1) * ACTION_BUTTON_GAP_PX;

              return (
                <ListItemButton
                  key={item.id}
                  onClick={() => activateRoom(item.id)}
                  sx={{
                    px: 1,
                    py: 0,
                    minHeight: LIST_ROW_HEIGHT_PX,
                    borderRadius: RADIUS_PX,
                    border: "1px solid transparent",
                    transition: "background-color 140ms ease, border-color 140ms ease",
                    "&:hover": {
                      bgcolor: "action.hover",
                      borderColor: "divider",
                    },
                    "& .room-row-actions-slot": {
                      width: 0,
                      opacity: 0,
                      pointerEvents: "none",
                      overflow: "hidden",
                      transform: "translateX(8px)",
                      transition: "width 220ms ease, opacity 180ms ease, transform 220ms ease",
                    },
                    "&:hover .room-row-actions-slot, &:focus-visible .room-row-actions-slot": {
                      width: `${actionsSlotWidthPx}px`,
                      opacity: 1,
                      pointerEvents: "auto",
                      transform: "translateX(0)",
                    },
                  }}
                >
                  {isMyRoom(item.name, authorizedPhone) ? (
                    <PersonOutlineIcon
                      fontSize="small"
                      sx={{
                        color: "text.secondary",
                        mr: 1,
                      }}
                    />
                  ) : null}
                  <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.8, minWidth: 0, flex: 1 }}>
                    <Typography
                      variant="body2"
                      sx={{
                        fontFamily: "monospace",
                        color: "text.secondary",
                        fontSize: 10,
                        lineHeight: 1,
                        minWidth: 16,
                        textAlign: "right",
                      }}
                    >
                      #{item.id}
                    </Typography>
                    <Typography
                      variant="body2"
                      noWrap
                      sx={{
                        fontWeight: 600,
                        fontSize: 15.5,
                        lineHeight: 1.15,
                        color: active ? "#FF6C37" : "text.primary",
                      }}
                    >
                      {item.name?.trim() || "(unnamed room)"}
                    </Typography>
                  </Box>
                  {active ? (
                    <Chip
                      size="small"
                      variant="outlined"
                      color="success"
                      label="Active"
                      sx={{
                        borderRadius: RADIUS_PX,
                        fontSize: 10,
                        fontWeight: 500,
                        letterSpacing: 0,
                        height: 22,
                        mr: 0.75,
                        "& .MuiChip-label": {
                          px: 1.1,
                          lineHeight: 1.2,
                        },
                      }}
                    />
                  ) : null}
                  <Box className="room-row-actions-slot">
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      {showLeaveAction ? (
                        <Tooltip title="Leave room">
                          <IconButton
                            size="small"
                            onClick={(event) => {
                              event.stopPropagation();
                              activateGlobal();
                            }}
                            aria-label={`Leave room ${item.id}`}
                            sx={ROW_ACTION_BUTTON_SX}
                          >
                            <LogoutOutlinedIcon sx={ACTION_ICON_SX} />
                          </IconButton>
                        </Tooltip>
                      ) : null}
                      <Tooltip title="Delete room">
                        <IconButton
                          size="small"
                          disabled={deleteInProgress}
                          onClick={(event) => {
                            event.stopPropagation();
                            setRoomToDelete(item.id);
                          }}
                          aria-label={`Delete room ${item.id}`}
                          sx={ROW_ACTION_BUTTON_SX}
                        >
                          <DeleteOutlineIcon sx={ACTION_ICON_SX} />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </Box>
                </ListItemButton>
              );
            })}
          </List>
        </>
      )}
      <Dialog
        open={createDialogOpen}
        onClose={() => {
          if (!createInProgress) {
            setCreateDialogOpen(false);
            setNewRoomName("");
          }
        }}
        PaperProps={{
          sx: {
            bgcolor: "#2b3345",
            color: "#e8ebf2",
            borderRadius: RADIUS_PX,
            minWidth: 430,
          },
        }}
      >
        <DialogTitle
          sx={{
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: 0.2,
            lineHeight: 1.3,
            pb: 0.75,
          }}
        >
          Create room
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            size="small"
            margin="dense"
            variant="standard"
            label="Room name"
            placeholder="QA regression run"
            value={newRoomName}
            helperText="Room ID will be generated automatically."
            onChange={(event) => setNewRoomName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void createRoom();
              }
            }}
            sx={{
              mt: 0.5,
              "& .MuiInputLabel-root": {
                color: alpha("#ffffff", 0.72),
                fontSize: 14,
                lineHeight: 1.2,
                fontWeight: 500,
                transform: "translate(0, -2px) scale(1)",
                transformOrigin: "top left",
              },
              "& .MuiInputLabel-root.Mui-focused": {
                color: alpha("#ffffff", 0.72),
              },
              "& .MuiInput-root": {
                mt: 2,
              },
              "& .MuiInputBase-input": {
                fontFamily: "inherit",
                fontSize: 16,
                fontWeight: 500,
                letterSpacing: 0,
                color: "#c6ccd8",
                py: 0.55,
              },
              "& .MuiInput-underline:before": {
                borderBottomColor: alpha("#ff6c37", 0.55),
              },
              "& .MuiInput-underline:hover:not(.Mui-disabled, .Mui-error):before": {
                borderBottomColor: "#ff6c37",
              },
              "& .MuiInput-underline:after": {
                borderBottomColor: "#ff6c37",
              },
              "& .MuiFormHelperText-root": {
                mt: 1,
                fontSize: 12,
                lineHeight: 1.35,
                color: alpha("#ffffff", 0.64),
              },
            }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            disabled={createInProgress}
            onClick={() => {
              setCreateDialogOpen(false);
              setNewRoomName("");
            }}
            sx={{
              color: "#ff6c37",
              fontWeight: 600,
              textTransform: "none",
              letterSpacing: 0,
            }}
          >
            Cancel
          </Button>
          <Button
            disabled={createInProgress}
            onClick={createRoom}
            sx={{
              color: "#ff6c37",
              fontWeight: 600,
              textTransform: "none",
              letterSpacing: 0,
            }}
          >
            {createInProgress ? "Creating..." : "Create"}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={Boolean(roomToDelete)}
        onClose={() => {
          if (!deleteInProgress) {
            setRoomToDelete(null);
          }
        }}
      >
        <DialogTitle>Delete room data?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will delete all stubs and history records for room{" "}
            <strong>{roomToDelete || "-"}</strong>. This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button disabled={deleteInProgress} onClick={() => setRoomToDelete(null)}>
            Cancel
          </Button>
          <Button color="error" disabled={deleteInProgress || !roomToDelete} onClick={deleteRoomData}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
