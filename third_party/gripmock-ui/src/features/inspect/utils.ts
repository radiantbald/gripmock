import type { InspectCandidate, InspectResponse } from "../../types/inspect";

export const parseJsonObject = (raw: string): { value: Record<string, unknown>; error?: string } => {
  if (!raw.trim()) {
    return { value: {} };
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { value: {}, error: "Value must be a JSON object" };
    }

    return { value: parsed as Record<string, unknown> };
  } catch (error) {
    return { value: {}, error: (error as Error).message };
  }
};

export const candidateMatchesFilter = (
  candidate: InspectCandidate,
  query: string,
  onlyMatched: boolean,
  onlyExcluded: boolean,
) => {
  if (onlyMatched && !candidate.matched) {
    return false;
  }

  if (onlyExcluded && (!candidate.excludedBy || candidate.excludedBy.length === 0)) {
    return false;
  }

  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  const haystack = [
    candidate.id,
    candidate.service,
    candidate.method,
    candidate.session || "",
    ...(candidate.excludedBy || []),
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalizedQuery);
};

export const buildCandidateStats = (result: InspectResponse | null) => {
  if (!result) {
    return null;
  }

  const total = result.candidates.length;
  const matched = result.candidates.filter((candidate) => candidate.matched).length;
  const visibleBySession = result.candidates.filter((candidate) => candidate.visibleBySession).length;
  const withinTimes = result.candidates.filter((candidate) => candidate.withinTimes).length;
  const headersMatched = result.candidates.filter((candidate) => candidate.headersMatched).length;
  const inputMatched = result.candidates.filter((candidate) => candidate.inputMatched).length;

  return {
    total,
    matched,
    visibleBySession,
    withinTimes,
    headersMatched,
    inputMatched,
  };
};
