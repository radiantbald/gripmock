export type RoomRow = {
  id: string;
  room?: string;
  name?: string;
};

export const normalizeRoomId = (value: string): string => value.trim();

export const resolveRoomRow = (row: RoomRow): { id: string; name: string } | null => {
  const roomId = String(row?.id || "").trim();
  const roomName = String(row?.room || row?.name || "").trim();
  if (!roomId || !roomName) {
    return null;
  }

  return {
    id: roomId,
    name: roomName,
  };
};

export const formatRoomLabel = (roomId: string, roomName?: string): string => {
  const normalizedId = String(roomId || "").trim();
  const normalizedName = String(roomName || "").trim();
  if (!normalizedId) {
    return "";
  }

  return normalizedName ? `#${normalizedId} ${normalizedName}` : `#${normalizedId}`;
};

export const mergeRoomOptions = (
  backendRows: RoomRow[],
  recent: string[],
  current: string,
): string[] => {
  const fromBackend = backendRows
    .map((item) => resolveRoomRow(item)?.id || item?.id || item?.room || item?.name)
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0);

  const merged = [...recent, ...fromBackend];
  if (current.trim()) {
    merged.unshift(current.trim());
  }

  return Array.from(new Set(merged));
};
