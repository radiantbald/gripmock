import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import { alpha, Box, IconButton } from "@mui/material";
import { Fragment, useMemo, useState } from "react";
import type { ReactNode } from "react";

import {
  collectHiddenLines,
  findJsonFoldRanges,
  foldCoversMatch,
  foldRangeStartingOnLine,
  splitJsonLines,
} from "./foldableJson";

export type JsonMatchRange = {
  start: number;
  end: number;
  index: number;
};

type FoldableJsonTextProps = {
  text: string;
  matchRanges?: JsonMatchRange[];
  activeMatchIndex?: number;
};

const jsonTextSx = {
  m: 0,
  p: 0,
  whiteSpace: "pre",
  fontFamily:
    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: 13,
  lineHeight: "14px",
  color: "text.primary",
  tabSize: 2,
  cursor: "text",
  userSelect: "text",
  "&::selection": {
    backgroundColor: alpha("#5DA8FF", 0.46),
    color: "#F6FAFF",
  },
  "& *::selection": {
    backgroundColor: alpha("#5DA8FF", 0.46),
    color: "#F6FAFF",
  },
  "&::-moz-selection": {
    backgroundColor: alpha("#5DA8FF", 0.46),
    color: "#F6FAFF",
  },
  "& *::-moz-selection": {
    backgroundColor: alpha("#5DA8FF", 0.46),
    color: "#F6FAFF",
  },
} as const;

const lineRowSx = {
  display: "flex",
  alignItems: "stretch",
  minHeight: 14,
} as const;

const gutterSx = {
  flexShrink: 0,
  width: 16,
  userSelect: "none",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
} as const;

const foldButtonSx = {
  width: 16,
  height: 14,
  minWidth: 16,
  minHeight: 14,
  p: 0,
  color: "text.secondary",
  borderRadius: 0.4,
  "&:hover": {
    color: "text.primary",
    bgcolor: "action.hover",
  },
} as const;

const lineBodySx = {
  ...jsonTextSx,
  flex: 1,
  minWidth: 0,
  display: "block",
} as const;

const highlightMarkSx = {
  px: 0,
  borderRadius: 0.2,
  "&::selection": {
    backgroundColor: alpha("#5DA8FF", 0.46),
    color: "#F6FAFF",
  },
  "&::-moz-selection": {
    backgroundColor: alpha("#5DA8FF", 0.46),
    color: "#F6FAFF",
  },
} as const;

const renderHighlightedSlice = (
  text: string,
  sliceStart: number,
  sliceEnd: number,
  ranges: JsonMatchRange[],
  activeMatchIndex: number,
  keyPrefix: string,
): ReactNode => {
  const slice = text.slice(sliceStart, sliceEnd);
  if (sliceStart >= sliceEnd) {
    return null;
  }

  const overlapping = ranges.filter(
    (range) => range.start < sliceEnd && range.end > sliceStart,
  );
  if (!overlapping.length) {
    return <Fragment key={`${keyPrefix}-plain`}>{slice}</Fragment>;
  }

  const nodes: ReactNode[] = [];
  let cursor = sliceStart;
  overlapping.forEach((range, idx) => {
    const start = Math.max(range.start, sliceStart);
    const end = Math.min(range.end, sliceEnd);
    if (start > cursor) {
      nodes.push(
        <Fragment key={`${keyPrefix}-plain-${idx}`}>
          {text.slice(cursor, start)}
        </Fragment>,
      );
    }
    const isActive = range.index === activeMatchIndex;
    nodes.push(
      <Box
        component="mark"
        data-match-index={range.index}
        key={`${keyPrefix}-mark-${range.index}-${start}`}
        sx={{
          ...highlightMarkSx,
          bgcolor: isActive ? "#ff9800" : "warning.light",
          color: isActive ? "#1a1a1a" : "warning.contrastText",
        }}
      >
        {text.slice(start, end)}
      </Box>,
    );
    cursor = end;
  });
  if (cursor < sliceEnd) {
    nodes.push(
      <Fragment key={`${keyPrefix}-plain-tail`}>
        {text.slice(cursor, sliceEnd)}
      </Fragment>,
    );
  }

  return nodes;
};

const FoldableJsonTextInner = ({
  text,
  matchRanges = [],
  activeMatchIndex = -1,
}: FoldableJsonTextProps) => {
  const folds = useMemo(() => findJsonFoldRanges(text), [text]);
  const lines = useMemo(() => splitJsonLines(text), [text]);
  const [collapsedStarts, setCollapsedStarts] = useState<Set<number>>(
    () => new Set(),
  );

  const visibleCollapsed = useMemo(() => {
    if (activeMatchIndex < 0) {
      return collapsedStarts;
    }
    const activeRange = matchRanges.find(
      (range) => range.index === activeMatchIndex,
    );
    if (!activeRange) {
      return collapsedStarts;
    }

    const next = new Set(collapsedStarts);
    let changed = false;
    for (const fold of folds) {
      if (
        next.has(fold.start) &&
        foldCoversMatch(fold, activeRange.start, activeRange.end)
      ) {
        next.delete(fold.start);
        changed = true;
      }
    }
    return changed ? next : collapsedStarts;
  }, [activeMatchIndex, collapsedStarts, folds, matchRanges]);

  const hiddenLines = useMemo(
    () => collectHiddenLines(folds, visibleCollapsed),
    [folds, visibleCollapsed],
  );

  const toggleFold = (start: number) => {
    setCollapsedStarts((current) => {
      const next = new Set(current);
      if (next.has(start)) {
        next.delete(start);
      } else {
        next.add(start);
      }
      return next;
    });
  };

  return (
    <Box>
      {lines.map((line, lineIndex) => {
        if (hiddenLines.has(lineIndex)) {
          return null;
        }

        const fold = foldRangeStartingOnLine(folds, lineIndex);
        const isCollapsed = Boolean(fold && visibleCollapsed.has(fold.start));

        return (
          <Box key={line.start} sx={lineRowSx}>
            <Box sx={gutterSx}>
              {fold ? (
                <IconButton
                  size="small"
                  aria-label={
                    isCollapsed ? "Expand JSON block" : "Collapse JSON block"
                  }
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    toggleFold(fold.start);
                  }}
                  sx={foldButtonSx}
                >
                  {isCollapsed ? (
                    <ChevronRightRoundedIcon sx={{ fontSize: 14 }} />
                  ) : (
                    <ExpandMoreRoundedIcon sx={{ fontSize: 14 }} />
                  )}
                </IconButton>
              ) : null}
            </Box>
            <Box component="pre" sx={lineBodySx}>
              {fold && isCollapsed
                ? [
                    renderHighlightedSlice(
                      text,
                      line.start,
                      fold.start + 1,
                      matchRanges,
                      activeMatchIndex,
                      `fold-${fold.start}-prefix`,
                    ),
                    <Box
                      component="span"
                      key={`fold-${fold.start}-ellipsis`}
                      sx={{ color: "text.secondary" }}
                    >
                      …
                    </Box>,
                    renderHighlightedSlice(
                      text,
                      fold.end,
                      lines[fold.endLine]?.end ?? fold.end + 1,
                      matchRanges,
                      activeMatchIndex,
                      `fold-${fold.start}-suffix`,
                    ),
                  ]
                : renderHighlightedSlice(
                    text,
                    line.start,
                    line.end,
                    matchRanges,
                    activeMatchIndex,
                    `line-${lineIndex}`,
                  )}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
};

export const FoldableJsonText = (props: FoldableJsonTextProps) => (
  <FoldableJsonTextInner key={props.text} {...props} />
);
