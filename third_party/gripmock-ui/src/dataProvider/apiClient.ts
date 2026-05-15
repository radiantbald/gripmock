import { API_CONFIG } from "../constants/api";
import { clearCurrentRoom, getCurrentRoom } from "../utils/room";
import type { RequestOptions } from "./types";

const getRoomHeader = (): Record<string, string> => {
  if (typeof window === "undefined") {
    return {};
  }

  const room = localStorage.getItem(API_CONFIG.ROOM_STORAGE_KEY);
  if (!room) {
    return {};
  }

  return { [API_CONFIG.ROOM_HEADER]: room };
};

const getClientHeader = (): Record<string, string> => {
  if (typeof window === "undefined") {
    return {};
  }

  const userID = localStorage.getItem(API_CONFIG.AUTH_PHONE_STORAGE_KEY)?.trim();
  if (userID) {
    return { [API_CONFIG.CLIENT_HEADER]: userID };
  }

  const legacyClientID = localStorage.getItem(API_CONFIG.CLIENT_STORAGE_KEY)?.trim();
  if (legacyClientID) {
    return { [API_CONFIG.CLIENT_HEADER]: legacyClientID };
  }

  return {};
};

const parseError = async (response: Response): Promise<Error> => {
  try {
    const payload = (await response.json()) as {
      error?: string;
      message?: string;
    };
    const message = payload.error || payload.message;
    if (message) {
      return new Error(message);
    }
  } catch {
    // Ignore parse error and fallback to HTTP status text.
  }

  return new Error(`HTTP error! status: ${response.status}`);
};

export const apiClient = {
  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
      [API_CONFIG.INTERNAL_HEADER]: API_CONFIG.INTERNAL_VALUE,
      ...(options.skipRoomHeader ? {} : getRoomHeader()),
      ...getClientHeader(),
      ...(options.headers || {}),
    };

    if (options.body instanceof FormData || options.body instanceof Blob) {
      delete headers["Content-Type"];
    }

    const response = await fetch(`${API_CONFIG.BASE_URL}${path}`, {
      method: options.method || "GET",
      cache: "no-store",
      headers,
      body: options.body ?? null,
    });

    if (!response.ok) {
      throw await parseError(response);
    }

    const resetRoom = response.headers.get(API_CONFIG.ROOM_RESET_HEADER);
    if (resetRoom === "1" && getCurrentRoom()) {
      clearCurrentRoom();
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const contentType = response.headers.get("content-type") || "";
    const contentLength = response.headers.get("content-length");
    if (
      contentLength === "0" ||
      (!contentType.includes("application/json") && response.status < 300)
    ) {
      return undefined as T;
    }

    const payload = await response.json();
    return payload as T;
  },

  async requestBinary<T>(
    path: string,
    file: File,
    options: { headers?: Record<string, string>; skipRoomHeader?: boolean } = {},
  ): Promise<T> {
    return this.request<T>(path, {
      method: "POST",
      body: file,
      skipRoomHeader: options.skipRoomHeader,
      headers: {
        "Content-Type": "application/octet-stream",
        ...(options.headers || {}),
      },
    });
  },
};
