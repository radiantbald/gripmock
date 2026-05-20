## Operational Runbook

### Prerequisites

- Docker is installed and Docker daemon is running.
- Run commands from repository root.
- Optional but recommended: create `.env` before first run.

Recommended setup:

```bash
cp .env.example .env
```

`make up` also creates `.env` automatically when it is missing.
Edit `.env` only when you need custom values (for example DB credentials, ports, or example paths).

### Primary Run (recommended)

```bash
make up
```

### What exactly happens during `make up`

`make up` executes three stages from `Makefile`:

1. `env`
   - if `.env` is missing, it is created from `.env.example`.
2. `ui-build` (depends on `deps-check`)
   - checks `third_party/gripmock-ui` dependencies.
   - runs `npm ci` only when dependencies are missing/outdated.
   - builds UI assets.
3. Docker Compose startup
   - runs:
     ```bash
     docker compose up -d --build --scale gripmock=1 postgres gripmock
     ```
   - starts `postgres` and waits until its healthcheck is green (`pg_isready`).
   - builds GripMock image from local sources (`--build`) and starts `gripmock`.
   - injects `POSTGRES_DSN` into GripMock container automatically from compose env.
   - exposes host ports from `.env` (`GRIPMOCK_GRPC_PORT`, `GRIPMOCK_HTTP_PORT`), defaults `4770` and `4771`.

### What is downloaded on first `make up`

On the very first run (or after cache cleanup), `make up` downloads:

- UI npm dependencies for `third_party/gripmock-ui` (`npm ci`).
- Docker image for PostgreSQL (`postgres:17-alpine`).
- Docker base images used by GripMock build (`golang:1.26-alpine3.23`, `alpine:3.23`).
- Go modules required by `go.mod` during Docker image build (`go mod download` in Dockerfile).

On next runs, these are usually reused from npm/Docker/build caches and startup is faster.


### Secondary Run (restart)

```bash
make up
```

