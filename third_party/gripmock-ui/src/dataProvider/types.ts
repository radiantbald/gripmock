export type RequestOptions = {
  method?: string;
  body?: string | Blob | FormData | null;
  headers?: Record<string, string>;
  skipSessionHeader?: boolean;
};

export type Sort = {
  field: string;
  order: "ASC" | "DESC";
};

export type Filter = Record<string, unknown>;
export type Row = Record<string, unknown>;
