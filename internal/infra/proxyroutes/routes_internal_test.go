package proxyroutes

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"google.golang.org/grpc"
	"google.golang.org/protobuf/types/descriptorpb"

	protosetdom "github.com/radiantbald/gripmock/v3/internal/domain/protoset"
)

type fakeRemoteClient struct {
	sets map[string]*descriptorpb.FileDescriptorSet
}

func (f fakeRemoteClient) FetchDescriptorSet(_ context.Context, source *protosetdom.Source) (*descriptorpb.FileDescriptorSet, error) {
	return f.sets[source.ReflectAddress], nil
}

func TestRegistryRouteByMethodNoFallback(t *testing.T) {
	t.Parallel()

	route := &Route{Mode: ModeProxy}
	r := &Registry{
		routes: []*Route{route},
		index: map[string]*Route{
			"/svc/Method": route,
		},
	}

	require.Same(t, route, r.RouteByMethod("/svc/Method"))
	require.Nil(t, r.RouteByMethod("/svc/Unknown"))
}

func TestNewFirstSourceWinsPerService(t *testing.T) {
	t.Parallel()

	client := fakeRemoteClient{sets: map[string]*descriptorpb.FileDescriptorSet{
		"proxy:123": buildDescriptorSet(map[string][]string{
			"greeter":  {"Ping"},
			"greeter1": {"Ping"},
		}),
		"proxy1:321": buildDescriptorSet(map[string][]string{
			"greeter1": {"Ping"},
			"greeter2": {"Ping"},
		}),
		"proxy2:444": buildDescriptorSet(map[string][]string{
			"greeter2": {"Ping"},
			"greeter3": {"Ping"},
		}),
	}}

	r, err := New(context.Background(), []string{
		"grpc+proxy://proxy:123",
		"grpc+replay://proxy1:321",
		"grpc+capture://proxy2:444",
	}, client)
	require.NoError(t, err)
	t.Cleanup(r.Close)

	require.Equal(t, ModeProxy, r.RouteByMethod("/greeter/Ping").Mode)
	require.Equal(t, ModeProxy, r.RouteByMethod("/greeter1/Ping").Mode)
	require.Equal(t, ModeReplay, r.RouteByMethod("/greeter2/Ping").Mode)
	require.Equal(t, ModeCapture, r.RouteByMethod("/greeter3/Ping").Mode)
	require.Nil(t, r.RouteByMethod("/unknown/Method"))
}

func TestRegisterDescriptorSetReplacesRuntimeRoute(t *testing.T) {
	t.Parallel()

	r := NewEmpty()
	t.Cleanup(r.Close)

	first := &protosetdom.Source{ReflectAddress: "first:123"}
	second := &protosetdom.Source{ReflectAddress: "second:456"}
	fds := buildDescriptorSet(map[string][]string{"greeter": {"Ping"}})

	require.NoError(t, r.RegisterDescriptorSet(first, fds, ModeReplay))
	require.Equal(t, ModeReplay, r.RouteByMethod("/greeter/Ping").Mode)
	require.Equal(t, "first:123", r.RouteByMethod("/greeter/Ping").Source.ReflectAddress)

	require.NoError(t, r.RegisterDescriptorSet(second, fds, ModeReplay))
	require.Equal(t, "second:456", r.RouteByMethod("/greeter/Ping").Source.ReflectAddress)
}

func TestDisableMethodRemovesRuntimeRoute(t *testing.T) {
	t.Parallel()

	r := NewEmpty()
	t.Cleanup(r.Close)

	require.NoError(t, r.RegisterDescriptorSet(
		&protosetdom.Source{ReflectAddress: "proxy:123"},
		buildDescriptorSet(map[string][]string{"greeter": {"Ping", "Pong"}}),
		ModeReplay,
	))
	require.NotNil(t, r.RouteByMethod("/greeter/Ping"))
	require.NotNil(t, r.RouteByMethod("/greeter/Pong"))

	r.DisableMethod("/greeter/Ping")

	require.Nil(t, r.RouteByMethod("/greeter/Ping"))
	require.NotNil(t, r.RouteByMethod("/greeter/Pong"))
}

func TestSetMethodModeOverridesSingleRuntimeRoute(t *testing.T) {
	t.Parallel()

	r := NewEmpty()
	t.Cleanup(r.Close)

	require.NoError(t, r.RegisterDescriptorSet(
		&protosetdom.Source{ReflectAddress: "proxy:123"},
		buildDescriptorSet(map[string][]string{"greeter": {"Ping", "Pong"}}),
		ModeReplay,
	))

	require.True(t, r.SetMethodMode("/greeter/Ping", ModeProxy))

	require.Equal(t, ModeProxy, r.RouteByMethod("/greeter/Ping").Mode)
	require.Equal(t, ModeReplay, r.RouteByMethod("/greeter/Pong").Mode)
}

func TestSetMethodModeForRoomOverridesOnlyThatRoom(t *testing.T) {
	t.Parallel()

	r := NewEmpty()
	t.Cleanup(r.Close)

	require.NoError(t, r.RegisterDescriptorSet(
		&protosetdom.Source{ReflectAddress: "proxy:123"},
		buildDescriptorSet(map[string][]string{"greeter": {"Ping"}}),
		ModeReplay,
	))

	require.True(t, r.SetMethodModeForRoom("room-a", "/greeter/Ping", ModeProxy))

	require.Equal(t, ModeProxy, r.RouteByMethodForRoom("room-a", "/greeter/Ping").Mode)
	require.Equal(t, ModeReplay, r.RouteByMethodForRoom("room-b", "/greeter/Ping").Mode)
	require.Equal(t, ModeReplay, r.RouteByMethod("/greeter/Ping").Mode)
}

func TestDisableMethodForRoomDisablesOnlyThatRoom(t *testing.T) {
	t.Parallel()

	r := NewEmpty()
	t.Cleanup(r.Close)

	require.NoError(t, r.RegisterDescriptorSet(
		&protosetdom.Source{ReflectAddress: "proxy:123"},
		buildDescriptorSet(map[string][]string{"greeter": {"Ping"}}),
		ModeReplay,
	))

	require.True(t, r.DisableMethodForRoom("room-a", "/greeter/Ping"))

	require.Nil(t, r.RouteByMethodForRoom("room-a", "/greeter/Ping"))
	require.NotNil(t, r.RouteByMethodForRoom("room-b", "/greeter/Ping"))
	require.NotNil(t, r.RouteByMethod("/greeter/Ping"))
}

func TestSetMethodModeAppliesToFutureRuntimeRoute(t *testing.T) {
	t.Parallel()

	r := NewEmpty()
	t.Cleanup(r.Close)

	require.False(t, r.SetMethodMode("/greeter/Ping", ModeProxy))
	require.NoError(t, r.RegisterDescriptorSet(
		&protosetdom.Source{ReflectAddress: "proxy:123"},
		buildDescriptorSet(map[string][]string{"greeter": {"Ping", "Pong"}}),
		ModeReplay,
	))

	require.Equal(t, ModeProxy, r.RouteByMethod("/greeter/Ping").Mode)
	require.Equal(t, ModeReplay, r.RouteByMethod("/greeter/Pong").Mode)
}

func TestSetMethodModeForRoomAppliesToFutureRuntimeRoute(t *testing.T) {
	t.Parallel()

	r := NewEmpty()
	t.Cleanup(r.Close)

	require.False(t, r.SetMethodModeForRoom("room-a", "/greeter/Ping", ModeProxy))
	require.NoError(t, r.RegisterDescriptorSet(
		&protosetdom.Source{ReflectAddress: "proxy:123"},
		buildDescriptorSet(map[string][]string{"greeter": {"Ping"}}),
		ModeReplay,
	))

	require.Equal(t, ModeProxy, r.RouteByMethodForRoom("room-a", "/greeter/Ping").Mode)
	require.Equal(t, ModeReplay, r.RouteByMethodForRoom("room-b", "/greeter/Ping").Mode)
}

func TestRouteWithStreamTimeoutSkipsServerStreams(t *testing.T) {
	t.Parallel()

	route := &Route{Source: &protosetdom.Source{ReflectTimeout: time.Second}}

	ctx, cancel := route.WithStreamTimeout(t.Context(), &grpc.StreamDesc{ServerStreams: true})
	defer cancel()

	_, hasDeadline := ctx.Deadline()
	require.False(t, hasDeadline)
}

func TestRouteWithStreamTimeoutAppliesToClientStreams(t *testing.T) {
	t.Parallel()

	route := &Route{Source: &protosetdom.Source{ReflectTimeout: time.Second}}

	ctx, cancel := route.WithStreamTimeout(t.Context(), &grpc.StreamDesc{ClientStreams: true})
	defer cancel()

	_, hasDeadline := ctx.Deadline()
	require.True(t, hasDeadline)
}

func buildDescriptorSet(services map[string][]string) *descriptorpb.FileDescriptorSet {
	fileName := new(string)
	*fileName = "test.proto"
	file := &descriptorpb.FileDescriptorProto{Name: fileName}

	for serviceName, methods := range services {
		svcName := new(string)
		*svcName = serviceName
		svc := &descriptorpb.ServiceDescriptorProto{Name: svcName}

		for _, method := range methods {
			methodName := new(string)
			*methodName = method
			svc.Method = append(svc.Method, &descriptorpb.MethodDescriptorProto{Name: methodName})
		}

		file.Service = append(file.Service, svc)
	}

	return &descriptorpb.FileDescriptorSet{File: []*descriptorpb.FileDescriptorProto{file}}
}
