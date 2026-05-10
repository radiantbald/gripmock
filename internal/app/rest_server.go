package app

import (
	"bytes"
	"context"
	"encoding/base64"
	stderrors "errors"
	"fmt"
	"io"
	"maps"
	"net/http"
	"path/filepath"
	"runtime"
	"slices"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/bufbuild/protocompile"
	"github.com/cockroachdb/errors"
	"github.com/go-playground/validator/v10"
	"github.com/goccy/go-json"
	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/modelcontextprotocol/go-sdk/jsonrpc"
	mcp "github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/rs/zerolog"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protodesc"
	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/reflect/protoregistry"
	"google.golang.org/protobuf/types/descriptorpb"

	mcpusecase "github.com/bavix/gripmock/v3/internal/app/usecase/mcp"
	"github.com/bavix/gripmock/v3/internal/domain/descriptors"
	"github.com/bavix/gripmock/v3/internal/domain/history"
	"github.com/bavix/gripmock/v3/internal/domain/rest"
	"github.com/bavix/gripmock/v3/internal/infra/build"
	"github.com/bavix/gripmock/v3/internal/infra/httputil"
	"github.com/bavix/gripmock/v3/internal/infra/jsondecoder"
	"github.com/bavix/gripmock/v3/internal/infra/muxmiddleware"
	pgallowlist "github.com/bavix/gripmock/v3/internal/infra/postgres/allowlist"
	pgclients "github.com/bavix/gripmock/v3/internal/infra/postgres/clients"
	pgprotometadata "github.com/bavix/gripmock/v3/internal/infra/postgres/protometadata"
	pgsessions "github.com/bavix/gripmock/v3/internal/infra/postgres/sessions"
	pgusers "github.com/bavix/gripmock/v3/internal/infra/postgres/users"
	protosetinfra "github.com/bavix/gripmock/v3/internal/infra/protoset"
	sessioninfra "github.com/bavix/gripmock/v3/internal/infra/session"
	"github.com/bavix/gripmock/v3/internal/infra/stuber"
	"github.com/bavix/gripmock/v3/internal/pbs"
)

// Extender defines the interface for extending stub functionality.
type Extender interface {
	Wait(ctx context.Context)
}

type ProtoMetadataWriter interface {
	ReplaceDescriptorFiles(ctx context.Context, source string, files []protoreflect.FileDescriptor) error
	ReplaceDescriptorSets(ctx context.Context, source string, descriptorSets []*descriptorpb.FileDescriptorSet) error
}

type protoMetadataReader interface {
	HasAnyProtofiles(ctx context.Context) (bool, error)
	HasServiceMethod(ctx context.Context, serviceID, methodID string) (bool, error)
}

type protoMetadataLister interface {
	ListProtofiles(ctx context.Context) ([]pgprotometadata.ProtofileMeta, error)
}

type protoMetadataDeleter interface {
	DeleteProtofile(ctx context.Context, name string) (pgprotometadata.DeleteProtofileResult, error)
}

// RestServer handles HTTP REST API requests for stub management.
type RestServer struct {
	ok              atomic.Bool
	nextPublicID    atomic.Uint64
	startedAt       time.Time
	descriptorOpsMu sync.Mutex
	idMapMu         sync.RWMutex
	mcpHandlerOnce  sync.Once
	budgerigar      *stuber.Budgerigar
	history         history.Reader
	validator       *validator.Validate
	restDescriptors *descriptors.Registry
	publicIDs       map[rest.ID]uuid.UUID
	privateIDs      map[uuid.UUID]rest.ID
	mcpHandler      http.Handler
	usersRepository *pgusers.Repository
	allowedPhones   *pgallowlist.Repository
	sessionsRepo    *pgsessions.Repository
	clientsRepo     *pgclients.Repository
	protoMetadata   ProtoMetadataWriter
}

var _ rest.ServerInterface = &RestServer{}

// NewRestServer creates a new REST server instance with the specified dependencies.
// If historyReader is nil, /api/history and /api/verify return empty/error.
// If stubValidator is nil, a new default validator is created automatically.
func NewRestServer(
	ctx context.Context,
	budgerigar *stuber.Budgerigar,
	extender Extender,
	historyReader history.Reader,
	stubValidator *validator.Validate,
	registry *descriptors.Registry,
) (*RestServer, error) {
	v := stubValidator
	if v == nil {
		var err error

		v, err = NewStubValidator()
		if err != nil {
			return nil, errors.Wrap(err, "failed to create stub validator")
		}
	}

	r := registry
	if r == nil {
		r = descriptors.NewRegistry()
	}

	server := &RestServer{
		startedAt:       time.Now(),
		budgerigar:      budgerigar,
		history:         historyReader,
		validator:       v,
		restDescriptors: r,
		publicIDs:       make(map[rest.ID]uuid.UUID),
		privateIDs:      make(map[uuid.UUID]rest.ID),
	}

	go func() {
		if extender != nil {
			extender.Wait(ctx)
		}

		server.ok.Store(true)
	}()

	return server, nil
}

func (h *RestServer) SetUsersRepository(repository *pgusers.Repository) {
	h.usersRepository = repository
}

func (h *RestServer) SetAllowedPhonesRepository(repository *pgallowlist.Repository) {
	h.allowedPhones = repository
}

func (h *RestServer) SetSessionsRepository(repository *pgsessions.Repository) {
	h.sessionsRepo = repository
}

func (h *RestServer) SetClientsRepository(repository *pgclients.Repository) {
	h.clientsRepo = repository
	if h.clientsRepo == nil {
		return
	}

	routes, err := h.clientsRepo.List(context.Background())
	if err != nil {
		return
	}
	for _, route := range routes {
		sessioninfra.AssignClient(route.ClientID, route.SessionID)
	}
}

func (h *RestServer) SetProtoMetadataWriter(writer ProtoMetadataWriter) {
	h.protoMetadata = writer
}

func (h *RestServer) ProtoMetadataStatus(w http.ResponseWriter, r *http.Request) {
	reader, ok := h.protoMetadata.(protoMetadataReader)
	if !ok {
		h.writeResponse(r.Context(), w, map[string]any{"exists": false})
		return
	}

	serviceID := strings.TrimSpace(r.URL.Query().Get("service"))
	methodID := strings.TrimSpace(r.URL.Query().Get("method"))

	var (
		exists bool
		err    error
	)
	if serviceID != "" || methodID != "" {
		exists, err = reader.HasServiceMethod(r.Context(), serviceID, methodID)
	} else {
		exists, err = reader.HasAnyProtofiles(r.Context())
	}
	if err != nil {
		zerolog.Ctx(r.Context()).Warn().Err(err).Str("service", serviceID).Str("method", methodID).
			Msg("failed to resolve proto metadata status")
		exists = false
	}

	h.writeResponse(r.Context(), w, map[string]any{"exists": exists})
}

const (
	servicesListCap                = 16
	serviceMethodsCap              = 32
	stubSchemaURL                  = "https://bavix.github.io/gripmock/schema/stub.json"
	historyStreamTick              = 15 * time.Second
	descriptorUploadFilenameHeader = "X-Gripmock-Descriptor-Filename"
	descriptorSourceREST           = "rest"
	descriptorSourceMCP            = "mcp"
)

var (
	errServiceNotFound        = stderrors.New("service not found")
	errMethodNotFound         = stderrors.New("method not found in service")
	errSessionForbiddenDelete = stderrors.New("only session creator can delete this session")
)

// ServicesList returns a list of all available gRPC services (startup + REST-added).
func (h *RestServer) ServicesList(w http.ResponseWriter, r *http.Request) {
	h.writeResponse(r.Context(), w, h.collectAllServices())
}

func splitLast(s string, sep string) []string {
	lastDot := strings.LastIndex(s, sep)
	if lastDot == -1 {
		return []string{s, ""}
	}

	return []string{s[:lastDot], s[lastDot+1:]}
}

// ServiceMethodsList returns a list of methods for the specified service.
func (h *RestServer) ServiceMethodsList(w http.ResponseWriter, r *http.Request, serviceID string) {
	serviceDescriptor, ok := h.findServiceDescriptor(serviceID)
	if !ok {
		h.writeResponse(r.Context(), w, []rest.Method{})

		return
	}

	h.writeResponse(r.Context(), w, h.serviceFromDescriptor(serviceDescriptor, false).Methods)
}

// ServiceGet returns exact service metadata by id.
func (h *RestServer) ServiceGet(w http.ResponseWriter, r *http.Request, serviceID string) {
	service, ok := h.findServiceDetailed(serviceID)
	if !ok {
		w.WriteHeader(http.StatusNotFound)
		h.writeResponseError(r.Context(), w, fmt.Errorf("%w: %s", errServiceNotFound, serviceID))

		return
	}

	h.writeResponse(r.Context(), w, service)
}

// ServiceMethodGet returns exact method metadata by service and method id.
func (h *RestServer) ServiceMethodGet(w http.ResponseWriter, r *http.Request, serviceID string, methodID string) {
	service, ok := h.findServiceDetailed(serviceID)
	if !ok {
		w.WriteHeader(http.StatusNotFound)
		h.writeResponseError(r.Context(), w, fmt.Errorf("%w: %s", errServiceNotFound, serviceID))

		return
	}

	for _, method := range service.Methods {
		if method.Id == methodID || method.Name == methodID {
			h.writeResponse(r.Context(), w, method)

			return
		}
	}

	w.WriteHeader(http.StatusNotFound)
	h.writeResponseError(
		r.Context(),
		w,
		fmt.Errorf("%w %s in service %s", errMethodNotFound, methodID, serviceID),
	)
}

// FindByID returns a stub by ID.
func (h *RestServer) FindByID(w http.ResponseWriter, r *http.Request, id rest.ID) {
	privateID, ok := h.resolvePrivateID(id)
	if !ok {
		w.WriteHeader(http.StatusNotFound)
		h.writeResponse(r.Context(), w, map[string]string{
			"error": fmt.Sprintf("Stub with ID '%d' not found", id),
		})

		return
	}

	stub := h.budgerigar.FindByID(privateID)
	if stub == nil {
		w.WriteHeader(http.StatusNotFound)
		h.writeResponse(r.Context(), w, map[string]string{
			"error": fmt.Sprintf("Stub with ID '%d' not found", id),
		})

		return
	}

	h.writeResponse(r.Context(), w, h.toRestStub(stub))
}

// Readiness handles the readiness probe endpoint.
func (h *RestServer) Readiness(w http.ResponseWriter, r *http.Request) {
	if !h.ok.Load() {
		w.WriteHeader(http.StatusServiceUnavailable)
		h.writeResponse(r.Context(), w, rest.MessageOK{Message: "not ready", Time: time.Now()})

		return
	}

	h.liveness(r.Context(), w)
}

// Liveness handles the liveness probe endpoint.
func (h *RestServer) Liveness(w http.ResponseWriter, r *http.Request) {
	h.liveness(r.Context(), w)
}

// DashboardOverview returns aggregated lightweight metrics for admin dashboard.
func (h *RestServer) DashboardOverview(w http.ResponseWriter, r *http.Request) {
	payload := h.dashboardPayload(r)

	response := rest.DashboardOverview{
		TotalServices:      payload.TotalServices,
		TotalStubs:         payload.TotalStubs,
		UsedStubs:          payload.UsedStubs,
		UnusedStubs:        payload.UnusedStubs,
		TotalSessions:      payload.TotalSessions,
		RuntimeDescriptors: payload.RuntimeDescriptors,
		TotalHistory:       payload.TotalHistory,
		HistoryErrors:      payload.HistoryErrors,
	}

	h.writeResponse(r.Context(), w, response)
}

// Dashboard returns combined counters and runtime metadata for dashboard page.
func (h *RestServer) Dashboard(w http.ResponseWriter, r *http.Request) {
	h.writeResponse(r.Context(), w, h.dashboardPayload(r))
}

// SessionsList returns distinct non-empty session IDs for UI selectors.
func (h *RestServer) SessionsList(w http.ResponseWriter, r *http.Request) {
	h.writeResponse(r.Context(), w, rest.Sessions{Sessions: h.sessionsForResponse()})
}

// SessionsCreate creates a session row and returns generated id.
func (h *RestServer) SessionsCreate(w http.ResponseWriter, r *http.Request) {
	if h.sessionsRepo == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		h.writeResponseError(r.Context(), w, errors.New("sessions repository is not configured"))
		return
	}

	var payload struct {
		Name string `json:"name"`
	}

	byt, err := io.ReadAll(r.Body)
	if err != nil {
		h.validationError(r.Context(), w, errors.Wrap(err, "failed to read request body"))
		return
	}
	if err = json.Unmarshal(byt, &payload); err != nil {
		h.validationError(r.Context(), w, errors.Wrap(err, "invalid sessions payload"))
		return
	}

	row, createErr := h.sessionsRepo.Create(r.Context(), payload.Name, muxmiddleware.OwnerFromContext(r.Context()))
	if createErr != nil {
		h.validationError(r.Context(), w, createErr)
		return
	}

	h.writeResponse(r.Context(), w, rest.Session{
		Id:   strconv.FormatInt(row.ID, 10),
		Name: nilIfEmpty(row.Name),
	})
}

// SessionsAssignPeer binds a stable peer identifier to a session for gRPC calls without explicit session header.
func (h *RestServer) SessionsAssignPeer(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Peer        string `json:"peer"`
		Session     string `json:"session"`
		UserAgent   string `json:"userAgent"`
		Fingerprint string `json:"fingerprint"`
	}

	byt, err := io.ReadAll(r.Body)
	if err != nil {
		h.validationError(r.Context(), w, errors.Wrap(err, "failed to read request body"))
		return
	}
	if err = json.Unmarshal(byt, &payload); err != nil {
		h.validationError(r.Context(), w, errors.Wrap(err, "invalid sessions peer assignment payload"))
		return
	}

	peerID := strings.TrimSpace(payload.Peer)
	sessionID := strings.TrimSpace(payload.Session)
	userAgent := strings.TrimSpace(payload.UserAgent)
	fingerprint := strings.TrimSpace(payload.Fingerprint)
	if peerID == "" || sessionID == "" {
		h.validationError(r.Context(), w, errors.New("peer and session are required"))
		return
	}
	if fingerprint == "" {
		fingerprint = clientFingerprint(peerID, userAgent)
	}

	if h.clientsRepo != nil {
		if err := h.clientsRepo.Upsert(
			r.Context(),
			peerID,
			sessionID,
			muxmiddleware.OwnerFromContext(r.Context()),
			peerID,
			userAgent,
			fingerprint,
		); err != nil {
			h.validationError(r.Context(), w, err)
			return
		}
	}

	if !sessioninfra.AssignClient(peerID, sessionID) {
		h.validationError(r.Context(), w, errors.New("failed to assign peer to session"))
		return
	}

	h.writeResponse(r.Context(), w, rest.MessageOK{
		Message: "peer assigned to session",
		Time:    time.Now(),
	})
}

// SessionsPeerStatus returns session mapping for a peer (if any).
func (h *RestServer) SessionsPeerStatus(w http.ResponseWriter, r *http.Request) {
	peerID := strings.TrimSpace(r.URL.Query().Get("peer"))
	if peerID == "" {
		h.validationError(r.Context(), w, errors.New("peer is required"))
		return
	}

	sessionID := ""
	if h.clientsRepo != nil {
		dbSessionID, err := h.clientsRepo.SessionByClient(r.Context(), peerID)
		if err != nil {
			h.validationError(r.Context(), w, err)
			return
		}
		sessionID = strings.TrimSpace(dbSessionID)
		if sessionID == "" {
			sessioninfra.UnassignClient(peerID)
		} else {
			sessioninfra.AssignClient(peerID, sessionID)
		}
	} else {
		sessionID = strings.TrimSpace(sessioninfra.SessionByClient(peerID))
	}
	h.writeResponse(r.Context(), w, map[string]any{
		"peer":    peerID,
		"session": sessionID,
		"bound":   sessionID != "",
	})
}

// ClientsList returns peer-to-session mappings persisted for routing.
func (h *RestServer) ClientsList(w http.ResponseWriter, r *http.Request) {
	if h.clientsRepo == nil {
		h.writeResponse(r.Context(), w, []map[string]any{})
		return
	}

	routes, err := h.clientsRepo.List(r.Context())
	if err != nil {
		h.validationError(r.Context(), w, err)
		return
	}

	items := make([]map[string]any, 0, len(routes))
	for _, route := range routes {
		clientID := strings.TrimSpace(route.ClientID)
		sessionID := strings.TrimSpace(route.SessionID)
		if clientID == "" || sessionID == "" {
			continue
		}

		items = append(items, map[string]any{
			"id":          clientID,
			"client":      clientID,
			"session":     sessionID,
			"user":        route.UserID,
			"peerHost":    route.PeerHost,
			"userAgent":   route.UserAgent,
			"fingerprint": route.Fingerprint,
		})
	}

	h.writeResponse(r.Context(), w, items)
}

func clientFingerprint(peerID string, userAgent string) string {
	peerID = strings.TrimSpace(peerID)
	userAgent = strings.TrimSpace(userAgent)
	if peerID == "" {
		return userAgent
	}
	if userAgent == "" {
		return peerID
	}

	return peerID + "|" + userAgent
}

// ProtofilesList returns persisted runtime proto files metadata.
func (h *RestServer) ProtofilesList(w http.ResponseWriter, r *http.Request) {
	lister, ok := h.protoMetadata.(protoMetadataLister)
	if !ok {
		h.writeResponse(r.Context(), w, []map[string]any{})
		return
	}

	protofiles, err := lister.ListProtofiles(r.Context())
	if err != nil {
		h.validationError(r.Context(), w, err)
		return
	}

	items := make([]map[string]any, 0, len(protofiles))
	for _, item := range protofiles {
		name := strings.TrimSpace(item.Name)
		if name == "" {
			continue
		}

		items = append(items, map[string]any{
			"id":        name,
			"name":      name,
			"hash":      item.Hash,
			"version":   item.Version,
			"source":    item.Source,
			"createdAt": item.CreatedAt,
			"updatedAt": item.UpdatedAt,
		})
	}

	h.writeResponse(r.Context(), w, items)
}

// ProtofilesDelete removes persisted protofile metadata and clears matching runtime state.
func (h *RestServer) ProtofilesDelete(w http.ResponseWriter, r *http.Request) {
	deleter, ok := h.protoMetadata.(protoMetadataDeleter)
	if !ok {
		w.WriteHeader(http.StatusNotImplemented)
		h.writeResponseError(r.Context(), w, errors.New("proto metadata delete is not configured"))

		return
	}

	name := strings.TrimSpace(mux.Vars(r)["name"])
	if name == "" {
		name = strings.TrimSpace(r.URL.Query().Get("name"))
	}
	if name == "" {
		h.validationError(r.Context(), w, errors.New("protofile name is required"))

		return
	}

	h.descriptorOpsMu.Lock()
	defer h.descriptorOpsMu.Unlock()

	deleted, err := deleter.DeleteProtofile(r.Context(), name)
	if err != nil {
		h.responseError(r.Context(), w, err)

		return
	}
	if !deleted.Removed {
		w.WriteHeader(http.StatusNotFound)
		h.writeResponseError(r.Context(), w, fmt.Errorf("protofile not found: %s", name))

		return
	}

	stubIDs := h.collectStubsForProtofileDelete(deleted)
	if len(stubIDs) > 0 {
		h.budgerigar.DeleteByID(stubIDs...)
	}

	h.restDescriptors.UnregisterByPath(name)

	h.writeResponse(r.Context(), w, map[string]any{
		"removed":        true,
		"name":           name,
		"serviceCount":   len(deleted.ServiceIDs),
		"methodCount":    len(deleted.ServiceMethods),
		"stubsRemoved":   len(stubIDs),
		"descriptorPath": name,
	})
}

func (h *RestServer) collectStubsForProtofileDelete(deleted pgprotometadata.DeleteProtofileResult) []uuid.UUID {
	if len(deleted.ServiceIDs) == 0 && len(deleted.ServiceMethods) == 0 {
		return nil
	}

	serviceSet := make(map[string]struct{}, len(deleted.ServiceIDs))
	for _, serviceID := range deleted.ServiceIDs {
		serviceSet[serviceID] = struct{}{}
	}

	methodSet := make(map[string]struct{}, len(deleted.ServiceMethods))
	for _, item := range deleted.ServiceMethods {
		if strings.TrimSpace(item.ServiceID) == "" || strings.TrimSpace(item.MethodID) == "" {
			continue
		}
		methodSet[item.ServiceID+"|"+item.MethodID] = struct{}{}
	}

	ids := make([]uuid.UUID, 0)
	for _, stub := range h.budgerigar.All() {
		if stub == nil {
			continue
		}

		if _, ok := methodSet[stub.Service+"|"+stub.Method]; ok {
			ids = append(ids, stub.ID)

			continue
		}

		// If method-level metadata is unavailable, remove by service as fallback.
		if len(methodSet) == 0 {
			if _, ok := serviceSet[stub.Service]; ok {
				ids = append(ids, stub.ID)
			}
		}
	}

	return ids
}

// DashboardInfo returns build metadata and runtime process information.
func (h *RestServer) DashboardInfo(w http.ResponseWriter, r *http.Request) {
	payload := h.dashboardPayload(r)

	h.writeResponse(r.Context(), w, rest.DashboardInfo{
		AppName:            payload.AppName,
		Version:            payload.Version,
		GoVersion:          payload.GoVersion,
		Compiler:           payload.Compiler,
		Goos:               payload.Goos,
		Goarch:             payload.Goarch,
		NumCPU:             payload.NumCPU,
		StartedAt:          payload.StartedAt,
		UptimeSeconds:      payload.UptimeSeconds,
		Ready:              payload.Ready,
		HistoryEnabled:     payload.HistoryEnabled,
		TotalServices:      payload.TotalServices,
		TotalStubs:         payload.TotalStubs,
		TotalSessions:      payload.TotalSessions,
		RuntimeDescriptors: payload.RuntimeDescriptors,
	})
}

func (h *RestServer) MCPHandler() http.Handler {
	h.mcpHandlerOnce.Do(func() {
		h.mcpHandler = newMCPStreamableHandler(h)
	})

	return h.mcpHandler
}

const (
	debugCallDefaultLimit = 20
	debugCallHintsCap     = 4
)

func newMCPStreamableHandler(h *RestServer) http.Handler {
	server := mcp.NewServer(&mcp.Implementation{Name: "gripmock", Version: build.Version}, nil)

	for _, tool := range mcpusecase.ListRuntimeTools() {
		name, _ := tool["name"].(string)
		description, _ := tool["description"].(string)
		inputSchema, _ := tool["inputSchema"].(map[string]any)

		if name == "" || inputSchema == nil {
			continue
		}

		server.AddTool(&mcp.Tool{
			Name:        name,
			Description: description,
			InputSchema: inputSchema,
		}, newMCPToolHandler(h, name))
	}

	handler := mcp.NewStreamableHTTPHandler(func(_ *http.Request) *mcp.Server {
		return server
	}, &mcp.StreamableHTTPOptions{
		Stateless:    true,
		JSONResponse: true,
	})

	return handler
}

func newMCPToolHandler(h *RestServer, name string) mcp.ToolHandler {
	return func(ctx context.Context, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		var args map[string]any
		if len(req.Params.Arguments) > 0 {
			if err := json.Unmarshal(req.Params.Arguments, &args); err != nil {
				return nil, &jsonrpc.Error{Code: jsonrpc.CodeInvalidParams, Message: mcpInvalidArgError("arguments must be an object").Error()}
			}
		}

		args = mcpusecase.ApplySession(name, args, mcpSessionFromContext(ctx, req))
		args = mcpApplyOwner(name, args, mcpOwnerFromContext(ctx, req))

		result, err := callMCPToolDispatch(h, name, args)
		if err != nil {
			return nil, mcpJSONRPCError(name, err)
		}

		return &mcp.CallToolResult{
			Content:           []mcp.Content{&mcp.TextContent{Text: "OK"}},
			StructuredContent: result,
		}, nil
	}
}

func mcpSessionFromContext(ctx context.Context, req *mcp.CallToolRequest) string {
	if sessionID := muxmiddleware.FromContext(ctx); sessionID != "" {
		return sessionID
	}

	if req == nil || req.Extra == nil {
		return ""
	}

	return strings.TrimSpace(req.Extra.Header.Get(muxmiddleware.HeaderName))
}

func mcpOwnerFromContext(ctx context.Context, req *mcp.CallToolRequest) string {
	if ownerID := muxmiddleware.OwnerFromContext(ctx); ownerID != "" {
		return ownerID
	}

	if req == nil || req.Extra == nil {
		return ""
	}

	return strings.TrimSpace(req.Extra.Header.Get(muxmiddleware.OwnerHeaderName))
}

func mcpApplyOwner(toolName string, args map[string]any, ownerID string) map[string]any {
	if ownerID == "" {
		return args
	}

	if toolName != mcpusecase.ToolStubsPurge && toolName != mcpusecase.ToolStubsUpsert {
		return args
	}

	if args == nil {
		args = make(map[string]any)
	}

	args["_owner"] = ownerID

	return args
}

func mcpJSONRPCError(toolName string, err error) error {
	data, marshalErr := json.Marshal(map[string]any{"tool": toolName})
	if marshalErr != nil {
		data = nil
	}

	if stderrors.Is(err, ErrMCPInvalidArgument) {
		return &jsonrpc.Error{Code: jsonrpc.CodeInvalidParams, Message: err.Error(), Data: data}
	}

	if stderrors.Is(err, ErrMCPToolNotFound) {
		return &jsonrpc.Error{Code: jsonrpc.CodeMethodNotFound, Message: err.Error(), Data: data}
	}

	return &jsonrpc.Error{Code: jsonrpc.CodeInternalError, Message: err.Error(), Data: data}
}

func callMCPToolDispatch(h *RestServer, name string, args map[string]any) (map[string]any, error) {
	handlers := mcpToolHandlers(h)

	result, err, found := mcpusecase.DispatchTool(name, args, handlers)
	if !found {
		return nil, mcpUnknownTool(name)
	}

	return result, err
}

func mcpToolHandlers(h *RestServer) map[string]mcpusecase.ToolHandler {
	handlers := map[string]mcpusecase.ToolHandler{}

	mergeMCPToolHandlers(handlers, mcpGeneralToolHandlers(h))
	mergeMCPToolHandlers(handlers, mcpServicesToolHandlers(h))
	mergeMCPToolHandlers(handlers, mcpStubsToolHandlers(h))

	return handlers
}

func mcpGeneralToolHandlers(h *RestServer) map[string]mcpusecase.ToolHandler {
	return map[string]mcpusecase.ToolHandler{
		mcpusecase.ToolHealthLiveness:  func(toolArgs map[string]any) (map[string]any, error) { return mcpHealthLiveness(h, toolArgs) },
		mcpusecase.ToolHealthReadiness: func(toolArgs map[string]any) (map[string]any, error) { return mcpHealthReadiness(h, toolArgs) },
		mcpusecase.ToolHealthStatus:    func(toolArgs map[string]any) (map[string]any, error) { return mcpHealthStatus(h, toolArgs) },
		mcpusecase.ToolDashboard:       func(toolArgs map[string]any) (map[string]any, error) { return mcpDashboard(h, toolArgs) },
		mcpusecase.ToolOverview:        func(toolArgs map[string]any) (map[string]any, error) { return mcpDashboardOverview(h, toolArgs) },
		mcpusecase.ToolInfo:            func(toolArgs map[string]any) (map[string]any, error) { return mcpDashboardInfo(h, toolArgs) },
		mcpusecase.ToolSessionsList:    func(toolArgs map[string]any) (map[string]any, error) { return mcpSessionsList(h, toolArgs) },
		mcpusecase.ToolGripmockInfo:    func(toolArgs map[string]any) (map[string]any, error) { return mcpGripmockInfo(h, toolArgs) },
		mcpusecase.ToolReflectInfo:     func(toolArgs map[string]any) (map[string]any, error) { return mcpReflectInfo(h, toolArgs) },
		mcpusecase.ToolReflectSources:  func(toolArgs map[string]any) (map[string]any, error) { return mcpReflectSources(h, toolArgs) },
		mcpusecase.ToolDescriptorsAdd:  func(toolArgs map[string]any) (map[string]any, error) { return mcpDescriptorsAdd(h, toolArgs) },
		mcpusecase.ToolDescriptorsList: func(toolArgs map[string]any) (map[string]any, error) { return mcpDescriptorsList(h, toolArgs) },
		mcpusecase.ToolHistoryList:     func(toolArgs map[string]any) (map[string]any, error) { return mcpHistoryList(h, toolArgs) },
		mcpusecase.ToolHistoryErrors:   func(toolArgs map[string]any) (map[string]any, error) { return mcpHistoryErrors(h, toolArgs) },
		mcpusecase.ToolVerifyCalls:     func(toolArgs map[string]any) (map[string]any, error) { return mcpVerifyCalls(h, toolArgs) },
		mcpusecase.ToolDebugCall:       func(toolArgs map[string]any) (map[string]any, error) { return mcpDebugCall(h, toolArgs) },
		mcpusecase.ToolSchemaStub:      func(toolArgs map[string]any) (map[string]any, error) { return mcpSchemaStub(h, toolArgs) },
	}
}

func mcpServicesToolHandlers(h *RestServer) map[string]mcpusecase.ToolHandler {
	return map[string]mcpusecase.ToolHandler{
		mcpusecase.ToolServicesList:    func(toolArgs map[string]any) (map[string]any, error) { return mcpServicesList(h, toolArgs) },
		mcpusecase.ToolServicesGet:     func(toolArgs map[string]any) (map[string]any, error) { return mcpServicesGet(h, toolArgs) },
		mcpusecase.ToolServicesMethods: func(toolArgs map[string]any) (map[string]any, error) { return mcpServicesMethods(h, toolArgs) },
		mcpusecase.ToolServicesMethod:  func(toolArgs map[string]any) (map[string]any, error) { return mcpServicesMethod(h, toolArgs) },
		mcpusecase.ToolServicesDelete:  func(toolArgs map[string]any) (map[string]any, error) { return mcpServicesDelete(h, toolArgs) },
	}
}

func mcpStubsToolHandlers(h *RestServer) map[string]mcpusecase.ToolHandler {
	return map[string]mcpusecase.ToolHandler{
		mcpusecase.ToolStubsUpsert: func(toolArgs map[string]any) (map[string]any, error) { return mcpStubsUpsert(h, toolArgs) },
		mcpusecase.ToolStubsList:   func(toolArgs map[string]any) (map[string]any, error) { return mcpStubsList(h, toolArgs) },
		mcpusecase.ToolStubsGet:    func(toolArgs map[string]any) (map[string]any, error) { return mcpStubsGet(h, toolArgs) },
		mcpusecase.ToolStubsDelete: func(toolArgs map[string]any) (map[string]any, error) { return mcpStubsDelete(h, toolArgs) },
		mcpusecase.ToolStubsBatchDelete: func(toolArgs map[string]any) (map[string]any, error) {
			return mcpStubsBatchDelete(h, toolArgs)
		},
		mcpusecase.ToolStubsPurge:   func(toolArgs map[string]any) (map[string]any, error) { return mcpStubsPurge(h, toolArgs) },
		mcpusecase.ToolStubsSearch:  func(toolArgs map[string]any) (map[string]any, error) { return mcpStubsSearch(h, toolArgs) },
		mcpusecase.ToolStubsInspect: func(toolArgs map[string]any) (map[string]any, error) { return mcpStubsInspect(h, toolArgs) },
		mcpusecase.ToolStubsUsed:    func(toolArgs map[string]any) (map[string]any, error) { return mcpStubsUsed(h, toolArgs) },
		mcpusecase.ToolStubsUnused:  func(toolArgs map[string]any) (map[string]any, error) { return mcpStubsUnused(h, toolArgs) },
	}
}

func mergeMCPToolHandlers(dst map[string]mcpusecase.ToolHandler, src map[string]mcpusecase.ToolHandler) {
	maps.Copy(dst, src)
}

func mcpSchemaStub(_ *RestServer, _ map[string]any) (map[string]any, error) {
	return map[string]any{"schemaUrl": stubSchemaURL}, nil
}

func mcpHealthLiveness(_ *RestServer, _ map[string]any) (map[string]any, error) {
	return map[string]any{"message": "ok", "time": time.Now()}, nil
}

func mcpHealthReadiness(h *RestServer, _ map[string]any) (map[string]any, error) {
	ready := h.ok.Load()
	if !ready {
		return map[string]any{"ready": false, "message": "not ready", "time": time.Now()}, nil
	}

	return map[string]any{"ready": true, "message": "ok", "time": time.Now()}, nil
}

func mcpHealthStatus(h *RestServer, _ map[string]any) (map[string]any, error) {
	ready := h.ok.Load()

	readiness := "ok"
	if !ready {
		readiness = "not ready"
	}

	return map[string]any{
		"liveness":  "ok",
		"readiness": readiness,
		"ready":     ready,
		"time":      time.Now(),
	}, nil
}

func mcpDashboard(h *RestServer, args map[string]any) (map[string]any, error) {
	return map[string]any{"dashboard": h.dashboardPayload(mcpSessionRequest(args))}, nil
}

func mcpDashboardOverview(h *RestServer, args map[string]any) (map[string]any, error) {
	payload := h.dashboardPayload(mcpSessionRequest(args))

	return map[string]any{"overview": rest.DashboardOverview{
		TotalServices:      payload.TotalServices,
		TotalStubs:         payload.TotalStubs,
		UsedStubs:          payload.UsedStubs,
		UnusedStubs:        payload.UnusedStubs,
		TotalSessions:      payload.TotalSessions,
		RuntimeDescriptors: payload.RuntimeDescriptors,
		TotalHistory:       payload.TotalHistory,
		HistoryErrors:      payload.HistoryErrors,
	}}, nil
}

func mcpDashboardInfo(h *RestServer, args map[string]any) (map[string]any, error) {
	payload := h.dashboardPayload(mcpSessionRequest(args))

	return map[string]any{"info": rest.DashboardInfo{
		AppName:            payload.AppName,
		Version:            payload.Version,
		GoVersion:          payload.GoVersion,
		Compiler:           payload.Compiler,
		Goos:               payload.Goos,
		Goarch:             payload.Goarch,
		NumCPU:             payload.NumCPU,
		StartedAt:          payload.StartedAt,
		UptimeSeconds:      payload.UptimeSeconds,
		Ready:              payload.Ready,
		HistoryEnabled:     payload.HistoryEnabled,
		TotalServices:      payload.TotalServices,
		TotalStubs:         payload.TotalStubs,
		TotalSessions:      payload.TotalSessions,
		RuntimeDescriptors: payload.RuntimeDescriptors,
	}}, nil
}

func mcpSessionsList(h *RestServer, _ map[string]any) (map[string]any, error) {
	return map[string]any{"sessions": h.sessionsForResponse()}, nil
}

func mcpGripmockInfo(h *RestServer, _ map[string]any) (map[string]any, error) {
	overview := h.dashboardPayload(nil)

	return map[string]any{
		"appName":            overview.AppName,
		"version":            overview.Version,
		"protocolVersion":    mcpusecase.ProtocolVersion,
		"historyEnabled":     overview.HistoryEnabled,
		"ready":              overview.Ready,
		"totalServices":      overview.TotalServices,
		"totalStubs":         overview.TotalStubs,
		"totalSessions":      overview.TotalSessions,
		"runtimeDescriptors": overview.RuntimeDescriptors,
		"tools":              mcpusecase.ListRuntimeTools(),
	}, nil
}

func mcpReflectInfo(h *RestServer, _ map[string]any) (map[string]any, error) {
	runtimePaths, reflectionPrefixes, reflectionFiles := runtimeDescriptorStats(h)

	globalCount := 0

	protoregistry.GlobalFiles.RangeFiles(func(_ protoreflect.FileDescriptor) bool {
		globalCount++

		return true
	})

	return map[string]any{
		"runtimeDescriptorFiles":    len(runtimePaths),
		"reflectionDescriptorFiles": reflectionFiles,
		"dynamicDescriptorFiles":    len(runtimePaths) - reflectionFiles,
		"reflectionDetected":        reflectionFiles > 0,
		"reflectionSources":         reflectionPrefixes,
		"globalDescriptorFiles":     globalCount,
	}, nil
}

func mcpReflectSources(h *RestServer, args map[string]any) (map[string]any, error) {
	runtimePaths, reflectionPrefixes, _ := runtimeDescriptorStats(h)
	reflectionPaths, dynamicPaths, _ := splitRuntimeDescriptorPaths(runtimePaths)

	kind, _ := args["kind"].(string)
	if kind == "" {
		kind = "all"
	}

	if kind != "all" && kind != "reflection" && kind != "dynamic" {
		return nil, mcpInvalidArgError("kind must be one of: all, reflection, dynamic")
	}

	offset, err := mcpIntArg(args, "offset", 0)
	if err != nil {
		return nil, err
	}

	limit, err := mcpIntArg(args, "limit", 0)
	if err != nil {
		return nil, err
	}

	filtered := runtimePaths

	switch kind {
	case "reflection":
		filtered = reflectionPaths
	case "dynamic":
		filtered = dynamicPaths
	}

	total := len(filtered)
	filtered = paginateStringSlice(filtered, offset, limit)

	return map[string]any{
		"kind":   kind,
		"paths":  filtered,
		"total":  total,
		"offset": offset,
		"limit":  limit,
		"groups": map[string]any{
			"reflection": map[string]any{"count": len(reflectionPaths)},
			"dynamic":    map[string]any{"count": len(dynamicPaths)},
		},
		"reflectionSources": reflectionPrefixes,
	}, nil
}

func runtimeDescriptorStats(h *RestServer) ([]string, []string, int) {
	runtimePaths := h.restDescriptors.Paths()
	reflectionPaths, _, prefixes := splitRuntimeDescriptorPaths(runtimePaths)

	return runtimePaths, prefixes, len(reflectionPaths)
}

func splitRuntimeDescriptorPaths(runtimePaths []string) ([]string, []string, []string) {
	reflectionPrefixes := make(map[string]struct{})
	reflectionPaths := make([]string, 0, len(runtimePaths))
	dynamicPaths := make([]string, 0, len(runtimePaths))

	for _, path := range runtimePaths {
		if !strings.HasPrefix(path, "grpc_reflect_") {
			dynamicPaths = append(dynamicPaths, path)

			continue
		}

		reflectionPaths = append(reflectionPaths, path)

		prefix := path
		if idx := strings.Index(prefix, "/"); idx > 0 {
			prefix = prefix[:idx]
		}

		reflectionPrefixes[prefix] = struct{}{}
	}

	prefixes := make([]string, 0, len(reflectionPrefixes))
	for prefix := range reflectionPrefixes {
		prefixes = append(prefixes, prefix)
	}

	sort.Strings(prefixes)

	return reflectionPaths, dynamicPaths, prefixes
}

func paginateStringSlice(items []string, offset int, limit int) []string {
	if offset >= len(items) {
		return []string{}
	}

	items = items[offset:]

	if limit > 0 && len(items) > limit {
		items = items[:limit]
	}

	return items
}

func mcpSessionRequest(args map[string]any) *http.Request {
	req := &http.Request{Header: make(http.Header)}
	if sessionID, _ := args["session"].(string); sessionID != "" {
		req.Header.Set(muxmiddleware.HeaderName, sessionID)
	}

	return req
}

func mcpDescriptorsAdd(h *RestServer, args map[string]any) (map[string]any, error) {
	descriptorSetBase64, _ := args["descriptorSetBase64"].(string)
	if descriptorSetBase64 == "" {
		return nil, mcpRequiredArgError("descriptorSetBase64")
	}

	payload, err := base64.StdEncoding.DecodeString(descriptorSetBase64)
	if err != nil {
		return nil, mcpDescriptorSetBase64ArgError(err)
	}

	serviceIDs, err := registerDescriptorBytes(context.Background(), h, payload, "", descriptorSourceMCP)
	if err != nil {
		return nil, mcpDescriptorRegistrationArgError(err)
	}

	return map[string]any{"serviceIDs": serviceIDs}, nil
}

func mcpDescriptorsList(h *RestServer, _ map[string]any) (map[string]any, error) {
	return map[string]any{"serviceIDs": h.restDescriptors.ServiceIDs()}, nil
}

func mcpServicesList(h *RestServer, _ map[string]any) (map[string]any, error) {
	return map[string]any{"services": h.collectAllServices()}, nil
}

func mcpServicesDelete(h *RestServer, args map[string]any) (map[string]any, error) {
	serviceID, _ := args["serviceID"].(string)
	if serviceID == "" {
		return nil, mcpRequiredArgError("serviceID")
	}

	removed := unregisterService(h, serviceID)

	return map[string]any{"removed": removed > 0, "serviceID": serviceID}, nil
}

func mcpServicesGet(h *RestServer, args map[string]any) (map[string]any, error) {
	serviceID, _ := args["serviceID"].(string)
	if serviceID == "" {
		return nil, mcpRequiredArgError("serviceID")
	}

	service, ok := h.findServiceDetailed(serviceID)
	if !ok {
		return nil, mcpInvalidArgError(errServiceNotFound.Error() + ": " + serviceID)
	}

	return map[string]any{"service": service}, nil
}

func mcpServicesMethods(h *RestServer, args map[string]any) (map[string]any, error) {
	serviceID, _ := args["serviceID"].(string)
	if serviceID == "" {
		return nil, mcpRequiredArgError("serviceID")
	}

	serviceDescriptor, ok := h.findServiceDescriptor(serviceID)
	if !ok {
		return nil, mcpInvalidArgError(errServiceNotFound.Error() + ": " + serviceID)
	}

	return map[string]any{"methods": h.serviceFromDescriptor(serviceDescriptor, false).Methods}, nil
}

func mcpServicesMethod(h *RestServer, args map[string]any) (map[string]any, error) {
	serviceID, _ := args["serviceID"].(string)
	if serviceID == "" {
		return nil, mcpRequiredArgError("serviceID")
	}

	methodID, _ := args["methodID"].(string)
	if methodID == "" {
		return nil, mcpRequiredArgError("methodID")
	}

	service, ok := h.findServiceDetailed(serviceID)
	if !ok {
		return nil, mcpInvalidArgError(errServiceNotFound.Error() + ": " + serviceID)
	}

	for _, method := range service.Methods {
		if method.Id == methodID || method.Name == methodID {
			return map[string]any{"method": method}, nil
		}
	}

	return nil, mcpInvalidArgError(errMethodNotFound.Error() + " " + methodID + " in service " + serviceID)
}

func mcpHistoryList(h *RestServer, args map[string]any) (map[string]any, error) {
	service, _ := args["service"].(string)
	method, _ := args["method"].(string)
	session, _ := args["session"].(string)

	limit, err := mcpIntArg(args, "limit", 0)
	if err != nil {
		return nil, err
	}

	records := filterHistory(h, history.FilterOpts{
		Service: service,
		Method:  method,
		Session: session,
	}, limit)

	return map[string]any{"records": records}, nil
}

func mcpHistoryErrors(h *RestServer, args map[string]any) (map[string]any, error) {
	session, _ := args["session"].(string)

	limit, err := mcpIntArg(args, "limit", 0)
	if err != nil {
		return nil, err
	}

	errorsOnly := extractErrorRecords(filterHistory(h, history.FilterOpts{Session: session}, 0))
	if limit > 0 && len(errorsOnly) > limit {
		errorsOnly = errorsOnly[len(errorsOnly)-limit:]
	}

	return map[string]any{"records": errorsOnly}, nil
}

func mcpVerifyCalls(h *RestServer, args map[string]any) (map[string]any, error) {
	service, _ := args["service"].(string)
	if service == "" {
		return nil, mcpRequiredArgError("service")
	}

	method, _ := args["method"].(string)
	if method == "" {
		return nil, mcpRequiredArgError("method")
	}

	expectedCount, err := mcpIntArg(args, "expectedCount", -1)
	if err != nil {
		return nil, err
	}

	if expectedCount < 0 {
		return nil, mcpRequiredArgError("expectedCount")
	}

	if h.history == nil {
		return map[string]any{"verified": false, "message": "history is disabled", "expected": expectedCount, "actual": 0}, nil
	}

	session, _ := args["session"].(string)
	calls := h.history.Filter(history.FilterOpts{Service: service, Method: method, Session: session})
	actual := len(calls)

	if actual != expectedCount {
		return map[string]any{
			"verified": false,
			"message":  fmt.Sprintf("expected %s/%s to be called %d times, got %d", service, method, expectedCount, actual),
			"expected": expectedCount,
			"actual":   actual,
		}, nil
	}

	return map[string]any{"verified": true, "message": "ok", "expected": expectedCount, "actual": actual}, nil
}

func mcpDebugCall(h *RestServer, args map[string]any) (map[string]any, error) {
	service, _ := args["service"].(string)
	if service == "" {
		return nil, mcpRequiredArgError("service")
	}

	method, _ := args["method"].(string)
	session, _ := args["session"].(string)

	limit, err := mcpIntArg(args, "limit", debugCallDefaultLimit)
	if err != nil {
		return nil, err
	}

	stubsLimit, err := mcpIntArg(args, "stubsLimit", debugCallDefaultLimit)
	if err != nil {
		return nil, err
	}

	return debugCall(h, service, method, session, limit, stubsLimit), nil
}

func mcpStubsUpsert(h *RestServer, args map[string]any) (map[string]any, error) {
	rawStubs, ok := args["stubs"]
	if !ok || rawStubs == nil {
		return nil, mcpRequiredArgError("stubs")
	}

	stubs, err := decodeMCPStubsArg(rawStubs)
	if err != nil {
		return nil, err
	}

	sessionID, _ := args["session"].(string)
	if sessionID != "" {
		ownerID, _ := args["_owner"].(string)
		sessioninfra.TouchWithOwner(sessionID, ownerID)
	}

	for _, stub := range stubs {
		stub.Session = sessionID
		stub.Source = stuber.SourceMCP

		if err = h.validateStub(stub); err != nil {
			return nil, mcpInvalidArgErrorWithCause(err.Error(), err)
		}
	}

	ids := h.budgerigar.PutMany(stubs...)

	return map[string]any{"ids": uuidListToStringSlice(ids)}, nil
}

func mcpStubsList(h *RestServer, args map[string]any) (map[string]any, error) {
	stubs, err := listMCPStubs(h.budgerigar.All(), args)
	if err != nil {
		return nil, err
	}

	return map[string]any{"stubs": stubs}, nil
}

func mcpStubsUsed(h *RestServer, args map[string]any) (map[string]any, error) {
	stubs, err := listMCPStubs(h.budgerigar.Used(), args)
	if err != nil {
		return nil, err
	}

	return map[string]any{"stubs": stubs}, nil
}

func mcpStubsUnused(h *RestServer, args map[string]any) (map[string]any, error) {
	stubs, err := listMCPStubs(h.budgerigar.Unused(), args)
	if err != nil {
		return nil, err
	}

	return map[string]any{"stubs": stubs}, nil
}

func mcpStubsGet(h *RestServer, args map[string]any) (map[string]any, error) {
	id, err := mcpUUIDArg(args, "id")
	if err != nil {
		return nil, err
	}

	found := h.budgerigar.FindByID(id)

	if found == nil {
		return map[string]any{"found": false, "id": id.String()}, nil
	}

	return map[string]any{"found": true, "stub": found}, nil
}

func mcpStubsDelete(h *RestServer, args map[string]any) (map[string]any, error) {
	id, err := mcpUUIDArg(args, "id")
	if err != nil {
		return nil, err
	}

	deleted := h.budgerigar.DeleteByID(id) > 0

	return map[string]any{"deleted": deleted, "id": id.String()}, nil
}

func mcpStubsBatchDelete(h *RestServer, args map[string]any) (map[string]any, error) {
	idStrings, err := mcpStringSliceArg(args, "ids")
	if err != nil {
		return nil, err
	}

	ids := make([]uuid.UUID, 0, len(idStrings))
	deletedIDs := make([]string, 0, len(idStrings))
	notFoundIDs := make([]string, 0)

	for _, idString := range idStrings {
		id, parseErr := uuid.Parse(idString)
		if parseErr != nil {
			return nil, mcpUUIDArgError("ids", idString, parseErr)
		}

		ids = append(ids, id)

		if h.budgerigar.FindByID(id) == nil {
			notFoundIDs = append(notFoundIDs, idString)
		} else {
			deletedIDs = append(deletedIDs, idString)
		}
	}

	if len(ids) > 0 {
		h.budgerigar.DeleteByID(ids...)
	}

	return map[string]any{
		"deletedIds":  deletedIDs,
		"notFoundIds": notFoundIDs,
	}, nil
}

func mcpStubsPurge(h *RestServer, args map[string]any) (map[string]any, error) {
	sessionID, _ := args["session"].(string)
	if sessionID != "" {
		ownerID, _ := args["_owner"].(string)
		if !sessioninfra.CanDelete(sessionID, ownerID) {
			return nil, mcpInvalidArgError(errSessionForbiddenDelete.Error())
		}

		deletedCount := h.budgerigar.DeleteSession(sessionID)
		deletedHistoryCount := 0
		if cleaner, ok := h.history.(history.SessionCleaner); ok {
			deletedHistoryCount = cleaner.DeleteSession(sessionID)
		}
		deletedSessionRows := 0
		if h.sessionsRepo != nil {
			parsedSessionID, parseErr := strconv.ParseInt(strings.TrimSpace(sessionID), 10, 64)
			if parseErr != nil {
				return nil, mcpInvalidArgError("session must be numeric id")
			}
			rows, deleteErr := h.sessionsRepo.DeleteByID(context.Background(), parsedSessionID)
			if deleteErr != nil {
				return nil, errors.Wrap(deleteErr, "failed to delete session metadata")
			}
			deletedSessionRows = rows
		}
		deletedClientRows := 0
		if h.clientsRepo != nil {
			rows, deleteErr := h.clientsRepo.DeleteBySession(context.Background(), sessionID)
			if deleteErr != nil {
				return nil, errors.Wrap(deleteErr, "failed to delete clients metadata")
			}
			deletedClientRows = rows
		}
		sessioninfra.Forget(sessionID)

		return map[string]any{
			"deletedCount":        deletedCount,
			"deletedHistoryCount": deletedHistoryCount,
			"deletedSessionRows":  deletedSessionRows,
			"deletedClientRows":   deletedClientRows,
			"session":             sessionID,
		}, nil
	}

	deletedCount := len(h.budgerigar.All())
	h.budgerigar.Clear()

	return map[string]any{"deletedCount": deletedCount}, nil
}

func mcpStubsSearch(h *RestServer, args map[string]any) (map[string]any, error) {
	service, _ := args["service"].(string)
	if service == "" {
		return nil, mcpRequiredArgError("service")
	}

	method, _ := args["method"].(string)
	if method == "" {
		return nil, mcpRequiredArgError("method")
	}

	input, err := mcpSearchInput(args)
	if err != nil {
		return nil, err
	}

	headers, err := mcpHeadersArg(args)
	if err != nil {
		return nil, err
	}

	sessionID, _ := args["session"].(string)

	result, searchErr := h.budgerigar.FindByQuery(stuber.Query{
		Service: service,
		Method:  method,
		Session: sessionID,
		Headers: headers,
		Input:   input,
	})
	if searchErr != nil {
		return mcpSearchNotMatchedResponse(searchErr), nil
	}

	found := result.Found()
	if found == nil {
		response := map[string]any{"matched": false}

		if similar := result.Similar(); similar != nil {
			response["similarStubId"] = similar.ID.String()
		}

		return response, nil
	}

	return map[string]any{
		"matched": true,
		"stubId":  found.ID.String(),
		"output":  found.Output,
	}, nil
}

func mcpStubsInspect(h *RestServer, args map[string]any) (map[string]any, error) {
	query, err := mcpInspectQuery(args)
	if err != nil {
		return nil, err
	}

	report := h.budgerigar.InspectQuery(query)

	return map[string]any{"report": toRestInspectReport(report)}, nil
}

func mcpInspectQuery(args map[string]any) (stuber.Query, error) {
	service, _ := args["service"].(string)
	if service == "" {
		return stuber.Query{}, mcpRequiredArgError("service")
	}

	method, _ := args["method"].(string)
	if method == "" {
		return stuber.Query{}, mcpRequiredArgError("method")
	}

	query := stuber.Query{Service: service, Method: method}

	err := mcpInspectQueryOptions(args, &query)
	if err != nil {
		return stuber.Query{}, err
	}

	return query, nil
}

func mcpInspectQueryOptions(args map[string]any, query *stuber.Query) error {
	if query == nil {
		return nil
	}

	if idValue, ok := args["id"]; ok && idValue != nil {
		id, err := mcpUUIDArg(args, "id")
		if err != nil {
			return err
		}

		query.ID = &id
	}

	if sessionID, _ := args["session"].(string); sessionID != "" {
		query.Session = sessionID
	}

	headers, err := mcpHeadersArg(args)
	if err != nil {
		return err
	}

	query.Headers = headers

	if rawInput, ok := args["input"]; ok && rawInput != nil {
		input, err := parseMCPInputArg(rawInput)
		if err != nil {
			return err
		}

		query.Input = input
	}

	return nil
}

func decodeMCPStubsArg(raw any) ([]*stuber.Stub, error) {
	payload, err := json.Marshal(raw)
	if err != nil {
		return nil, mcpStubPayloadArgError(err)
	}

	var items []*stuber.Stub
	if err = jsondecoder.UnmarshalSlice(payload, &items); err != nil {
		return nil, mcpStubPayloadArgError(err)
	}

	if len(items) == 0 {
		return nil, mcpInvalidArgError("stubs cannot be empty")
	}

	return items, nil
}

func listMCPStubs(stubs []*stuber.Stub, args map[string]any) ([]*stuber.Stub, error) {
	name, _ := args["name"].(string)
	service, _ := args["service"].(string)
	method, _ := args["method"].(string)
	sessionID, _ := args["session"].(string)

	limit, err := mcpIntArg(args, "limit", 0)
	if err != nil {
		return nil, err
	}

	offset, err := mcpIntArg(args, "offset", 0)
	if err != nil {
		return nil, err
	}

	filtered := filterMCPStubs(stubs, name, service, method, sessionID)

	if offset >= len(filtered) {
		return []*stuber.Stub{}, nil
	}

	filtered = filtered[offset:]

	if limit > 0 && len(filtered) > limit {
		filtered = filtered[:limit]
	}

	return filtered, nil
}

func mcpUUIDArg(args map[string]any, key string) (uuid.UUID, error) {
	value, _ := args[key].(string)
	if value == "" {
		return uuid.Nil, mcpRequiredArgError(key)
	}

	id, err := uuid.Parse(value)
	if err != nil {
		return uuid.Nil, mcpUUIDArgError(key, value, err)
	}

	return id, nil
}

func mcpStringSliceArg(args map[string]any, key string) ([]string, error) {
	raw, ok := args[key]
	if !ok || raw == nil {
		return nil, mcpRequiredArgError(key)
	}

	switch values := raw.(type) {
	case []string:
		return validateMCPStringSlice(values, key)
	case []any:
		return convertMCPAnyStringSlice(values, key)
	default:
		return nil, mcpStringListArgError(key)
	}
}

func mcpSearchInput(args map[string]any) ([]map[string]any, error) {
	if rawInput, ok := args["input"]; ok && rawInput != nil {
		return parseMCPInputArg(rawInput)
	}

	payload, ok := args["payload"].(map[string]any)
	if !ok || payload == nil {
		return nil, mcpRequiredArgError("payload")
	}

	return []map[string]any{payload}, nil
}

func mcpHeadersArg(args map[string]any) (map[string]any, error) {
	rawHeaders, ok := args["headers"]
	if !ok || rawHeaders == nil {
		return map[string]any{}, nil
	}

	headers, ok := rawHeaders.(map[string]any)
	if !ok {
		return nil, mcpInvalidArgError("headers must be an object")
	}

	return headers, nil
}

func mcpSearchNotMatchedResponse(searchErr error) map[string]any {
	return map[string]any{"matched": false, "error": searchErr.Error()}
}

func filterMCPStubs(stubs []*stuber.Stub, name, service, method, sessionID string) []*stuber.Stub {
	filtered := make([]*stuber.Stub, 0, len(stubs))

	for _, stub := range stubs {
		if !mcpStubMatchesFilters(stub, name, service, method, sessionID) {
			continue
		}

		filtered = append(filtered, stub)
	}

	return filtered
}

func mcpStubMatchesFilters(stub *stuber.Stub, name, service, method, sessionID string) bool {
	if name != "" && stub.Name != name {
		return false
	}

	if service != "" && stub.Service != service {
		return false
	}

	if method != "" && stub.Method != method {
		return false
	}

	return stubVisibleForSession(stub.Session, sessionID)
}

func validateMCPStringSlice(values []string, key string) ([]string, error) {
	if len(values) == 0 {
		return nil, mcpInvalidArgError(key + " cannot be empty")
	}

	if slices.Contains(values, "") {
		return nil, mcpStringListArgError(key)
	}

	return values, nil
}

func convertMCPAnyStringSlice(values []any, key string) ([]string, error) {
	if len(values) == 0 {
		return nil, mcpInvalidArgError(key + " cannot be empty")
	}

	out := make([]string, 0, len(values))
	for _, item := range values {
		value, ok := item.(string)
		if !ok || value == "" {
			return nil, mcpStringListArgError(key)
		}

		out = append(out, value)
	}

	return out, nil
}

func parseMCPInputArg(rawInput any) ([]map[string]any, error) {
	switch input := rawInput.(type) {
	case []map[string]any:
		if len(input) == 0 {
			return nil, mcpInvalidArgError("input cannot be empty")
		}

		return input, nil
	case []any:
		if len(input) == 0 {
			return nil, mcpInvalidArgError("input cannot be empty")
		}

		return convertMCPAnyMapSlice(input)
	default:
		return nil, mcpInvalidArgError("input must be an array")
	}
}

func convertMCPAnyMapSlice(input []any) ([]map[string]any, error) {
	out := make([]map[string]any, 0, len(input))
	for _, item := range input {
		message, ok := item.(map[string]any)
		if !ok {
			return nil, mcpInvalidArgError("input must contain JSON objects")
		}

		out = append(out, message)
	}

	return out, nil
}

func uuidListToStringSlice(ids []uuid.UUID) []string {
	out := make([]string, 0, len(ids))

	for _, id := range ids {
		out = append(out, id.String())
	}

	return out
}

func debugCall(h *RestServer, service, method, session string, historyLimit, stubsLimit int) map[string]any {
	serviceFound, methodFound := lookupServiceAndMethod(h, service, method)
	dynamic := slices.Contains(h.restDescriptors.ServiceIDs(), service)
	stubCount, stubRecords := collectDebugStubs(h, service, method, session, stubsLimit)
	historyRecords := filterHistory(h, history.FilterOpts{Service: service, Method: method, Session: session}, historyLimit)
	errorRecords := extractErrorRecords(historyRecords)
	hints := buildDebugHints(h, serviceFound, methodFound, method, stubCount)

	return map[string]any{
		"service":           service,
		"method":            method,
		"session":           session,
		"serviceRegistered": serviceFound,
		"methodRegistered":  methodFound,
		"dynamicService":    dynamic,
		"stubCount":         stubCount,
		"stubs":             stubRecords,
		"historyCount":      len(historyRecords),
		"errorCount":        len(errorRecords),
		"recentHistory":     historyRecords,
		"recentErrors":      errorRecords,
		"hints":             hints,
	}
}

func lookupServiceAndMethod(h *RestServer, service, method string) (bool, bool) {
	for _, svc := range h.collectAllServices() {
		if svc.Id != service {
			continue
		}

		if method == "" {
			return true, true
		}

		for _, m := range svc.Methods {
			if m.Name == method || m.Id == service+"/"+method {
				return true, true
			}
		}

		return true, false
	}

	return false, false
}

func collectDebugStubs(h *RestServer, service, method, session string, stubsLimit int) (int, []map[string]any) {
	stubRecords := make([]map[string]any, 0)
	stubCount := 0

	for _, stub := range h.budgerigar.All() {
		if stub.Service != service {
			continue
		}

		if !stubVisibleForSession(stub.Session, session) {
			continue
		}

		if method != "" && stub.Method != method {
			continue
		}

		stubCount++

		if stubsLimit > 0 && len(stubRecords) >= stubsLimit {
			continue
		}

		stubRecords = append(stubRecords, map[string]any{
			"id":      stub.ID.String(),
			"service": stub.Service,
			"method":  stub.Method,
			"session": stub.Session,
			"enabled": stub.IsEnabled(),
		})
	}

	return stubCount, stubRecords
}

func stubVisibleForSession(stubSession, querySession string) bool {
	if querySession == "" {
		return stubSession == ""
	}

	return stubSession == "" || stubSession == querySession
}

func extractErrorRecords(records []rest.CallRecord) []rest.CallRecord {
	errorsOnly := make([]rest.CallRecord, 0)

	for _, item := range records {
		if item.Error != nil && *item.Error != "" {
			errorsOnly = append(errorsOnly, item)
		}
	}

	return errorsOnly
}

func buildDebugHints(h *RestServer, serviceFound, methodFound bool, method string, stubCount int) []string {
	hints := make([]string, 0, debugCallHintsCap)

	if !serviceFound {
		hints = append(hints, "Service is not registered. Add descriptors first (MCP descriptors.add).")
	}

	if serviceFound && method != "" && !methodFound {
		hints = append(hints, "Method is not found in service descriptor.")
	}

	if serviceFound && methodFound && stubCount == 0 {
		hints = append(hints, "No stubs found for this service/method. Add one via /api/stubs.")
	}

	if h.history == nil {
		hints = append(hints, "History is disabled; enable HISTORY_ENABLED=true to inspect call traces.")
	}

	return hints
}

func filterHistory(h *RestServer, opts history.FilterOpts, limit int) []rest.CallRecord {
	if h.history == nil {
		return []rest.CallRecord{}
	}

	calls := h.history.Filter(opts)
	if limit > 0 && len(calls) > limit {
		calls = calls[len(calls)-limit:]
	}

	out := make([]rest.CallRecord, len(calls))
	for i, c := range calls {
		out[i] = h.historyCallRecordToRest(c)
	}

	return out
}

func historyFilterFromRequest(r *http.Request) (history.FilterOpts, int) {
	query := r.URL.Query()
	sessionID := strings.TrimSpace(query.Get("session"))
	if sessionID == "" {
		sessionID = strings.TrimSpace(muxmiddleware.FromRequest(r))
	}

	limit := 0
	if rawLimit := strings.TrimSpace(query.Get("limit")); rawLimit != "" {
		if parsedLimit, err := strconv.Atoi(rawLimit); err == nil && parsedLimit > 0 {
			limit = parsedLimit
		}
	}

	return history.FilterOpts{
		Service: strings.TrimSpace(query.Get("service")),
		Method:  strings.TrimSpace(query.Get("method")),
		Session: sessionID,
	}, limit
}

func mcpIntArg(args map[string]any, key string, defaultValue int) (int, error) {
	raw, ok := args[key]
	if !ok || raw == nil {
		return defaultValue, nil
	}

	switch v := raw.(type) {
	case float64:
		if v < 0 || v != float64(int(v)) {
			return 0, mcpNonNegativeIntegerArgError(key)
		}

		return int(v), nil
	case int:
		if v < 0 {
			return 0, mcpNonNegativeIntegerArgError(key)
		}

		return v, nil
	default:
		return 0, mcpNonNegativeIntegerArgError(key)
	}
}

// ListHistory returns recorded gRPC calls.
func (h *RestServer) ListHistory(w http.ResponseWriter, r *http.Request) {
	if h.history == nil {
		h.writeResponse(r.Context(), w, rest.HistoryList{})

		return
	}

	opts, limit := historyFilterFromRequest(r)
	out := filterHistory(h, opts, limit)
	h.writeResponse(r.Context(), w, out)
}

// StreamHistory returns recorded gRPC calls as Server-Sent Events.
func (h *RestServer) StreamHistory(w http.ResponseWriter, r *http.Request, params rest.StreamHistoryParams) {
	if h.history == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		h.writeResponseError(r.Context(), w, errors.New("history is disabled"))
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		w.WriteHeader(http.StatusInternalServerError)
		h.writeResponseError(r.Context(), w, errors.New("streaming is not supported"))
		return
	}

	subscriber, ok := h.history.(history.Subscriber)
	if !ok {
		w.WriteHeader(http.StatusServiceUnavailable)
		h.writeResponseError(r.Context(), w, errors.New("history stream is not supported by store"))
		return
	}

	sessionID := strings.TrimSpace(muxmiddleware.FromRequest(r))
	if params.Session != nil && strings.TrimSpace(*params.Session) != "" {
		sessionID = strings.TrimSpace(*params.Session)
	}

	opts := history.FilterOpts{
		Service: strings.TrimSpace(stringFromPtr(params.Service)),
		Method:  strings.TrimSpace(stringFromPtr(params.Method)),
		Session: sessionID,
	}
	calls, unsubscribe := subscriber.Subscribe(128)
	defer unsubscribe()

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	heartbeat := time.NewTicker(historyStreamTick)
	defer heartbeat.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-heartbeat.C:
			if _, err := io.WriteString(w, ": ping\n\n"); err != nil {
				return
			}
			flusher.Flush()
		case call, ok := <-calls:
			if !ok {
				return
			}
			if !historyCallMatchesFilter(call, opts) {
				continue
			}

			record := h.historyCallRecordToRest(call)
			payload, err := json.Marshal(record)
			if err != nil {
				continue
			}

			if _, err := io.WriteString(w, "event: call\n"); err != nil {
				return
			}
			if _, err := io.WriteString(w, "data: "); err != nil {
				return
			}
			if _, err := w.Write(payload); err != nil {
				return
			}
			if _, err := io.WriteString(w, "\n\n"); err != nil {
				return
			}

			flusher.Flush()
		}
	}
}

func historyCallMatchesFilter(call history.CallRecord, opts history.FilterOpts) bool {
	if opts.Service != "" && call.Service != opts.Service {
		return false
	}
	if opts.Method != "" && call.Method != opts.Method {
		return false
	}
	if opts.Session != "" && call.Session != "" && call.Session != opts.Session {
		return false
	}

	return true
}

func (h *RestServer) historyCallRecordToRest(c history.CallRecord) rest.CallRecord {
	service := c.Service
	method := c.Method

	r := rest.CallRecord{
		Service: &service,
		Method:  &method,
	}

	if c.CallID != "" {
		callID := c.CallID
		r.CallId = &callID
	}

	if c.Transport != "" {
		transport := c.Transport
		r.Transport = &transport
	}
	if c.Client != "" {
		client := c.Client
		r.Client = &client
	}

	if c.StubID != uuid.Nil {
		r.StubId = h.publicIDPtr(c.StubID)
	}

	if len(c.Requests) > 0 {
		r.Requests = &c.Requests
		r.Request = &c.Requests[0]
	} else if c.Request != nil {
		r.Request = &c.Request
	}

	if len(c.Responses) > 0 {
		r.Responses = &c.Responses
		r.Response = &c.Responses[0]
	} else if c.Response != nil {
		r.Response = &c.Response
	}
	if len(c.ResponseTimestamps) > 0 {
		responseTimestamps := append([]time.Time(nil), c.ResponseTimestamps...)
		r.ResponseTimestamps = &responseTimestamps
	}

	if c.Error != "" {
		r.Error = &c.Error
	}

	code := int(c.Code)
	r.Code = &code

	if !c.Timestamp.IsZero() {
		r.Timestamp = &c.Timestamp
	}

	if c.Session != "" {
		session := c.Session
		r.Session = &session
	}

	return r
}

// VerifyCalls verifies that a method was called the expected number of times.
func (h *RestServer) VerifyCalls(w http.ResponseWriter, r *http.Request) {
	if h.history == nil {
		w.WriteHeader(http.StatusBadRequest)
		message := "history is disabled"
		h.writeResponse(r.Context(), w, rest.VerifyError{Message: &message})

		return
	}

	var req rest.VerifyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		h.writeResponseError(r.Context(), w, errors.Wrap(err, "invalid verify request"))

		return
	}

	calls := h.history.Filter(history.FilterOpts{
		Service: req.Service,
		Method:  req.Method,
		Session: muxmiddleware.FromRequest(r),
	})

	actual := len(calls)
	if actual != req.ExpectedCount {
		w.WriteHeader(http.StatusBadRequest)
		message := fmt.Sprintf("expected %s/%s to be called %d times, got %d", req.Service, req.Method, req.ExpectedCount, actual)
		h.writeResponse(r.Context(), w, rest.VerifyError{
			Message:  &message,
			Expected: &req.ExpectedCount,
			Actual:   &actual,
		})

		return
	}

	h.writeResponse(r.Context(), w, rest.MessageOK{Message: "ok", Time: time.Now()})
}

// AddStub inserts new stubs.
func (h *RestServer) AddStub(w http.ResponseWriter, r *http.Request) {
	byt, err := httputil.RequestBody(r)
	if err != nil {
		h.responseError(r.Context(), w, err)

		return
	}

	var payload []rest.Stub

	if err := jsondecoder.UnmarshalSlice(byt, &payload); err != nil {
		h.responseError(r.Context(), w, err)

		return
	}

	inputs := make([]*stuber.Stub, 0, len(payload))
	sess := strings.TrimSpace(muxmiddleware.FromRequest(r))
	if sess == "" {
		sess = strings.TrimSpace(r.URL.Query().Get("session"))
	}
	for _, item := range payload {
		stub, convertErr := h.toDomainStub(item)
		if convertErr != nil {
			h.validationError(r.Context(), w, convertErr)

			return
		}

		stub.Session = sess
		stub.Source = stuber.SourceRest

		if err := h.validateStub(stub); err != nil {
			h.validationError(r.Context(), w, err)

			return
		}

		inputs = append(inputs, stub)
	}

	ids := h.budgerigar.PutMany(inputs...)
	publicIDs := make([]rest.ID, len(ids))
	for i, privateID := range ids {
		publicIDs[i] = h.ensurePublicID(privateID)
	}

	h.writeResponse(r.Context(), w, publicIDs)
}

// ListDescriptors returns service IDs of descriptors added via POST /descriptors.
func (h *RestServer) ListDescriptors(w http.ResponseWriter, r *http.Request) {
	h.writeResponse(r.Context(), w, rest.DescriptorServiceIDs{ServiceIDs: h.restDescriptors.ServiceIDs()})
}

// AddDescriptors accepts binary FileDescriptorSet and registers it for discovery.
// Returns service IDs; use DELETE /services/{serviceID} to remove.
func (h *RestServer) AddDescriptors(w http.ResponseWriter, r *http.Request) {
	byt, err := httputil.RequestBody(r)
	if err != nil {
		h.responseError(r.Context(), w, err)

		return
	}

	if len(byt) == 0 {
		w.WriteHeader(http.StatusBadRequest)
		h.writeResponseError(r.Context(), w, ErrEmptyBody)

		return
	}

	serviceIDs, err := registerDescriptorBytes(
		r.Context(),
		h,
		byt,
		r.Header.Get(descriptorUploadFilenameHeader),
		descriptorSourceREST,
	)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		h.writeResponseError(r.Context(), w, err)

		return
	}

	h.writeResponse(r.Context(), w, rest.AddDescriptorsResponse{
		Message:    "ok",
		Time:       time.Now(),
		ServiceIDs: serviceIDs,
	})
}

// DeleteService removes a service added via POST /descriptors.
// Services from startup (proto path) cannot be removed and return 404.
func (h *RestServer) DeleteService(w http.ResponseWriter, _ *http.Request, serviceID string) {
	if unregisterService(h, serviceID) == 0 {
		w.WriteHeader(http.StatusNotFound)
		h.writeResponseError(context.Background(), w, serviceNotRemovable(serviceID))

		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func unregisterService(h *RestServer, serviceID string) int {
	h.descriptorOpsMu.Lock()
	defer h.descriptorOpsMu.Unlock()

	return h.restDescriptors.UnregisterByService(serviceID)
}

func registerDescriptorBytes(
	ctx context.Context,
	h *RestServer,
	byt []byte,
	sourceName string,
	source string,
) ([]string, error) {
	h.descriptorOpsMu.Lock()
	defer h.descriptorOpsMu.Unlock()

	fds, err := decodeDescriptorSet(byt, sourceName)
	if err != nil {
		return nil, err
	}

	files, err := decodeDescriptorFiles(fds)
	if err != nil {
		return nil, err
	}

	if h.protoMetadata != nil {
		if err := h.protoMetadata.ReplaceDescriptorFiles(ctx, source, files); err != nil {
			return nil, errors.Wrap(err, "failed to persist descriptor metadata")
		}
	}

	serviceIDs := make([]string, 0)

	for _, fd := range files {
		h.restDescriptors.Register(fd)

		services := fd.Services()
		for i := range services.Len() {
			serviceIDs = append(serviceIDs, string(services.Get(i).FullName()))
		}
	}

	sort.Strings(serviceIDs)

	return serviceIDs, nil
}

func decodeDescriptorSet(byt []byte, sourceName string) (*descriptorpb.FileDescriptorSet, error) {
	fds := new(descriptorpb.FileDescriptorSet)
	if err := proto.Unmarshal(byt, fds); err == nil {
		if len(fds.GetFile()) == 0 {
			return nil, ErrFileDescriptorSetNoFiles
		}

		return fds, nil
	}

	compiled, err := compileProtoSourceDescriptorSet(byt, sourceName)
	if err != nil {
		return nil, invalidFileDescriptorSetError(err)
	}

	if len(compiled.GetFile()) == 0 {
		return nil, ErrFileDescriptorSetNoFiles
	}

	return compiled, nil
}

func compileProtoSourceDescriptorSet(byt []byte, sourceName string) (*descriptorpb.FileDescriptorSet, error) {
	fileName := normalizeProtoUploadFileName(sourceName)
	fallbackResolver, err := pbs.NewResolver()
	if err != nil {
		return nil, errors.Wrap(err, "failed to create fallback proto resolver")
	}

	sourceResolver := &protocompile.SourceResolver{
		Accessor: func(path string) (io.ReadCloser, error) {
			if path != fileName {
				return nil, protoregistry.NotFound
			}

			return io.NopCloser(bytes.NewReader(byt)), nil
		},
	}

	compiler := protocompile.Compiler{
		Resolver: protocompile.CompositeResolver{
			sourceResolver,
			fallbackResolver,
		},
	}

	compiled, err := compiler.Compile(context.Background(), fileName)
	if err != nil {
		return nil, errors.Wrap(err, "failed to compile proto source")
	}

	files := make([]*descriptorpb.FileDescriptorProto, 0, len(compiled))
	for _, file := range compiled {
		files = append(files, protodesc.ToFileDescriptorProto(file))
	}

	return &descriptorpb.FileDescriptorSet{File: files}, nil
}

func normalizeProtoUploadFileName(sourceName string) string {
	name := strings.TrimSpace(sourceName)
	if name == "" {
		return "upload.proto"
	}

	base := filepath.Base(name)
	if base == "." || base == string(filepath.Separator) || base == "" {
		return "upload.proto"
	}

	return filepath.ToSlash(base)
}

func decodeDescriptorFiles(fds *descriptorpb.FileDescriptorSet) ([]protoreflect.FileDescriptor, error) {
	registry := new(protoregistry.Files)
	pending := make([]*descriptorpb.FileDescriptorProto, 0, len(fds.GetFile()))

	for _, fd := range fds.GetFile() {
		if fd != nil {
			pending = append(pending, fd)
		}
	}

	for len(pending) > 0 {
		progress := false
		nextPending := make([]*descriptorpb.FileDescriptorProto, 0, len(pending))

		resolver := &protosetinfra.Fallback{Primary: registry, Fallback: protoregistry.GlobalFiles}

		for _, fd := range pending {
			fileDesc, err := protodesc.NewFile(fd, resolver)
			if err != nil {
				nextPending = append(nextPending, fd)

				continue
			}

			if err := registry.RegisterFile(fileDesc); err != nil {
				return nil, registerDescriptorFileError(fd.GetName(), err)
			}

			progress = true
		}

		if !progress {
			return nil, ErrResolveDescriptorDeps
		}

		pending = nextPending
	}

	files := make([]protoreflect.FileDescriptor, 0, len(fds.GetFile()))

	registry.RangeFiles(func(fd protoreflect.FileDescriptor) bool {
		files = append(files, fd)

		return true
	})

	return files, nil
}

// DeleteStubByID removes a stub by ID.
func (h *RestServer) DeleteStubByID(w http.ResponseWriter, _ *http.Request, id rest.ID) {
	privateID, ok := h.resolvePrivateID(id)
	if ok {
		h.budgerigar.DeleteByID(privateID)
	}

	w.WriteHeader(http.StatusNoContent)
}

// BatchStubsDelete removes multiple stubs by ID.
func (h *RestServer) BatchStubsDelete(w http.ResponseWriter, r *http.Request) {
	byt, err := httputil.RequestBody(r)
	if err != nil {
		h.responseError(r.Context(), w, err)

		return
	}

	var inputs []rest.ID

	if err := jsondecoder.UnmarshalSlice(byt, &inputs); err != nil {
		h.responseError(r.Context(), w, err)

		return
	}

	if len(inputs) > 0 {
		ids := make([]uuid.UUID, 0, len(inputs))
		for _, id := range inputs {
			privateID, ok := h.resolvePrivateID(id)
			if !ok {
				continue
			}

			ids = append(ids, privateID)
		}

		if len(ids) > 0 {
			h.budgerigar.DeleteByID(ids...)
		}
	}
}

// ListUsedStubs returns stubs that have been matched.
func (h *RestServer) ListUsedStubs(w http.ResponseWriter, r *http.Request) {
	sessionID := strings.TrimSpace(muxmiddleware.FromRequest(r))
	visible := make([]*stuber.Stub, 0)
	for _, stub := range h.budgerigar.Used() {
		if stubVisibleForSession(stub.Session, sessionID) {
			visible = append(visible, stub)
		}
	}

	h.writeResponse(r.Context(), w, h.toRestStubs(visible))
}

// ListUnusedStubs returns stubs that have never been matched.
func (h *RestServer) ListUnusedStubs(w http.ResponseWriter, r *http.Request) {
	sessionID := strings.TrimSpace(muxmiddleware.FromRequest(r))
	visible := make([]*stuber.Stub, 0)
	for _, stub := range h.budgerigar.Unused() {
		if stubVisibleForSession(stub.Session, sessionID) {
			visible = append(visible, stub)
		}
	}

	h.writeResponse(r.Context(), w, h.toRestStubs(visible))
}

// ListStubs returns all stubs, optionally filtered by source.
func (h *RestServer) ListStubs(w http.ResponseWriter, r *http.Request, params rest.ListStubsParams) {
	options := listOptionsFromParams(params)
	if !options.SessionSet {
		if sessionID := strings.TrimSpace(muxmiddleware.FromRequest(r)); sessionID != "" {
			options.Session = sessionID
			options.SessionSet = true
		}
	}

	stubs, total := h.budgerigar.List(options)
	w.Header().Set("X-Total-Count", strconv.Itoa(total))

	h.writeResponse(r.Context(), w, h.toRestStubs(stubs))
}

func listOptionsFromParams(params rest.ListStubsParams) stuber.ListOptions {
	options := stuber.ListOptions{
		Source:  stringFromPtr(params.Source),
		Name:    stringFromPtr(params.Name),
		Service: stringFromPtr(params.Service),
		Method:  stringFromPtr(params.Method),
		Sort:    stringFromPtr(params.Sort),
		Limit:   intFromPtr(params.Limit),
		Offset:  intFromPtr(params.Offset),
	}

	if params.Session != nil {
		options.Session = *params.Session
		options.SessionSet = true
	}

	return options
}

// PurgeStubs removes all stubs.
func (h *RestServer) PurgeStubs(w http.ResponseWriter, _ *http.Request) {
	h.budgerigar.Clear()

	w.WriteHeader(http.StatusNoContent)
}

// SearchStubs finds a stub matching the query.
func (h *RestServer) SearchStubs(w http.ResponseWriter, r *http.Request) {
	byt, err := httputil.RequestBody(r)
	if err != nil {
		h.responseError(r.Context(), w, err)

		return
	}

	var request map[string]any
	if err := json.Unmarshal(byt, &request); err == nil {
		if rawID, exists := request["id"]; exists {
			switch value := rawID.(type) {
			case float64:
				publicID := rest.ID(uint64(value))
				privateID, ok := h.resolvePrivateID(publicID)
				if !ok {
					w.WriteHeader(http.StatusNotFound)
					h.writeResponseError(r.Context(), w, fmt.Errorf("stub with id %d not found", publicID))

					return
				}

				request["id"] = privateID.String()
			}
		}

		if patched, marshalErr := json.Marshal(request); marshalErr == nil {
			r.Body = io.NopCloser(bytes.NewReader(patched))
		}
	}

	query, err := stuber.NewQuery(r)
	if err != nil {
		h.responseError(r.Context(), w, err)

		return
	}

	if sess := muxmiddleware.FromRequest(r); sess != "" {
		query.Session = sess
	}

	result, err := h.budgerigar.FindByQuery(query)
	if err != nil {
		w.WriteHeader(http.StatusNotFound)
		h.writeResponseError(r.Context(), w, err)

		return
	}

	if result.Found() == nil {
		w.WriteHeader(http.StatusNotFound)
		h.writeResponseError(r.Context(), w, stubNotFoundError(query, result))

		return
	}

	h.writeResponse(r.Context(), w, result.Found().Output)
}

// InspectStubs returns detailed matching report for a query.
func (h *RestServer) InspectStubs(w http.ResponseWriter, r *http.Request) {
	var req rest.InspectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.responseError(r.Context(), w, err)

		return
	}

	query := stuber.Query{
		Service: req.Service,
		Method:  req.Method,
		Input:   req.Input,
		Headers: req.Headers,
	}

	if req.Id != nil {
		privateID, ok := h.resolvePrivateID(*req.Id)
		if !ok {
			w.WriteHeader(http.StatusNotFound)
			h.writeResponseError(r.Context(), w, fmt.Errorf("stub with id %d not found", *req.Id))

			return
		}

		query.ID = &privateID
	}

	if req.Session != nil {
		query.Session = *req.Session
	}

	report := h.budgerigar.InspectQuery(query)
	h.writeResponse(r.Context(), w, toRestInspectReport(report))
}

func toRestInspectReport(report stuber.InspectReport) rest.InspectReport {
	stages := make([]rest.InspectStage, len(report.Stages))
	for i, stage := range report.Stages {
		stages[i] = rest.InspectStage{
			Name:    stage.Name,
			Before:  stage.Before,
			After:   stage.After,
			Removed: stage.Removed,
		}
	}

	candidates := make([]rest.InspectCandidate, len(report.Candidates))
	for i, candidate := range report.Candidates {
		events := make([]rest.InspectCandidateEvent, len(candidate.Events))
		for j, event := range candidate.Events {
			reason := event.Reason
			events[j] = rest.InspectCandidateEvent{
				Stage:  event.Stage,
				Result: event.Result,
				Reason: nilIfEmpty(reason),
			}
		}

		candidates[i] = rest.InspectCandidate{
			Id:               candidate.ID.String(),
			Name:             nilIfEmpty(candidate.Name),
			Service:          candidate.Service,
			Method:           candidate.Method,
			Session:          candidate.Session,
			Priority:         candidate.Priority,
			Enabled:          boolPtr(candidate.Enabled),
			Times:            candidate.Times,
			Used:             candidate.Used,
			Specificity:      candidate.Specificity,
			Score:            candidate.Score,
			VisibleBySession: candidate.VisibleBySession,
			WithinTimes:      candidate.WithinTimes,
			HeadersMatched:   candidate.HeadersMatched,
			InputMatched:     candidate.InputMatched,
			Matched:          candidate.Matched,
			ExcludedBy:       candidate.ExcludedBy,
			Events:           events,
		}
	}

	return rest.InspectReport{
		Service:          report.Service,
		Method:           report.Method,
		Session:          report.Session,
		MatchedStubId:    stringFromUUIDPtr(report.MatchedStubID),
		SimilarStubId:    stringFromUUIDPtr(report.SimilarStubID),
		FallbackToMethod: report.FallbackToMethod,
		Error:            stringFromPtr(report.Error),
		Stages:           stages,
		Candidates:       candidates,
	}
}

func (h *RestServer) toRestStubs(stubs []*stuber.Stub) []rest.Stub {
	result := make([]rest.Stub, 0, len(stubs))
	for _, stub := range stubs {
		result = append(result, h.toRestStub(stub))
	}

	return result
}

func (h *RestServer) toRestStub(stub *stuber.Stub) rest.Stub {
	payload, err := json.Marshal(stub)
	if err != nil {
		return rest.Stub{}
	}

	var raw map[string]any
	if err := json.Unmarshal(payload, &raw); err != nil {
		return rest.Stub{}
	}

	delete(raw, "id")

	normalized, err := json.Marshal(raw)
	if err != nil {
		return rest.Stub{}
	}

	var out rest.Stub
	if err := json.Unmarshal(normalized, &out); err != nil {
		return rest.Stub{}
	}

	id := h.ensurePublicID(stub.ID)
	out.Id = &id
	out.Enabled = boolPtr(stub.IsEnabled())

	return out
}

func (h *RestServer) toDomainStub(input rest.Stub) (*stuber.Stub, error) {
	payload, err := json.Marshal(input)
	if err != nil {
		return nil, err
	}

	var raw map[string]any
	if err := json.Unmarshal(payload, &raw); err != nil {
		return nil, err
	}

	delete(raw, "id")

	normalized, err := json.Marshal(raw)
	if err != nil {
		return nil, err
	}

	var out stuber.Stub
	if err := json.Unmarshal(normalized, &out); err != nil {
		return nil, err
	}

	if input.Id != nil {
		privateID, ok := h.resolvePrivateID(*input.Id)
		if !ok {
			return nil, fmt.Errorf("stub with id %d not found", *input.Id)
		}

		out.ID = privateID
	}

	return &out, nil
}

func nilIfEmpty(value string) *string {
	if value == "" {
		return nil
	}

	return &value
}

func stringFromPtr(value *string) string {
	if value == nil {
		return ""
	}

	return *value
}

func intFromPtr(value *int) int {
	if value == nil {
		return 0
	}

	return *value
}

func boolPtr(value bool) *bool {
	return &value
}

func (h *RestServer) ensurePublicID(privateID uuid.UUID) rest.ID {
	h.idMapMu.RLock()
	if publicID, ok := h.privateIDs[privateID]; ok {
		h.idMapMu.RUnlock()

		return publicID
	}
	h.idMapMu.RUnlock()

	h.idMapMu.Lock()
	defer h.idMapMu.Unlock()

	if publicID, ok := h.privateIDs[privateID]; ok {
		return publicID
	}

	for {
		candidate := rest.ID(h.nextPublicID.Add(1))
		if _, exists := h.publicIDs[candidate]; exists {
			continue
		}

		h.publicIDs[candidate] = privateID
		h.privateIDs[privateID] = candidate

		return candidate
	}
}

func (h *RestServer) resolvePrivateID(publicID rest.ID) (uuid.UUID, bool) {
	h.idMapMu.RLock()
	defer h.idMapMu.RUnlock()

	privateID, ok := h.publicIDs[publicID]

	return privateID, ok
}

func (h *RestServer) publicIDPtr(privateID uuid.UUID) *rest.ID {
	if privateID == uuid.Nil {
		return nil
	}

	id := h.ensurePublicID(privateID)

	return &id
}

func stringFromUUIDPtr(value *uuid.UUID) string {
	if value == nil {
		return ""
	}

	return value.String()
}

func (h *RestServer) collectServices(file protoreflect.FileDescriptor, results *[]rest.Service) bool {
	services := file.Services()

	for i := range services.Len() {
		*results = append(*results, h.serviceFromDescriptor(services.Get(i), false))
	}

	return true
}

func (h *RestServer) collectAllServices() []rest.Service {
	results := make([]rest.Service, 0, servicesListCap)

	protoregistry.GlobalFiles.RangeFiles(func(file protoreflect.FileDescriptor) bool {
		return h.collectServices(file, &results)
	})

	h.restDescriptors.RangeFiles(func(file protoreflect.FileDescriptor) bool {
		return h.collectServices(file, &results)
	})

	sort.Slice(results, func(i, j int) bool {
		return results[i].Id < results[j].Id
	})

	return results
}

func (h *RestServer) serviceFromDescriptor(
	service protoreflect.ServiceDescriptor,
	includeSchemas bool,
) rest.Service {
	methods := service.Methods()
	result := rest.Service{
		Id:      string(service.FullName()),
		Name:    string(service.Name()),
		Package: string(service.ParentFile().Package()),
		Methods: make([]rest.Method, 0, methods.Len()),
	}

	for j := range methods.Len() {
		result.Methods = append(result.Methods, h.methodFromDescriptor(service, methods.Get(j), includeSchemas))
	}

	sort.Slice(result.Methods, func(i, j int) bool {
		return result.Methods[i].Id < result.Methods[j].Id
	})

	return result
}

func (h *RestServer) methodFromDescriptor(
	service protoreflect.ServiceDescriptor,
	method protoreflect.MethodDescriptor,
	includeSchemas bool,
) rest.Method {
	requestType := string(method.Input().FullName())
	responseType := string(method.Output().FullName())

	result := rest.Method{
		Id:              fmt.Sprintf("%s/%s", string(service.FullName()), string(method.Name())),
		Name:            string(method.Name()),
		MethodType:      grpcMethodType(method.IsStreamingClient(), method.IsStreamingServer()),
		RequestType:     &requestType,
		ResponseType:    &responseType,
		ClientStreaming: method.IsStreamingClient(),
		ServerStreaming: method.IsStreamingServer(),
	}

	if includeSchemas {
		result.RequestSchema = h.messageSchemaFromDescriptor(method.Input(), map[protoreflect.FullName]struct{}{})
		result.ResponseSchema = h.messageSchemaFromDescriptor(method.Output(), map[protoreflect.FullName]struct{}{})
	}

	return result
}

func (h *RestServer) messageSchemaFromDescriptor(
	message protoreflect.MessageDescriptor,
	visiting map[protoreflect.FullName]struct{},
) *rest.ProtoMessageSchema {
	fullName := message.FullName()
	if _, ok := visiting[fullName]; ok {
		return &rest.ProtoMessageSchema{
			TypeName:     string(fullName),
			Fields:       []rest.ProtoFieldSchema{},
			RecursiveRef: true,
		}
	}

	visiting[fullName] = struct{}{}
	defer delete(visiting, fullName)

	fields := message.Fields()
	result := rest.ProtoMessageSchema{
		TypeName: string(fullName),
		Fields:   make([]rest.ProtoFieldSchema, 0, fields.Len()),
	}

	for i := range fields.Len() {
		result.Fields = append(result.Fields, h.fieldSchemaFromDescriptor(fields.Get(i), visiting))
	}

	return &result
}

//nolint:funlen
func (h *RestServer) fieldSchemaFromDescriptor(
	field protoreflect.FieldDescriptor,
	visiting map[protoreflect.FullName]struct{},
) rest.ProtoFieldSchema {
	result := rest.ProtoFieldSchema{
		Name:        string(field.Name()),
		JsonName:    field.JSONName(),
		Number:      int(field.Number()),
		Kind:        field.Kind().String(),
		Cardinality: grpcCardinality(field.Cardinality()),
	}

	if oneof := field.ContainingOneof(); oneof != nil && !oneof.IsSynthetic() {
		group := string(oneof.Name())
		result.Oneof = &group
	}

	if field.IsMap() {
		result.Map = true

		keyKind := field.MapKey().Kind().String()
		result.MapKeyKind = &keyKind

		mapValue := field.MapValue()
		valueKind := mapValue.Kind().String()
		result.MapValueKind = &valueKind

		if mapValue.Kind() == protoreflect.MessageKind {
			valueTypeName := string(mapValue.Message().FullName())
			result.MapValueTypeName = &valueTypeName
		}

		if mapValue.Kind() == protoreflect.EnumKind {
			valueTypeName := string(mapValue.Enum().FullName())
			result.MapValueTypeName = &valueTypeName
		}

		if mapValue.Kind() == protoreflect.MessageKind {
			result.MapValueMessage = h.messageSchemaFromDescriptor(mapValue.Message(), visiting)
		}

		return result
	}

	if field.Kind() == protoreflect.EnumKind {
		enumTypeName := string(field.Enum().FullName())
		result.TypeName = &enumTypeName

		enumValues := make([]string, 0, field.Enum().Values().Len())
		for i := range field.Enum().Values().Len() {
			enumValues = append(enumValues, string(field.Enum().Values().Get(i).Name()))
		}

		result.EnumValues = &enumValues

		return result
	}

	if field.Kind() == protoreflect.MessageKind {
		messageTypeName := string(field.Message().FullName())
		result.TypeName = &messageTypeName
		result.Message = h.messageSchemaFromDescriptor(field.Message(), visiting)
	}

	return result
}

func grpcCardinality(cardinality protoreflect.Cardinality) rest.ProtoFieldSchemaCardinality {
	switch cardinality {
	case protoreflect.Required:
		return rest.Required
	case protoreflect.Repeated:
		return rest.Repeated
	case protoreflect.Optional:
		return rest.Optional
	default:
		return rest.Optional
	}
}

func grpcMethodType(clientStreaming bool, serverStreaming bool) rest.MethodMethodType {
	switch {
	case clientStreaming && serverStreaming:
		return rest.BidiStreaming
	case clientStreaming:
		return rest.ClientStreaming
	case serverStreaming:
		return rest.ServerStreaming
	default:
		return rest.Unary
	}
}

// liveness handles the liveness probe response.
func (h *RestServer) liveness(ctx context.Context, w http.ResponseWriter) {
	h.writeResponse(ctx, w, rest.MessageOK{Message: "ok", Time: time.Now()})
}

// responseError writes an error response to the HTTP writer.
func (h *RestServer) responseError(ctx context.Context, w http.ResponseWriter, err error) {
	w.WriteHeader(http.StatusInternalServerError)

	h.writeResponseError(ctx, w, err)
}

// validationError writes a validation error response to the HTTP writer.
func (h *RestServer) validationError(ctx context.Context, w http.ResponseWriter, err error) {
	w.WriteHeader(http.StatusBadRequest)

	h.writeResponseError(ctx, w, err)
}

// writeResponseError writes an error response to the HTTP writer.
func (h *RestServer) writeResponseError(ctx context.Context, w http.ResponseWriter, err error) {
	h.writeResponse(ctx, w, map[string]string{
		"error": err.Error(),
	})
}

// writeResponse writes a successful response to the HTTP writer.
func (h *RestServer) writeResponse(ctx context.Context, w http.ResponseWriter, data any) {
	if err := json.NewEncoder(w).Encode(data); err != nil {
		zerolog.Ctx(ctx).Err(err).Msg("failed to encode JSON response")
	}
}

// validateStub validates if the stub is valid or not.
func (h *RestServer) validateStub(stub *stuber.Stub) error {
	if err := h.validator.Struct(stub); err != nil {
		validationErrors, ok := stderrors.AsType[validator.ValidationErrors](err)
		if !ok {
			return err
		}

		if len(validationErrors) > 0 {
			fieldError := validationErrors[0]

			return &ValidationError{
				Field:   fieldError.Field(),
				Tag:     fieldError.Tag(),
				Value:   fieldError.Value(),
				Message: getValidationMessage(fieldError),
			}
		}

		return err
	}

	return nil
}

func (h *RestServer) dashboardPayload(r *http.Request) rest.Dashboard {
	all := h.budgerigar.All()
	used := h.budgerigar.Used()
	sessions := h.sessions()

	payload := rest.Dashboard{
		AppName:            "gripmock",
		Version:            build.Version,
		GoVersion:          runtime.Version(),
		Compiler:           runtime.Compiler,
		Goos:               runtime.GOOS,
		Goarch:             runtime.GOARCH,
		NumCPU:             runtime.NumCPU(),
		StartedAt:          h.startedAt,
		UptimeSeconds:      int(time.Since(h.startedAt).Seconds()),
		Ready:              h.ok.Load(),
		HistoryEnabled:     h.history != nil,
		TotalServices:      len(h.collectAllServices()),
		TotalStubs:         len(all),
		UsedStubs:          len(used),
		UnusedStubs:        max(len(all)-len(used), 0),
		TotalSessions:      len(sessions),
		RuntimeDescriptors: len(h.restDescriptors.ServiceIDs()),
		TotalHistory:       0,
		HistoryErrors:      0,
	}

	if h.history == nil {
		return payload
	}

	records := h.history.Filter(history.FilterOpts{Session: muxmiddleware.FromRequest(r)})
	payload.TotalHistory = len(records)

	for _, record := range records {
		if record.Error != "" {
			payload.HistoryErrors++
		}
	}

	return payload
}

func (h *RestServer) sessions() []string {
	if h.sessionsRepo == nil {
		return []string{}
	}

	sessions, err := h.sessionsRepo.List(context.Background())
	if err != nil {
		return []string{}
	}

	return sessions
}

func (h *RestServer) sessionsForResponse() []rest.Session {
	if h.sessionsRepo == nil {
		return []rest.Session{}
	}

	rows, err := h.sessionsRepo.ListRows(context.Background())
	if err != nil {
		return []rest.Session{}
	}

	result := make([]rest.Session, 0, len(rows))
	for _, item := range rows {
		result = append(result, rest.Session{
			Id:   strconv.FormatInt(item.ID, 10),
			Name: nilIfEmpty(item.Name),
		})
	}

	return result
}

func (h *RestServer) findServiceDetailed(serviceID string) (rest.Service, bool) {
	serviceDescriptor, ok := h.findServiceDescriptor(serviceID)
	if !ok {
		return rest.Service{}, false
	}

	return h.serviceFromDescriptor(serviceDescriptor, true), true
}

func (h *RestServer) findServiceDescriptor(serviceID string) (protoreflect.ServiceDescriptor, bool) { //nolint:ireturn
	var found protoreflect.ServiceDescriptor

	collect := func(file protoreflect.FileDescriptor) bool {
		services := file.Services()
		for i := range services.Len() {
			service := services.Get(i)
			if string(service.FullName()) == serviceID {
				found = service

				return false
			}
		}

		return true
	}

	if strings.Contains(serviceID, ".") {
		packageName := splitLast(serviceID, ".")[0]

		protoregistry.GlobalFiles.RangeFilesByPackage(protoreflect.FullName(packageName), collect)

		if found != nil {
			return found, true
		}

		h.restDescriptors.RangeFiles(func(file protoreflect.FileDescriptor) bool {
			if string(file.Package()) != packageName {
				return true
			}

			return collect(file)
		})

		if found != nil {
			return found, true
		}
	}

	protoregistry.GlobalFiles.RangeFiles(func(file protoreflect.FileDescriptor) bool {
		return collect(file)
	})

	if found != nil {
		return found, true
	}

	h.restDescriptors.RangeFiles(func(file protoreflect.FileDescriptor) bool {
		return collect(file)
	})

	if found == nil {
		return nil, false
	}

	return found, true
}
