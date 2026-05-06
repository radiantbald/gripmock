import { API_CONFIG } from "../constants/api";

const SESSION_CHANGED_EVENT = "gripmock:session-changed";
const RECENT_SESSIONS_STORAGE_KEY = "gripmock.ui.recentSessions";

const emitSessionChanged = () => {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(SESSION_CHANGED_EVENT));
};

export const getCurrentSession = (): string => {
  if (typeof window === "undefined") {
    return "";
  }

  return localStorage.getItem(API_CONFIG.SESSION_STORAGE_KEY) || "";
};

export const setCurrentSession = (value: string) => {
  if (typeof window === "undefined") {
    return;
  }

  const normalized = value.trim();
  if (!normalized) {
    localStorage.removeItem(API_CONFIG.SESSION_STORAGE_KEY);
    emitSessionChanged();
    return;
  }

  localStorage.setItem(API_CONFIG.SESSION_STORAGE_KEY, normalized);
  emitSessionChanged();
};

export const clearCurrentSession = () => {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.removeItem(API_CONFIG.SESSION_STORAGE_KEY);
  emitSessionChanged();
};

export const subscribeSessionChanges = (listener: () => void): (() => void) => {
  if (typeof window === "undefined") {
    return () => {};
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key === API_CONFIG.SESSION_STORAGE_KEY) {
      listener();
    }
  };

  window.addEventListener("storage", onStorage);
  window.addEventListener(SESSION_CHANGED_EVENT, listener);

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(SESSION_CHANGED_EVENT, listener);
  };
};

export const readRecentSessions = (): string[] => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = localStorage.getItem(RECENT_SESSIONS_STORAGE_KEY);
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

export const saveRecentSessions = (sessions: string[]) => {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem(RECENT_SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
};
