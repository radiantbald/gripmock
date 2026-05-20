package sdk

import (
	"context"
	stderrors "errors"
	"fmt"
	"net/http"
	"slices"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	grpcclient "github.com/radiantbald/gripmock/v3/internal/infra/grpcclient"
	"github.com/cockroachdb/errors"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/protobuf/types/descriptorpb"

	"github.com/radiantbald/gripmock/v3/internal/infra/stuber"
	"github.com/radiantbald/gripmock/v3/pkg/sdk/internal/remoteapi"
)

type remoteMock struct {
	ctx           context.Context
	conn          *grpc.ClientConn
	addr          string
	restBaseURL   string
	httpClient    *http.Client
	room          string
	roomTTL       time.Duration
	ttlTimer      *time.Timer
	expectedTotal atomic.Int32
	expectedMu    sync.Mutex
	expectedByMth map[string]int
	stubIDsMu     sync.Mutex
	stubIDs       []uint64
	opErrMu       sync.Mutex
	opErr         error
}

func (m *remoteMock) Conn() *grpc.ClientConn { return m.conn }
func (m *remoteMock) Addr() string           { return m.addr }
func (m *remoteMock) History() HistoryReader { return &remoteHistory{mock: m} }
func (m *remoteMock) Verify() Verifier       { return &remoteVerifier{mock: m} }
func (m *remoteMock) Stub(service, method string) StubBuilder {
	if strings.TrimSpace(service) == "" || strings.TrimSpace(method) == "" {
		panic("sdk.Mock.Stub: service and method must be non-empty")
	}

	return m.stubBuilderCore(service, method)
}

func (m *remoteMock) Close() error {
	if m.ttlTimer != nil {
		m.ttlTimer.Stop()
	}

	cleanupErr := m.cleanupStubs()
	opErr := m.getOpErr()
	var connErr error
	if m.conn != nil {
		connErr = m.conn.Close()
		m.conn = nil
	}

	return stderrors.Join(opErr, cleanupErr, connErr)
}

func (m *remoteMock) setOpErr(err error) {
	if err == nil {
		return
	}

	m.opErrMu.Lock()
	if m.opErr == nil {
		m.opErr = err
	}
	m.opErrMu.Unlock()
}

func (m *remoteMock) getOpErr() error {
	m.opErrMu.Lock()
	defer m.opErrMu.Unlock()

	return m.opErr
}

func (m *remoteMock) armRoomTTL() {
	if m.room == "" || m.roomTTL <= 0 {
		return
	}

	m.ttlTimer = time.AfterFunc(m.roomTTL, func() {
		if err := m.cleanupStubs(); err != nil {
			m.setOpErr(fmt.Errorf("gripmock: room TTL cleanup failed: %w", err))
		}
	})
}

func (m *remoteMock) popStubIDs() []uint64 {
	m.stubIDsMu.Lock()
	defer m.stubIDsMu.Unlock()

	if len(m.stubIDs) == 0 {
		return nil
	}

	ids := slices.Clone(m.stubIDs)
	m.stubIDs = nil

	return ids
}

func (m *remoteMock) cleanupStubs() error {
	return m.deleteOwnedStubs()
}

func (m *remoteMock) deleteOwnedStubs() error {
	ids := m.popStubIDs()
	if len(ids) == 0 {
		return nil
	}

	return m.batchDelete(ids)
}

func (m *remoteMock) api() remoteapi.Client {
	return m.apiWithContext(nil)
}

func (m *remoteMock) apiWithContext(ctx context.Context) remoteapi.Client {
	httpClient := m.httpClient
	if httpClient == nil {
		httpClient = http.DefaultClient
	}

	requestCtx := m.ctx
	if ctx != nil {
		requestCtx = ctx
	}

	return remoteapi.Client{
		BaseURL:    m.restBaseURL,
		HTTPClient: httpClient,
		Room:       m.room,
		Context:    requestCtx,
	}
}

func (m *remoteMock) batchDelete(ids []uint64) error {
	return m.api().BatchDelete(ids)
}

func (m *remoteMock) uploadDescriptors(files []*descriptorpb.FileDescriptorProto) error {
	return m.api().UploadDescriptors(files)
}

func (m *remoteMock) addStub(stub *stuber.Stub) {
	_ = m.commitStubs([]*stuber.Stub{stub})
}

func (m *remoteMock) commitStubs(stubs []*stuber.Stub) error {
	if len(stubs) == 0 {
		return nil
	}

	if opErr := m.getOpErr(); opErr != nil {
		return opErr
	}

	if err := m.api().AddStubs(stubs); err != nil {
		m.setOpErr(err)
		return err
	}

	for _, stub := range stubs {
		if stub.Options.Times > 0 {
			m.recordExpected(stub.Service, stub.Method, stub.Options.Times)
		}

		m.appendStubID(stub.ID)
	}

	return nil
}

func (m *remoteMock) recordExpected(service, method string, times int) {
	m.expectedTotal.Add(int32(times))

	m.expectedMu.Lock()
	if m.expectedByMth == nil {
		m.expectedByMth = make(map[string]int)
	}
	m.expectedByMth[methodKey(service, method)] += times
	m.expectedMu.Unlock()
}

func (m *remoteMock) appendStubID(id uint64) {
	m.stubIDsMu.Lock()
	m.stubIDs = append(m.stubIDs, id)
	m.stubIDsMu.Unlock()
}

func runRemote(ctx context.Context, o *options) (Mock, error) {
	o.remoteAddr = normalizeRemoteAddr(o.remoteAddr)
	o.remoteRestURL = normalizeRemoteRestURL(o.remoteRestURL)

	opts := []grpc.DialOption{
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	}

	unaryInterceptors := []grpc.UnaryClientInterceptor{grpcclient.UnaryTimeoutInterceptor(o.grpcTimeout)}
	streamInterceptors := []grpc.StreamClientInterceptor{grpcclient.StreamTimeoutInterceptor(o.grpcTimeout)}
	if o.room != "" {
		sess := o.room
		unaryInterceptors = append(unaryInterceptors, grpcclient.UnaryRoomInterceptor(sess))
		streamInterceptors = append(streamInterceptors, grpcclient.StreamRoomInterceptor(sess))
	}

	opts = append(opts,
		grpc.WithChainUnaryInterceptor(unaryInterceptors...),
		grpc.WithChainStreamInterceptor(streamInterceptors...),
	)

	conn, err := grpc.NewClient("passthrough:///"+o.remoteAddr, opts...)
	if err != nil {
		return nil, errors.Wrapf(err, "failed to connect to remote gripmock at %s", o.remoteAddr)
	}
	if err := waitForHealthy(ctx, conn, o.healthyTimeout); err != nil {
		_ = conn.Close()
		return nil, err
	}
	rm := &remoteMock{
		ctx:         context.WithoutCancel(ctx),
		conn:        conn,
		addr:        o.remoteAddr,
		restBaseURL: o.remoteRestURL,
		httpClient:  o.httpClient,
		room:        o.room,
		roomTTL:     o.roomTTL,
	}

	if err := rm.uploadDescriptors(o.descriptorFiles); err != nil {
		_ = conn.Close()
		return nil, err
	}

	rm.armRoomTTL()

	return rm, nil
}

func (m *remoteMock) stubBuilderCore(service, method string) *stubBuilderCore {
	return &stubBuilderCore{
		service:  service,
		method:   method,
		onCommit: func(stub *stuber.Stub) { m.addStub(stub) },
	}
}
