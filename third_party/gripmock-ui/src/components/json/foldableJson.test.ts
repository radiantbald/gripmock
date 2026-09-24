import { describe, expect, it } from "vitest";

import {
  collectHiddenLines,
  findJsonFoldRanges,
  foldCoversMatch,
  foldRangeStartingOnLine,
  splitJsonLines,
} from "./foldableJson";

describe("findJsonFoldRanges", () => {
  it("finds nested multiline objects and arrays", () => {
    const text = `{
  "quiz": {
    "questions": [
      {
        "choices": [
          {
            "id": "a"
          }
        ]
      }
    ]
  }
}`;

    const ranges = findJsonFoldRanges(text);

    expect(
      ranges.map((range) => [range.startLine, range.endLine, range.kind]),
    ).toEqual([
      [0, 12, "object"],
      [1, 11, "object"],
      [2, 10, "array"],
      [3, 9, "object"],
      [4, 8, "array"],
      [5, 7, "object"],
    ]);
  });

  it("ignores a single-line object", () => {
    expect(findJsonFoldRanges('{"a":1,"b":[2,3]}')).toEqual([]);
  });

  it("does not treat braces inside strings as blocks", () => {
    const text = `{
  "note": "use { and } plus [arrays]",
  "ok": true
}`;

    const ranges = findJsonFoldRanges(text);

    expect(ranges).toHaveLength(1);
    expect(ranges[0]).toMatchObject({
      startLine: 0,
      endLine: 3,
      kind: "object",
    });
  });

  it("ignores escaped quotes when scanning strings", () => {
    const text = `{
  "quote": "say \\"hello { world }\\"",
  "next": 1
}`;

    expect(findJsonFoldRanges(text)).toHaveLength(1);
  });
});

describe("splitJsonLines", () => {
  it("keeps offsets aligned with the source text", () => {
    const text = '{\n  "a": 1\n}';
    const lines = splitJsonLines(text);

    expect(lines).toEqual([
      { start: 0, end: 1, text: "{" },
      { start: 2, end: 10, text: '  "a": 1' },
      { start: 11, end: 12, text: "}" },
    ]);
  });
});

describe("fold helpers", () => {
  it("picks the innermost fold that starts on a line", () => {
    const text = `{ "inner": {\n  "a": 1\n}}`;
    const folds = findJsonFoldRanges(text);
    const onFirstLine = foldRangeStartingOnLine(folds, 0);

    expect(onFirstLine?.kind).toBe("object");
    expect(text.slice(onFirstLine!.start, onFirstLine!.end + 1)).toBe(
      '{\n  "a": 1\n}',
    );
  });

  it("hides every line covered by a collapsed fold", () => {
    const folds = findJsonFoldRanges('{\n  "a": {\n    "b": 1\n  }\n}');
    const hidden = collectHiddenLines(folds, new Set([folds[0].start]));

    expect(Array.from(hidden)).toEqual([1, 2, 3, 4]);
  });

  it("detects a match hidden inside a fold", () => {
    const folds = findJsonFoldRanges('{\n  "hidden": true\n}');
    const fold = folds[0];
    const hiddenStart = fold.start + 2;

    expect(foldCoversMatch(fold, hiddenStart, hiddenStart + 6)).toBe(true);
    expect(foldCoversMatch(fold, fold.start, fold.start + 1)).toBe(false);
  });
});
