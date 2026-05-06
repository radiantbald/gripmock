import ReactJsonView, {
  InteractionProps,
  ReactJsonViewProps,
} from "@microlink/react-json-view";
import { FormHelperText } from "@mui/material";
import {
  InputProps,
  Labeled,
  useInput,
} from "react-admin";

type JsonInputProps = {
  source: string;
  label?: string;
  helperText?: string;
  jsonString?: boolean;
  reactJsonOptions?: Omit<ReactJsonViewProps, "src">;
} & InputProps;

export const JsonInput = (props: JsonInputProps) => {
  const {
    field: { value, onChange },
    fieldState: { isTouched, error },
    formState: { isSubmitted },
    isRequired,
  } = useInput(props);

  const {
    source,
    label,
    helperText,
    jsonString = false,
    reactJsonOptions,
  } = props;

  const change = (updatedSrc: unknown) => {
    if (jsonString) {
      const next =
        updatedSrc &&
        typeof updatedSrc === "object" &&
        Object.keys(updatedSrc as object).length > 0
          ? JSON.stringify(updatedSrc)
          : null;
      onChange(next);
      return;
    }

    onChange(updatedSrc);
  };

  const onEdit = (edit: InteractionProps) => {
    change(edit.updated_src);
    if (typeof reactJsonOptions?.onEdit === "function") {
      reactJsonOptions.onEdit(edit);
    }
  };

  const onAdd = (add: InteractionProps) => {
    change(add.updated_src);
    if (typeof reactJsonOptions?.onAdd === "function") {
      reactJsonOptions.onAdd(add);
    }
  };

  const onDelete = (del: InteractionProps) => {
    change(del.updated_src);
    if (typeof reactJsonOptions?.onDelete === "function") {
      reactJsonOptions.onDelete(del);
    }
  };

  let src = value;
  if (jsonString && typeof value === "string") {
    try {
      src = value ? JSON.parse(value) : {};
    } catch {
      src = {};
    }
  }

  return (
    <div>
      <Labeled source={source} label={label} isRequired={isRequired}>
        <ReactJsonView
          {...reactJsonOptions}
          src={src || {}}
          onEdit={reactJsonOptions?.onEdit === false ? false : onEdit}
          onAdd={reactJsonOptions?.onAdd === false ? false : onAdd}
          onDelete={reactJsonOptions?.onDelete === false ? false : onDelete}
        />
      </Labeled>
      <FormHelperText error={(isTouched || isSubmitted) && !!error}>
        {error?.message || helperText}
      </FormHelperText>
    </div>
  );
};
