FROM golang:1.26-alpine3.23 AS builder

ARG version
ARG commit
ARG date

WORKDIR /gripmock-src

COPY go.mod go.sum ./
COPY third_party/gripmock-ui/go.mod ./third_party/gripmock-ui/go.mod
RUN --mount=type=cache,id=gripmock-go-mod,target=/go/pkg/mod,sharing=locked \
    --mount=type=cache,id=gripmock-go-build,target=/root/.cache/go-build,sharing=locked \
    sh -c 'echo "[deps] Ensuring Go dependencies are cached (download only missing)..."; go mod download all'

COPY . /gripmock-src
RUN --mount=type=cache,id=gripmock-go-mod,target=/go/pkg/mod,sharing=locked \
    --mount=type=cache,id=gripmock-go-build,target=/root/.cache/go-build,sharing=locked \
    go build -mod=readonly -o /usr/local/bin/gripmock -ldflags "-X 'github.com/bavix/gripmock/v3/internal/infra/build.Version=${version:-dev}' -X 'github.com/bavix/gripmock/v3/internal/infra/build.Commit=${commit:-unknown}' -X 'github.com/bavix/gripmock/v3/internal/infra/build.Date=${date:-}' -s -w" .

FROM alpine:3.23

LABEL org.opencontainers.image.title="GripMock" 
LABEL org.opencontainers.image.description="Mock server for gRPC services with dynamic stubbing capabilities"
LABEL org.opencontainers.image.source="https://github.com/bavix/gripmock"
LABEL org.opencontainers.image.documentation="https://bavix.github.io/gripmock/"
LABEL org.opencontainers.image.authors="Babichev Maxim <info@babichev.net>"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.vendor="bavix"

COPY --from=builder /usr/local/bin/gripmock /usr/local/bin/gripmock

EXPOSE 4770 4771

HEALTHCHECK --start-interval=1s --start-period=30s \
    CMD gripmock check --silent

ENTRYPOINT ["/usr/local/bin/gripmock"]
