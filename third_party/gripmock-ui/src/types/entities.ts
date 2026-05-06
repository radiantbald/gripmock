export type ProtoFieldSchema = {
  name: string;
  jsonName: string;
  number: number;
  kind: string;
  cardinality: "optional" | "required" | "repeated";
  typeName?: string;
  oneof?: string;
  enumValues?: string[];
  map?: boolean;
  mapKeyKind?: string;
  mapValueKind?: string;
  mapValueTypeName?: string;
  message?: ProtoMessageSchema;
  mapValueMessage?: ProtoMessageSchema;
};

export type ProtoMessageSchema = {
  typeName: string;
  recursiveRef?: boolean;
  fields: ProtoFieldSchema[];
};

export type ServiceMethod = {
  id?: string;
  name?: string;
  methodType?: "unary" | "client_streaming" | "server_streaming" | "bidi_streaming";
  requestType?: string;
  inputType?: string;
  request?: string;
  responseType?: string;
  outputType?: string;
  response?: string;
  requestSchema?: ProtoMessageSchema;
  responseSchema?: ProtoMessageSchema;
  clientStreaming?: boolean;
  isClientStreaming?: boolean;
  serverStreaming?: boolean;
  isServerStreaming?: boolean;
};

export type ServiceRecord = {
  id: string;
  package?: string;
  name?: string;
  methods?: ServiceMethod[];
};

export type HistoryRecord = {
  id?: string;
  service?: string;
  method?: string;
  stubId?: string;
  timestamp?: string;
  error?: string;
  request?: unknown;
  response?: unknown;
};

export type StubRecord = {
  id: string;
  service?: string;
  method?: string;
  priority?: number;
  headers?: Record<string, unknown>;
  input?: {
    ignoreArrayOrder?: boolean;
    [key: string]: unknown;
  };
  inputs?: unknown[];
  output?: {
    stream?: unknown[];
    data?: unknown;
    error?: string;
    [key: string]: unknown;
  };
  options?: {
    times?: number;
    [key: string]: unknown;
  };
};
