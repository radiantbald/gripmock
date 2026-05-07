import { DataProvider } from "react-admin";

import { apiClient } from "./apiClient";
import {
  asRow,
  backendListResources,
  buildBackendListQuery,
  dataProcessing,
  ensureArray,
  normalizeHistoryRows,
} from "./processing";
import { canonicalResource } from "./resources";
import type { Row } from "./types";
import { getCurrentSession } from "../utils/session";

type RAResult<T> = { data: T };

const extractSessionName = (value: unknown): string => {
  if (typeof value === "string") {
    return value.trim();
  }

  if (!value || typeof value !== "object") {
    return "";
  }

  const row = value as Record<string, unknown>;
  const candidate = row.session || row.name || row.id;
  return typeof candidate === "string" ? candidate.trim() : "";
};

const toText = (value: unknown): string => (typeof value === "string" ? value.trim() : String(value ?? "").trim());

const extractSessionRow = (value: unknown): { id: string; session: string; name: string } | null => {
  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) {
      return null;
    }

    return { id: normalized, session: normalized, name: normalized };
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const row = value as Record<string, unknown>;
  const sessionName = extractSessionName(value);
  if (!sessionName) {
    return null;
  }

  const id = toText(row.id || sessionName);
  if (!id) {
    return null;
  }

  return {
    id,
    session: sessionName,
    name: sessionName,
  };
};

const toNumericId = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.length > 0) {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
      hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
    }

    return hash;
  }

  return Date.now();
};

const dataProvider: DataProvider = {
  getList: async (resource, params) => {
    const canonical = canonicalResource(resource);

    if (canonical === "sessions") {
      const json = await apiClient.request<unknown>(`/${canonical}`);
      const payload =
        ensureArray<unknown>((json as { sessions?: unknown[] } | undefined)?.sessions).length > 0
          ? ensureArray<unknown>((json as { sessions?: unknown[] }).sessions)
          : ensureArray<unknown>(json);
      const byId = new Map<string, { id: string; session: string; name: string }>();
      payload.forEach((item) => {
        const row = extractSessionRow(item);
        if (!row) {
          return;
        }
        byId.set(row.id, row);
      });
      const rows = Array.from(byId.values());
      const { page, perPage } = params.pagination || { page: 1, perPage: 25 };
      return dataProcessing.applyPagination(rows, page, perPage) as any;
    }

    if (canonical === "descriptors") {
      const json = await apiClient.request<{ serviceIDs?: string[] }>(`/${canonical}`);
      const rows = (json.serviceIDs || []).map((serviceID) => ({
        id: serviceID,
        serviceID,
      }));

      const { page, perPage } = params.pagination || { page: 1, perPage: 25 };
      return dataProcessing.applyPagination(rows, page, perPage) as any;
    }

    if (backendListResources.has(canonical)) {
      const query = buildBackendListQuery(params);
      const response = await apiClient.request<unknown>(`/${canonical}${query}`);
      const json = ensureArray<Row>(response);
      const normalized = canonical === "history" ? normalizeHistoryRows(json) : json;

      const processedData = dataProcessing.processData(
        normalized,
        params.filter,
        params.sort,
        canonical,
      );

      const { page, perPage } = params.pagination || { page: 1, perPage: 25 };
      return dataProcessing.applyPagination(processedData, page, perPage) as any;
    }

    const response = await apiClient.request<unknown>(`/${canonical}`);
    const json = ensureArray<Row>(response);
    const normalized = canonical === "history" ? normalizeHistoryRows(json) : json;

    const processedData = dataProcessing.processData(
      normalized,
      params.filter,
      params.sort,
      canonical,
    );

    const { page, perPage } = params.pagination || { page: 1, perPage: 25 };
    const result = dataProcessing.applyPagination(processedData, page, perPage);

    return result as any;
  },

  getOne: async (resource, params) => {
    const canonical = canonicalResource(resource);

    if (canonical === "dashboard" || canonical === "dashboard/overview" || canonical === "dashboard/info") {
      const data = asRow(await apiClient.request<Row>(`/${canonical}`));
      return { data: { id: params.id, ...data } } as RAResult<any>;
    }

    if (canonical === "health/liveness" || canonical === "health/readiness") {
      const data = asRow(await apiClient.request<Row>(`/${canonical}`));
      return { data: { ...data, id: params.id } } as RAResult<any>;
    }

    const data = asRow(await apiClient.request<Row>(`/${canonical}/${params.id}`));
    return { data } as RAResult<any>;
  },

  getMany: async (resource, params) => {
    const canonical = canonicalResource(resource);

    const response = await apiClient.request<unknown>(`/${canonical}`);
    const json = ensureArray<Row>(response);

    const filteredData = json.filter((item) =>
      params.ids.includes(item.id as (typeof params.ids)[number]),
    );

    return { data: filteredData } as RAResult<any[]>;
  },

  getManyReference: async (resource, params) => {
    const canonical = canonicalResource(resource);
    const url = `/${canonical}/${params.id}/${params.target}`;
    const response = await apiClient.request<unknown>(url);
    const json = ensureArray<Row>(response);

    const processedData = dataProcessing.processData(
      json,
      params.filter,
      params.sort,
      canonical,
    );

    return {
      data: processedData,
      total: json.length,
    } as any;
  },

  create: async (resource, params) => {
    const canonical = canonicalResource(resource);

    if (canonical === "descriptors") {
      const file = params.data?.file as File | undefined;
      if (!file) {
        throw new Error("Descriptor file is required");
      }

      const data = asRow(await apiClient.requestBinary<Row>(`/${canonical}`, file));
      const id = typeof data.time === "string" ? data.time : file.name;
      return { data: { id, ...data } } as RAResult<any>;
    }

    if (canonical === "verify") {
      const data = asRow(
        await apiClient.request<Row>(`/${canonical}`, {
          method: "POST",
          body: JSON.stringify(params.data),
        }),
      );

      return {
        data: { id: `${params.data.service}/${params.data.method}`, ...data },
      } as RAResult<any>;
    }

    if (canonical === "inspect") {
      const data = asRow(
        await apiClient.request<Row>(`/stubs/inspect`, {
          method: "POST",
          body: JSON.stringify(params.data),
        }),
      );

      return {
        data: {
          id: `${params.data.service || ""}/${params.data.method || ""}`,
          ...data,
        },
      } as RAResult<any>;
    }

    const requestBody = Array.isArray(params.data) ? params.data : [params.data];
    const activeSession = getCurrentSession().trim();
    const endpoint =
      canonical === "stubs" && activeSession
        ? `/${canonical}?session=${encodeURIComponent(activeSession)}`
        : `/${canonical}`;

    const response = await apiClient.request<unknown>(endpoint, {
      method: "POST",
      body: JSON.stringify(requestBody),
    });

    if (canonical === "stubs") {
      const createdIDs = ensureArray<unknown>(response);
      const firstBackendID = createdIDs[0] ?? (params.data as Row | undefined)?.id;

      return {
        data: {
          ...(asRow(params.data as Row)),
          id: toNumericId(firstBackendID),
          backendId: firstBackendID,
        },
      } as RAResult<any>;
    }

    return { data: params.data as any };
  },

  update: async (resource, params) => {
    const canonical = canonicalResource(resource);
    const requestBody = Array.isArray(params.data) ? params.data : [params.data];

    await apiClient.request(`/${canonical}`, {
      method: "POST",
      body: JSON.stringify(requestBody),
    });

    return { data: { id: params.id, ...params.data } as any };
  },

  updateMany: async (resource, params) => {
    const canonical = canonicalResource(resource);
    const stubsToUpdate = params.ids.map((id) => ({ id, ...params.data }));

    await apiClient.request(`/${canonical}`, {
      method: "POST",
      body: JSON.stringify(stubsToUpdate),
    });

    return { data: params.ids };
  },

  delete: async (resource, params) => {
    const canonical = canonicalResource(resource);

    if (canonical === "services") {
      await apiClient.request<void>(`/${canonical}/${params.id}`, {
        method: "DELETE",
      });

      return { data: params.id as any };
    }

    await apiClient.request(`/${canonical}/batchDelete`, {
      method: "POST",
      body: JSON.stringify([params.id]),
    });

    return { data: params.id as any };
  },

  deleteMany: async (resource, params) => {
    const canonical = canonicalResource(resource);

    if (canonical === "services") {
      await Promise.all(
        params.ids.map((id) =>
          apiClient.request<void>(`/${canonical}/${id}`, {
            method: "DELETE",
          }),
        ),
      );

      return { data: params.ids };
    }

    await apiClient.request(`/${canonical}/batchDelete`, {
      method: "POST",
      body: JSON.stringify(params.ids),
    });

    return { data: params.ids };
  },
};

export default dataProvider;
