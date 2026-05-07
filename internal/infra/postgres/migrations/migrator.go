package migrations

import (
	"context"
	"embed"
	"path/filepath"
	"sort"
	"strings"

	"github.com/cockroachdb/errors"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed *.sql
var files embed.FS

// Apply executes SQL migrations in filename order.
func Apply(ctx context.Context, pool *pgxpool.Pool) error {
	entries, err := files.ReadDir(".")
	if err != nil {
		return errors.Wrap(err, "failed to read migration files")
	}

	names := make([]string, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".sql" {
			continue
		}

		names = append(names, entry.Name())
	}

	sort.Strings(names)

	for _, name := range names {
		query, readErr := files.ReadFile(name)
		if readErr != nil {
			return errors.Wrapf(readErr, "failed to read migration %s", name)
		}

		if strings.TrimSpace(string(query)) == "" {
			continue
		}

		if _, execErr := pool.Exec(ctx, string(query)); execErr != nil {
			return errors.Wrapf(execErr, "failed to apply migration %s", name)
		}
	}

	return nil
}
