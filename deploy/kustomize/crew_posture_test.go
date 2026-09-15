package kustomize

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
	"gopkg.in/yaml.v3"
)

// renderCrewOverlay renders the same base + crew component shape that the CMP
// plugin assembles for a crew application.
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

// renderCrewApplication renders crew in the order the CMP really assembles it:
// idp-render prepare rewrites cluster-config's branchSlug and APPENDS
// components/crew to the ROOT kustomization's own components list, so the root
// replacements run AFTER the crew component. renderCrewOverlay layers the
// component over an already-built root instead, which runs the root
// replacements first and so cannot see a crew-labelled field the root
// deliberately skips — exactly how the literal CELLTOKEN on the collab route
// reached the API server unnoticed.
func renderCrewApplication(t *testing.T, bin, kustomizeDir, branchSlug string) string {
	t.Helper()
	appDir := filepath.Join(t.TempDir(), "kustomize")
	require.NoError(t, os.CopyFS(appDir, os.DirFS(kustomizeDir)))

	rewrite := func(name string, pattern *regexp.Regexp, replacement string) {
		path := filepath.Join(appDir, name)
		raw, err := os.ReadFile(path)
		require.NoError(t, err)
		require.Truef(t, pattern.Match(raw), "%s no longer has the shape idp-render prepare edits (%s)", name, pattern)
		require.NoError(t, os.WriteFile(path, pattern.ReplaceAll(raw, []byte(replacement)), 0o644))
	}
	rewrite("cluster-config.yaml", regexp.MustCompile(`(?m)^  branchSlug: .*$`), "  branchSlug: "+branchSlug)
	rewrite("kustomization.yaml", regexp.MustCompile(`(?m)^components:\n(?:  - .*\n)+`), "${0}  - components/crew\n")

	return renderKustomize(t, bin, appDir)
}

func TestCrewCollabRouteIsCrewHosted(t *testing.T) {
	bin := kustomizeBin(t)
	kustomizeDir := thisDir(t)

	for _, branchSlug := range []string{"crew-daniel", "crew-yafet"} {
		t.Run(branchSlug, func(t *testing.T) {
			rendered := renderCrewApplication(t, bin, kustomizeDir, branchSlug)
			require.False(t, strings.Contains(rendered, "CELLTOKEN"), "crew render leaked an unsubstituted CELLTOKEN placeholder")

			routes := renderedHTTPRoutes(t, rendered)
			for name, host := range map[string]string{
				"orvex-wiki":        "wiki." + branchSlug + ".orvex.dev",
				"orvex-wiki-collab": "collab." + branchSlug + ".orvex.dev",
			} {
				route, ok := routes[name]
				require.Truef(t, ok, "crew render is missing HTTPRoute %q", name)
				require.Equal(t, []string{host}, route.Spec.Hostnames)
				require.Equal(t, host, route.Metadata.Annotations["external-dns.alpha.kubernetes.io/hostname"])
				require.Len(t, route.Spec.ParentRefs, 1)
				require.Equal(t, "orvex-dev-https", route.Spec.ParentRefs[0].SectionName)
			}
			require.Equal(t, "false", routes["orvex-wiki-collab"].Metadata.Annotations["external-dns.alpha.kubernetes.io/cloudflare-proxied"])

			data := crewWikiEnv(t, rendered)
			require.Equal(t, "https://wiki."+branchSlug+".orvex.dev", data["APP_URL"])
			require.Equal(t, "https://collab."+branchSlug+".orvex.dev", data["COLLAB_URL"],
				"crew must open its collab socket on its own crew host, never a cell host")
		})
	}
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
