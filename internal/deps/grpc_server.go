package deps

import (
	"context"
	"crypto/tls"
	"net"
	"strings"

	"github.com/cockroachdb/errors"
	"github.com/rs/zerolog"

	"github.com/bavix/gripmock/v3/internal/app"
	"github.com/bavix/gripmock/v3/internal/domain/history"
	"github.com/bavix/gripmock/v3/internal/domain/proto"
	protosetdom "github.com/bavix/gripmock/v3/internal/domain/protoset"
)

//nolint:funlen,cyclop
func (b *Builder) GRPCServe(ctx context.Context, param *proto.Arguments) error {
	b.StartRoomGC(ctx)

	grpcTLS := b.grpcTLSConfig()
	grpcTLS.ClientAuth = b.config.GRPCTLSClientAuth

	var (
		tlsCfg *tls.Config
		err    error
	)

	if grpcTLS.IsEnabled() {
		tlsCfg, err = grpcTLS.BuildTLSConfig()
		if err != nil {
			return errors.Wrap(err, "failed to build TLS config")
		}
	}

	listener, err := (&net.ListenConfig{}).Listen(ctx, b.config.GRPCNetwork, b.config.GRPCAddr)
	if err != nil {
		return errors.Wrap(err, "failed to listen")
	}

	logger := zerolog.Ctx(ctx)

	logger.Info().
		Str("addr", listener.Addr().String()).
		Str("network", listener.Addr().Network()).
		Bool("tls", grpcTLS.IsEnabled()).
		Msg("Serving gRPC")

	var recorder history.Recorder
	if store := b.HistoryStore(); store != nil {
		recorder = store
	}

	grpcServer := app.NewGRPCServer(
		b.config.GRPCNetwork,
		b.config.GRPCAddr,
		param,
		b.Budgerigar(),
		b.Extender(ctx),
		recorder,
		b.DescriptorRegistry(),
		tlsCfg,
		b.RemoteClient(),
		b.config.OtelEnabled,
		b.StubValidator(),
	)
	grpcServer.SetProxyRoutes(b.ProxyRoutes())
	grpcServer.SetStrictPersistedDescriptorStartup(b.config.GRPCStrictPersistedDescriptors)

	if reflectionHostsRepository, reflectionHostsErr := b.ReflectionHostsRepository(ctx); reflectionHostsErr == nil {
		hosts, listErr := reflectionHostsRepository.List(ctx)
		if listErr == nil {
			proxySources := make([]string, 0, len(hosts))
			for _, host := range hosts {
				if source := replayProxySource(host.Source); source != "" {
					proxySources = append(proxySources, source)
				}
			}
			if len(proxySources) > 0 {
				if err := b.ProxyRoutes().RegisterSources(ctx, proxySources, b.RemoteClient()); err != nil {
					logger.Warn().Err(err).Msg("Failed to restore reflection replay routes")
				}
			}
		}
	}

	if protoMetadataRepo, protoMetadataErr := b.ProtoMetadataRepository(ctx); protoMetadataErr == nil {
		grpcServer.SetProtoMetadataWriter(protoMetadataRepo)
	}

	server, err := grpcServer.Build(ctx)
	if err != nil {
		return errors.Wrap(err, "failed to build gRPC server")
	}

	b.ender.Add(func(_ context.Context) error {
		server.GracefulStop()

		return nil
	})

	ch := make(chan error)

	go func() {
		defer func() {
			if r := recover(); r != nil {
				logger.Fatal().
					Interface("panic", r).
					Msg("Fatal panic in gRPC server goroutine - terminating server")
			}
		}()
		defer close(ch)

		ch <- server.Serve(listener)
	}()

	select {
	case <-ctx.Done():
		if !errors.Is(ctx.Err(), context.Canceled) {
			return errors.Wrap(ctx.Err(), "failed to serve")
		}
	case err := <-ch:
		if !errors.Is(err, context.Canceled) {
			return errors.Wrap(err, "failed to serve")
		}
	}

	return nil
}

func replayProxySource(source string) string {
	source = strings.TrimSpace(source)
	parsed, err := protosetdom.ParseSource(source)
	if err != nil || parsed.Type != protosetdom.SourceReflect || parsed.ProxyMode != "" {
		return ""
	}

	switch {
	case strings.HasPrefix(source, "grpc://"):
		return "grpc+replay://" + strings.TrimPrefix(source, "grpc://")
	case strings.HasPrefix(source, "grpcs://"):
		return "grpcs+replay://" + strings.TrimPrefix(source, "grpcs://")
	default:
		return ""
	}
}
