## Operational Runbook

### Prerequisites

- PostgreSQL is running and reachable.
- `POSTGRES_DSN` is set.

```bash
export POSTGRES_DSN='postgres://user:pass@localhost:5432/gripmock?sslmode=disable'
```

### Primary Run

```bash
gripmock --stub ./examples/projects/inventory ./examples/projects/inventory
```

### Secondary Run (restart)

```bash
gripmock ./examples/projects/inventory
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
# Inventory Service

Stateful stub example demonstrating sequential responses, retry scenario testing, and array matching.

## What it does

- **Sequential/Retry Scenario**: First 2 calls return `UNAVAILABLE` error, third call returns success
- **Array Matching**: Demonstrates matching on repeated fields (arrays)

## Run

```bash
gripmock --stub examples/projects/inventory examples/projects/inventory/service.proto
```

## Tests

```bash
grpctestify examples/projects/inventory/
```

## Structure

- `service.proto` - gRPC service definition with `ips` repeated field
- `test_stateful_retry.gctf` + `stubs_test_stateful_retry.yaml` - stateful retry scenario (Issue #827)
- `test_array_exact_match.gctf` + `stubs_test_array_exact_match.yaml` - array matching (Issue #840)

## Features

### Sequential/Retry (Issue #827)

- **Stateful Matching**: Stubs change behavior after being exhausted
- **Priority System**: High priority stub (priority: 10) used first, falls back to low priority (priority: 1)
- **Times Option**: Limits stub usage count (`times: 2`)

### Array Matching (Issue #840)

- `equals`: exact array match `ips: ["10.0.0.1", "10.0.0.2"]`

## Notes

- Array scenarios from Issue #840 are now covered by internal matcher tests; inventory examples should be kept in sync with these cases.
