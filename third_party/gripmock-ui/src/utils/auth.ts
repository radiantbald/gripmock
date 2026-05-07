import { API_CONFIG } from "../constants/api";

const AUTH_CHANGED_EVENT = "gripmock:auth-changed";

const emitAuthChanged = () => {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(AUTH_CHANGED_EVENT));
};

export const getAuthorizedPhone = (): string => {
  if (typeof window === "undefined") {
    return "";
  }

  return localStorage.getItem(API_CONFIG.AUTH_PHONE_STORAGE_KEY) || "";
};

export const setAuthorizedPhone = (phone: string) => {
  if (typeof window === "undefined") {
    return;
  }

  const normalized = phone.trim();
  if (!normalized) {
    localStorage.removeItem(API_CONFIG.AUTH_PHONE_STORAGE_KEY);
    emitAuthChanged();
    return;
  }

  localStorage.setItem(API_CONFIG.AUTH_PHONE_STORAGE_KEY, normalized);
  emitAuthChanged();
};

export const clearAuthorizedPhone = () => {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.removeItem(API_CONFIG.AUTH_PHONE_STORAGE_KEY);
  emitAuthChanged();
};

export const subscribeAuthChanges = (listener: () => void): (() => void) => {
  if (typeof window === "undefined") {
    return () => {};
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key === API_CONFIG.AUTH_PHONE_STORAGE_KEY) {
      listener();
    }
  };

  window.addEventListener("storage", onStorage);
  window.addEventListener(AUTH_CHANGED_EVENT, listener);

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(AUTH_CHANGED_EVENT, listener);
  };
};
