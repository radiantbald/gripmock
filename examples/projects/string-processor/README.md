## Operational Runbook

### Prerequisites

- PostgreSQL is running and reachable.
- `POSTGRES_DSN` is set.

```bash
export POSTGRES_DSN='postgres://user:pass@localhost:5432/gripmock?sslmode=disable'
```

### Primary Run

```bash
gripmock --stub ./examples/projects/string-processor ./examples/projects/string-processor
```

### Secondary Run (restart)

```bash
gripmock ./examples/projects/string-processor
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
# String Processor Service - Bidirectional Streaming

This example demonstrates bidirectional streaming with gRPC using Gripmock.

## Service Definition

The `StringProcessorService` provides a `BidiStream` method that:
- Accepts a stream of `TextRequest` messages
- Returns a stream of `TextResponse` messages
- Processes text input and can return multiple responses for a single request

## Test Cases

### Bidirectional Streaming Test

The test case demonstrates:
1. Sending "Hello" and receiving "Hello" back
2. Sending "World from gRPC" and receiving three separate responses: "World", "from", "gRPC"

## Running the Example

```bash
# Start gripmock with the string processor service
go run main.go examples/projects/string-processor --stub examples/projects/string-processor

# Run the test case
grpctestify examples/projects/string-processor
```

## Message Types

- `TextRequest`: Contains a `text` field with the input message
- `TextResponse`: Contains a `result` field with the processed output
