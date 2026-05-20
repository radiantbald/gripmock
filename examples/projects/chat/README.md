## Operational Runbook

### Prerequisites

- PostgreSQL is running and reachable.
- `POSTGRES_DSN` is set.

```bash
export POSTGRES_DSN='postgres://user:pass@localhost:5432/gripmock?sslmode=disable'
```

### Primary Run

```bash
gripmock --stub ./examples/projects/chat ./examples/projects/chat
```

### Secondary Run (restart)

```bash
gripmock ./examples/projects/chat
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
# Chat Service

Chat service example with support for different streaming types.

## What it does

- Handles messages from different users
- Supports client, server and bidirectional streaming
- Shows real chat scenarios

## Run

```bash
gripmock --stub examples/projects/chat examples/projects/chat/service.proto
```

## Tests

```bash
grpctestify examples/projects/chat/
```

## Structure

- `service.proto` - gRPC service definition
- `stubs.yaml` - mock responses for testing
- `*.gctf` - test scenarios

## Features

- **Client Streaming**: Send multiple messages from one client
- **Server Streaming**: Receive message stream from server
- **Bidirectional**: Real-time two-way chat
- **User Context**: Different responses for different users 