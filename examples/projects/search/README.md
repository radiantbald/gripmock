## Operational Runbook

### Prerequisites

- PostgreSQL is running and reachable.
- `POSTGRES_DSN` is set.

```bash
export POSTGRES_DSN='postgres://user:pass@localhost:5432/gripmock?sslmode=disable'
```

### Primary Run

```bash
gripmock --stub ./examples/projects/search ./examples/projects/search
```

### Secondary Run (restart)

```bash
gripmock ./examples/projects/search
```

### Verify

```bash
gripmock check --timeout 20s
curl http://127.0.0.1:4771/api/health/readiness
```

### Troubleshooting

- If startup fails, verify `POSTGRES_DSN` and DB connectivity.
- If descriptors conflict after local refactors, reset local compose DB (`make reset-db`).
- If tests race startup, wait with `gripmock check` before test execution.
# Search Service Example

This example demonstrates server streaming with multiple results and an empty stream (zero messages).

## Service

`SearchService.Search` is a server streaming method that returns a stream of `SearchResult` messages.

## Usage

```bash
gripmock --stub=./stubs.yaml ./service.proto
```

## Stub Configurations

| Query | Results | Description |
|-------|---------|-------------|
| `query: "grpc", category: "tech"` | 3 | Multiple search results |
| `query: "nonexistent"` | 0 | Empty stream (no matches) |
| `query: "specific"` | 1 | Single search result |
| `category: "empty"` | 0 | Empty stream by category |

## Empty Stream

Use `stream: []` to return zero messages and immediately close the stream with OK status. This is useful for scenarios like:
- Search with no matches
- Empty query results
- Filters that exclude all items
