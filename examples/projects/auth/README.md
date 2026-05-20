## Operational Runbook

### Prerequisites

- PostgreSQL is running and reachable.
- `POSTGRES_DSN` is set.

```bash
export POSTGRES_DSN='postgres://user:pass@localhost:5432/gripmock?sslmode=disable'
```

### Primary Run

```bash
gripmock --stub ./examples/projects/auth ./examples/projects/auth
```

### Secondary Run (restart)

```bash
gripmock ./examples/projects/auth
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
# Auth Service

Simple authentication and authorization example using gRPC and GripMock.

## What it does

- Validates API keys through headers
- Checks resource access permissions
- Shows how to test security scenarios

## Run

```bash
gripmock --stub examples/projects/auth examples/projects/auth/service.proto
```

## Tests

```bash
grpctestify examples/projects/auth/
```

## Structure

- `service.proto` - gRPC service definition
- `stubs.yml` - mock responses for testing
- `*.gctf` - test scenarios

## Features

- **API Key Auth**: Validation via `x-api-key` header
- **RBAC**: Resource-action permission model
- **Fallback**: General rules for unknown requests 