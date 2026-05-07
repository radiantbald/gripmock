const DEFAULT_API_BASE = "/api";

const normalizeApiBase = (value: string): string => {
  if (!value) {
    return DEFAULT_API_BASE;
  }

  return value.endsWith("/") ? value.slice(0, -1) : value;
};

const runtimeAPIBase = normalizeApiBase(
  import.meta.env.VITE_GRIPMOCK_API_URL || DEFAULT_API_BASE,
);

export const UI_CONFIG = {
  BASENAME: undefined,
} as const;

export const API_CONFIG = {
  BASE_URL: runtimeAPIBase,
  INTERNAL_HEADER: "X-GripMock-RequestInternal",
  INTERNAL_VALUE: "92b4d5a9-c74b-4ac0-989c-717f80acba22",
  SESSION_HEADER: "X-Gripmock-Session",
  SESSION_RESET_HEADER: "X-Gripmock-Session-Reset",
  CLIENT_HEADER: "X-Gripmock-Client",
  SESSION_STORAGE_KEY: "gripmock.ui.session",
  CLIENT_STORAGE_KEY: "gripmock.ui.client",
  AUTH_PHONE_STORAGE_KEY: "gripmock.ui.authPhone",
} as const;
