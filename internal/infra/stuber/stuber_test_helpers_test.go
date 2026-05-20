package stuber_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/radiantbald/gripmock/v3/internal/infra/stuber"
)

func newBudgerigar() *stuber.Budgerigar {
	return stuber.NewBudgerigar()
}

func runFindByTests(t *testing.T, create func() *stuber.Budgerigar) {
	t.Helper()

	s := create()

	require.Empty(t, s.All())

	s.PutMany(
		&stuber.Stub{ID: newStubID(), Service: "Greeter1", Method: "SayHello1"},
		&stuber.Stub{ID: newStubID(), Service: "Greeter1", Method: "SayHello1"},
		&stuber.Stub{ID: newStubID(), Service: "Greeter2", Method: "SayHello2"},
		&stuber.Stub{ID: newStubID(), Service: "Greeter3", Method: "SayHello2"},
		&stuber.Stub{ID: newStubID(), Service: "Greeter4", Method: "SayHello3"},
		&stuber.Stub{ID: newStubID(), Service: "Greeter5", Method: "SayHello3"},
		&stuber.Stub{ID: newStubID(), Service: "Greeter1", Method: "SayHello3"},
	)

	require.Len(t, s.All(), 7)
}

func runFindBySortedTests(t *testing.T, create func() *stuber.Budgerigar) {
	t.Helper()

	s := create()

	stub1 := &stuber.Stub{ID: 3, Service: "Greeter1", Method: "SayHello1"}
	stub2 := &stuber.Stub{ID: 1, Service: "Greeter1", Method: "SayHello1"}
	stub3 := &stuber.Stub{ID: 2, Service: "Greeter1", Method: "SayHello1"}
	stub4 := &stuber.Stub{ID: 4, Service: "Greeter2", Method: "SayHello2"}

	s.PutMany(stub1, stub2, stub3, stub4)

	results, err := s.FindBy("Greeter1", "SayHello1")
	require.NoError(t, err)
	require.Len(t, results, 3)

	require.Equal(t, stub2.ID, results[0].ID)
	require.Equal(t, stub3.ID, results[1].ID)
	require.Equal(t, stub1.ID, results[2].ID)

	results, err = s.FindBy("Greeter2", "SayHello2")
	require.NoError(t, err)
	require.Len(t, results, 1)
	require.Equal(t, stub4.ID, results[0].ID)

	_, err = s.FindBy("Greeter3", "SayHello3")
	require.ErrorIs(t, err, stuber.ErrServiceNotFound)
}
