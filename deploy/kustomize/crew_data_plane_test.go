package kustomize

import (
	"errors"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
	"gopkg.in/yaml.v3"
)

func TestCrewDataPlaneClaimsUseCrewNamespace(t *testing.T) {
	bin := kustomizeBin(t)
	kustomizeDir := thisDir(t)
	appDir := filepath.Join(t.TempDir(), "kustomize")
	require.NoError(t, os.CopyFS(appDir, os.DirFS(kustomizeDir)))

	configPath := filepath.Join(appDir, "cluster-config.yaml")
	config, err := os.ReadFile(configPath)
	require.NoError(t, err)
	config = regexp.MustCompile(`(?m)^  appNamespace: .*?$`).ReplaceAll(config, []byte("  appNamespace: orvex-wiki-crew-probe"))
	config = regexp.MustCompile(`(?m)^  branchSlug: .*?$`).ReplaceAll(config, []byte("  branchSlug: crew-probe"))
	require.NoError(t, os.WriteFile(configPath, config, 0o644))

	kustomizationPath := filepath.Join(appDir, "kustomization.yaml")
	kustomization, err := os.ReadFile(kustomizationPath)
	require.NoError(t, err)
	kustomization = regexp.MustCompile(`(?m)^components:\n(?:  - .*\n)+`).ReplaceAll(kustomization,
		[]byte("components:\n  - components/crew\n"))
	require.NoError(t, os.WriteFile(kustomizationPath, kustomization, 0o644))

	rendered := renderKustomize(t, bin, appDir)
	found := map[string]bool{}
	dec := yaml.NewDecoder(strings.NewReader(rendered))
	for {
		var doc map[string]any
		err := dec.Decode(&doc)
		if errors.Is(err, io.EOF) {
			break
		}
		require.NoError(t, err)
		if doc == nil {
			continue
		}
		metadata, _ := doc["metadata"].(map[string]any)
		if (doc["kind"] == "PostgresInstanceClaim" && metadata["name"] == "orvex-wiki-postgres") ||
			(doc["kind"] == "RedisInstanceClaim" && metadata["name"] == "orvex-wiki-redis") ||
			(doc["kind"] == "ObjectStorageClaim" && metadata["name"] == "orvex-wiki-s3") {
			require.Equal(t, "orvex-wiki-crew-probe", metadata["namespace"])
			found[doc["kind"].(string)] = true
			if doc["kind"] == "ObjectStorageClaim" {
				spec, _ := doc["spec"].(map[string]any)
				require.Equal(t, "orvex-wiki-crew-probe-bucket", spec["bucketName"])
			}
		}
	}
	require.True(t, found["PostgresInstanceClaim"], "crew render must include its own Postgres claim")
	require.True(t, found["RedisInstanceClaim"], "crew render must include its own Redis claim")
	require.True(t, found["ObjectStorageClaim"], "crew render must include its own bucket claim")
	require.Contains(t, rendered, "key: orvex-wiki-crew-probe/postgres")
	require.Contains(t, rendered, "key: orvex-wiki-crew-probe/redis")
}
