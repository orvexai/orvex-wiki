package kustomize

import (
	"io"
	"io/fs"
	"path/filepath"
	"sort"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
	"gopkg.in/yaml.v3"
)

// TestTektonTreeIsSharedBuildOnly is the standing ENG-3297 invariant: this
// repo owns the trigger declaration, not a per-repo build Pipeline or manual
// PipelineRun. Keep the assertion on both source files and the rendered
// resource stream so a renamed or newly referenced legacy manifest is caught.
func TestTektonTreeIsSharedBuildOnly(t *testing.T) {
	tektonDir := filepath.Join(thisDir(t), "..", "..", "tekton")

	var files []string
	err := filepath.WalkDir(tektonDir, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() {
			return nil
		}
		rel, err := filepath.Rel(tektonDir, path)
		require.NoError(t, err)
		files = append(files, filepath.ToSlash(rel))
		return nil
	})
	require.NoError(t, err)
	sort.Strings(files)
	require.Equal(t, []string{"kustomization.yaml", "orvex-wiki-trigger.yaml"}, files,
		"ENG-3297 requires tekton/ to contain only the kustomization and shared-build trigger")

	rendered := renderKustomize(t, kustomizeBin(t), tektonDir)
	dec := yaml.NewDecoder(strings.NewReader(rendered))
	for {
		var doc struct {
			Kind string `yaml:"kind"`
		}
		if err := dec.Decode(&doc); err != nil {
			require.ErrorIs(t, err, io.EOF, "tekton render must be valid YAML")
			break
		}
		require.NotEqual(t, "Pipeline", doc.Kind, "legacy per-repo Pipeline rendered from tekton/")
		require.NotEqual(t, "PipelineRun", doc.Kind, "legacy manual PipelineRun rendered from tekton/")
	}
}
