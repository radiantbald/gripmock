package deps

import (
	"context"
	"io/fs"
	"net"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/cockroachdb/errors"
	"github.com/gorilla/handlers"
	"github.com/gorilla/mux"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"

	"github.com/bavix/gripmock/v3/internal/app"
	"github.com/bavix/gripmock/v3/internal/domain/history"
	"github.com/bavix/gripmock/v3/internal/domain/rest"
	"github.com/bavix/gripmock/v3/internal/infra/httputil"
	"github.com/bavix/gripmock/v3/internal/infra/muxmiddleware"
	"github.com/bavix/gripmock/v3/internal/infra/telemetry"
	infraTLS "github.com/bavix/gripmock/v3/internal/infra/tls"
)

type RestServer struct {
	server     *http.Server
	listener   net.Listener
	tlsEnabled bool
}

func (s *RestServer) Addr() string {
	if s.listener == nil {
		return s.server.Addr
	}

	return s.listener.Addr().String()
}

func (s *RestServer) TLSEnabled() bool {
	return s.tlsEnabled
}

func (s *RestServer) ListenAndServe() error {
	if s.listener == nil {
		return errors.New("http listener is not initialized")
	}

	if s.tlsEnabled {
		return s.server.ServeTLS(s.listener, "", "")
	}

	return s.server.Serve(s.listener)
}

func (s *RestServer) Shutdown(ctx context.Context) error {
	return s.server.Shutdown(ctx)
}

//nolint:funlen
func (b *Builder) RestServe(
	ctx context.Context,
	stubPath string,
) (*RestServer, error) {
	b.StartSessionGC(ctx)

	extender := b.Extender(ctx)
	// Load stubs synchronously before starting HTTP server
	// This ensures stubs are available when gRPC server starts
	if stubPath != "" {
		extender.ReadFromPathSync(ctx, stubPath)
	} else {
		// No stub path, close the channel to signal completion
		extender.SignalLoaded()
	}

	var historyReader history.Reader
	if store := b.HistoryStore(); store != nil {
		historyReader = store
	}

	apiServer, err := app.NewRestServer(
		ctx,
		b.Budgerigar(),
		extender,
		historyReader,
		b.StubValidator(),
		b.DescriptorRegistry(),
	)
	if err != nil {
		return nil, errors.Wrapf(err, "failed to create rest server")
	}

	if usersRepository, usersErr := b.UserRepository(ctx); usersErr == nil {
		apiServer.SetUsersRepository(usersRepository)
	}
	if allowedPhones, allowedErr := b.AllowedPhonesRepository(ctx); allowedErr == nil {
		apiServer.SetAllowedPhonesRepository(allowedPhones)
	}
	if sessionsRepository, sessionsErr := b.SessionsRepository(ctx); sessionsErr == nil {
		apiServer.SetSessionsRepository(sessionsRepository)
	}

	ui, err := b.ui(ctx)
	if err != nil {
		return nil, errors.Wrapf(err, "failed to get UI assets")
	}

	router := mux.NewRouter()
	rest.HandlerWithOptions(apiServer, rest.GorillaServerOptions{
		BaseURL:    "/api",
		BaseRouter: router,
		Middlewares: []rest.MiddlewareFunc{
			httputil.MaxBodySize(httputil.MaxBodyBytes()),
			muxmiddleware.PanicRecoveryMiddleware,
			muxmiddleware.TransportSession,
			muxmiddleware.ContentType,
			muxmiddleware.RequestLogger,
		},
	})
	router.Path("/api/mcp").Methods(http.MethodPost).Handler(
		withMCPMiddlewares(apiServer.MCPHandler()),
	)
	router.Path("/api/auth/code/request").Methods(http.MethodPost).Handler(
		withMCPMiddlewares(http.HandlerFunc(apiServer.RequestCallAuth)),
	)
	router.Path("/api/auth/code/verify").Methods(http.MethodPost).Handler(
		withMCPMiddlewares(http.HandlerFunc(apiServer.VerifyCallAuth)),
	)
	// Backward-compatible aliases for legacy clients.
	router.Path("/api/auth/call/request").Methods(http.MethodPost).Handler(
		withMCPMiddlewares(http.HandlerFunc(apiServer.RequestCallAuth)),
	)
	router.Path("/api/auth/call/verify").Methods(http.MethodPost).Handler(
		withMCPMiddlewares(http.HandlerFunc(apiServer.VerifyCallAuth)),
	)
	router.Path("/api/auth/allowlist").Methods(http.MethodGet).Handler(
		withMCPMiddlewares(http.HandlerFunc(apiServer.ListAllowedPhones)),
	)
	router.Path("/api/auth/allowlist").Methods(http.MethodPost).Handler(
		withMCPMiddlewares(http.HandlerFunc(apiServer.UpsertAllowedPhone)),
	)
	router.Path("/api/auth/allowlist").Methods(http.MethodDelete).Handler(
		withMCPMiddlewares(http.HandlerFunc(apiServer.DeleteAllowedPhone)),
	)
	router.Path("/api/sessions").Methods(http.MethodPost).Handler(
		withMCPMiddlewares(http.HandlerFunc(apiServer.SessionsCreate)),
	)

	router.Path("/metrics").Handler(telemetry.MetricsHandler(b.promReg))

	router.PathPrefix("/").Handler(spaHandler(ui)).Methods(http.MethodGet)

	const (
		readHeaderTimeout = 10 * time.Second
		readTimeout       = 30 * time.Second
		writeTimeout      = 30 * time.Second
		idleTimeout       = 120 * time.Second
		maxHeaderBytes    = 1 << 20
	)

	handler := handlers.CORS(
		handlers.AllowedOrigins([]string{"*"}),
		handlers.AllowedHeaders([]string{
			"Accept", "Accept-Language", "Content-Type", "Content-Language", "Origin",
			"X-GripMock-RequestInternal",
			"X-Gripmock-Session",
		}),
		handlers.AllowedMethods([]string{http.MethodGet, http.MethodPost, http.MethodDelete, http.MethodPatch}),
	)(router)
	if b.config.OtelEnabled {
		handler = otelhttp.NewHandler(handler, "gripmock-rest")
	}

	srv := &http.Server{
		Addr:              b.config.HTTPAddr,
		ReadHeaderTimeout: readHeaderTimeout,
		ReadTimeout:       readTimeout,
		WriteTimeout:      writeTimeout,
		IdleTimeout:       idleTimeout,
		MaxHeaderBytes:    maxHeaderBytes,
		BaseContext: func(_ net.Listener) context.Context {
			return ctx
		},
		Handler: handler,
	}

	b.ender.Add(srv.Shutdown)

	httpTLS := infraTLS.TLSConfig{
		CertFile:   b.config.HTTPTLSCertFile,
		KeyFile:    b.config.HTTPTLSKeyFile,
		ClientAuth: b.config.HTTPTLSClientAuth,
		CAFile:     b.config.HTTPTLSCAFile,
		MinVersion: infraTLS.MinTLSVersion12,
	}
	if httpTLS.IsEnabled() {
		tlsCfg, tlsErr := httpTLS.BuildTLSConfig()
		if tlsErr != nil {
			return nil, errors.Wrap(tlsErr, "failed to build HTTP TLS config")
		}

		srv.TLSConfig = tlsCfg
	}

	listener, err := (&net.ListenConfig{}).Listen(ctx, "tcp", b.config.HTTPAddr)
	if err != nil {
		return nil, errors.Wrap(err, "failed to listen")
	}

	return &RestServer{
		server:     srv,
		listener:   listener,
		tlsEnabled: srv.TLSConfig != nil,
	}, nil
}

func withMCPMiddlewares(handler http.Handler) http.Handler {
	middlewares := []func(http.Handler) http.Handler{
		httputil.MaxBodySize(httputil.MaxBodyBytes()),
		muxmiddleware.PanicRecoveryMiddleware,
		muxmiddleware.TransportSession,
		muxmiddleware.ContentType,
		muxmiddleware.RequestLogger,
	}

	for _, middleware := range middlewares {
		handler = middleware(handler)
	}

	return handler
}

func spaHandler(assets fs.FS) http.Handler {
	fileServer := http.FileServerFS(assets)

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cleanPath := strings.TrimPrefix(filepath.Clean(r.URL.Path), "/")
		if cleanPath == "" || cleanPath == "." {
			fileServer.ServeHTTP(w, r)
			return
		}

		if _, err := fs.Stat(assets, cleanPath); err == nil {
			fileServer.ServeHTTP(w, r)
			return
		}

		// For missing static files keep regular 404 behavior.
		if strings.Contains(filepath.Base(cleanPath), ".") {
			http.NotFound(w, r)
			return
		}

		index, err := fs.ReadFile(assets, "index.html")
		if err != nil {
			http.Error(w, "failed to load UI index", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write(index)
	})
}
