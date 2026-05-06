import Fuse from "fuse.js";

import type { Filter, Row, Sort } from "./types";

export const ensureArray = <T,>(value: unknown): T[] =>
  Array.isArray(value) ? (value as T[]) : [];

export const asRow = (value: unknown): Row =>
  value && typeof value === "object" ? (value as Row) : {};

const getByPath = (value: unknown, path: string): unknown =>
  path.split(".").reduce((acc: unknown, key) => {
    if (!acc || typeof acc !== "object") {
      return undefined;
    }

    return (acc as Record<string, unknown>)[key];
  }, value);

const matchesScalar = (actual: unknown, expected: unknown): boolean => {
  if (expected === null || typeof expected !== "object") {
    return actual === expected;
  }

  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      return false;
    }

    return expected.every((item, index) => matchesScalar(actual[index], item));
  }

  if (!actual || typeof actual !== "object") {
    return false;
  }

  return Object.entries(expected).every(([key, val]) =>
    matchesScalar((actual as Record<string, unknown>)[key], val),
  );
};

export const normalizeHistoryRows = (json: Row[]): Row[] =>
  json.map((item, index) => ({
    id:
      item.id ||
      `${item.timestamp || "no-ts"}-${item.service || "svc"}-${item.method || "m"}-${index}`,
    ...item,
  }));

export const backendListResources = new Set([
  "services",
  "stubs",
  "stubs/used",
  "stubs/unused",
  "history",
]);

export const buildBackendListQuery = (params: {
  filter?: Filter;
  sort?: Sort;
}): string => {
  const search = new URLSearchParams();
  const filter = params.filter || {};

  if (filter.q) {
    search.set("q", String(filter.q));
  }
  if (filter.service) {
    search.set("service", String(filter.service));
  }
  if (filter.name) {
    search.set("name", String(filter.name));
  }
  if (filter.method) {
    search.set("method", String(filter.method));
  }
  if (typeof filter.error !== "undefined") {
    search.set("errorOnly", String(Boolean(filter.error)));
  }

  if (params.sort?.field) {
    search.set("sortField", params.sort.field);
  }
  if (params.sort?.order) {
    search.set("sortOrder", params.sort.order);
  }

  const query = search.toString();
  return query ? `?${query}` : "";
};

export const dataProcessing = {
  applyGlobalSearch(data: Row[], searchTerm: string, resource?: string): Row[] {
    if (!searchTerm || searchTerm.trim() === "") {
      return data;
    }

    const searchTermLower = searchTerm.toLowerCase();

    if (resource === "services") {
      return data.filter((service) => {
        const methods = Array.isArray(service.methods)
          ? (service.methods as Row[])
          : [];
        const serviceMatch =
          String(service.id || "").toLowerCase().includes(searchTermLower) ||
          String(service.name || "").toLowerCase().includes(searchTermLower) ||
          String(service.package || "").toLowerCase().includes(searchTermLower);

        const methodMatch = methods.some(
          (method) =>
            String(method.name || "").toLowerCase().includes(searchTermLower) ||
            String(method.id || "").toLowerCase().includes(searchTermLower),
        );

        return serviceMatch || methodMatch;
      });
    }

    const searchKeys = [
      "id",
      "name",
      "service",
      "method",
      "headers",
      "input",
      "inputs",
      "output",
    ];

    const fuse = new Fuse(data, {
      keys: searchKeys,
      includeScore: true,
      threshold: 0.4,
      ignoreLocation: true,
    });

    const searchResults = fuse.search(searchTerm);
    return searchResults.map((result) => result.item);
  },

  applyFilters(data: Row[], filters: Filter, resource?: string): Row[] {
    if (!filters || Object.keys(filters).length === 0) {
      return data;
    }

    const { q, ...otherFilters } = filters;
    let filteredData = data;

    if (typeof q === "string" && q.trim().length > 0) {
      filteredData = this.applyGlobalSearch(filteredData, q, resource);
    }

    if (Object.keys(otherFilters).length > 0) {
      filteredData = filteredData.filter((item) =>
        Object.entries(otherFilters).every(([key, value]) =>
          matchesScalar(getByPath(item, key), value),
        ),
      );
    }

    return filteredData;
  },

  applySorting(data: Row[], sort: Sort): Row[] {
    if (!sort || !sort.field) {
      return data;
    }

    const direction = sort.order === "DESC" ? -1 : 1;

    return [...data].sort((left, right) => {
      const leftValue = getByPath(left, sort.field);
      const rightValue = getByPath(right, sort.field);

      if (leftValue === rightValue) {
        return 0;
      }

      if (leftValue === undefined || leftValue === null) {
        return 1;
      }

      if (rightValue === undefined || rightValue === null) {
        return -1;
      }

      if (leftValue < rightValue) {
        return -1 * direction;
      }

      return 1 * direction;
    });
  },

  processData(data: Row[], filters?: Filter, sort?: Sort, resource?: string): Row[] {
    if (!filters && !sort) {
      return data;
    }

    let processedData = data;

    if (filters) {
      processedData = this.applyFilters(processedData, filters, resource);
    }

    if (sort) {
      processedData = this.applySorting(processedData, sort);
    }

    return processedData;
  },

  applyPagination(data: Row[], page: number, perPage: number): { data: Row[]; total: number } {
    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;
    const paginatedData = data.slice(startIndex, endIndex);

    return {
      data: paginatedData,
      total: data.length,
    };
  },
};
