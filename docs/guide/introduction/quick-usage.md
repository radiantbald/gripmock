# Quick Usage

## Installation

Choose one installation method:

- Homebrew:
  ```bash
  brew tap gripmock/tap
  brew install --cask gripmock
  ```
- Shell installer:
  ```bash
  curl -s https://raw.githubusercontent.com/radiantbald/gripmock/refs/heads/master/setup.sh | sh -s
  ```
- Go:
  ```bash
  go install github.com/radiantbald/gripmock/v3@latest
  ```
- Docker:
  ```bash
  docker pull radiantbald/gripmock
  ```

Check installation:

```bash
gripmock --version
```

## Recommended startup: `make up`

This repository is designed to be started with `make up`.

Prerequisites:

- Docker is installed.
- Docker daemon is running.
- You run commands from repository root.
- Configure `.env` values when you need non-default ports/credentials/example paths.

Recommended before first run:

```bash
cp .env.example .env
```

Then edit `.env` as needed (`POSTGRES_*`, `GRIPMOCK_*`, `TRAEFIK_*`).

### Primary start

From repository root:

```bash
make up
```

### What happens during `make up`

`make up` runs `env`, `ui-build`, then Docker Compose startup:

1. `env`:
   - creates `.env` from `.env.example` if `.env` does not exist.
   - if `.env` already exists, keeps your custom values.
2. `ui-build`:
   - checks UI dependencies in `third_party/gripmock-ui`.
   - runs `npm ci` when dependencies are missing/outdated.
   - builds UI assets.
3. `docker compose up -d --build --scale gripmock=1 postgres gripmock`:
   - starts PostgreSQL first.
   - waits for PostgreSQL healthcheck.
   - builds and starts GripMock container.
   - exposes ports from `.env` (`GRIPMOCK_GRPC_PORT`, `GRIPMOCK_HTTP_PORT`).

### Defaults from `.env.example`

- stubs: `./examples/projects/greeter/stubs`
- proto source: `./examples/projects/greeter/service.proto`
- ports: `4770` (gRPC), `4771` (HTTP/UI)

### Verify readiness after `make up`

```bash
gripmock check --timeout 20s
curl http://127.0.0.1:4771/api/health/readiness
```

### Secondary start (restart)

```bash
make up
```

`make up` reuses persisted PostgreSQL data between restarts.

### Troubleshooting for `make up`

- reset persisted metadata:
  ```bash
  make reset-db
  make up
  ```
- full clean restart:
  ```bash
  make reup-clean
  ```

## Manual startup (when you do not use `make up`)

`POSTGRES_DSN` is required for direct `gripmock` server startup.

Example:

```bash
export POSTGRES_DSN='postgres://user:pass@localhost:5432/gripmock?sslmode=disable'
```

Other defaults:

- gRPC: `0.0.0.0:4770`
- HTTP (API + UI): `0.0.0.0:4771`
- Dashboard: `http://localhost:4771/`

See full env list in [Environment Variables](/guide/introduction/environment-variables).

Assume you have `service.proto` and optional stubs in `./stubs`.

### Local binary

```bash
POSTGRES_DSN='postgres://user:pass@localhost:5432/gripmock?sslmode=disable' \
gripmock --stub ./stubs ./service.proto
```

### Docker

```bash
docker run -p 4770:4770 -p 4771:4771 \
  -e POSTGRES_DSN='postgres://user:pass@host.docker.internal:5432/gripmock?sslmode=disable' \
  -v $(pwd)/stubs:/stubs \
  -v $(pwd)/proto:/proto \
  radiantbald/gripmock --stub=/stubs /proto/service.proto
```

### Verify readiness

HTTP readiness:

```bash
curl http://127.0.0.1:4771/api/health/readiness
```

gRPC health (`service=gripmock`):

```bash
gripmock check --timeout 20s
```

## Manual secondary start (restart with persisted state)

GripMock restores persisted stubs/descriptors from PostgreSQL on restart.

Restart with the same `POSTGRES_DSN`:

```bash
POSTGRES_DSN='postgres://user:pass@localhost:5432/gripmock?sslmode=disable' \
gripmock ./service.proto
```

If startup still succeeds but your local files changed, reapply static stubs:

```bash
POSTGRES_DSN='postgres://user:pass@localhost:5432/gripmock?sslmode=disable' \
gripmock --stub ./stubs ./service.proto
```

## Descriptor Sources

GripMock can load descriptors from:

- `.proto` file(s)
- compiled `.pb` / `.protoset`
- a directory with `.proto` and `.pb`
- Buf Schema Registry (BSR)
- gRPC reflection (`grpc://`, `grpcs://`)
- upstream reflection modes (`grpc+proxy://`, `grpc+replay://`, `grpc+capture://`)

Example (BSR):

```bash
POSTGRES_DSN='postgres://user:pass@localhost:5432/gripmock?sslmode=disable' \
gripmock --stub ./stubs buf.build/connectrpc/eliza
```

## Troubleshooting

### `POSTGRES_DSN is required` or database connection failure

- Ensure PostgreSQL is running and reachable.
- Validate DSN credentials/host/database.
- For Docker Desktop on macOS, use `host.docker.internal`.

### HTTP readiness is OK, but tests still fail

- Readiness (`/api/health/readiness`) is HTTP-level startup status.
- `gripmock check` validates gRPC health service state (`SERVING` for `gripmock`).
- In CI, prefer waiting with `gripmock check`.

### Startup fails after schema/proto changes

- Persisted descriptors may conflict with your new local source set.
- For local docker-compose development, reset DB:
  ```bash
  make reset-db
  make up
  ```

### Stubs are missing after restart

- Confirm stubs were loaded from files (`--stub`) or created via API.
- Export runtime stubs before cleanup:
  ```bash
  gripmock dump --output ./stubs_export
  ```

## Next Steps

- Stubs authoring: [Stubs](/guide/stubs/json)
- Matching strategies: [Matcher](/guide/matcher/)
- Runtime descriptor loading: [Descriptors API](/guide/api/descriptors)
- Utility commands: [Tooling](/guide/utility/check)
