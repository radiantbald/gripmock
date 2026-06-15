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
  methodType?:
    | "unary"
    | "client_streaming"
    | "server_streaming"
    | "bidi_streaming";
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
  callId?: string;
  transport?: string;
  client?: string;
  service?: string;
  method?: string;
  stubId?: string;
  room?: string;
  timestamp?: string;
  code?: number;
  error?: string;
  request?: unknown;
  requests?: unknown[];
  response?: unknown;
  responses?: unknown[];
  responseHeaders?: Record<string, string>;
  responseTimestamps?: string[];
  source?: "proto" | "reflection";
};

export type StubMatcherRule = {
  equals?: Record<string, unknown>;
  contains?: Record<string, unknown>;
  matches?: Record<string, unknown>;
  glob?: Record<string, unknown>;
  ignoreArrayOrder?: boolean;
  anyOf?: StubMatcherRule[];
  [key: string]: unknown;
};

export type StubRecord = {
  id: string;
  name?: string;
  service?: string;
  method?: string;
  enabled?: boolean;
  headers?: Record<string, unknown>;
  input?: StubMatcherRule;
  inputs?: StubMatcherRule[];
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
