import { Chip } from "@mui/material";
import { formatRoomLabel } from "../model";

export const RoomScopeChip = ({ room, roomName }: { room: string; roomName?: string }) => (
  <Chip
    color={room ? "primary" : "default"}
    variant={room ? "filled" : "outlined"}
    label={room ? formatRoomLabel(room, roomName) : "Global (no X-GripMock-Room)"}
    sx={{
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      maxWidth: "100%",
    }}
  />
);
