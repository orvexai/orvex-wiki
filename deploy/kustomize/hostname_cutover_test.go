// Package kustomize hosts the deploy-tree render gate for ENG-1505 (M14 —
// short-cell DNS/cert cutover to wiki.eu1).
//
// TestHttpRouteHostnameShortCellToken is the ONE named binary DoD gate: it
// renders the real GitOps overlays (base = prod, base+components/staging =
// dev) with the actual `kustomize` binary — no mock, no fixture — and
// asserts every emitted public hostname carries the short cell token
// (`eu1`), never the AWS-AZ cell id (`eu-central-1`), while the INTERNAL
// AZ id (clusterName/clusterDomain in cluster-config.yaml) stays untouched.
package kustomize

import (
	"bytes"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
	"gopkg.in/yaml.v3"
)

// shortCellTokenHostname is the ONLY shape a public wiki hostname may take
// post-cutover (AC1). Internal AZ ids (eu-central-1) are never public.
var shortCellTokenHostname = regexp.MustCompile(`^wiki\.eu1\.orvex\.(ai|dev)$`)

// kustomizeBin resolves the `kustomize` binary the same way CI's
// k8s-validate job does (go install sigs.k8s.io/kustomize/kustomize/v5),
// falling back to PATH for local runs.
func kustomizeBin(t *testing.T) string {
	t.Helper()
	if p, err := exec.LookPath("kustomize"); err == nil {
		return p
	}
	if gopath, err := exec.Command("go", "env", "GOPATH").Output(); err == nil {
		candidate := filepath.Join(strings.TrimSpace(string(gopath)), "bin", "kustomize")
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
	}
	t.Fatal("kustomize binary not found on PATH or $GOPATH/bin — install sigs.k8s.io/kustomize/kustomize/v5 (see .github/workflows/ci.yml k8s-validate job)")
	return ""
}

// thisDir is the directory this test file lives in: deploy/kustomize.
func thisDir(t *testing.T) string {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	require.True(t, ok, "runtime.Caller failed to resolve test file path")
	return filepath.Dir(file)
}

// renderKustomize behaviour-through-interface renders a kustomize root with
// the real binary (in-process w.r.t. the test, true CLI w.r.t. kustomize —
// no mock of Kustomize internals per CS §5d) and fails loudly on any error.
func renderKustomize(t *testing.T, bin, dir string) string {
	t.Helper()
	cmd := exec.Command(bin, "build", "--load-restrictor", "LoadRestrictionsNone", dir)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	require.NoErrorf(t, err, "kustomize build %s failed: %s", dir, stderr.String())
	return stdout.String()
}

// renderStagingOverlay renders base+components/staging (the dev environment)
// by materializing a throwaway overlay kustomization next to the kustomize
// root (a sibling under deploy/, never inside deploy/kustomize itself —
// kustomize rejects a root that would recurse into its own subtree).
func renderStagingOverlay(t *testing.T, bin, kustomizeDir string) string {
	t.Helper()
	deployDir := filepath.Dir(kustomizeDir)
	overlayDir, err := os.MkdirTemp(deployDir, "render-gate-staging-")
	require.NoError(t, err)
	t.Cleanup(func() { _ = os.RemoveAll(overlayDir) })

	relRoot, err := filepath.Rel(overlayDir, kustomizeDir)
	require.NoError(t, err)
	relStaging, err := filepath.Rel(overlayDir, filepath.Join(kustomizeDir, "components", "staging"))
	require.NoError(t, err)

	overlay := "apiVersion: kustomize.config.k8s.io/v1beta1\n" +
		"kind: Kustomization\n" +
		"resources:\n  - " + relRoot + "\n" +
		"components:\n  - " + relStaging + "\n"
	require.NoError(t, os.WriteFile(filepath.Join(overlayDir, "kustomization.yaml"), []byte(overlay), 0o644))

	return renderKustomize(t, bin, overlayDir)
}

// publicHostnames walks a rendered multi-doc YAML stream and collects every
// value that names a PUBLIC hostname: HTTPRoute.spec.hostnames[*] and the
// external-dns hostname annotation. It deliberately does NOT collect
// cluster-internal fields (clusterName, clusterDomain, harborHost, image
// refs) — AC4 requires those to stay on the AWS-AZ id.
func publicHostnames(t *testing.T, rendered string) []string {
	t.Helper()
	var hostnames []string
	dec := yaml.NewDecoder(strings.NewReader(rendered))
	for {
		var doc map[string]any
		if err := dec.Decode(&doc); err != nil {
			break
		}
		if doc == nil {
			continue
		}
		kind, _ := doc["kind"].(string)
		if kind != "HTTPRoute" {
			continue
		}
		if spec, ok := doc["spec"].(map[string]any); ok {
			if hs, ok := spec["hostnames"].([]any); ok {
				for _, h := range hs {
					if s, ok := h.(string); ok {
						hostnames = append(hostnames, s)
					}
				}
			}
		}
		if meta, ok := doc["metadata"].(map[string]any); ok {
			if annotations, ok := meta["annotations"].(map[string]any); ok {
				if h, ok := annotations["external-dns.alpha.kubernetes.io/hostname"].(string); ok {
					hostnames = append(hostnames, h)
				}
			}
		}
	}
	return hostnames
}

// TestHttpRouteHostnameShortCellToken is the named binary DoD gate
// (ENG-1505). AC1/AC2/AC5 render assertions; AC4 boundary assertion reads
// the build-time-only cluster-config.yaml source directly since it is
// excluded from kustomize's rendered output (local-config: true).
func TestHttpRouteHostnameShortCellToken(t *testing.T) {
	bin := kustomizeBin(t)
	kustomizeDir := thisDir(t)

	prodRendered := renderKustomize(t, bin, kustomizeDir)
	devRendered := renderStagingOverlay(t, bin, kustomizeDir)

	t.Run("AC1_prod_and_dev_hostnames_carry_short_cell_token", func(t *testing.T) {
		all := append(publicHostnames(t, prodRendered), publicHostnames(t, devRendered)...)
		require.NotEmpty(t, all, "no public hostnames found in rendered output — render gate is not exercising the HTTPRoute")
		for _, h := range all {
			require.Truef(t, shortCellTokenHostname.MatchString(h),
				"public hostname %q does not match ^wiki\\.eu1\\.orvex\\.(ai|dev)$", h)
		}
	})

	t.Run("AC2_no_legacy_az_public_hostname", func(t *testing.T) {
		require.NotContains(t, prodRendered, "wiki.eu-central-1", "legacy AZ-id public hostname leaked into the prod render")
		require.NotContains(t, devRendered, "wiki.eu-central-1", "legacy AZ-id public hostname leaked into the dev render")
		for _, h := range append(publicHostnames(t, prodRendered), publicHostnames(t, devRendered)...) {
			require.NotContains(t, h, "eu-central-1", "public hostname %q carries the AWS-AZ cell id", h)
		}
	})

	t.Run("AC4_internal_az_id_untouched", func(t *testing.T) {
		raw, err := os.ReadFile(filepath.Join(kustomizeDir, "cluster-config.yaml"))
		require.NoError(t, err)
		var cfg struct {
			Data map[string]string `yaml:"data"`
		}
		require.NoError(t, yaml.Unmarshal(raw, &cfg))
		require.Equal(t, "eu-central-1", cfg.Data["clusterName"], "internal clusterName must stay the AWS-AZ id, never the short cell token")
		require.Equal(t, "eu-central-1.myidp.cloud", cfg.Data["clusterDomain"], "internal clusterDomain must stay the AWS-AZ id")
		require.Equal(t, "wiki.eu1.orvex.ai", cfg.Data["wikiHost"], "public wikiHost must carry the short cell token")
	})

	t.Run("AC5_cell_token_single_source", func(t *testing.T) {
		// The literal "eu1" token must be typed in exactly ONE file —
		// cluster-config.yaml's `cellToken` field — and reach every
		// consumer (base HTTPRoute + the staging-overlay dev HTTPRoute) by
		// kustomize `replacements`, never by re-typing the literal. A future
		// 2nd cell (e.g. eu2) composes by editing cellToken alone.
		deployDir := filepath.Dir(kustomizeDir)
		allowed := map[string]bool{
			filepath.Join(kustomizeDir, "cluster-config.yaml"): true,
		}
		err := filepath.Walk(deployDir, func(path string, info os.FileInfo, err error) error {
			if err != nil || info.IsDir() {
				return err
			}
			if !strings.HasSuffix(path, ".yaml") {
				return nil
			}
			if strings.Contains(path, "render-gate-staging-") {
				return nil // our own throwaway overlay, not part of the deploy tree
			}
			raw, rerr := os.ReadFile(path)
			if rerr != nil {
				return rerr
			}
			if strings.Contains(string(raw), "eu1") && !allowed[path] {
				t.Errorf("unexpected cell-token literal %q found outside cluster-config.yaml — the token must be sourced via replacements, not re-typed", path)
			}
			return nil
		})
		require.NoError(t, err)

		// Functional proof the replacement chain actually wires up (not just
		// an absence of the literal): both renders must carry CELL_TOKEN=eu1
		// on the orvex-wiki-env ConfigMap, propagated from cluster-config's
		// single cellToken source through the ConfigMap into the component.
		for _, rendered := range []string{prodRendered, devRendered} {
			dec := yaml.NewDecoder(strings.NewReader(rendered))
			found := false
			for {
				var doc map[string]any
				if err := dec.Decode(&doc); err != nil {
					break
				}
				if doc == nil {
					continue
				}
				if kind, _ := doc["kind"].(string); kind != "ConfigMap" {
					continue
				}
				meta, _ := doc["metadata"].(map[string]any)
				if name, _ := meta["name"].(string); name != "orvex-wiki-env" {
					continue
				}
				data, _ := doc["data"].(map[string]any)
				require.Equal(t, "eu1", data["CELL_TOKEN"], "orvex-wiki-env CELL_TOKEN must be sourced from cluster-config.cellToken")
				found = true
			}
			require.True(t, found, "orvex-wiki-env ConfigMap not found in render")
		}
	})
}
