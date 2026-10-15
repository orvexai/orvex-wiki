package kustomize

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"testing"

	"github.com/stretchr/testify/require"
)

// renderCrewVMVariant renders the crew profile the way idp-render does for
// orvex-wiki-crew-yafet: base components, then components/crew, then (when
// withVM) components/crew-vm-backend.
func renderCrewVMVariant(t *testing.T, withVM bool) []renderedDoc {
	t.Helper()
	bin := kustomizeBin(t)
	appDir := filepath.Join(t.TempDir(), "kustomize")
	require.NoError(t, os.CopyFS(appDir, os.DirFS(thisDir(t))))

	configPath := filepath.Join(appDir, "cluster-config.yaml")
	config, err := os.ReadFile(configPath)
	require.NoError(t, err)
	config = regexp.MustCompile(`(?m)^  appNamespace: .*?$`).ReplaceAll(config, []byte("  appNamespace: orvex-wiki-crew-yafet"))
	config = regexp.MustCompile(`(?m)^  branchSlug: .*?$`).ReplaceAll(config, []byte("  branchSlug: crew-yafet"))
	require.NoError(t, os.WriteFile(configPath, config, 0o644))

	extra := "  - components/crew\n"
	if withVM {
		extra += "  - components/crew-vm-backend\n"
	}
	kpath := filepath.Join(appDir, "kustomization.yaml")
	k, err := os.ReadFile(kpath)
	require.NoError(t, err)
	k = regexp.MustCompile(`(?m)^(components:\n(?:  - .*\n)+)`).ReplaceAll(k, []byte("${1}"+extra))
	require.NoError(t, os.WriteFile(kpath, k, 0o644))

	return decodeRendered(t, renderKustomize(t, bin, appDir))
}

func findDoc(docs []renderedDoc, kind, name string) map[string]any {
	for _, d := range docs {
		if d.kind == kind && d.name == name {
			return d.doc
		}
	}
	return nil
}

func TestCrewPodBackendStaysDefault(t *testing.T) {
	docs := renderCrewVMVariant(t, false)
	require.NotNil(t, findDoc(docs, "Deployment", "orvex-wiki"))
	require.Nil(t, findDoc(docs, "ConfigMap", "orvex-wiki-vm-env"))
	svc := findDoc(docs, "Service", "orvex-wiki")
	require.Equal(t, map[string]any{"app.kubernetes.io/name": "orvex-wiki"}, svc["spec"].(map[string]any)["selector"])

	prod := decodeRendered(t, renderKustomize(t, kustomizeBin(t), thisDir(t)))
	require.NotNil(t, findDoc(prod, "Deployment", "orvex-wiki"))
	require.Nil(t, findDoc(prod, "ConfigMap", "orvex-wiki-vm-env"))
}

func TestCrewVMBackendSelectsVMIAndDropsPodObjects(t *testing.T) {
	pod := renderCrewVMVariant(t, false)
	docs := renderCrewVMVariant(t, true)

	require.Nil(t, findDoc(docs, "Deployment", "orvex-wiki"))
	require.Nil(t, findDoc(docs, "ServiceAccount", "orvex-wiki"))
	require.Nil(t, findDoc(docs, "PodDisruptionBudget", "orvex-wiki"))

	spec := findDoc(docs, "Service", "orvex-wiki")["spec"].(map[string]any)
	require.Equal(t, map[string]any{"orvex.ai/crew-service": "orvex-wiki", "vm.kubevirt.io/name": "crew"}, spec["selector"])
	port := spec["ports"].([]any)[0].(map[string]any)
	require.Equal(t, 3000, port["port"], "HTTPRoutes reference Service port 3000")
	require.Equal(t, 8080, port["targetPort"], "the crew VM exposes 8080 only")

	env := findDoc(docs, "ConfigMap", "orvex-wiki-env")
	require.Equal(t, "8080", env["data"].(map[string]any)["PORT"])

	vmEnv := findDoc(docs, "ConfigMap", "orvex-wiki-vm-env")
	require.NotNil(t, vmEnv)
	require.Equal(t, "orvex-wiki-crew-yafet", vmEnv["metadata"].(map[string]any)["namespace"])
	var got []any
	require.NoError(t, json.Unmarshal([]byte(vmEnv["data"].(map[string]any)["envFrom"].(string)), &got))

	// Must match the pod Deployment's rendered envFrom exactly.
	dep := findDoc(pod, "Deployment", "orvex-wiki")
	want := containersOf(t, dep)[0]["envFrom"]
	wantJSON, _ := json.Marshal(want)
	gotJSON, _ := json.Marshal(got)
	require.JSONEq(t, string(wantJSON), string(gotJSON))
}
