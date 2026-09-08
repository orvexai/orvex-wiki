package kustomize

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
	"gopkg.in/yaml.v3"
)

// renderCrewOverlay renders the base + crew component shape that the CMP
// plugin assembles for one named crew application. The CMP normally rewrites
// cluster-config before Kustomize runs; this test does the same in its
// throwaway overlay so each named branch exercises its own replacements.
func renderCrewOverlay(t *testing.T, bin, kustomizeDir, branchSlug string) string {
	t.Helper()
	deployDir := filepath.Dir(kustomizeDir)
	overlayDir, err := os.MkdirTemp(deployDir, "render-gate-crew-")
	require.NoError(t, err)
	t.Cleanup(func() { _ = os.RemoveAll(overlayDir) })

	// Kustomize processes a component's replacements before patches on this
	// outer overlay. A patch to cluster-config here would therefore arrive too
	// late to feed the crew component. Copy the real root into the throwaway
	// overlay and rewrite only the two values idp-render supplies before the
	// build starts.
	crewRoot := filepath.Join(overlayDir, "kustomize")
	require.NoError(t, os.CopyFS(crewRoot, os.DirFS(kustomizeDir)))
	clusterConfigPath := filepath.Join(crewRoot, "cluster-config.yaml")
	clusterConfig, err := os.ReadFile(clusterConfigPath)
	require.NoError(t, err)
	clusterConfigText := string(clusterConfig)
	clusterNamespace := "orvex-wiki-" + branchSlug
	clusterConfigText = strings.Replace(clusterConfigText, "appNamespace: orvex-wiki\n", "appNamespace: "+clusterNamespace+"\n", 1)
	clusterConfigText = strings.Replace(clusterConfigText, "branchSlug: main\n", "branchSlug: "+branchSlug+"\n", 1)
	require.Contains(t, clusterConfigText, "appNamespace: "+clusterNamespace+"\n")
	require.Contains(t, clusterConfigText, "branchSlug: "+branchSlug+"\n")
	require.NoError(t, os.WriteFile(clusterConfigPath, []byte(clusterConfigText), 0o644))

	// The CMP appends the resource-profile component to this list before the
	// root replacements run. Mirror that ordering in the copied root.
	kustomizationPath := filepath.Join(crewRoot, "kustomization.yaml")
	kustomization, err := os.ReadFile(kustomizationPath)
	require.NoError(t, err)
	kustomizationText := strings.Replace(
		string(kustomization),
		"  - components/telemetry-env\n",
		"  - components/telemetry-env\n  - components/crew\n",
		1,
	)
	require.Contains(t, kustomizationText, "  - components/crew\n")
	require.NoError(t, os.WriteFile(kustomizationPath, []byte(kustomizationText), 0o644))

	return renderKustomize(t, bin, crewRoot)
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

func requireCrewHosts(t *testing.T, rendered, branchSlug string) {
	t.Helper()
	data := crewWikiEnv(t, rendered)
	expectedHosts := map[string]string{
		"ORVEX_IDENTITY_URL":    "https://identity." + branchSlug + ".orvex.dev",
		"ORVEX_KNOWLEDGE_URL":   "https://knowledge." + branchSlug + ".orvex.dev",
		"ORVEX_AI_URL":          "https://ai." + branchSlug + ".orvex.dev",
		"ORVEX_BILLING_API_URL": "https://billing." + branchSlug + ".orvex.dev",
		"ORVEX_MCP_URL":         "https://mcp." + branchSlug + ".orvex.dev",
		"ORVEX_CONSOLE_URL":     "https://console." + branchSlug + ".orvex.dev",
		"ORVEX_WIKI_API_URL":    "https://wiki-api." + branchSlug + ".orvex.dev",
	}
	for key, expected := range expectedHosts {
		require.Equal(t, expected, data[key], "%s must resolve to the rendered crew branch", key)
	}
	require.Equal(t, "https://wiki."+branchSlug+".orvex.dev", data["APP_URL"])

	dec := yaml.NewDecoder(strings.NewReader(rendered))
	for {
		var doc map[string]any
		if err := dec.Decode(&doc); err != nil {
			break
		}
		if doc == nil || doc["kind"] != "HTTPRoute" {
			continue
		}
		meta, _ := doc["metadata"].(map[string]any)
		if meta["name"] != "orvex-wiki" {
			continue
		}
		spec, _ := doc["spec"].(map[string]any)
		hostnames, _ := spec["hostnames"].([]any)
		require.Len(t, hostnames, 1)
		require.Equal(t, "wiki."+branchSlug+".orvex.dev", hostnames[0])
		annotations, _ := meta["annotations"].(map[string]any)
		require.Equal(t, "wiki."+branchSlug+".orvex.dev", annotations["external-dns.alpha.kubernetes.io/hostname"])
		return
	}
	t.Fatal("crew wiki HTTPRoute not found in crew render")
}

func TestCrewPostureIsCloudFalseForBothNamedCrewCells(t *testing.T) {
	bin := kustomizeBin(t)
	kustomizeDir := thisDir(t)

	for _, branchSlug := range []string{"crew-daniel", "crew-yafet"} {
		t.Run(branchSlug, func(t *testing.T) {
			rendered := renderCrewOverlay(t, bin, kustomizeDir, branchSlug)
			data := crewWikiEnv(t, rendered)
			require.Equal(t, "false", data["CLOUD"], "crew posture must disable cloud enforcement")
			require.Equal(t, "solo", data["CELL_ID"], "crew retains its intentional sentinel cell")
			require.Equal(t, branchSlug, data["EVENT_TOPIC_SUFFIX"], "crew event topics must be isolated by branch")
			requireCrewHosts(t, rendered, branchSlug)
		})
	}
}
