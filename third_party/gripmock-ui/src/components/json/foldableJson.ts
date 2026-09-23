export type JsonFoldKind = "object" | "array";

export type JsonFoldRange = {
  start: number;
  end: number;
  startLine: number;
  endLine: number;
  kind: JsonFoldKind;
};

const openToKind: Record<string, JsonFoldKind> = {
  "{": "object",
  "[": "array",
};

const closeToOpen: Record<string, string> = {
  "}": "{",
  "]": "[",
};

export const findJsonFoldRanges = (text: string): JsonFoldRange[] => {
  const ranges: JsonFoldRange[] = [];
  const stack: { ch: string; index: number; line: number }[] = [];
  let inString = false;
  let escaped = false;
  let line = 0;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (ch === "\n") {
      line += 1;
      escaped = false;
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "{" || ch === "[") {
      stack.push({ ch, index: i, line });
      continue;
    }

    const expectedOpen = closeToOpen[ch];
    if (!expectedOpen) {
      continue;
    }

    while (stack.length > 0) {
      const open = stack.pop();
      if (!open) {
        break;
      }
      if (open.ch !== expectedOpen) {
        continue;
      }
      if (open.line !== line) {
        ranges.push({
          start: open.index,
          end: i,
          startLine: open.line,
          endLine: line,
          kind: openToKind[open.ch],
        });
      }
      break;
    }
  }

  ranges.sort((left, right) => {
    if (left.start !== right.start) {
      return left.start - right.start;
    }
    return right.end - left.end;
  });

  return ranges;
};

export const splitJsonLines = (
  text: string,
): { start: number; end: number; text: string }[] => {
  const lines: { start: number; end: number; text: string }[] = [];
  let start = 0;

  for (let i = 0; i <= text.length; i += 1) {
    if (i === text.length || text[i] === "\n") {
      lines.push({
        start,
        end: i,
        text: text.slice(start, i),
      });
      start = i + 1;
    }
  }

  return lines;
};

export const foldRangeStartingOnLine = (
  folds: JsonFoldRange[],
  lineIndex: number,
): JsonFoldRange | undefined => {
  let selected: JsonFoldRange | undefined;
  for (const fold of folds) {
    if (fold.startLine !== lineIndex) {
      continue;
    }
    if (!selected || fold.start > selected.start) {
      selected = fold;
    }
  }
  return selected;
};

export const collectHiddenLines = (
  folds: JsonFoldRange[],
  collapsedStarts: ReadonlySet<number>,
): Set<number> => {
  const hidden = new Set<number>();
  for (const fold of folds) {
    if (!collapsedStarts.has(fold.start)) {
      continue;
    }
    for (let line = fold.startLine + 1; line <= fold.endLine; line += 1) {
      hidden.add(line);
    }
  }
  return hidden;
};

export const foldCoversMatch = (
  fold: JsonFoldRange,
  matchStart: number,
  matchEnd: number,
): boolean => {
  const hiddenStart = fold.start + 1;
  const hiddenEnd = fold.end;
  return matchStart < hiddenEnd && matchEnd > hiddenStart;
};
