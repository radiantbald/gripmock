import { describe, expect, it } from "vitest";

import {
  emptyJsonTextAreaValue,
  jsonTextAreaValueFromText,
  prettyJson,
} from "./jsonTextAreaValue";

describe("JsonTextAreaInput empty body", () => {
  it("clears a prefilled stub body and keeps it empty after blur", () => {
    const prefill = { message: "hello" };
    const defaultValues = { output: { data: prefill } };
    let formValue: unknown = defaultValues.output.data;

    expect(prettyJson(formValue)).toBe(JSON.stringify(prefill, null, 2));

    formValue = jsonTextAreaValueFromText("");
    const resolvedFormValue =
      formValue === undefined ? defaultValues.output.data : formValue;
    const textAfterBlur = prettyJson(resolvedFormValue);

    expect(formValue).toBe(emptyJsonTextAreaValue);
    expect(resolvedFormValue).toBeNull();
    expect(textAfterBlur).toBe("");
  });
});
