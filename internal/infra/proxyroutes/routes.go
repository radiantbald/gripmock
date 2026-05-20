package proxyroutes

import (
	"context"
	"strings"
	"sync"

	"github.com/cockroachdb/errors"
	"google.golang.org/grpc"
	"google.golang.org/grpc/metadata"
	"google.golang.org/protobuf/types/descriptorpb"

	protosetdom "github.com/radiantbald/gripmock/v3/internal/domain/protoset"
	grpcclient "github.com/radiantbald/gripmock/v3/internal/infra/grpcclient"
)

var errRemoteClientNil = errors.New("remote client is not configured")

const (
	descriptorMethodsInitCap = 16
)

type Mode uint8

const (
	ModeProxy Mode = iota + 1
	ModeReplay
	ModeCapture
)

type Route struct {
	Mode   Mode
	Source *protosetdom.Source
	Conn   *grpc.ClientConn
}

type methodOverride struct {
	mode     Mode
	disabled bool
}

type Registry struct {
	mu            sync.RWMutex
	routes        []*Route
	index         map[string]*Route
	modeOverrides map[string]methodOverride
}

func NewEmpty() *Registry {
	return &Registry{
		index:         make(map[string]*Route),
		modeOverrides: make(map[string]methodOverride),
	}
}

func New(ctx context.Context, paths []string, remoteClient protosetdom.RemoteClient) (*Registry, error) {
	registry := NewEmpty()
	if err := registry.RegisterSources(ctx, paths, remoteClient); err != nil {
		return nil, err
	}

	return registry, nil
}

//nolint:cyclop
func (r *Registry) RegisterSources(ctx context.Context, paths []string, remoteClient protosetdom.RemoteClient) error {
	sources := make([]*protosetdom.Source, 0, len(paths))

	for _, path := range paths {
		source, err := protosetdom.ParseSource(path)
		if err != nil {
			return errors.Wrapf(err, "failed to parse source: %s", path)
		}

		if source.ProxyMode == "" {
			continue
		}

		sources = append(sources, source)
	}

	if len(sources) == 0 {
		return nil
	}

	if remoteClient == nil {
		return errRemoteClientNil
	}

	assignedServices := make(map[string]struct{})

	for _, source := range sources {
		fds, err := remoteClient.FetchDescriptorSet(ctx, source)
		if err != nil {
			return errors.Wrapf(err, "failed to fetch proxy descriptors: %s", source.Raw)
		}

		route, err := newRoute(source, mapMode(source.ProxyMode))
		if err != nil {
			return err
		}

		serviceMethods := make(map[string][]string)
		for service, methods := range collectServiceMethods(fds) {
			if _, exists := assignedServices[service]; exists {
				continue
			}

			assignedServices[service] = struct{}{}
			serviceMethods[service] = methods
		}

		r.registerRoute(route, serviceMethods, false)
	}

	return nil
}

func (r *Registry) RegisterDescriptorSet(
	source *protosetdom.Source,
	fds *descriptorpb.FileDescriptorSet,
	mode Mode,
) error {
	route, err := newRoute(source, mode)
	if err != nil {
		return err
	}

	r.registerRoute(route, collectServiceMethods(fds), true)

	return nil
}

func (r *Registry) DisableMethod(fullMethod string) {
	if r == nil || fullMethod == "" {
		return
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	delete(r.index, fullMethod)
	delete(r.modeOverrides, fullMethod)
	r.pruneRoutesLocked()
}

func (r *Registry) DisableMethodForRoom(room string, fullMethod string) bool {
	if r == nil || fullMethod == "" {
		return false
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	if r.modeOverrides == nil {
		r.modeOverrides = make(map[string]methodOverride)
	}
	r.modeOverrides[routeOverrideKey(room, fullMethod)] = methodOverride{disabled: true}

	_, ok := r.index[fullMethod]
	return ok
}

func (r *Registry) SetMethodMode(fullMethod string, mode Mode) bool {
	return r.SetMethodModeForRoom("", fullMethod, mode)
}

func (r *Registry) SetMethodModeForRoom(room string, fullMethod string, mode Mode) bool {
	if r == nil || fullMethod == "" {
		return false
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	if r.modeOverrides == nil {
		r.modeOverrides = make(map[string]methodOverride)
	}
	r.modeOverrides[routeOverrideKey(room, fullMethod)] = methodOverride{mode: mode}

	_, ok := r.index[fullMethod]
	return ok
}

func newRoute(source *protosetdom.Source, mode Mode) (*Route, error) {
	conn, err := grpc.NewClient("passthrough:///"+source.ReflectAddress, grpcclient.DialOptions(
		source.ReflectTimeout,
		source.ReflectTLS,
		source.ReflectServerName,
		source.ReflectBearer,
		source.ReflectInsecure,
	)...)
	if err != nil {
		return nil, errors.Wrapf(err, "failed to connect proxy upstream: %s", source.ReflectAddress)
	}

	return &Route{
		Mode:   mode,
		Source: source,
		Conn:   conn,
	}, nil
}

func (r *Registry) registerRoute(route *Route, serviceMethods map[string][]string, replace bool) {
	if r == nil || route == nil || len(serviceMethods) == 0 {
		if route != nil && route.Conn != nil {
			_ = route.Conn.Close()
		}

		return
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	if r.index == nil {
		r.index = make(map[string]*Route)
	}

	for _, methods := range serviceMethods {
		for _, method := range methods {
			if _, exists := r.index[method]; exists && !replace {
				continue
			}

			r.index[method] = route
		}
	}

	r.routes = append(r.routes, route)
	r.pruneRoutesLocked()
}

func (r *Registry) pruneRoutesLocked() {
	live := make(map[*Route]struct{}, len(r.index))
	for _, route := range r.index {
		live[route] = struct{}{}
	}

	kept := r.routes[:0]
	for _, route := range r.routes {
		if _, ok := live[route]; ok {
			kept = append(kept, route)
			continue
		}

		if route != nil && route.Conn != nil {
			_ = route.Conn.Close()
		}
	}

	r.routes = kept
}

func (r *Registry) RouteByMethod(fullMethod string) *Route {
	return r.RouteByMethodForRoom("", fullMethod)
}

func (r *Registry) RouteByMethodForRoom(room string, fullMethod string) *Route {
	if r == nil {
		return nil
	}

	r.mu.RLock()
	defer r.mu.RUnlock()

	route, ok := r.index[fullMethod]
	if !ok {
		return nil
	}

	if override, hasOverride := r.methodOverrideLocked(room, fullMethod); hasOverride {
		if override.disabled {
			return nil
		}
		overridden := *route
		overridden.Mode = override.mode

		return &overridden
	}

	return route
}

func (r *Registry) methodOverrideLocked(room string, fullMethod string) (methodOverride, bool) {
	if r.modeOverrides == nil {
		return methodOverride{}, false
	}

	if override, ok := r.modeOverrides[routeOverrideKey(room, fullMethod)]; ok {
		return override, true
	}

	if normalizeRoom(room) == "" {
		return methodOverride{}, false
	}

	override, ok := r.modeOverrides[routeOverrideKey("", fullMethod)]
	return override, ok
}

func (r *Registry) Routes() []*Route {
	if r == nil {
		return nil
	}

	r.mu.RLock()
	defer r.mu.RUnlock()

	return append([]*Route(nil), r.routes...)
}

func (r *Registry) Close() {
	if r == nil {
		return
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	for _, route := range r.routes {
		if route == nil || route.Conn == nil {
			continue
		}

		_ = route.Conn.Close()
	}

	r.routes = nil
	r.index = make(map[string]*Route)
	r.modeOverrides = make(map[string]methodOverride)
}

func routeOverrideKey(room string, fullMethod string) string {
	return normalizeRoom(room) + "\x00" + fullMethod
}

func normalizeRoom(room string) string {
	normalized := strings.TrimSpace(room)
	if strings.EqualFold(normalized, "global") {
		return ""
	}

	return normalized
}

func (r *Route) WithTimeout(ctx context.Context) (context.Context, context.CancelFunc) {
	if r == nil || r.Source == nil {
		return ctx, func() {}
	}

	if _, hasDeadline := ctx.Deadline(); hasDeadline || r.Source.ReflectTimeout <= 0 {
		return ctx, func() {}
	}

	return context.WithTimeout(ctx, r.Source.ReflectTimeout)
}

func ForwardIncomingMetadata(ctx context.Context) context.Context {
	md, ok := metadata.FromIncomingContext(ctx)
	if !ok || len(md) == 0 {
		return ctx
	}

	return metadata.NewOutgoingContext(ctx, md.Copy())
}

func mapMode(mode string) Mode {
	switch mode {
	case "proxy":
		return ModeProxy
	case "capture":
		return ModeCapture
	case "replay":
		return ModeReplay
	default:
		return ModeProxy
	}
}

func collectServiceMethods(fds *descriptorpb.FileDescriptorSet) map[string][]string {
	if fds == nil {
		return nil
	}

	serviceMethods := make(map[string][]string)

	for _, file := range fds.GetFile() {
		pkg := file.GetPackage()

		for _, service := range file.GetService() {
			serviceName := service.GetName()
			if pkg != "" {
				serviceName = pkg + "." + serviceName
			}

			methods := serviceMethods[serviceName]
			if methods == nil {
				methods = make([]string, 0, descriptorMethodsInitCap)
			}

			for _, method := range service.GetMethod() {
				methods = append(methods, "/"+serviceName+"/"+method.GetName())
			}

			serviceMethods[serviceName] = methods
		}
	}

	return serviceMethods
}
