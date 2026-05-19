import {
  Box,
  Button,
  FormHelperText,
  Stack,
  Typography,
} from "@mui/material";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { BooleanInput, useRecordContext } from "react-admin";
import { KeyValueTableInput } from "./KeyValueTableInput";

type StubMatcherInputProps = {
  inputSource?: string;
  inputsSource?: string;
  label?: string;
  helperText?: string;
  minRows?: number;
  mode: "create" | "edit";
};

const matcherKeys = new Set(["equals", "contains", "matches", "glob", "anyOf", "ignoreArrayOrder"]);
const scalarMatcherKeys = ["equals", "contains", "matches", "glob"] as const;
type ScalarMatcherKey = (typeof scalarMatcherKeys)[number];
const ANY_OF_MODE_KEY = "__anyOfEnabled";

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isMatcherObject = (value: unknown): value is Record<string, unknown> =>
  isPlainObject(value) && Object.keys(value).some((key) => matcherKeys.has(key));

const normalizeInputMatcher = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (!isPlainObject(item)) {
        return item;
      }

      return isMatcherObject(item) ? item : { equals: item };
    });
  }

  if (!isPlainObject(value)) {
    return value;
  }

  return isMatcherObject(value) ? value : { equals: value };
};

const normalizeMatcherForFields = (value: unknown): Record<string, unknown> => {
  if (!isPlainObject(value)) {
    return {};
  }

  const normalized: Record<string, unknown> = {};

  if (value.ignoreArrayOrder === true) {
    normalized.ignoreArrayOrder = true;
  }

  for (const key of scalarMatcherKeys) {
    const section = value[key];
    if (!isPlainObject(section)) {
      continue;
    }
    normalized[key] = {
      ...(isPlainObject(normalized[key]) ? (normalized[key] as Record<string, unknown>) : {}),
      ...section,
    };
  }

  if (Array.isArray(value.anyOf)) {
    for (const rule of value.anyOf) {
      if (!isPlainObject(rule)) {
        continue;
      }
      if (rule.ignoreArrayOrder === true) {
        normalized.ignoreArrayOrder = true;
      }
      for (const key of scalarMatcherKeys) {
        const section = rule[key];
        if (!isPlainObject(section)) {
          continue;
        }
        normalized[key] = {
          ...(isPlainObject(normalized[key]) ? (normalized[key] as Record<string, unknown>) : {}),
          ...section,
        };
      }
    }
  }

  for (const [key, rawValue] of Object.entries(value)) {
    if (!matcherKeys.has(key) && rawValue !== undefined && key !== ANY_OF_MODE_KEY) {
      normalized[key] = rawValue;
    }
  }

  const explicitAnyOfMode = value[ANY_OF_MODE_KEY];
  normalized[ANY_OF_MODE_KEY] =
    typeof explicitAnyOfMode === "boolean"
      ? explicitAnyOfMode
      : Array.isArray(value.anyOf) && value.anyOf.length > 0;

  return normalized;
};

const isEmptyObject = (value: unknown): boolean => isPlainObject(value) && Object.keys(value).length === 0;

const validateRegexValues = (value: unknown, path: string): string[] => {
  if (!isPlainObject(value)) {
    return [];
  }

  const errors: string[] = [];
  for (const [key, pattern] of Object.entries(value)) {
    if (typeof pattern !== "string") {
      continue;
    }

    try {
      void new RegExp(pattern);
    } catch {
      errors.push(`${path}.${key}: invalid regex`);
    }
  }

  return errors;
};

const hasBalancedDelimiters = (pattern: string): boolean => {
  const stack: string[] = [];
  const openToClose: Record<string, string> = { "[": "]", "{": "}", "(": ")" };
  const closing = new Set(Object.values(openToClose));
  let escaped = false;

  for (const char of pattern) {
    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char in openToClose) {
      stack.push(char);
      continue;
    }

    if (closing.has(char)) {
      const open = stack.pop();
      if (!open || openToClose[open] !== char) {
        return false;
      }
    }
  }

  return stack.length === 0;
};

const validateGlobValues = (value: unknown, path: string): string[] => {
  if (!isPlainObject(value)) {
    return [];
  }

  const errors: string[] = [];
  for (const [key, pattern] of Object.entries(value)) {
    if (typeof pattern !== "string") {
      continue;
    }

    if (!hasBalancedDelimiters(pattern)) {
      errors.push(`${path}.${key}: malformed glob`);
    }
  }

  return errors;
};

const collectMatcherValidationErrors = (matcher: unknown): string[] => {
  if (!isPlainObject(matcher)) {
    return [];
  }

  const errors = [
    ...validateRegexValues(matcher.matches, "matches"),
    ...validateGlobValues(matcher.glob, "glob"),
  ];

  if (Array.isArray(matcher.anyOf)) {
    matcher.anyOf.forEach((rule, index) => {
      if (!isPlainObject(rule)) {
        return;
      }
      errors.push(...validateRegexValues(rule.matches, `anyOf[${index}].matches`));
      errors.push(...validateGlobValues(rule.glob, `anyOf[${index}].glob`));
    });
  }

  return errors;
};

const collectUnknownMatcherKeys = (matcher: unknown): string[] => {
  if (!isPlainObject(matcher)) {
    return [];
  }

  const unknown = Object.keys(matcher).filter((key) => !matcherKeys.has(key) && key !== ANY_OF_MODE_KEY);
  const anyOf = Array.isArray(matcher.anyOf) ? matcher.anyOf : [];

  anyOf.forEach((rule, index) => {
    if (!isPlainObject(rule)) {
      return;
    }

    Object.keys(rule)
      .filter((key) => !matcherKeys.has(key) && key !== ANY_OF_MODE_KEY)
      .forEach((key) => unknown.push(`anyOf[${index}].${key}`));
  });

  return unknown;
};

const compactMatcherRule = (value: unknown): Record<string, unknown> | undefined => {
  if (!isPlainObject(value)) {
    return undefined;
  }

  const result: Record<string, unknown> = {};

  if (value.ignoreArrayOrder === true) {
    result.ignoreArrayOrder = true;
  }
  if (typeof value[ANY_OF_MODE_KEY] === "boolean") {
    result[ANY_OF_MODE_KEY] = value[ANY_OF_MODE_KEY];
  }

  for (const key of scalarMatcherKeys) {
    const rawSection = value[key];
    if (!isPlainObject(rawSection)) {
      continue;
    }

    const filtered = Object.fromEntries(
      Object.entries(rawSection).filter(([entryKey]) => entryKey.trim().length > 0),
    );
    if (Object.keys(filtered).length > 0) {
      result[key] = filtered;
    }
  }

  for (const [key, rawValue] of Object.entries(value)) {
    if (!matcherKeys.has(key) && rawValue !== undefined) {
      result[key] = rawValue;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
};

const compactMatcherRoot = (value: unknown): Record<string, unknown> | undefined => {
  if (!isPlainObject(value)) {
    return undefined;
  }

  const compacted = compactMatcherRule(value) || {};
  // Keep fields-mode state in form as-is; convert to API payload on submit.
  if (!Array.isArray(compacted.anyOf)) {
    delete compacted.anyOf;
  }

  return Object.keys(compacted).length > 0 ? compacted : undefined;
};

const matcherKeyLabels: Record<ScalarMatcherKey, string> = {
  equals: "equals",
  contains: "contains",
  matches: "matches (regex)",
  glob: "glob",
};

const matcherBooleanInputSx = {
  my: 0,
  width: "fit-content",
  "& .MuiFormControlLabel-root": {
    m: 0,
  },
  "& .MuiFormControlLabel-label": {
    fontSize: "0.875rem",
    lineHeight: 1.3,
  },
} as const;

const getDefaultMatcherKey = (value: unknown): ScalarMatcherKey => {
  if (!isPlainObject(value)) {
    return "equals";
  }

  for (const key of scalarMatcherKeys) {
    const section = value[key];
    if (isPlainObject(section) && Object.keys(section).length > 0) {
      return key;
    }
  }

  return "equals";
};

const MatcherRuleKeyValueEditor = ({
  baseSource,
  maxTableHeight,
  controls,
  headerLabel,
}: {
  baseSource: string;
  maxTableHeight: number;
  controls?: ReactNode;
  headerLabel: string;
}) => {
  const ruleValue = useWatch({ name: baseSource });
  const [selectedKey, setSelectedKey] = useState<ScalarMatcherKey>(() => getDefaultMatcherKey(ruleValue));

  useEffect(() => {
    if (!scalarMatcherKeys.includes(selectedKey)) {
      setSelectedKey(getDefaultMatcherKey(ruleValue));
    }
  }, [ruleValue, selectedKey]);

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "250px minmax(0, 1fr)" },
        columnGap: 1.25,
        rowGap: 0.75,
        alignItems: "start",
        width: "100%",
        minWidth: 0,
      }}
    >
      <Box sx={{ gridColumn: { md: "1 / 2" }, display: "flex", alignItems: "center", minHeight: 28 }}>
        <Typography variant="body2" color="text.secondary">
          {headerLabel}
        </Typography>
      </Box>
      <Box sx={{ gridColumn: { md: "2 / 3" }, minWidth: 0 }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            gap: 1.25,
            flexWrap: "nowrap",
            overflowX: "auto",
            minWidth: 0,
            pb: 0.25,
          }}
        >
          {scalarMatcherKeys.map((key) => {
            const isSelected = selectedKey === key;
            return (
              <Button
                key={key}
                type="button"
                onClick={() => {
                  setSelectedKey(key);
                }}
                sx={{
                  justifyContent: "flex-start",
                  textTransform: "none",
                  px: 0,
                  py: 0.25,
                  minHeight: "unset",
                  minWidth: "unset",
                  color: isSelected ? "#FF6C37" : "text.secondary",
                  fontWeight: isSelected ? 700 : 500,
                  backgroundColor: "transparent",
                  "&:hover": {
                    color: "#FF6C37",
                    backgroundColor: "transparent",
                  },
                }}
              >
                {matcherKeyLabels[key]}
              </Button>
            );
          })}
        </Box>
      </Box>
      <Stack spacing={1} sx={{ gridColumn: { md: "1 / 2" }, alignItems: "flex-start" }}>
        {controls}
      </Stack>
      <Box sx={{ gridColumn: { md: "2 / 3" }, minWidth: 0 }}>
        <KeyValueTableInput
          source={`${baseSource}.${selectedKey}`}
          label={matcherKeyLabels[selectedKey]}
          hideLabel
          maxTableHeight={maxTableHeight}
        />
      </Box>
    </Box>
  );
};

const MatcherFieldsEditor = ({
  inputSource,
  label,
}: {
  inputSource: string;
  label: string;
}) => {
  const { setValue } = useFormContext();
  const anyOfModeSource = `${inputSource}.${ANY_OF_MODE_KEY}`;
  const anyOfEnabled = useWatch({ name: anyOfModeSource });
  const matcherRoot = useWatch({ name: inputSource });
  const effectiveAnyOfEnabled =
    typeof anyOfEnabled === "boolean"
      ? anyOfEnabled
      : isPlainObject(matcherRoot) && Array.isArray(matcherRoot.anyOf) && matcherRoot.anyOf.length > 0;

  useEffect(() => {
    if (typeof anyOfEnabled === "boolean") {
      return;
    }
    setValue(anyOfModeSource, effectiveAnyOfEnabled, { shouldDirty: false });
  }, [anyOfEnabled, anyOfModeSource, effectiveAnyOfEnabled, setValue]);

  return (
    <Stack spacing={1}>
      <MatcherRuleKeyValueEditor
        baseSource={inputSource}
        maxTableHeight={130}
        headerLabel={label}
        controls={
          <>
            <BooleanInput
              source={`${inputSource}.ignoreArrayOrder`}
              label="ignoreArrayOrder"
              helperText={false}
              sx={matcherBooleanInputSx}
            />
            <BooleanInput
              source={anyOfModeSource}
              label={`anyOf rules (${effectiveAnyOfEnabled ? "OR" : "AND"})`}
              helperText={false}
              sx={matcherBooleanInputSx}
            />
          </>
        }
      />
    </Stack>
  );
};

export const StubMatcherInput = ({
  inputSource = "input",
  inputsSource = "inputs",
  label = "Input / Inputs",
  helperText,
  mode,
}: StubMatcherInputProps) => {
  const record = useRecordContext();
  const { setValue } = useFormContext();
  const watchedInput = useWatch({ name: inputSource });
  const watchedInputs = useWatch({ name: inputsSource });
  const [isInitialized, setInitialized] = useState(false);

  const currentMatcherValue = useMemo(() => {
    if (Array.isArray(watchedInputs) && watchedInputs.length > 0) {
      const firstRule = watchedInputs.find((item) => isPlainObject(item));
      return firstRule || watchedInputs[0];
    }

    if (isPlainObject(watchedInput) && !isEmptyObject(watchedInput)) {
      return watchedInput;
    }

    return undefined;
  }, [watchedInput, watchedInputs]);

  const initialValue = useMemo(() => {
    if (currentMatcherValue !== undefined) {
      return currentMatcherValue;
    }

    if (Array.isArray(record?.[inputsSource])) {
      const firstRule = record[inputsSource].find((item) => isPlainObject(item));
      return firstRule || record[inputsSource][0];
    }

    if (record?.[inputSource] && isPlainObject(record[inputSource])) {
      return record[inputSource];
    }

    return undefined;
  }, [currentMatcherValue, inputSource, inputsSource, record]);

  const rootMatcher = isPlainObject(currentMatcherValue)
    ? currentMatcherValue
    : isPlainObject(initialValue)
      ? initialValue
      : {};
  const validationErrors = collectMatcherValidationErrors(rootMatcher);
  const unknownKeyPaths = collectUnknownMatcherKeys(rootMatcher);

  useEffect(() => {
    if (isInitialized) {
      return;
    }

    if (mode === "edit" && !record) {
      return;
    }

    const unsetValue = mode === "edit" ? null : undefined;
    if (mode === "create" && !isPlainObject(initialValue)) {
      setValue(inputSource, {}, { shouldDirty: false });
      setValue(inputsSource, unsetValue, { shouldDirty: false });
    } else {
      const normalized = normalizeInputMatcher(initialValue);
      if (normalized && typeof normalized === "object" && !Array.isArray(normalized)) {
        setValue(inputSource, normalizeMatcherForFields(normalized), { shouldDirty: false });
        setValue(inputsSource, unsetValue, { shouldDirty: false });
      }
    }

    setInitialized(true);
  }, [initialValue, inputSource, inputsSource, isInitialized, mode, record, setValue]);

  useEffect(() => {
    if (!isPlainObject(watchedInput)) {
      return;
    }

    const compacted = compactMatcherRoot(watchedInput);
    const nextInput = compacted ?? {};
    if (JSON.stringify(watchedInput) !== JSON.stringify(nextInput)) {
      setValue(inputSource, nextInput, { shouldDirty: true });
    }
  }, [inputSource, setValue, watchedInput]);

  useEffect(() => {
    const unsetValue = mode === "edit" ? null : undefined;
    if (Array.isArray(watchedInputs) && watchedInputs.length > 0) {
      setValue(inputsSource, unsetValue, { shouldDirty: true });
    }
  }, [inputsSource, mode, setValue, watchedInputs]);

  return (
    <div>
      <Stack spacing={1}>
        <MatcherFieldsEditor inputSource={inputSource} label={label || inputSource} />
        {helperText ? <FormHelperText>{helperText}</FormHelperText> : null}
      </Stack>
      {validationErrors.length > 0 ? (
        <FormHelperText error>
          {`Validation: ${validationErrors.join("; ")}`}
        </FormHelperText>
      ) : null}
      {unknownKeyPaths.length > 0 ? (
        <FormHelperText>
          {`Custom matcher keys detected: ${unknownKeyPaths.join(", ")}.`}
        </FormHelperText>
      ) : null}
    </div>
  );
};
