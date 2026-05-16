const STUB_EDIT_SIGNAL_KEY = "gripmock.stubEditedSignal";

type StubEditSignal = {
  stubId: string;
  savedAt: number;
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

  const payload: StubEditSignal = { stubId: normalizedStubId, savedAt: Date.now() };
  try {
    getStorage()?.setItem(STUB_EDIT_SIGNAL_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage failures (private mode, quota, etc.).
  }
};

export const getStubEditedSignalStubId = (): string => {
  try {
    const raw = getStorage()?.getItem(STUB_EDIT_SIGNAL_KEY);
    if (!raw) {
      return "";
    }

    const parsed = JSON.parse(raw) as Partial<StubEditSignal>;
    return String(parsed?.stubId || "").trim();
  } catch {
    return "";
  }
};

export const clearStubEditedSignal = (): void => {
  try {
    getStorage()?.removeItem(STUB_EDIT_SIGNAL_KEY);
  } catch {
    // Ignore storage failures (private mode, quota, etc.).
  }
};
