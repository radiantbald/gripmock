---
title: Builder Image
---

# Builder Image <VersionTag version="v3.7.1" />

## Main rule

- build plugins in `radiantbald/gripmock:<tag>-builder`
- run GripMock in `radiantbald/gripmock:<tag>`
- always keep the same `<tag>`

This is required because Go plugins are sensitive to toolchain and platform differences (`plugin.Open`).

## Published images

For each release tag `<tag>`:

- `radiantbald/gripmock:<tag>`
- `radiantbald/gripmock:<tag>-builder`

Same tags are published to `ghcr.io/radiantbald/gripmock`.

## CI behavior

- `Dockerfile.builder` builds and publishes `:<tag>-builder`
- `Dockerfile` builds and publishes `:<tag>`
- runtime build uses `BUILDER_IMAGE` pinned by builder digest from the same pipeline run

This keeps runtime and builder strictly aligned.

## Usage

```bash
docker run --rm \
  -v "$PWD":/work \
  -w /work \
  radiantbald/gripmock:v3.12.0-builder \
  sh -lc 'go build -buildmode=plugin -o ./plugins/myplugin.so ./cmd/myplugin'
```

```bash
docker run --rm \
  -p 4770:4770 -p 4771:4771 \
  -v "$PWD/plugins":/plugins \
  -v "$PWD/proto":/proto \
  radiantbald/gripmock:v3.12.0 \
  --plugins=/plugins/myplugin.so /proto/service.proto
```

## If plugin does not load

- verify runtime and builder use the same base tag
- rebuild plugin in matching `:<tag>-builder`
- verify architecture (`amd64`/`arm64`)
