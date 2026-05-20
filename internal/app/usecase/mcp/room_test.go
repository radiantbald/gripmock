package mcp_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"

	mcpusecase "github.com/radiantbald/gripmock/v3/internal/app/usecase/mcp"
)

func TestToolUsesRoom(t *testing.T) {
	t.Parallel()

	// Arrange
	tools := []string{"history.list", "history.errors", "debug.call"}

	for _, tool := range tools {
		// Act
		usesRoom := mcpusecase.ToolUsesRoom(tool)

		// Assert
		require.True(t, usesRoom)
	}
}

func TestToolUsesRoomFalseForOtherTools(t *testing.T) {
	t.Parallel()

	// Act
	usesRoom := mcpusecase.ToolUsesRoom("services.list")

	// Assert
	require.False(t, usesRoom)
}

func TestApplyTransportRoomInjectsHeaderRoom(t *testing.T) {
	t.Parallel()

	// Arrange
	req := httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/api/mcp", nil)
	req.Header.Set("X-Gripmock-Room", "A")

	// Act
	args := mcpusecase.ApplyTransportRoom(req, "history.list", map[string]any{"service": "svc"})

	// Assert
	require.Equal(t, "A", args["room"])
}

func TestApplyTransportRoomDoesNotOverrideExplicitRoom(t *testing.T) {
	t.Parallel()

	// Arrange
	req := httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/api/mcp", nil)
	req.Header.Set("X-Gripmock-Room", "A")

	// Act
	args := mcpusecase.ApplyTransportRoom(req, "history.list", map[string]any{"room": "B"})

	// Assert
	require.Equal(t, "B", args["room"])
}

func TestApplyTransportRoomSkipsUnsupportedTool(t *testing.T) {
	t.Parallel()

	// Arrange
	req := httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/api/mcp", nil)
	req.Header.Set("X-Gripmock-Room", "A")

	// Act
	args := mcpusecase.ApplyTransportRoom(req, "services.list", map[string]any{"x": 1})

	// Assert
	_, hasRoom := args["room"]
	require.False(t, hasRoom)
}
