# Check <VersionTag version="v3.0.0" />

`gripmock check` verifies that a running GripMock server is healthy.

It uses gRPC health checks and waits until service `gripmock` becomes `SERVING`.

`gripmock check` does not start the server; it only checks an existing instance.

## Usage

```bash
gripmock check
```

## Options

| Flag | Short | Default | Description |
|---|---|---|---|
| `--timeout` | `-t` | `10s` | Total time to wait for readiness. |
| `--interval` | — | `500ms` | Delay between health check attempts. |
| `--silent` | — | `false` | Suppress error output from command. |

## Examples

Wait up to 30 seconds:

```bash
gripmock check --timeout 30s
```

Check more aggressively every 100ms:

```bash
gripmock check --timeout 10s --interval 100ms
```

Use in CI script:

```bash
gripmock check --timeout 20s --silent
```

## Typical CI pattern

```bash
POSTGRES_DSN='postgres://user:pass@localhost:5432/gripmock?sslmode=disable' \
gripmock --stub ./stubs ./proto &
gripmock check --timeout 20s
go test ./...
```

## Primary vs Secondary start

- **Primary start**: start GripMock with valid `POSTGRES_DSN`, then run `gripmock check`.
- **Secondary start**: restart with the same `POSTGRES_DSN`; persisted descriptors/stubs are hydrated from PostgreSQL, then `gripmock check` confirms gRPC readiness.

## Troubleshooting

### `context deadline exceeded`

- Increase `--timeout`.
- Verify server address from `GRPC_ADDR` (`GRPC_HOST`, `GRPC_PORT`).
- Confirm there is no port conflict.

### Health check keeps failing after process start

- Check startup logs for descriptor parsing errors or PostgreSQL connection errors.
- Validate `POSTGRES_DSN` and DB availability.
- Compare with HTTP readiness:
  ```bash
  curl http://127.0.0.1:4771/api/health/readiness
  ```
  HTTP readiness and gRPC health are different signals and can become ready at different moments.
