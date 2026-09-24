export const emptyJsonTextAreaValue = null;

export const prettyJson = (value: unknown): string => {
  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value === "string" && value.trim().length === 0) {
    return "";
  }

  return JSON.stringify(value, null, 2);
};

export const jsonTextAreaValueFromText = (text: string): unknown => {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return emptyJsonTextAreaValue;
  }

  return JSON.parse(text);
};
