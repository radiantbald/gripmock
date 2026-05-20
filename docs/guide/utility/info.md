# Info <VersionTag version="v3.12.0" />

`gripmock info` prints runtime build details and loaded plugin capabilities.

Use it to quickly validate:

- GripMock version and Go runtime
- platform (`GOOS/GOARCH`)
- built-in and external plugin counts
- available template functions (including deprecations/decorators)

## Usage

```bash
gripmock info
```

## Example

```text
GripMock : v3.12.0
Go       : go1.26.0
Platform : darwin/arm64
Plugins  : 3
Functions: 42
Builtin  : 1
External : 2
```

## With external plugins

`gripmock info` respects the same `--plugins` flag and `TEMPLATE_PLUGIN_PATHS` env used by server startup.

```bash
gripmock --plugins ./plugins/hash.so --plugins ./plugins/math.so info
```

Tip: run this in CI before startup to catch missing `.so` files or incompatible plugin bundles.
