# Proto Export <VersionTag version="v3.12.0" />

`gripmock proto export` compiles `.proto` files into a descriptor bundle:

- `.pb` for raw `FileDescriptorSet`
- `.pbs` for compressed descriptor bundle

This command uses `protocompile` and does not require system `protoc`.

## Usage

```bash
gripmock proto export --root ./proto --out ./bundle.pb
```

## Options

| Flag | Default | Description |
|---|---|---|
| `--root` | *(required)* | Discovery + import root (repeatable). |
| `--import-root` | *(empty)* | Import-only roots, not included in output discovery. |
| `--out` | *(required)* | Output file path (`.pb` or `.pbs`). |
| `--include` | `**/*.proto` | Include glob patterns. |
| `--exclude` | *(empty)* | Exclude glob patterns. |

## Examples

Export all proto files from one root:

```bash
gripmock proto export --root ./proto --out ./service.pb
```

Export with extra import roots:

```bash
gripmock proto export \
  --root ./proto \
  --import-root ./third_party/proto \
  --out ./service.pb
```

Export compressed bundle and exclude test protos:

```bash
gripmock proto export \
  --root ./proto \
  --out ./service.pbs \
  --exclude "**/*_test.proto"
```

## Typical flow

1. Compile descriptor bundle with `gripmock proto export`.
2. Start server from generated descriptor:
   ```bash
   POSTGRES_DSN='postgres://user:pass@localhost:5432/gripmock?sslmode=disable' \
   gripmock ./service.pb
   ```
3. Validate readiness with:
   ```bash
   gripmock check --timeout 20s
   ```
