package stuber_test

import (
	"testing"

	"github.com/bavix/gripmock/v3/internal/infra/stuber"
)

func BenchmarkInspectQuery(b *testing.B) {
	budgerigar := stuber.NewBudgerigar()

	for range 500 {
		budgerigar.PutMany(&stuber.Stub{
			ID:      newStubID(),
			Service: "service",
			Method:  "method",
			Input: stuber.InputData{
				Equals: map[string]any{"name": "alex"},
			},
			Output: stuber.Output{Data: map[string]any{"ok": true}},
		})
	}

	query := stuber.Query{
		Service: "service",
		Method:  "method",
		Input:   []map[string]any{{"name": "alex"}},
	}

	b.ReportAllocs()
	b.ResetTimer()

	for range b.N {
		_ = budgerigar.InspectQuery(query)
	}
}
