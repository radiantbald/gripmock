package mcp

import (
	"net/http"

	"github.com/bavix/gripmock/v3/internal/infra/muxmiddleware"
)

func ApplyTransportRoom(r *http.Request, toolName string, args map[string]any) map[string]any {
	return ApplyRoom(toolName, args, muxmiddleware.FromRequest(r))
}

func ApplyRoom(toolName string, args map[string]any, roomID string) map[string]any {
	if !ToolUsesRoom(toolName) {
		return args
	}

	if args == nil {
		args = make(map[string]any)
	}

	if _, ok := args["room"]; ok {
		return args
	}

	if roomID != "" {
		args["room"] = roomID
	}

	return args
}

func ToolUsesRoom(toolName string) bool {
	switch toolName {
	case ToolDashboard, ToolOverview, ToolInfo, ToolHistoryList, ToolHistoryErrors, ToolVerifyCalls, ToolDebugCall:
		return true
	case ToolStubsUpsert, ToolStubsList, ToolStubsPurge, ToolStubsSearch, ToolStubsInspect, ToolStubsUsed, ToolStubsUnused:
		return true
	default:
		return false
	}
}
