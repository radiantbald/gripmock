## Operational Runbook

### Prerequisites

- PostgreSQL is running and reachable.
- `POSTGRES_DSN` is set.

```bash
export POSTGRES_DSN='postgres://user:pass@localhost:5432/gripmock?sslmode=disable'
```

### Primary Run

```bash
gripmock --stub ./examples/projects/circle-converter ./examples/projects/circle-converter
```

### Secondary Run (restart)

```bash
gripmock ./examples/projects/circle-converter
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
# Circle Converter

Simple microservice example for geometric calculations.

## What it does

- Converts radius to diameter
- Shows "one function - one task" principle
- Demonstrates simple mathematical operations

## Run

```bash
gripmock --stub examples/projects/circle-converter examples/projects/circle-converter/service.proto
```

## Tests

```bash
grpctestify examples/projects/circle-converter/
```

## Structure

- `service.proto` - gRPC service definition
- `stub.yaml` - mock responses for testing
- `test.gctf` - test scenario

## Features

- **Single Responsibility**: One method, one operation
- **Performance**: Optimized for frequent calculations
- **Precision**: Accurate mathematical calculations
- **Simplicity**: Minimal and clear API 