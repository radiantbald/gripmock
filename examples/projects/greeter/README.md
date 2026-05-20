## Operational Runbook

### Prerequisites

- PostgreSQL is running and reachable.
- `POSTGRES_DSN` is set.

```bash
export POSTGRES_DSN='postgres://user:pass@localhost:5432/gripmock?sslmode=disable'
```

### Primary Run

```bash
gripmock --stub ./examples/projects/greeter ./examples/projects/greeter
```

### Secondary Run (restart)

```bash
gripmock ./examples/projects/greeter
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
# Greeter (dynamic stub)

- Service: `helloworld.Greeter/SayHello`
- Dynamic response: `"Hello, {{.Request.name}}!"`

Original proto reference:
- gRPC Hello World proto: https://github.com/grpc/grpc-go/blob/master/examples/helloworld/helloworld/helloworld.proto

Run:
- Server: `go run main.go examples/projects/greeter/service.proto --stub examples/projects/greeter`
- Tests:
  - `grpctestify examples/projects/greeter/case_say_hello_alice.gctf`
  - `grpctestify examples/projects/greeter/case_say_hello_alex.gctf`
  - `grpctestify examples/projects/greeter/case_say_hello_bob.gctf`
