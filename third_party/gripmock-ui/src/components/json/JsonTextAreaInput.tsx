import AutoFixHighRoundedIcon from "@mui/icons-material/AutoFixHighRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import KeyboardArrowUpRoundedIcon from "@mui/icons-material/KeyboardArrowUpRounded";
import OpenInFullRoundedIcon from "@mui/icons-material/OpenInFullRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import {
  Box,
  Button,
  FormHelperText,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
  alpha,
} from "@mui/material";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { InputProps, useInput } from "react-admin";
import { useFormContext, useWatch } from "react-hook-form";

import { FloatingEditorModal } from "./FloatingEditorModal";
import {
  emptyJsonTextAreaValue,
  jsonTextAreaValueFromText,
  prettyJson,
} from "./jsonTextAreaValue";
import {
  buildSearchRegex,
  collectMatchRanges,
  type TextMatchRange,
  type TextSearchOptions,
} from "./textSearch";

type JsonTextAreaInputProps = {
  source: string;
  label?: ReactNode;
  helperText?: string;
  minRows?: number;
  syncNestedFields?: string[];
  visibleKeys?: string[];
  placeholder?: string;
} & InputProps;

const DEFAULT_SEARCH_OPTIONS: TextSearchOptions = {
  caseSensitive: false,
  wholeWord: false,
  useRegex: false,
};

const compactSearchBarSx = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 0.5,
  mx: -1.5,
  px: 1,
  py: 0.25,
  mb: 1,
  minHeight: 42,
  bgcolor: "#2f3136",
  borderBottom: "1px solid",
  borderColor: "divider",
} as const;

const compactSearchInputSx = {
  "& .MuiInputBase-root": {
    minHeight: 28,
    height: 28,
    bgcolor: alpha("#ffffff", 0.03),
    color: "text.primary",
    borderRadius: 1,
    alignItems: "center",
  },
  "& .MuiInputBase-input": {
    fontSize: 12,
    py: 0.35,
    px: 1,
    lineHeight: 1.3,
    "&::placeholder": {
      opacity: 1,
      color: "text.secondary",
    },
  },
  "& .MuiOutlinedInput-notchedOutline": {
    borderColor: alpha("#ffffff", 0.16),
  },
  "& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline": {
    borderColor: alpha("#ffffff", 0.28),
  },
  "& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline": {
    borderColor: "#FF6C37",
  },
} as const;

const compactSearchToggleButtonSx = {
  minWidth: 26,
  width: 26,
  height: 26,
  px: 0,
  fontSize: 11,
  lineHeight: 1,
  textTransform: "none",
  color: "grey.200",
  backgroundColor: "transparent",
  boxShadow: "none",
  "&:hover": {
    backgroundColor: "transparent",
    color: "#FF6C37",
    boxShadow: "none",
  },
  "&.MuiButton-contained": {
    backgroundColor: "transparent",
    color: "#FF6C37",
    boxShadow: "none",
  },
  "&.MuiButton-contained:hover": {
    backgroundColor: "transparent",
    color: "#FF6C37",
    boxShadow: "none",
  },
} as const;

const compactSearchIconButtonSx = {
  width: 26,
  height: 26,
  p: 0,
  color: "grey.200",
  "&:hover": {
    backgroundColor: "transparent",
    color: "#FF6C37",
  },
} as const;

const compactSearchCounterSx = {
  minWidth: 48,
  textAlign: "center",
  color: "grey.300",
  fontSize: 12,
  lineHeight: 1,
  transition: "color 120ms ease",
  "&:hover": {
    color: "#FF6C37",
  },
} as const;

const editorFontSx = {
  fontFamily:
    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: 13,
  lineHeight: 1.5,
} as const;

const renderSearchHighlights = (
  value: string,
  ranges: TextMatchRange[],
  activeIndex: number,
): ReactNode => {
  if (ranges.length === 0) {
    return value;
  }

  const nodes: ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((range) => {
    if (range.start > cursor) {
      nodes.push(
        <Fragment key={`plain-${cursor}`}>
          {value.slice(cursor, range.start)}
        </Fragment>,
      );
    }
    const isActive = range.index === activeIndex;
    nodes.push(
      <Box
        component="mark"
        key={`match-${range.index}`}
        data-match-index={range.index}
        sx={{
          bgcolor: isActive ? "#ff9800" : alpha("#ff9800", 0.35),
          color: "transparent",
          p: 0,
        }}
      >
        {value.slice(range.start, range.end)}
      </Box>,
    );
    cursor = range.end;
  });
  if (cursor < value.length) {
    nodes.push(<Fragment key="plain-tail">{value.slice(cursor)}</Fragment>);
  }
  return nodes;
};

const headerIconButtonSx = {
  m: 0,
  p: 0,
  width: 18,
  height: 18,
  borderRadius: 0,
  bgcolor: "transparent",
  color: "text.secondary",
  transition: "color 0.15s ease",
  "&:hover": {
    color: "primary.main",
    bgcolor: "transparent",
  },
} as const;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return !!value && typeof value === "object" && !Array.isArray(value);
};

const projectVisibleValue = (
  value: unknown,
  visibleKeys: string[],
): unknown => {
  if (visibleKeys.length === 0 || !isRecord(value)) {
    return value;
  }

  const projected: Record<string, unknown> = {};
  for (const key of visibleKeys) {
    if (Object.hasOwn(value, key) && value[key] !== undefined) {
      projected[key] = value[key];
    }
  }

  if (Object.keys(projected).length === 0) {
    return undefined;
  }

  return projected;
};

const mergeVisibleValue = (
  currentValue: unknown,
  parsedValue: unknown,
  visibleKeys: string[],
): unknown => {
  if (visibleKeys.length === 0 || !isRecord(parsedValue)) {
    return parsedValue;
  }

  const next = isRecord(currentValue) ? { ...currentValue } : {};
  for (const key of visibleKeys) {
    delete next[key];
  }

  for (const key of visibleKeys) {
    if (Object.hasOwn(parsedValue, key)) {
      next[key] = parsedValue[key];
    }
  }

  return next;
};

const scrollTextareaToOffset = (
  textarea: HTMLTextAreaElement,
  offset: number,
) => {
  const style = window.getComputedStyle(textarea);
  const parsedLineHeight = Number.parseFloat(style.lineHeight);
  const fontSize = Number.parseFloat(style.fontSize) || 13;
  const lineHeight = Number.isFinite(parsedLineHeight)
    ? parsedLineHeight
    : fontSize * 1.5;
  const paddingTop = Number.parseFloat(style.paddingTop) || 0;
  const lineIndex = textarea.value.slice(0, offset).split("\n").length - 1;
  const target =
    paddingTop +
    lineIndex * lineHeight -
    textarea.clientHeight / 2 +
    lineHeight / 2;
  textarea.scrollTop = Math.max(0, target);
};

export const JsonTextAreaInput = (props: JsonTextAreaInputProps) => {
  const {
    source,
    label,
    helperText,
    minRows = 10,
    syncNestedFields = [],
    visibleKeys = [],
    placeholder = "{}",
  } = props;
  const { getValues } = useFormContext();

  const {
    field: { value, onChange },
    fieldState: { isTouched, error },
    formState: { isSubmitted },
    isRequired,
  } = useInput(props);

  const initialText = useMemo(
    () => prettyJson(projectVisibleValue(value, visibleKeys)),
    [value, visibleKeys],
  );
  const [text, setText] = useState(initialText);
  const [parseError, setParseError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOptions, setSearchOptions] = useState<TextSearchOptions>(
    DEFAULT_SEARCH_OPTIONS,
  );
  const [activeMatch, setActiveMatch] = useState(-1);
  const expandedTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const highlightOverlayRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const syncFieldNames = useMemo(
    () => syncNestedFields.map((field) => `${source}.${field}`),
    [source, syncNestedFields],
  );
  const watchedSyncValues = useWatch({
    name: syncFieldNames,
  });

  const searchRegex = useMemo(
    () => buildSearchRegex(searchQuery, searchOptions),
    [searchOptions, searchQuery],
  );
  const matchRanges = useMemo(
    () => collectMatchRanges(text, searchRegex),
    [searchRegex, text],
  );
  const matchCount = matchRanges.length;
  const resolvedActiveMatch =
    showSearch && matchCount > 0
      ? activeMatch < 0 || activeMatch >= matchCount
        ? 0
        : activeMatch
      : -1;

  useEffect(() => {
    if (isFocused) {
      return;
    }
    if (parseError) {
      return;
    }

    setText((prev) => (prev === initialText ? prev : initialText));
  }, [initialText, isFocused, parseError]);

  useEffect(() => {
    if (syncFieldNames.length === 0) {
      return;
    }
    if (isFocused) {
      return;
    }
    if (parseError) {
      return;
    }

    const latest = getValues(source);
    const nextText = prettyJson(projectVisibleValue(latest, visibleKeys));
    const currentTextFromValue = prettyJson(
      projectVisibleValue(value, visibleKeys),
    );

    if (currentTextFromValue !== nextText) {
      onChange(latest);
    }

    setText((prev) => (prev === nextText ? prev : nextText));
  }, [
    getValues,
    onChange,
    source,
    syncFieldNames.length,
    value,
    visibleKeys,
    watchedSyncValues,
    isFocused,
    parseError,
  ]);

  useEffect(() => {
    if (!expanded || !showSearch || resolvedActiveMatch < 0) {
      return;
    }

    const textarea = expandedTextareaRef.current;
    const range = matchRanges[resolvedActiveMatch];
    if (!textarea || !range) {
      return;
    }

    if (document.activeElement === textarea) {
      return;
    }

    const restoreSearchFocus =
      document.activeElement === searchInputRef.current;
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(range.start, range.end);
    scrollTextareaToOffset(textarea, range.start);

    const overlay = highlightOverlayRef.current;
    const mark = overlay?.querySelector<HTMLElement>(
      `[data-match-index="${resolvedActiveMatch}"]`,
    );
    if (overlay && mark) {
      const overlayRect = overlay.getBoundingClientRect();
      const markRect = mark.getBoundingClientRect();
      overlay.scrollTop = Math.max(
        0,
        markRect.top -
          overlayRect.top -
          overlay.clientHeight / 2 +
          overlay.scrollTop,
      );
      overlay.scrollLeft = textarea.scrollLeft;
    } else if (overlay) {
      overlay.scrollTop = textarea.scrollTop;
      overlay.scrollLeft = textarea.scrollLeft;
    }

    if (restoreSearchFocus) {
      searchInputRef.current?.focus();
    }
  }, [expanded, matchRanges, resolvedActiveMatch, showSearch]);

  useEffect(() => {
    if (!expanded || !showSearch) {
      return;
    }
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
  }, [expanded, showSearch]);

  const updateValueFromText = (nextText: string) => {
    try {
      const parsed = jsonTextAreaValueFromText(nextText);
      setParseError(null);
      onChange(
        parsed === emptyJsonTextAreaValue
          ? parsed
          : mergeVisibleValue(value, parsed, visibleKeys),
      );
    } catch {
      setParseError("Invalid JSON. Fix syntax and try again.");
    }
  };

  const handleTextChange = (nextText: string) => {
    setText(nextText);
    updateValueFromText(nextText);
  };

  const handleBeautify = () => {
    const trimmed = text.trim();
    if (!trimmed) {
      setText("{}");
      setParseError(null);
      onChange({});
      return;
    }

    try {
      const parsed = JSON.parse(text);
      const formatted = JSON.stringify(parsed, null, 2);
      setText(formatted);
      setParseError(null);
      onChange(mergeVisibleValue(value, parsed, visibleKeys));
    } catch {
      setParseError("Beautify failed: JSON is invalid.");
    }
  };

  const resetSearch = useCallback(() => {
    setShowSearch(false);
    setSearchQuery("");
    setSearchOptions(DEFAULT_SEARCH_OPTIONS);
    setActiveMatch(-1);
  }, []);

  const closeExpanded = useCallback(() => {
    setExpanded(false);
    resetSearch();
  }, [resetSearch]);

  const closeSearch = useCallback(() => {
    setShowSearch(false);
    setSearchQuery("");
    setActiveMatch(-1);
  }, []);

  const toggleSearch = useCallback(() => {
    if (showSearch) {
      closeSearch();
      return;
    }
    setShowSearch(true);
  }, [closeSearch, showSearch]);

  const stepMatch = useCallback(
    (delta: number) => {
      if (matchCount === 0) {
        return;
      }
      const base =
        resolvedActiveMatch < 0 ? (delta > 0 ? -1 : 0) : resolvedActiveMatch;
      setActiveMatch((base + delta + matchCount) % matchCount);
    },
    [matchCount, resolvedActiveMatch],
  );

  const toggleSearchOption = (key: keyof TextSearchOptions) => {
    setSearchOptions((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  useEffect(() => {
    if (!expanded) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const isFindShortcut =
        (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f";
      if (isFindShortcut) {
        event.preventDefault();
        event.stopPropagation();
        toggleSearch();
        return;
      }

      if (event.key === "Escape" && showSearch) {
        event.preventDefault();
        event.stopPropagation();
        closeSearch();
        return;
      }

      if (!showSearch || event.key !== "Enter") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      stepMatch(event.shiftKey ? -1 : 1);
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [closeSearch, expanded, showSearch, stepMatch, toggleSearch]);

  return (
    <div>
      <Stack spacing={1}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Typography variant="body2" color="text.secondary">
            {label || source}
            {isRequired ? " *" : ""}
          </Typography>
          <IconButton
            size="small"
            aria-label="Expand editor"
            onClick={() => {
              setExpanded(true);
            }}
            sx={{
              m: 0,
              p: 0,
              width: 14,
              height: 14,
              borderRadius: 0,
              bgcolor: "transparent",
              color: "text.secondary",
              transition: "color 0.15s ease",
              "&:hover": {
                color: "primary.main",
                bgcolor: "transparent",
              },
            }}
          >
            <OpenInFullRoundedIcon sx={{ fontSize: 12, display: "block" }} />
          </IconButton>
        </Box>
        <Stack spacing={1}>
          <TextField
            multiline
            fullWidth
            rows={minRows}
            value={text}
            placeholder={placeholder}
            onFocusCapture={() => {
              setIsFocused(true);
            }}
            onBlurCapture={() => {
              setIsFocused(false);
            }}
            onChange={(event) => {
              handleTextChange(event.target.value);
            }}
            variant="outlined"
            slotProps={{
              input: {
                endAdornment: (
                  <Tooltip title="Beautify JSON">
                    <IconButton
                      size="small"
                      onClick={handleBeautify}
                      sx={{
                        alignSelf: "flex-start",
                        m: 0,
                        width: 16,
                        height: 16,
                        p: 0,
                        color: "text.secondary",
                        "&:hover": {
                          bgcolor: "transparent",
                          color: "primary.main",
                        },
                      }}
                      aria-label="Beautify JSON"
                    >
                      <AutoFixHighRoundedIcon
                        sx={{ fontSize: 14, display: "block" }}
                      />
                    </IconButton>
                  </Tooltip>
                ),
                sx: {
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                  fontSize: 13,
                  lineHeight: 1.5,
                  p: "14px",
                  alignItems: "flex-start",
                  "& textarea": {
                    overflowY: "auto !important",
                    resize: "none",
                  },
                },
              },
            }}
          />
        </Stack>
      </Stack>
      <FormHelperText
        error={!!parseError || ((isTouched || isSubmitted) && !!error)}
      >
        {parseError || error?.message || helperText}
      </FormHelperText>
      <FloatingEditorModal
        open={expanded}
        onClose={(_, reason) => {
          if (reason === "escapeKeyDown" && showSearch) {
            closeSearch();
            return;
          }
          closeExpanded();
        }}
        onCloseClick={closeExpanded}
        title={
          <Typography variant="body2" color="text.secondary">
            {label || source}
          </Typography>
        }
        actions={
          <IconButton
            size="small"
            aria-label={showSearch ? "Close search" : "Find in editor"}
            onClick={toggleSearch}
            sx={headerIconButtonSx}
          >
            <SearchRoundedIcon sx={{ fontSize: 16, display: "block" }} />
          </IconButton>
        }
      >
        {showSearch ? (
          <Box sx={compactSearchBarSx}>
            <TextField
              inputRef={searchInputRef}
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);
              }}
              size="small"
              fullWidth
              placeholder="Find"
              sx={compactSearchInputSx}
            />
            <Button
              size="small"
              variant={searchOptions.caseSensitive ? "contained" : "text"}
              onClick={() => {
                toggleSearchOption("caseSensitive");
              }}
              sx={compactSearchToggleButtonSx}
            >
              Aa
            </Button>
            <Button
              size="small"
              variant={searchOptions.wholeWord ? "contained" : "text"}
              onClick={() => {
                toggleSearchOption("wholeWord");
              }}
              sx={compactSearchToggleButtonSx}
            >
              ab
            </Button>
            <Button
              size="small"
              variant={searchOptions.useRegex ? "contained" : "text"}
              onClick={() => {
                toggleSearchOption("useRegex");
              }}
              sx={compactSearchToggleButtonSx}
            >
              .*
            </Button>
            <Typography variant="body2" sx={compactSearchCounterSx}>
              {matchCount > 0
                ? `${resolvedActiveMatch + 1} of ${matchCount}`
                : "0 of 0"}
            </Typography>
            <IconButton
              size="small"
              onClick={() => {
                stepMatch(-1);
              }}
              disabled={matchCount === 0}
              sx={compactSearchIconButtonSx}
              aria-label="Previous match"
            >
              <KeyboardArrowUpRoundedIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              onClick={() => {
                stepMatch(1);
              }}
              disabled={matchCount === 0}
              sx={compactSearchIconButtonSx}
              aria-label="Next match"
            >
              <KeyboardArrowDownRoundedIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              onClick={closeSearch}
              sx={compactSearchIconButtonSx}
              aria-label="Close search"
            >
              <CloseRoundedIcon fontSize="small" />
            </IconButton>
          </Box>
        ) : null}
        <Box sx={{ flex: 1, minHeight: 0, position: "relative" }}>
          {showSearch && matchCount > 0 ? (
            <Box
              ref={highlightOverlayRef}
              aria-hidden
              sx={{
                position: "absolute",
                inset: 0,
                overflow: "hidden",
                pointerEvents: "none",
                zIndex: 1,
                p: "14px",
                pr: "36px",
                boxSizing: "border-box",
              }}
            >
              <Box
                component="pre"
                sx={{
                  m: 0,
                  ...editorFontSx,
                  whiteSpace: "pre-wrap",
                  overflowWrap: "anywhere",
                  color: "transparent",
                }}
              >
                {renderSearchHighlights(text, matchRanges, resolvedActiveMatch)}
              </Box>
            </Box>
          ) : null}
          <TextField
            inputRef={expandedTextareaRef}
            multiline
            fullWidth
            value={text}
            placeholder={placeholder}
            onFocusCapture={() => {
              setIsFocused(true);
            }}
            onBlurCapture={() => {
              setIsFocused(false);
            }}
            onChange={(event) => {
              handleTextChange(event.target.value);
            }}
            variant="outlined"
            sx={{ height: "100%" }}
            slotProps={{
              htmlInput: {
                onScroll: (event: { currentTarget: HTMLTextAreaElement }) => {
                  const overlay = highlightOverlayRef.current;
                  if (!overlay) {
                    return;
                  }
                  overlay.scrollTop = event.currentTarget.scrollTop;
                  overlay.scrollLeft = event.currentTarget.scrollLeft;
                },
              },
              input: {
                endAdornment: (
                  <Tooltip title="Beautify JSON">
                    <IconButton
                      size="small"
                      onClick={handleBeautify}
                      sx={{
                        alignSelf: "flex-start",
                        m: 0,
                        width: 16,
                        height: 16,
                        p: 0,
                        color: "text.secondary",
                        "&:hover": {
                          bgcolor: "transparent",
                          color: "primary.main",
                        },
                      }}
                      aria-label="Beautify JSON"
                    >
                      <AutoFixHighRoundedIcon
                        sx={{ fontSize: 14, display: "block" }}
                      />
                    </IconButton>
                  </Tooltip>
                ),
                sx: {
                  height: "100%",
                  ...editorFontSx,
                  p: "14px",
                  alignItems: "flex-start",
                  "& textarea": {
                    height: "100% !important",
                    overflowY: "auto !important",
                    resize: "none",
                  },
                },
              },
            }}
          />
        </Box>
      </FloatingEditorModal>
    </div>
  );
};
