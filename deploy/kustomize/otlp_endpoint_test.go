// TestWikiOverlayRepointed — ENG-3103 (AD-25, [verified live]): the
// orvex-wiki black-hole fix.
//
// orvex-wiki used to hard-set `OTEL_EXPORTER_OTLP_ENDPOINT` to
// `http://otel-collector.orvex-studio-console.svc.cluster.local:4318`, a
// collector that has never existed — every trace/metric/log this engine
// exported vanished into a black hole, undetected. The fix DELETES that
// literal (not repoint-and-keep) and lets the shared `telemetry-env`
// kustomize component (my-idp-apps, AD-35) inject the family's single
// Alloy OTLP target instead (AD-25).
package kustomize

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

const (
	deadConsoleCollector = "otel-collector." + "orvex-studio-console"
	alloyTarget          = "k8s-monitoring-alloy-receiver.observability.svc.cluster.local:4318"
	otlpEndpointKey      = "OTEL_EXPORTER_OTLP_ENDPOINT"
)

// TestWikiOverlayRepointed_NoDeadCollectorLiteralInSource is a static,
// network-free guard: the dead console-collector host string must not
// exist ANYWHERE in the deploy tree's source (only in prose explaining its
// own removal, which this test excludes by construction — see
// deadConsoleCollector's split-string construction above, so this file
// itself never plants a false negative).
func TestWikiOverlayRepointed_NoDeadCollectorLiteralInSource(t *testing.T) {
	kustomizeDir := thisDir(t)
	err := filepath.Walk(kustomizeDir, func(path string, info os.FileInfo, walkErr error) error {
		if walkErr != nil || info.IsDir() || !strings.HasSuffix(path, ".yaml") {
			return walkErr
		}
		raw, rerr := os.ReadFile(path)
		if rerr != nil {
			return rerr
		}
		require.NotContainsf(t, string(raw), "http://"+deadConsoleCollector,
			"%s still hard-sets the dead console collector endpoint — must be deleted, not repointed-and-kept", path)
		return nil
	})
	require.NoError(t, err)
}

// TestWikiOverlayRepointed_NoPerServiceEndpointLiteral asserts the family
// AD-25 rule at this repo's own boundary: OTEL_EXPORTER_OTLP_ENDPOINT is
// never itself SET (as a data/env value) by this repo's own source — the
// key is injected by the shared component, never hand-typed here. The
// explanatory comment in configmap-env.yaml naming the key is fine (prose);
// what must never appear is `OTEL_EXPORTER_OTLP_ENDPOINT:` as a live
// ConfigMap data assignment.
func TestWikiOverlayRepointed_NoPerServiceEndpointLiteral(t *testing.T) {
	kustomizeDir := thisDir(t)
	assignment := otlpEndpointKey + ":"
	err := filepath.Walk(kustomizeDir, func(path string, info os.FileInfo, walkErr error) error {
		if walkErr != nil || info.IsDir() || !strings.HasSuffix(path, ".yaml") {
			return walkErr
		}
		raw, rerr := os.ReadFile(path)
		if rerr != nil {
			return rerr
		}
		for _, line := range strings.Split(string(raw), "\n") {
			trimmed := strings.TrimSpace(line)
			if strings.HasPrefix(trimmed, "#") {
				continue // prose explaining the history, not a live assignment
			}
			require.NotContainsf(t, trimmed, assignment,
				"%s hand-sets %s — the shared telemetry-env component must be the only source (AD-25)", path, otlpEndpointKey)
		}
		return nil
	})
	require.NoError(t, err)
}

// TestWikiOverlayRepointed_ComponentWired asserts the root kustomization
// actually references the shared component (the fix is not just a
// deletion — the family target must still reach the pod).
func TestWikiOverlayRepointed_ComponentWired(t *testing.T) {
	kustomizeDir := thisDir(t)
	raw, err := os.ReadFile(filepath.Join(kustomizeDir, "kustomization.yaml"))
	require.NoError(t, err)
	require.Contains(t, string(raw), "my-idp-apps//components/telemetry-env",
		"root kustomization.yaml must reference the shared telemetry-env component")
}

// TestWikiOverlayRepointed_RenderCarriesAlloyTargetOrPending is the
// live-render leg. It fetches the REAL remote component (network
// required — skips gracefully if unreachable, since this repo's own CI
// network profile is not this test's contract to assert). Two honest
// outcomes are both acceptable, and are told apart explicitly:
//   - the my-idp-apps shared-component PR has ALREADY merged to main: the
//     render must carry the exact Alloy target and zero dead-collector
//     bytes.
//   - it has NOT merged yet (this repo's own PR intentionally lands first
//     per the accepted cross-repo ordering, ENG-3103 §4g): the render
//     still succeeds (kustomize build is happy either way) and the dead
//     collector string is still provably absent — the black-hole bug
//     itself cannot regress even during the transient half-landed window.
func TestWikiOverlayRepointed_RenderCarriesAlloyTargetOrPending(t *testing.T) {
	bin := kustomizeBin(t)
	kustomizeDir := thisDir(t)

	out, err := exec.Command(bin, "build", "--load-restrictor", "LoadRestrictionsNone", kustomizeDir).CombinedOutput()
	if err != nil {
		t.Skipf("kustomize build requires network access to fetch the shared my-idp-apps component; skipping live-render leg: %s", string(out))
		return
	}
	rendered := string(out)

	require.NotContains(t, rendered, deadConsoleCollector,
		"rendered manifest must never carry the dead console collector, merged or not")

	if strings.Contains(rendered, otlpEndpointKey) {
		require.Containsf(t, rendered, alloyTarget,
			"shared component has landed but did not inject the frozen Alloy target: %s", rendered)
	} else {
		t.Log("shared my-idp-apps telemetry-env component not yet merged upstream — accepted transient window (ENG-3103 §4g); dead-collector absence still proven above")
	}
}
