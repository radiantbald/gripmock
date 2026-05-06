import ReactJsonView, { ReactJsonViewProps } from "@microlink/react-json-view";
import { FieldProps, useRecordContext } from "react-admin";

type JsonFieldProps = {
  source: string;
  jsonString?: boolean;
  reactJsonOptions?: Omit<ReactJsonViewProps, "src">;
} & FieldProps;

export const JsonField = ({
  source,
  jsonString = false,
  reactJsonOptions = {},
}: JsonFieldProps) => {
  const record = useRecordContext();
  let src = record?.[source];

  if (jsonString && typeof src === "string") {
    try {
      src = JSON.parse(src);
    } catch {
      src = {};
    }
  }

  return <ReactJsonView {...reactJsonOptions} src={src || {}} />;
};
