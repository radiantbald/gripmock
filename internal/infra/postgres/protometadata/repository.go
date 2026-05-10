package protometadata

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"sort"
	"strings"
	"time"

	"github.com/cockroachdb/errors"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protodesc"
	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/types/descriptorpb"
)

const (
	actionCreated  = "created"
	actionReplaced = "replaced"
	actionNoop     = "noop"

	eventServiceAdded           = "service_added"
	eventServiceRemoved         = "service_removed"
	eventMethodAdded            = "method_added"
	eventMethodRemoved          = "method_removed"
	eventMethodSignatureChanged = "method_signature_changed"
)

type methodSnapshot struct {
	PackageName  string
	ServiceName  string
	MethodName   string
	RequestType  string
	ResponseType string
}

type serviceSnapshot struct {
	PackageName string
	ServiceName string
}

type fileSnapshot struct {
	services map[string]serviceSnapshot
	methods  map[string]methodSnapshot
}

type apiHistoryEvent struct {
	EventType   string
	PackageName string
	ServiceName string
	MethodName  string
	Payload     map[string]any
}

type Repository struct {
	pool *pgxpool.Pool
}

type ProtofileMeta struct {
	Name      string
	Hash      string
	Version   int64
	Source    string
	CreatedAt time.Time
	UpdatedAt time.Time
}

type ServiceMethodRef struct {
	ServiceID string
	MethodID  string
}

type DeleteProtofileResult struct {
	Removed        bool
	ServiceIDs     []string
	ServiceMethods []ServiceMethodRef
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

func (r *Repository) ListProtofiles(ctx context.Context) ([]ProtofileMeta, error) {
	rows, err := r.pool.Query(
		ctx,
		`SELECT p.name, p.hash, p.version, COALESCE(p.source, ''), p.created_at, p.updated_at
		 FROM protofiles p
		 ORDER BY p.updated_at DESC, p.name ASC`,
	)
	if err != nil {
		return nil, errors.Wrap(err, "failed to list protofiles")
	}
	defer rows.Close()

	result := make([]ProtofileMeta, 0)
	for rows.Next() {
		var row ProtofileMeta
		if scanErr := rows.Scan(
			&row.Name,
			&row.Hash,
			&row.Version,
			&row.Source,
			&row.CreatedAt,
			&row.UpdatedAt,
		); scanErr != nil {
			return nil, errors.Wrap(scanErr, "failed to scan protofile")
		}
		result = append(result, row)
	}

	if rowsErr := rows.Err(); rowsErr != nil {
		return nil, errors.Wrap(rowsErr, "failed while reading protofiles")
	}

	return result, nil
}

func (r *Repository) DeleteProtofile(ctx context.Context, name string) (DeleteProtofileResult, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return DeleteProtofileResult{}, errors.New("protofile name is required")
	}

	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return DeleteProtofileResult{}, errors.Wrap(err, "failed to begin delete protofile transaction")
	}
	defer func() {
		_ = tx.Rollback(ctx)
	}()

	rows, err := tx.Query(
		ctx,
		`SELECT p.name, s.name, m.name
		 FROM methods m
		 INNER JOIN services s ON s.id = m.service_id
		 INNER JOIN packages p ON p.id = s.package_id
		 INNER JOIN protofiles pf ON pf.id = p.protofile_id
		 WHERE pf.name = $1`,
		name,
	)
	if err != nil {
		return DeleteProtofileResult{}, errors.Wrap(err, "failed to list service methods for protofile delete")
	}

	serviceIDsSet := make(map[string]struct{})
	methodRefs := make([]ServiceMethodRef, 0)
	for rows.Next() {
		var packageName, serviceName, methodName string
		if scanErr := rows.Scan(&packageName, &serviceName, &methodName); scanErr != nil {
			rows.Close()

			return DeleteProtofileResult{}, errors.Wrap(scanErr, "failed to scan service methods for protofile delete")
		}

		serviceID := serviceName
		if packageName != "" {
			serviceID = packageName + "." + serviceName
		}

		serviceIDsSet[serviceID] = struct{}{}
		methodRefs = append(methodRefs, ServiceMethodRef{
			ServiceID: serviceID,
			MethodID:  methodName,
		})
	}
	if rowsErr := rows.Err(); rowsErr != nil {
		rows.Close()

		return DeleteProtofileResult{}, errors.Wrap(rowsErr, "failed while listing service methods for protofile delete")
	}
	rows.Close()

	tag, err := tx.Exec(ctx, `DELETE FROM protofiles WHERE name = $1`, name)
	if err != nil {
		return DeleteProtofileResult{}, errors.Wrap(err, "failed to delete protofile")
	}

	if err := tx.Commit(ctx); err != nil {
		return DeleteProtofileResult{}, errors.Wrap(err, "failed to commit delete protofile transaction")
	}

	if tag.RowsAffected() == 0 {
		return DeleteProtofileResult{Removed: false}, nil
	}

	serviceIDs := make([]string, 0, len(serviceIDsSet))
	for serviceID := range serviceIDsSet {
		serviceIDs = append(serviceIDs, serviceID)
	}
	sort.Strings(serviceIDs)

	sort.Slice(methodRefs, func(i, j int) bool {
		if methodRefs[i].ServiceID == methodRefs[j].ServiceID {
			return methodRefs[i].MethodID < methodRefs[j].MethodID
		}

		return methodRefs[i].ServiceID < methodRefs[j].ServiceID
	})

	return DeleteProtofileResult{
		Removed:        true,
		ServiceIDs:     serviceIDs,
		ServiceMethods: methodRefs,
	}, nil
}

func (r *Repository) HasAnyProtofiles(ctx context.Context) (bool, error) {
	var exists bool
	if err := r.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM protofiles WHERE payload IS NOT NULL LIMIT 1)`).Scan(&exists); err != nil {
		return false, errors.Wrap(err, "failed to check protofiles existence")
	}

	return exists, nil
}

func (r *Repository) HasServiceMethod(ctx context.Context, serviceID, methodID string) (bool, error) {
	serviceID = strings.TrimSpace(serviceID)
	methodID = strings.TrimSpace(methodID)

	if serviceID == "" && methodID == "" {
		return r.HasAnyProtofiles(ctx)
	}

	var exists bool
	if err := r.pool.QueryRow(
		ctx,
		`SELECT EXISTS(
			SELECT 1
			FROM methods m
			INNER JOIN services s ON s.id = m.service_id
			INNER JOIN packages p ON p.id = s.package_id
			INNER JOIN protofiles pf ON pf.id = p.protofile_id
			WHERE ($1 = '' OR (
				CASE WHEN p.name = '' THEN s.name ELSE p.name || '.' || s.name END
			) = $1)
			  AND ($2 = '' OR m.name = $2)
			  AND pf.payload IS NOT NULL
		)`,
		serviceID,
		methodID,
	).Scan(&exists); err != nil {
		return false, errors.Wrap(err, "failed to check proto metadata by service/method")
	}

	return exists, nil
}

func (r *Repository) ReplaceDescriptorFiles(
	ctx context.Context,
	source string,
	files []protoreflect.FileDescriptor,
) error {
	if len(files) == 0 {
		return nil
	}

	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return errors.Wrap(err, "failed to begin proto metadata transaction")
	}
	defer func() {
		_ = tx.Rollback(ctx)
	}()

	for _, file := range files {
		if file == nil {
			continue
		}

		if err := r.replaceDescriptorFileTx(ctx, tx, source, file); err != nil {
			return err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return errors.Wrap(err, "failed to commit proto metadata transaction")
	}

	return nil
}

func (r *Repository) ReplaceDescriptorSets(
	ctx context.Context,
	source string,
	descriptorSets []*descriptorpb.FileDescriptorSet,
) error {
	files, err := descriptorSetsToFiles(descriptorSets)
	if err != nil {
		return err
	}

	return r.ReplaceDescriptorFiles(ctx, source, files)
}

func (r *Repository) LoadDescriptorSets(ctx context.Context) ([]*descriptorpb.FileDescriptorSet, error) {
	rows, err := r.pool.Query(ctx, `SELECT payload FROM protofiles WHERE payload IS NOT NULL ORDER BY name`)
	if err != nil {
		return nil, errors.Wrap(err, "failed to list descriptor payloads")
	}
	defer rows.Close()

	set := &descriptorpb.FileDescriptorSet{File: make([]*descriptorpb.FileDescriptorProto, 0)}
	for rows.Next() {
		var payload []byte
		if scanErr := rows.Scan(&payload); scanErr != nil {
			return nil, errors.Wrap(scanErr, "failed to scan descriptor payload")
		}
		if len(payload) == 0 {
			continue
		}

		fileProto := new(descriptorpb.FileDescriptorProto)
		if unmarshalErr := proto.Unmarshal(payload, fileProto); unmarshalErr != nil {
			return nil, errors.Wrap(unmarshalErr, "failed to decode descriptor payload")
		}
		set.File = append(set.File, fileProto)
	}

	if rowsErr := rows.Err(); rowsErr != nil {
		return nil, errors.Wrap(rowsErr, "failed while reading descriptor payloads")
	}

	if len(set.File) == 0 {
		return nil, nil
	}

	return []*descriptorpb.FileDescriptorSet{set}, nil
}

func (r *Repository) replaceDescriptorFileTx(
	ctx context.Context,
	tx pgx.Tx,
	source string,
	file protoreflect.FileDescriptor,
) error {
	fileProto := protodesc.ToFileDescriptorProto(file)
	hash, err := hashFileProto(fileProto)
	if err != nil {
		return err
	}

	var (
		protofileID int64
		version     int64
		prevHash    string
	)

	selectErr := tx.QueryRow(
		ctx,
		`SELECT id, hash, version FROM protofiles WHERE name = $1 FOR UPDATE`,
		file.Path(),
	).Scan(&protofileID, &prevHash, &version)
	switch {
	case errors.Is(selectErr, pgx.ErrNoRows):
		oldState := emptyFileSnapshot()

		if err := tx.QueryRow(
			ctx,
			`INSERT INTO protofiles (name, hash, version, created_at, updated_at)
			 VALUES ($1, $2, 1, NOW(), NOW())
			 RETURNING id, version`,
			file.Path(),
			hash,
		).Scan(&protofileID, &version); err != nil {
			return errors.Wrap(err, "failed to create protofile row")
		}

		if err := r.upsertDescriptorFilePayloadTx(ctx, tx, file.Path(), fileProto, hash, source); err != nil {
			return err
		}

		if err := r.insertFileTreeTx(ctx, tx, protofileID, file); err != nil {
			return err
		}

		historyID, err := r.insertHistoryTx(ctx, tx, protofileID, file.Path(), version, hash, actionCreated, source)
		if err != nil {
			return err
		}

		return r.insertAPIHistoryTx(ctx, tx, historyID, protofileID, file.Path(), version, source, oldState, snapshotFromDescriptor(file))
	case selectErr != nil:
		return errors.Wrap(selectErr, "failed to load protofile row")
	}

	if err := r.upsertDescriptorFilePayloadTx(ctx, tx, file.Path(), fileProto, hash, source); err != nil {
		return err
	}

	if prevHash == hash {
		_, err := r.insertHistoryTx(ctx, tx, protofileID, file.Path(), version, hash, actionNoop, source)

		return err
	}

	oldState, err := r.loadExistingFileSnapshotTx(ctx, tx, protofileID)
	if err != nil {
		return err
	}

	if _, err := tx.Exec(
		ctx,
		`UPDATE protofiles
		 SET hash = $2, version = version + 1, updated_at = NOW()
		 WHERE id = $1`,
		protofileID,
		hash,
	); err != nil {
		return errors.Wrap(err, "failed to update protofile row")
	}

	version++

	if _, err := tx.Exec(ctx, `DELETE FROM packages WHERE protofile_id = $1`, protofileID); err != nil {
		return errors.Wrap(err, "failed to delete old package tree")
	}

	if err := r.insertFileTreeTx(ctx, tx, protofileID, file); err != nil {
		return err
	}

	historyID, err := r.insertHistoryTx(ctx, tx, protofileID, file.Path(), version, hash, actionReplaced, source)
	if err != nil {
		return err
	}

	return r.insertAPIHistoryTx(
		ctx,
		tx,
		historyID,
		protofileID,
		file.Path(),
		version,
		source,
		oldState,
		snapshotFromDescriptor(file),
	)
}

func (r *Repository) upsertDescriptorFilePayloadTx(
	ctx context.Context,
	tx pgx.Tx,
	name string,
	fileProto *descriptorpb.FileDescriptorProto,
	hash string,
	source string,
) error {
	payload, err := proto.MarshalOptions{Deterministic: true}.Marshal(fileProto)
	if err != nil {
		return errors.Wrap(err, "failed to marshal descriptor payload")
	}

	_, err = tx.Exec(
		ctx,
		`UPDATE protofiles
		 SET payload = $2,
		     hash = $3,
		     source = $4,
		     updated_at = NOW()
		 WHERE name = $1`,
		name,
		payload,
		hash,
		source,
	)
	if err != nil {
		return errors.Wrap(err, "failed to upsert descriptor payload")
	}

	return nil
}

func (r *Repository) insertFileTreeTx(
	ctx context.Context,
	tx pgx.Tx,
	protofileID int64,
	file protoreflect.FileDescriptor,
) error {
	var packageID int64
	if err := tx.QueryRow(
		ctx,
		`INSERT INTO packages (name, protofile_id, created_at)
		 VALUES ($1, $2, NOW())
		 RETURNING id`,
		string(file.Package()),
		protofileID,
	).Scan(&packageID); err != nil {
		return errors.Wrap(err, "failed to create package row")
	}

	services := file.Services()
	for i := range services.Len() {
		service := services.Get(i)

		var serviceID int64
		if err := tx.QueryRow(
			ctx,
			`INSERT INTO services (name, package_id, created_at)
			 VALUES ($1, $2, NOW())
			 RETURNING id`,
			string(service.Name()),
			packageID,
		).Scan(&serviceID); err != nil {
			return errors.Wrap(err, "failed to create service row")
		}

		methods := service.Methods()
		for j := range methods.Len() {
			method := methods.Get(j)

			if _, err := tx.Exec(
				ctx,
				`INSERT INTO methods (name, service_id, request_type, response_type, created_at)
				 VALUES ($1, $2, $3, $4, NOW())`,
				string(method.Name()),
				serviceID,
				string(method.Input().FullName()),
				string(method.Output().FullName()),
			); err != nil {
				return errors.Wrap(err, "failed to create method row")
			}
		}
	}

	return nil
}

func (r *Repository) insertHistoryTx(
	ctx context.Context,
	tx pgx.Tx,
	protofileID int64,
	fileName string,
	version int64,
	hash string,
	action string,
	source string,
) (int64, error) {
	var historyID int64
	if err := tx.QueryRow(
		ctx,
		`INSERT INTO protofile_history (protofile_id, name, version, hash, action, source, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, NOW())
		 RETURNING id`,
		protofileID,
		fileName,
		version,
		hash,
		action,
		source,
	).Scan(&historyID); err != nil {
		return 0, errors.Wrap(err, "failed to create protofile history row")
	}

	return historyID, nil
}

func hashFileProto(fileProto *descriptorpb.FileDescriptorProto) (string, error) {
	body, err := proto.MarshalOptions{Deterministic: true}.Marshal(fileProto)
	if err != nil {
		return "", errors.Wrap(err, "failed to marshal descriptor proto for hash")
	}

	sum := sha256.Sum256(body)

	return hex.EncodeToString(sum[:]), nil
}

func descriptorSetsToFiles(descriptorSets []*descriptorpb.FileDescriptorSet) ([]protoreflect.FileDescriptor, error) {
	byPath := make(map[string]protoreflect.FileDescriptor)

	for _, descriptorSet := range descriptorSets {
		if descriptorSet == nil {
			continue
		}

		files, err := protodesc.NewFiles(descriptorSet)
		if err != nil {
			return nil, errors.Wrap(err, "failed to decode descriptor set for proto metadata")
		}

		files.RangeFiles(func(fd protoreflect.FileDescriptor) bool {
			byPath[fd.Path()] = fd

			return true
		})
	}

	paths := make([]string, 0, len(byPath))
	for path := range byPath {
		paths = append(paths, path)
	}
	sort.Strings(paths)

	result := make([]protoreflect.FileDescriptor, 0, len(paths))
	for _, path := range paths {
		result = append(result, byPath[path])
	}

	return result, nil
}

func (r *Repository) loadExistingFileSnapshotTx(ctx context.Context, tx pgx.Tx, protofileID int64) (fileSnapshot, error) {
	rows, err := tx.Query(
		ctx,
		`SELECT p.name, s.name, m.name, m.request_type, m.response_type
		 FROM packages p
		 JOIN services s ON s.package_id = p.id
		 LEFT JOIN methods m ON m.service_id = s.id
		 WHERE p.protofile_id = $1`,
		protofileID,
	)
	if err != nil {
		return fileSnapshot{}, errors.Wrap(err, "failed to load existing proto tree")
	}
	defer rows.Close()

	state := emptyFileSnapshot()
	for rows.Next() {
		var (
			packageName  string
			serviceName  string
			methodName   *string
			requestType  *string
			responseType *string
		)
		if err := rows.Scan(&packageName, &serviceName, &methodName, &requestType, &responseType); err != nil {
			return fileSnapshot{}, errors.Wrap(err, "failed to scan existing proto tree")
		}

		serviceKey := serviceSnapshotKey(packageName, serviceName)
		state.services[serviceKey] = serviceSnapshot{
			PackageName: packageName,
			ServiceName: serviceName,
		}

		if methodName != nil && requestType != nil && responseType != nil {
			methodKey := methodSnapshotKey(packageName, serviceName, *methodName)
			state.methods[methodKey] = methodSnapshot{
				PackageName:  packageName,
				ServiceName:  serviceName,
				MethodName:   *methodName,
				RequestType:  *requestType,
				ResponseType: *responseType,
			}
		}
	}

	if err := rows.Err(); err != nil {
		return fileSnapshot{}, errors.Wrap(err, "failed to iterate existing proto tree")
	}

	return state, nil
}

func (r *Repository) insertAPIHistoryTx(
	ctx context.Context,
	tx pgx.Tx,
	protofileHistoryID int64,
	protofileID int64,
	protofileName string,
	protofileVersion int64,
	source string,
	oldState fileSnapshot,
	newState fileSnapshot,
) error {
	events := diffSnapshots(oldState, newState)
	if len(events) == 0 {
		return nil
	}

	for _, event := range events {
		payload := event.Payload
		if payload == nil {
			payload = map[string]any{}
		}

		payloadJSON, err := json.Marshal(payload)
		if err != nil {
			return errors.Wrap(err, "failed to marshal proto api history payload")
		}

		if _, err := tx.Exec(
			ctx,
			`INSERT INTO proto_api_history (
				protofile_history_id,
				protofile_id,
				protofile_name,
				protofile_version,
				event_type,
				package_name,
				service_name,
				method_name,
				payload,
				source,
				created_at
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, NOW())`,
			protofileHistoryID,
			protofileID,
			protofileName,
			protofileVersion,
			event.EventType,
			event.PackageName,
			nullIfEmpty(event.ServiceName),
			nullIfEmpty(event.MethodName),
			payloadJSON,
			source,
		); err != nil {
			return errors.Wrap(err, "failed to insert proto api history row")
		}
	}

	return nil
}

func diffSnapshots(oldState, newState fileSnapshot) []apiHistoryEvent {
	events := make([]apiHistoryEvent, 0)

	for key, service := range oldState.services {
		if _, ok := newState.services[key]; ok {
			continue
		}
		events = append(events, apiHistoryEvent{
			EventType:   eventServiceRemoved,
			PackageName: service.PackageName,
			ServiceName: service.ServiceName,
			Payload: map[string]any{
				"service_full_name": service.PackageName + "." + service.ServiceName,
			},
		})
	}

	for key, service := range newState.services {
		if _, ok := oldState.services[key]; ok {
			continue
		}
		events = append(events, apiHistoryEvent{
			EventType:   eventServiceAdded,
			PackageName: service.PackageName,
			ServiceName: service.ServiceName,
			Payload: map[string]any{
				"service_full_name": service.PackageName + "." + service.ServiceName,
			},
		})
	}

	for key, method := range oldState.methods {
		next, ok := newState.methods[key]
		if !ok {
			events = append(events, apiHistoryEvent{
				EventType:   eventMethodRemoved,
				PackageName: method.PackageName,
				ServiceName: method.ServiceName,
				MethodName:  method.MethodName,
				Payload: map[string]any{
					"service_full_name": method.PackageName + "." + method.ServiceName,
					"method_full_name":  method.PackageName + "." + method.ServiceName + "/" + method.MethodName,
					"request_type":      method.RequestType,
					"response_type":     method.ResponseType,
				},
			})
			continue
		}

		if method.RequestType != next.RequestType || method.ResponseType != next.ResponseType {
			events = append(events, apiHistoryEvent{
				EventType:   eventMethodSignatureChanged,
				PackageName: method.PackageName,
				ServiceName: method.ServiceName,
				MethodName:  method.MethodName,
				Payload: map[string]any{
					"service_full_name": method.PackageName + "." + method.ServiceName,
					"method_full_name":  method.PackageName + "." + method.ServiceName + "/" + method.MethodName,
					"before": map[string]any{
						"request_type":  method.RequestType,
						"response_type": method.ResponseType,
					},
					"after": map[string]any{
						"request_type":  next.RequestType,
						"response_type": next.ResponseType,
					},
				},
			})
		}
	}

	for key, method := range newState.methods {
		if _, ok := oldState.methods[key]; ok {
			continue
		}
		events = append(events, apiHistoryEvent{
			EventType:   eventMethodAdded,
			PackageName: method.PackageName,
			ServiceName: method.ServiceName,
			MethodName:  method.MethodName,
			Payload: map[string]any{
				"service_full_name": method.PackageName + "." + method.ServiceName,
				"method_full_name":  method.PackageName + "." + method.ServiceName + "/" + method.MethodName,
				"request_type":      method.RequestType,
				"response_type":     method.ResponseType,
			},
		})
	}

	sort.Slice(events, func(i, j int) bool {
		if events[i].EventType != events[j].EventType {
			return events[i].EventType < events[j].EventType
		}
		if events[i].PackageName != events[j].PackageName {
			return events[i].PackageName < events[j].PackageName
		}
		if events[i].ServiceName != events[j].ServiceName {
			return events[i].ServiceName < events[j].ServiceName
		}
		return events[i].MethodName < events[j].MethodName
	})

	return events
}

func snapshotFromDescriptor(file protoreflect.FileDescriptor) fileSnapshot {
	state := emptyFileSnapshot()
	packageName := string(file.Package())

	services := file.Services()
	for i := range services.Len() {
		service := services.Get(i)
		serviceName := string(service.Name())
		serviceKey := serviceSnapshotKey(packageName, serviceName)

		state.services[serviceKey] = serviceSnapshot{
			PackageName: packageName,
			ServiceName: serviceName,
		}

		methods := service.Methods()
		for j := range methods.Len() {
			method := methods.Get(j)
			methodName := string(method.Name())
			methodKey := methodSnapshotKey(packageName, serviceName, methodName)

			state.methods[methodKey] = methodSnapshot{
				PackageName:  packageName,
				ServiceName:  serviceName,
				MethodName:   methodName,
				RequestType:  string(method.Input().FullName()),
				ResponseType: string(method.Output().FullName()),
			}
		}
	}

	return state
}

func emptyFileSnapshot() fileSnapshot {
	return fileSnapshot{
		services: make(map[string]serviceSnapshot),
		methods:  make(map[string]methodSnapshot),
	}
}

func serviceSnapshotKey(packageName, serviceName string) string {
	return packageName + "|" + serviceName
}

func methodSnapshotKey(packageName, serviceName, methodName string) string {
	return packageName + "|" + serviceName + "|" + methodName
}

func nullIfEmpty(value string) any {
	if value == "" {
		return nil
	}

	return value
}
