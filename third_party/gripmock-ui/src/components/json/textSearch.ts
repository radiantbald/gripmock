export type TextSearchOptions = {
  caseSensitive: boolean;
  wholeWord: boolean;
  useRegex: boolean;
};

export type TextMatchRange = {
  start: number;
  end: number;
  index: number;
};

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const buildSearchRegex = (
  query: string,
  options: TextSearchOptions,
): RegExp | null => {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return null;
  }

  const source = options.useRegex
    ? normalizedQuery
    : escapeRegExp(normalizedQuery);
  const boundedSource = options.wholeWord ? `\\b(?:${source})\\b` : source;
  const flags = options.caseSensitive ? "g" : "gi";

  try {
    return new RegExp(boundedSource, flags);
  } catch {
    return null;
  }
};

export const collectMatchRanges = (
  text: string,
  matcher: RegExp | null,
  offset = 0,
): TextMatchRange[] => {
  if (!matcher) {
    return [];
  }

  const ranges: TextMatchRange[] = [];
  const regex = new RegExp(
    matcher.source,
    matcher.flags.includes("g") ? matcher.flags : `${matcher.flags}g`,
  );
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const start = match.index;
    const matchedText = match[0] || "";
    const end = start + matchedText.length;
    ranges.push({ start, end, index: offset + ranges.length });
    if (!matchedText) {
      regex.lastIndex += 1;
    }
  }

  return ranges;
};
