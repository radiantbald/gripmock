package app

import (
	errorFormatter "github.com/radiantbald/gripmock/v3/internal/infra/errors"
	"github.com/radiantbald/gripmock/v3/internal/infra/stuber"
)

func stubNotFoundError(expect stuber.Query, result *stuber.Result) error {
	formatter := errorFormatter.NewStubNotFoundFormatter()

	return formatter.Format(expect, result)
}
