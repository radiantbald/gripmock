package deps

import (
	"context"
	"io/fs"
	"os"
	"path/filepath"
	"time"

	"github.com/cockroachdb/errors"
	"github.com/rs/zerolog"

	gripmockui "github.com/bavix/gripmock-ui"
)

const (
	uiSourceDir = "third_party/gripmock-ui/src"
	uiDistDir   = "third_party/gripmock-ui/dist"
)

func (b *Builder) ui(ctx context.Context) (fs.FS, error) {
	warnIfUIBuildStale(ctx)

	assets, err := gripmockui.Assets()
	if err != nil {
		return nil, errors.Wrapf(err, "failed to get UI assets")
	}

	return assets, nil
}

func warnIfUIBuildStale(ctx context.Context) {
	srcModTime, srcErr := newestFileModTime(uiSourceDir)
	distModTime, distErr := newestFileModTime(uiDistDir)
	if srcErr != nil || distErr != nil {
		return
	}

	if srcModTime.After(distModTime) {
		zerolog.Ctx(ctx).Warn().
			Str("ui_src", uiSourceDir).
			Str("ui_dist", uiDistDir).
			Time("src_latest", srcModTime).
			Time("dist_latest", distModTime).
			Msg("UI source is newer than dist assets; run `make ui-build` to refresh frontend bundle")
	}
}

func newestFileModTime(root string) (time.Time, error) {
	info, err := os.Stat(root)
	if err != nil {
		return time.Time{}, err
	}

	if !info.IsDir() {
		return info.ModTime(), nil
	}

	latest := info.ModTime()
	walkErr := filepath.WalkDir(root, func(path string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}

		if d.IsDir() {
			return nil
		}

		entryInfo, entryErr := d.Info()
		if entryErr != nil {
			return entryErr
		}

		modTime := entryInfo.ModTime()
		if modTime.After(latest) {
			latest = modTime
		}

		return nil
	})
	if walkErr != nil {
		return time.Time{}, walkErr
	}

	return latest, nil
}
