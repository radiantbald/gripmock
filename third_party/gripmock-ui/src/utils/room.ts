import { API_CONFIG } from "../constants/api";

const ROOM_CHANGED_EVENT = "gripmock:room-changed";
const RECENT_ROOMS_STORAGE_KEY = "gripmock.ui.recentRooms";
const DEFAULT_MAX_RECENT_ROOMS = 8;

const emitRoomChanged = () => {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(ROOM_CHANGED_EVENT));
};

export const getCurrentRoom = (): string => {
  if (typeof window === "undefined") {
    return "";
  }

  return localStorage.getItem(API_CONFIG.ROOM_STORAGE_KEY) || "";
};

export const setCurrentRoom = (value: string) => {
  if (typeof window === "undefined") {
    return;
  }

  const normalized = value.trim();
  if (!normalized) {
    localStorage.removeItem(API_CONFIG.ROOM_STORAGE_KEY);
    emitRoomChanged();
    return;
  }

  localStorage.setItem(API_CONFIG.ROOM_STORAGE_KEY, normalized);
  emitRoomChanged();
};

export const clearCurrentRoom = () => {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.removeItem(API_CONFIG.ROOM_STORAGE_KEY);
  emitRoomChanged();
};

export const subscribeRoomChanges = (listener: () => void): (() => void) => {
  if (typeof window === "undefined") {
    return () => {};
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key === API_CONFIG.ROOM_STORAGE_KEY) {
      listener();
    }
  };

  window.addEventListener("storage", onStorage);
  window.addEventListener(ROOM_CHANGED_EVENT, listener);

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(ROOM_CHANGED_EVENT, listener);
  };
};

export const readRecentRooms = (): string[] => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = localStorage.getItem(RECENT_ROOMS_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  } catch {
    return [];
  }
};

export const saveRecentRooms = (rooms: string[]) => {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem(RECENT_ROOMS_STORAGE_KEY, JSON.stringify(rooms));
};

export const rememberRecentRoom = (value: string, limit: number = DEFAULT_MAX_RECENT_ROOMS): string[] => {
  const normalized = value.trim();
  if (!normalized) {
    return readRecentRooms();
  }

  const current = readRecentRooms();
  const maxItems = Math.max(limit, 1);
  const dedupedCurrent = current.filter((item) => item.trim().length > 0);

  const next = dedupedCurrent.includes(normalized)
    ? dedupedCurrent.slice(-maxItems)
    : [...dedupedCurrent, normalized].slice(-maxItems);

  saveRecentRooms(next);

  return next;
};
