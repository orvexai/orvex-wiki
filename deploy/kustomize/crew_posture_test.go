package kustomize

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
	"gopkg.in/yaml.v3"
)

// renderCrewOverlay renders the same base + crew component shape that the CMP
// plugin assembles. The posture is component-scoped, so it is identical for
// each named crew application even though idp-render supplies each branch's
// other values separately.
func renderCrewOverlay(t *testing.T, bin, kustomizeDir string) string {
	t.Helper()
	deployDir := filepath.Dir(kustomizeDir)
	overlayDir, err := os.MkdirTemp(deployDir, "render-gate-crew-")
	require.NoError(t, err)
	t.Cleanup(func() { _ = os.RemoveAll(overlayDir) })

	relRoot, err := filepath.Rel(overlayDir, kustomizeDir)
	require.NoError(t, err)
	relCrew, err := filepath.Rel(overlayDir, filepath.Join(kustomizeDir, "components", "crew"))
	require.NoError(t, err)

	overlay := "apiVersion: kustomize.config.k8s.io/v1beta1\n" +
		"kind: Kustomization\n" +
		"resources:\n  - " + relRoot + "\n" +
		"components:\n  - " + relCrew + "\n"
	require.NoError(t, os.WriteFile(filepath.Join(overlayDir, "kustomization.yaml"), []byte(overlay), 0o644))

	return renderKustomize(t, bin, overlayDir)
}

func TestCrewOutboxTopicIsCrewScoped(t *testing.T) {
	bin := kustomizeBin(t)
	kustomizeDir := thisDir(t)

	for _, branchSlug := range []string{"crew-daniel", "crew-yafet"} {
		t.Run(branchSlug, func(t *testing.T) {
			rendered := renderCrewOverlay(t, bin, kustomizeDir)
			data := crewWikiEnv(t, rendered)
			topic := data["KAFKA_OUTBOX_TOPIC"]
			require.True(t, strings.HasPrefix(topic, "wiki-events."), "crew outbox topic must use the wiki-events prefix")
			require.NotEqual(t, prodWikiEventsTopic, topic, "crew must not publish to the production topic")
			require.NotEqual(t, devWikiEventsTopic, topic, "crew must not publish to the development topic")
			requireWikiConfigMapConsumed(t, rendered)
		})
	}
}

func crewWikiEnv(t *testing.T, rendered string) map[string]string {
	t.Helper()
	dec := yaml.NewDecoder(strings.NewReader(rendered))
	for {
		var doc map[string]any
		if err := dec.Decode(&doc); err != nil {
			break
		}
		if doc == nil || doc["kind"] != "ConfigMap" {
			continue
		}
		meta, _ := doc["metadata"].(map[string]any)
		if meta["name"] != "orvex-wiki-env" {
			continue
		}
		data, _ := doc["data"].(map[string]any)
		result := make(map[string]string, len(data))
		for key, value := range data {
			if text, ok := value.(string); ok {
				result[key] = text
			}
		}
		return result
	}
	t.Fatal("orvex-wiki-env ConfigMap not found in crew render")
	return nil
}

func TestCrewPostureIsCloudFalseForBothNamedCrewCells(t *testing.T) {
	bin := kustomizeBin(t)
	kustomizeDir := thisDir(t)

	for _, branchSlug := range []string{"crew-daniel", "crew-yafet"} {
		t.Run(branchSlug, func(t *testing.T) {
			data := crewWikiEnv(t, renderCrewOverlay(t, bin, kustomizeDir))
			require.Equal(t, "false", data["CLOUD"], "crew posture must disable cloud enforcement")
			require.Equal(t, "solo", data["CELL_ID"], "crew retains its intentional sentinel cell")
		})
	}
}
