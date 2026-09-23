import { describe, expect, it } from "vitest";

import { buildSearchRegex, collectMatchRanges } from "./textSearch";

const defaultOptions = {
  caseSensitive: false,
  wholeWord: false,
  useRegex: false,
};

describe("buildSearchRegex", () => {
  it("returns null for a blank query", () => {
    expect(buildSearchRegex("   ", defaultOptions)).toBeNull();
  });

  it("matches a literal query case-insensitively", () => {
    const matcher = buildSearchRegex("Value", defaultOptions);

    expect(matcher).not.toBeNull();
    expect("the value".match(matcher as RegExp)).toEqual(["value"]);
  });

  it("escapes regex metacharacters in literal mode", () => {
    const matcher = buildSearchRegex("a.b", defaultOptions);

    expect("a.b".match(matcher as RegExp)).toEqual(["a.b"]);
    expect("axb".match(matcher as RegExp)).toBeNull();
  });

  it("honors case-sensitive and whole-word options", () => {
    const matcher = buildSearchRegex("tick", {
      caseSensitive: true,
      wholeWord: true,
      useRegex: false,
    });

    expect("tick".match(matcher as RegExp)).toEqual(["tick"]);
    expect("ticker".match(matcher as RegExp)).toBeNull();
    expect("Tick".match(matcher as RegExp)).toBeNull();
  });

  it("returns null for an invalid regular expression", () => {
    expect(
      buildSearchRegex("(", {
        caseSensitive: false,
        wholeWord: false,
        useRegex: true,
      }),
    ).toBeNull();
  });
});

describe("collectMatchRanges", () => {
  it("returns an empty list without a matcher", () => {
    expect(collectMatchRanges("hello", null)).toEqual([]);
  });

  it("collects every match with a running index", () => {
    const matcher = buildSearchRegex("ab", defaultOptions);
    const ranges = collectMatchRanges("ab x ab", matcher);

    expect(ranges).toEqual([
      { start: 0, end: 2, index: 0 },
      { start: 5, end: 7, index: 1 },
    ]);
  });

  it("advances past zero-length regex matches", () => {
    const matcher = buildSearchRegex("a*", {
      caseSensitive: true,
      wholeWord: false,
      useRegex: true,
    });
    const ranges = collectMatchRanges("bb", matcher);

    expect(ranges.length).toBeGreaterThan(0);
    expect(ranges.every((range) => range.end >= range.start)).toBe(true);
  });
});
