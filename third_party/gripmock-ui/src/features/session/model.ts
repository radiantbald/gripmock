export type SessionRow = {
  id: string;
  session?: string;
  name?: string;
};

export const normalizeSessionId = (value: string): string => value.trim();

export const mergeSessionOptions = (
  backendRows: SessionRow[],
  recent: string[],
  current: string,
): string[] => {
  const fromBackend = backendRows
    .map((item) => item?.session || item?.name || item?.id)
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0);

  const merged = [...recent, ...fromBackend];
  if (current.trim()) {
    merged.unshift(current.trim());
  }

  return Array.from(new Set(merged));
};
