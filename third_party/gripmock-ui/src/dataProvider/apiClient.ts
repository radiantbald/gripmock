import { API_CONFIG } from "../constants/api";
import { clearCurrentSession, getCurrentSession } from "../utils/session";
import type { RequestOptions } from "./types";

const getSessionHeader = (): Record<string, string> => {
  if (typeof window === "undefined") {
    return {};
  }

  const session = localStorage.getItem(API_CONFIG.SESSION_STORAGE_KEY);
  if (!session) {
    return {};
  }

  return { [API_CONFIG.SESSION_HEADER]: session };
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
      ...(options.skipSessionHeader ? {} : getSessionHeader()),
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

    const resetSession = response.headers.get(API_CONFIG.SESSION_RESET_HEADER);
    if (resetSession === "1" && getCurrentSession()) {
      clearCurrentSession();
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
    options: { headers?: Record<string, string>; skipSessionHeader?: boolean } = {},
  ): Promise<T> {
    return this.request<T>(path, {
      method: "POST",
      body: file,
      skipSessionHeader: options.skipSessionHeader,
      headers: {
        "Content-Type": "application/octet-stream",
        ...(options.headers || {}),
      },
    });
  },
};
