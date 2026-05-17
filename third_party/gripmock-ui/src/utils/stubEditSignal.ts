const STUB_EDIT_SIGNAL_KEY = "gripmock.stubEditedSignal";
const STUB_REPLACED_SIGNAL_KEY = "gripmock.stubReplacedSignal";
const STUB_CREATED_SIGNAL_KEY = "gripmock.stubCreatedSignal";
const STUB_EDIT_HISTORY_KEY = "gripmock.stubEditedHistory";
const STUB_REPLACED_HISTORY_KEY = "gripmock.stubReplacedHistory";
const STUB_CREATED_HISTORY_KEY = "gripmock.stubCreatedHistory";
const STUB_CALL_RESOLUTION_KEY = "gripmock.stubCallResolution";

type StubEditSignal = {
  stubId: string;
  savedAt: number;
};

type StubReplacedSignal = {
  service: string;
  method: string;
  savedAt: number;
};
type StubCreatedSignal = {
  service: string;
  method: string;
  savedAt: number;
};

type StubCallResolutionKind = "edited" | "replaced";

type StubCallResolution = {
  callId: string;
  kind: StubCallResolutionKind;
  savedAt: number;
};

const toTimestamp = (value: unknown): number => {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0;
};

const readStubEditedHistory = (): StubEditSignal[] => {
  try {
    const raw = getStorage()?.getItem(STUB_EDIT_HISTORY_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => {
        const stubId = String((item as Partial<StubEditSignal>)?.stubId || "").trim();
        if (!stubId) {
          return null;
        }

        return {
          stubId,
          savedAt: toTimestamp((item as Partial<StubEditSignal>)?.savedAt),
        } satisfies StubEditSignal;
      })
      .filter((item): item is StubEditSignal => item !== null);
  } catch {
    return [];
  }
};

const writeStubEditedHistory = (entries: StubEditSignal[]): void => {
  try {
    getStorage()?.setItem(STUB_EDIT_HISTORY_KEY, JSON.stringify(entries));
  } catch {
    // Ignore storage failures (private mode, quota, etc.).
  }
};

const readStubReplacedHistory = (): StubReplacedSignal[] => {
  try {
    const raw = getStorage()?.getItem(STUB_REPLACED_HISTORY_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => {
        const service = String((item as Partial<StubReplacedSignal>)?.service || "").trim();
        const method = String((item as Partial<StubReplacedSignal>)?.method || "").trim();
        if (!service || !method) {
          return null;
        }

        return {
          service,
          method,
          savedAt: toTimestamp((item as Partial<StubReplacedSignal>)?.savedAt),
        } satisfies StubReplacedSignal;
      })
      .filter((item): item is StubReplacedSignal => item !== null);
  } catch {
    return [];
  }
};
const readStubCreatedHistory = (): StubCreatedSignal[] => {
  try {
    const raw = getStorage()?.getItem(STUB_CREATED_HISTORY_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => {
        const service = String((item as Partial<StubCreatedSignal>)?.service || "").trim();
        const method = String((item as Partial<StubCreatedSignal>)?.method || "").trim();
        if (!service || !method) {
          return null;
        }

        return {
          service,
          method,
          savedAt: toTimestamp((item as Partial<StubCreatedSignal>)?.savedAt),
        } satisfies StubCreatedSignal;
      })
      .filter((item): item is StubCreatedSignal => item !== null);
  } catch {
    return [];
  }
};

const writeStubReplacedHistory = (entries: StubReplacedSignal[]): void => {
  try {
    getStorage()?.setItem(STUB_REPLACED_HISTORY_KEY, JSON.stringify(entries));
  } catch {
    // Ignore storage failures (private mode, quota, etc.).
  }
};
const writeStubCreatedHistory = (entries: StubCreatedSignal[]): void => {
  try {
    getStorage()?.setItem(STUB_CREATED_HISTORY_KEY, JSON.stringify(entries));
  } catch {
    // Ignore storage failures (private mode, quota, etc.).
  }
};

const readStubCallResolution = (): StubCallResolution[] => {
  try {
    const raw = getStorage()?.getItem(STUB_CALL_RESOLUTION_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => {
        const callId = String((item as Partial<StubCallResolution>)?.callId || "").trim();
        const rawKind = String((item as Partial<StubCallResolution>)?.kind || "").trim();
        const kind = rawKind === "edited" || rawKind === "replaced" ? rawKind : "";
        if (!callId || !kind) {
          return null;
        }

        return {
          callId,
          kind,
          savedAt: toTimestamp((item as Partial<StubCallResolution>)?.savedAt),
        } satisfies StubCallResolution;
      })
      .filter((item): item is StubCallResolution => item !== null);
  } catch {
    return [];
  }
};

const writeStubCallResolution = (entries: StubCallResolution[]): void => {
  try {
    getStorage()?.setItem(STUB_CALL_RESOLUTION_KEY, JSON.stringify(entries));
  } catch {
    // Ignore storage failures (private mode, quota, etc.).
  }
};

const getStorage = (): Storage | null => {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
};

export const setStubEditedSignal = (stubId: string): void => {
  const normalizedStubId = String(stubId).trim();
  if (!normalizedStubId) {
    return;
  }

  const savedAt = Date.now();
  const payload: StubEditSignal = { stubId: normalizedStubId, savedAt };
  try {
    getStorage()?.setItem(STUB_EDIT_SIGNAL_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage failures (private mode, quota, etc.).
  }

  const existing = readStubEditedHistory();
  const next = [{ stubId: normalizedStubId, savedAt }, ...existing.filter((item) => item.stubId !== normalizedStubId)];
  writeStubEditedHistory(next.slice(0, 200));
};

export const getStubEditedSignalStubId = (): string => {
  const signal = getStubEditedSignal();
  return signal?.stubId || "";
};

export const getStubEditedSignal = (): StubEditSignal | null => {
  try {
    const raw = getStorage()?.getItem(STUB_EDIT_SIGNAL_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<StubEditSignal>;
    const stubId = String(parsed?.stubId || "").trim();
    if (!stubId) {
      return null;
    }

    return { stubId, savedAt: toTimestamp(parsed?.savedAt) };
  } catch {
    return null;
  }
};

export const getStubEditedHistory = (): StubEditSignal[] => readStubEditedHistory();

export const clearStubEditedSignal = (): void => {
  try {
    getStorage()?.removeItem(STUB_EDIT_SIGNAL_KEY);
  } catch {
    // Ignore storage failures (private mode, quota, etc.).
  }
};

export const setStubReplacedSignal = (service: string, method: string): void => {
  const normalizedService = String(service).trim();
  const normalizedMethod = String(method).trim();
  if (!normalizedService || !normalizedMethod) {
    return;
  }

  const savedAt = Date.now();
  const payload: StubReplacedSignal = {
    service: normalizedService,
    method: normalizedMethod,
    savedAt,
  };
  try {
    getStorage()?.setItem(STUB_REPLACED_SIGNAL_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage failures (private mode, quota, etc.).
  }

  const signature = `${normalizedService}::${normalizedMethod}`;
  const existing = readStubReplacedHistory();
  const next = [
    { service: normalizedService, method: normalizedMethod, savedAt },
    ...existing.filter((item) => `${item.service}::${item.method}` !== signature),
  ];
  writeStubReplacedHistory(next.slice(0, 200));
};
export const setStubCreatedSignal = (service: string, method: string): void => {
  const normalizedService = String(service).trim();
  const normalizedMethod = String(method).trim();
  if (!normalizedService || !normalizedMethod) {
    return;
  }

  const savedAt = Date.now();
  const payload: StubCreatedSignal = {
    service: normalizedService,
    method: normalizedMethod,
    savedAt,
  };
  try {
    getStorage()?.setItem(STUB_CREATED_SIGNAL_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage failures (private mode, quota, etc.).
  }

  const signature = `${normalizedService}::${normalizedMethod}`;
  const existing = readStubCreatedHistory();
  const next = [
    { service: normalizedService, method: normalizedMethod, savedAt },
    ...existing.filter((item) => `${item.service}::${item.method}` !== signature),
  ];
  writeStubCreatedHistory(next.slice(0, 200));
};

export const getStubReplacedSignal = (): StubReplacedSignal | null => {
  try {
    const raw = getStorage()?.getItem(STUB_REPLACED_SIGNAL_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<StubReplacedSignal>;
    const service = String(parsed?.service || "").trim();
    const method = String(parsed?.method || "").trim();
    if (!service || !method) {
      return null;
    }

    return { service, method, savedAt: toTimestamp(parsed?.savedAt) };
  } catch {
    return null;
  }
};
export const getStubCreatedSignal = (): StubCreatedSignal | null => {
  try {
    const raw = getStorage()?.getItem(STUB_CREATED_SIGNAL_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<StubCreatedSignal>;
    const service = String(parsed?.service || "").trim();
    const method = String(parsed?.method || "").trim();
    if (!service || !method) {
      return null;
    }

    return { service, method, savedAt: toTimestamp(parsed?.savedAt) };
  } catch {
    return null;
  }
};

export const getStubReplacedHistory = (): StubReplacedSignal[] => readStubReplacedHistory();
export const getStubCreatedHistory = (): StubCreatedSignal[] => readStubCreatedHistory();

export const clearStubReplacedSignal = (): void => {
  try {
    getStorage()?.removeItem(STUB_REPLACED_SIGNAL_KEY);
  } catch {
    // Ignore storage failures (private mode, quota, etc.).
  }
};
export const clearStubCreatedSignal = (): void => {
  try {
    getStorage()?.removeItem(STUB_CREATED_SIGNAL_KEY);
  } catch {
    // Ignore storage failures (private mode, quota, etc.).
  }
};

export const getStubCallResolutionKind = (callId: string): StubCallResolutionKind | "" => {
  const normalizedCallId = String(callId).trim();
  if (!normalizedCallId) {
    return "";
  }

  const entry = readStubCallResolution().find((item) => item.callId === normalizedCallId);
  return entry?.kind || "";
};

export const setStubCallResolutionKind = (callId: string, kind: StubCallResolutionKind): void => {
  const normalizedCallId = String(callId).trim();
  if (!normalizedCallId) {
    return;
  }

  const savedAt = Date.now();
  const existing = readStubCallResolution();
  const next = [
    { callId: normalizedCallId, kind, savedAt },
    ...existing.filter((item) => item.callId !== normalizedCallId),
  ];
  writeStubCallResolution(next.slice(0, 500));
};
