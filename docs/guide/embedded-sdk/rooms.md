# Room Management <VersionTag version="v3.7.0" />

::: warning
⚠️ **EXPERIMENTAL FEATURE**: The GripMock Embedded SDK is currently experimental. The API is subject to change without notice, and functionality may be modified in future versions. Use at your own risk.
:::

::: info
**Minimum Requirements**: Go 1.26 or later
:::

Rooms provide isolation for stubs and history data when using remote GripMock instances. Each room maintains its own set of stubs and call history, preventing interference between different test contexts.

## Room Lifecycle

Rooms in GripMock have the following lifecycle characteristics:

1. **Creation**: Rooms are created when the first stub is registered with a specific room ID
2. **Active Period**: During this time, the room stores stubs and history for that room
3. **Automatic Cleanup**: Room resources can be cleaned automatically by the SDK and/or server policies
4. **Manual Cleanup**: Rooms can be explicitly cleared via API calls

## Using Rooms

To use rooms, specify a room ID when connecting to a remote GripMock instance:

```go
func TestMyService_WithRoom(t *testing.T) {
    // ARRANGE
    mock, err := sdk.Run(t,
        sdk.WithRemote("localhost:4770", "http://localhost:4771"),
        sdk.WithFileDescriptor(service.File_service_proto),
        sdk.WithRoom("test-room-123"), // Isolate this test's stubs and history
    )
    require.NoError(t, err)

    // Stubs defined in this room are isolated from other rooms
    mock.Stub(sdk.By(MyService_MyMethod_FullMethodName)).
        When(sdk.Equals("id", "room-test")).
        Reply(sdk.Data("result", "room-isolated")).
        Commit()

    client := NewMyServiceClient(mock.Conn())

    // ACT
    resp, err := client.MyMethod(t.Context(), &MyRequest{Id: "room-test"})

    // ASSERT
    require.NoError(t, err)
    require.Equal(t, "room-isolated", resp.Result)
}
```

## Room Isolation Benefits

Rooms provide several benefits:

- **Test Isolation**: Prevents stubs from one test affecting another
- **Parallel Test Safety**: Allows safe parallel execution when sharing a remote GripMock instance
- **History Separation**: Keeps call history separate between different test contexts
- **Resource Management**: Enables cleanup of test-specific resources

## Room Best Practices

### 1. Use Unique Room IDs

Always use unique room identifiers to prevent conflicts:

```go
// Good: Use test name as room ID for uniqueness
mock, err := sdk.Run(t,
    sdk.WithRemote("localhost:4770", "http://localhost:4771"),
    sdk.WithRoom(t.Name()), // Uses test function name as room ID
)

// Good: Use UUID for guaranteed uniqueness
roomID := uuid.New().String()
mock, err := sdk.Run(t,
    sdk.WithRemote("localhost:4770", "http://localhost:4771"),
    sdk.WithRoom(roomID),
)
```

### 2. Clean Up Rooms

`mock.Close()` cleans remote stubs associated with the active room. You can also set a TTL to trigger automatic cleanup:

```go
func TestMyService_WithCleanup(t *testing.T) {
    roomID := "test-" + t.Name()
    
    mock, err := sdk.Run(t,
        sdk.WithRemote("localhost:4770", "http://localhost:4771"),
        sdk.WithRoom(roomID),
        sdk.WithRoomTTL(30 * time.Second),
    )
    require.NoError(t, err)

    // Test logic here...
    
    // Resources for this room are cleaned on Close() and via TTL.
}
```

### 3. Room-Aware Verification

When using rooms, verification occurs within the context of that room:

```go
func TestMyService_RoomVerification(t *testing.T) {
    mock, err := sdk.Run(t,
        sdk.WithRemote("localhost:4770", "http://localhost:4771"),
        sdk.WithFileDescriptor(service.File_service_proto),
        sdk.WithRoom(t.Name()),
    )
    require.NoError(t, err)

    mock.Stub(sdk.By(MyService_MyMethod_FullMethodName)).
        When(sdk.Equals("id", "verify-test")).
        Reply(sdk.Data("result", "verified")).
        Times(2). // Expected to be called exactly 2 times in this room
        Commit()

    client := NewMyServiceClient(mock.Conn())

    // ACT
    _, _ = client.MyMethod(t.Context(), &MyRequest{Id: "verify-test"})
    _, _ = client.MyMethod(t.Context(), &MyRequest{Id: "verify-test"})

    // ASSERT
    // Verification happens within the room context
    mock.Verify().Method(sdk.By(MyService_MyMethod_FullMethodName)).Called(t, 2)
}
```

## Room Configuration

Rooms can be configured with various options depending on your needs:

### Room Timeouts

By default, SDK schedules remote room cleanup with TTL `60s`. Use `sdk.WithRoomTTL(...)` to override:

```go
mock, err := sdk.Run(t,
    sdk.WithRemote("localhost:4770", "http://localhost:4771"),
    sdk.WithRoom(t.Name()),
    sdk.WithRoomTTL(2*time.Minute),
)
require.NoError(t, err)
```

### Room Persistence

Rooms maintain state as long as the remote GripMock instance is running and the room hasn't expired:

- Registered stubs persist within the room
- Call history accumulates within the room
- Verification data is maintained per room

## Common Room Patterns

### Parallel Testing Pattern

When running tests in parallel with a shared remote GripMock instance:

```go
func TestMyService_Parallel(t *testing.T) {
    t.Parallel() // Safe with rooms

    mock, err := sdk.Run(t,
        sdk.WithRemote("localhost:4770", "http://localhost:4771"),
        sdk.WithFileDescriptor(service.File_service_proto),
        sdk.WithRoom(t.Name()), // Each parallel test gets its own room
    )
    require.NoError(t, err)

    // Rest of test...
}
```

### Integration Testing Pattern

For integration tests that need shared state, create the mock in test setup code that has access to `t` (for example in suite setup helpers):

```go
func runSharedRoomMock(t *testing.T) sdk.Mock {
    t.Helper()

    mock, err := sdk.Run(t,
        sdk.WithRemote("localhost:4770", "http://localhost:4771"),
        sdk.WithRoom("integration-suite"),
    )
    require.NoError(t, err)

    return mock
}
```

## Room Limitations

- Rooms are only applicable when using remote mode (`sdk.WithRemote`)
- Room IDs should be unique to prevent conflicts
- Room data persists until explicitly cleared or the server restarts/cleans up
- Each room consumes server resources, so avoid creating excessive numbers of rooms
