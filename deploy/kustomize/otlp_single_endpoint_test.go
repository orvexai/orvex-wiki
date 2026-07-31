// ENG-3103 (AD-25 [verified live], AD-35, PO-2026-07-30-1) — the orvex-wiki
// leg of "the ONE OTLP endpoint", asserted on the REAL render.
//
// History this test exists to make un-repeatable. This engine's ~1,918 LOC of
// OTel exported into a collector in the orvex-studio-console namespace that
// exists in no namespace at all, so every span, metric and log was silently
// discarded and nothing in CI noticed. The first fix (PR #135)
// referenced my-idp-apps' shared telemetry component CROSS-REPO and was
// reverted the same day (ef16602f): this repo is PUBLIC, its CI runs on
// `public-runners`, and those hold no credential for the PRIVATE my-idp-apps,
// so `kustomize build` died on `could not read Username`. The workaround that
// followed hand-set OTEL_EXPORTER_OTLP_ENDPOINT as a per-service literal in
// app-manifests/configmap-env.yaml — the correct VALUE in the one PLACE AD-25
// forbids — and CI was green for that too.
//
// Both shapes are now closed by construction: the component is MATERIALIZED
// in-repo (PO-2026-07-30-1; `./manifest-copy-check.sh` holds the copy
// byte-identical to the canonical), and this gate asserts the RESULT rather
// than the mechanism.
//
// Behaviour-through-interface: every assertion below reads the rendered
// manifest stream a cluster would receive, or the deploy sources an author
// edits — never the wiring in between. Renaming the component, moving it, or
// swapping kustomize for something else leaves this test meaningful.
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

const (
	// otlpEnvVar is the one variable AD-25 governs. A service READS it and
	// never CHOOSES it.
	otlpEnvVar = "OTEL_EXPORTER_OTLP_ENDPOINT"

	// alloyTarget is the ONE family app-telemetry OTLP target (AD-25,
	// verified live against my-idp platform/apps/observability/
	// k8s-monitoring/values.yaml, chart grafana/k8s-monitoring v3.7.1). It is
	// cluster-local Service DNS and carries no cell token, so it is identical
	// in every cell (cell contract JGAUQRsw2g rule 1).
	alloyTarget = "http://k8s-monitoring-alloy-receiver.observability.svc.cluster.local:4318"

	// sharedTelemetryConfigMap is the name of the ConfigMap carried by the
	// materialized shared component. Its single key IS the env var name, so
	// an `envFrom` reference maps it 1:1 and no manifest in this repo has to
	// type the variable.
	sharedTelemetryConfigMap = "telemetry-env"

	// materializedComponentPath is the ONLY file in the deploy tree allowed
	// to contain the variable name: the byte-identical copy of my-idp-apps'
	// canonical component, governed by ./manifest-copy-check.sh.
	materializedComponentPath = "components/telemetry-env/configmap.yaml"
)

// otlpSetterLine matches a line that SETS the variable, in each of the three
// shapes a kustomize deploy tree can express it:
//
//	OTEL_EXPORTER_OTLP_ENDPOINT: "..."          a ConfigMap / chart-values key
//	- name: OTEL_EXPORTER_OTLP_ENDPOINT         a container `env:` entry, or the
//	                                            `value:` half of a JSON6902 patch
//	- OTEL_EXPORTER_OTLP_ENDPOINT=...           a configMapGenerator literal
//
// A bare MENTION is deliberately not a violation. AD-25 governs who SETS the
// value, and both the materialized component's own header and the note left in
// app-manifests/configmap-env.yaml explaining why the key is gone name the
// variable in prose — banning the word would force those explanations out and
// leave the next author with no record of why the obvious edit is wrong.
var otlpSetterLine = regexp.MustCompile(`(^|[\s"'-])` + otlpEnvVar + `\s*[:=]`)

// otlpEnvEntryLine matches the container-env shape, where the variable is the
// VALUE of a `name:` key rather than a key itself.
var otlpEnvEntryLine = regexp.MustCompile(`name\s*:\s*["']?` + otlpEnvVar)

// phantomCollectorHosts are the two OTLP hosts AD-25 names as never-valid for
// family app telemetry. The first does not exist at all (the black hole this
// ticket closes); the second exists but is LLM-scoped — a different product,
// zero family consumers, and explicitly "not a fallback".
var phantomCollectorHosts = []string{
	"otel-collector.orvex-studio-console",
	"otel-collector.otel.svc",
}

// renderedDoc is one document of a rendered multi-doc YAML stream, decoded
// only as far as these assertions need.
type renderedDoc struct {
	kind string
	name string
	doc  map[string]any
}

func decodeRendered(t *testing.T, rendered string) []renderedDoc {
	t.Helper()
	var docs []renderedDoc
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
		name := ""
		if meta, ok := doc["metadata"].(map[string]any); ok {
			name, _ = meta["name"].(string)
		}
		docs = append(docs, renderedDoc{kind: kind, name: name, doc: doc})
	}
	require.NotEmpty(t, docs, "the render decoded to zero documents — there is nothing here to rule on")
	return docs
}

// assertOneEndpointFromSharedComponent is the per-environment body. It runs
// against every environment this repo renders, because "the dev overlay
// patched it back" is exactly the kind of divergence a base-only assertion
// misses.
func assertOneEndpointFromSharedComponent(t *testing.T, env, rendered string) {
	t.Helper()

	// (1) The phantom hosts appear NOWHERE in the stream. Checked on the raw
	// text, not the decoded docs, so a host hiding in an annotation, a
	// comment-shaped string or a field this test does not model still reds.
	for _, host := range phantomCollectorHosts {
		require.NotContainsf(t, rendered, host, "%s: the rendered manifest still names %q — AD-25 deletes these targets, it does not repoint-and-keep them", env, host)
	}

	// (2) Exactly ONE document sets the variable, and it is the shared
	// component's ConfigMap. A second setter anywhere — a per-service
	// ConfigMap, a Deployment `env:` entry, a chart value — is the shape
	// AD-25 forbids and the shape that shipped on 2026-07-24.
	var setters []string
	for _, d := range decodeRendered(t, rendered) {
		if strings.Contains(mustMarshal(t, d.doc), otlpEnvVar) {
			setters = append(setters, d.kind+"/"+d.name)
		}
	}
	require.Equalf(t, []string{"ConfigMap/" + sharedTelemetryConfigMap}, setters,
		"%s: %s must be set by exactly one rendered document — the shared component's ConfigMap/%s — and by nothing else (AD-25: injected by the shared deploy layer, never by a per-service manifest)",
		env, otlpEnvVar, sharedTelemetryConfigMap)

	// (3) That one setter carries the ONE target, verbatim.
	for _, d := range decodeRendered(t, rendered) {
		if d.kind != "ConfigMap" || d.name != sharedTelemetryConfigMap {
			continue
		}
		data, ok := d.doc["data"].(map[string]any)
		require.Truef(t, ok, "%s: ConfigMap/%s has no data block", env, sharedTelemetryConfigMap)
		require.Equalf(t, alloyTarget, data[otlpEnvVar], "%s: the shared telemetry ConfigMap must carry the ONE Alloy target verbatim", env)
	}

	// (4) The value REACHES the pod. A rendered ConfigMap nobody consumes is
	// the same silent nothing as the black hole — so every workload container
	// must actually pull the shared ConfigMap in via envFrom. This is the leg
	// that would red if the component's JSON6902 envFrom patch ever stopped
	// matching this repo's Deployment shape.
	workloads := 0
	for _, d := range decodeRendered(t, rendered) {
		if d.kind != "Deployment" {
			continue
		}
		workloads++
		for i, c := range containersOf(t, d.doc) {
			require.Truef(t, envFromNames(c)[sharedTelemetryConfigMap],
				"%s: Deployment/%s containers[%d] does not envFrom the shared ConfigMap/%s — the endpoint is rendered but never reaches the process",
				env, d.name, i, sharedTelemetryConfigMap)
		}
	}
	require.Positivef(t, workloads, "%s: the render contains no Deployment, so the envFrom assertion above proved nothing", env)
}

func mustMarshal(t *testing.T, doc map[string]any) string {
	t.Helper()
	b, err := yaml.Marshal(doc)
	require.NoError(t, err)
	return string(b)
}

func containersOf(t *testing.T, doc map[string]any) []map[string]any {
	t.Helper()
	spec, ok := doc["spec"].(map[string]any)
	require.True(t, ok, "workload has no spec")
	tmpl, ok := spec["template"].(map[string]any)
	require.True(t, ok, "workload has no spec.template")
	podSpec, ok := tmpl["spec"].(map[string]any)
	require.True(t, ok, "workload has no spec.template.spec")
	raw, ok := podSpec["containers"].([]any)
	require.True(t, ok, "workload has no spec.template.spec.containers")
	var out []map[string]any
	for _, c := range raw {
		if m, ok := c.(map[string]any); ok {
			out = append(out, m)
		}
	}
	return out
}

func envFromNames(container map[string]any) map[string]bool {
	names := map[string]bool{}
	raw, ok := container["envFrom"].([]any)
	if !ok {
		return names
	}
	for _, e := range raw {
		entry, ok := e.(map[string]any)
		if !ok {
			continue
		}
		ref, ok := entry["configMapRef"].(map[string]any)
		if !ok {
			continue
		}
		if n, ok := ref["name"].(string); ok {
			names[n] = true
		}
	}
	return names
}

// TestOtlpEndpointInjectedBySharedComponentOnly renders every environment this
// repo produces and asserts the AD-25 single-endpoint contract on each.
//
// Deliberately NOT a grep of the source tree alone: the 2026-07-24 workaround
// would have passed a "the value is correct" grep, and the reverted #135 would
// have passed a "the component is referenced" grep while ArgoCD silently
// dropped the reference. Only the render says what a cluster actually gets.
func TestOtlpEndpointInjectedBySharedComponentOnly(t *testing.T) {
	bin := kustomizeBin(t)
	kustomizeDir := thisDir(t)

	assertOneEndpointFromSharedComponent(t, "prod (base)", renderKustomize(t, bin, kustomizeDir))
	assertOneEndpointFromSharedComponent(t, "dev (base+components/staging)", renderStagingOverlay(t, bin, kustomizeDir))
}

// TestNoPerServiceOtlpEndpointInDeploySources is the AD-25 reject rule as this
// PUBLIC repo can actually run it.
//
// The family-wide version is contracts' obs-gate rule `O-single-otlp`, a
// reusable workflow this repo structurally cannot call — GitHub forbids a
// public repo calling a private repo's reusable workflow, the same blocker
// fleet.yaml already records against `atlas-migrate` for this member. So the
// repo-local half is asserted here, in a job that IS in `ci-success.needs`,
// rather than left to a gate that can never run: an author who re-adds the
// literal to a manifest reds this test on their own PR.
//
// Scoped to the deploy tree on purpose. Application code READING the variable
// (apps/server/src/orvex/obs — initOrvexTracing) is exactly what AD-25 wants:
// "a service reads it and never chooses it." Only a *manifest* that sets it is
// the violation.
func TestNoPerServiceOtlpEndpointInDeploySources(t *testing.T) {
	kustomizeDir := thisDir(t)
	allowed := filepath.Join(kustomizeDir, filepath.FromSlash(materializedComponentPath))

	var offenders []string
	err := filepath.Walk(kustomizeDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() {
			return nil
		}
		// This test file names the variable in its own assertions; so does
		// any future sibling. Go sources are not deploy manifests.
		if strings.HasSuffix(path, ".go") {
			return nil
		}
		if path == allowed {
			return nil
		}
		b, readErr := os.ReadFile(path)
		if readErr != nil {
			return readErr
		}
		if !setsOtlpEndpoint(string(b)) {
			return nil
		}
		rel, relErr := filepath.Rel(kustomizeDir, path)
		if relErr != nil {
			rel = path
		}
		offenders = append(offenders, rel)
		return nil
	})
	require.NoError(t, err, "walking the deploy tree failed — refusing to report a verdict this pass did not earn")

	require.Emptyf(t, offenders,
		"these deploy files set %s: %v. AD-25: it is injected by the shared deploy layer and MUST NOT appear in any per-service ConfigMap, Deployment or chart values file. The only file allowed to contain it is the materialized shared component at %s, held byte-identical to my-idp-apps' canonical by ./manifest-copy-check.sh.",
		otlpEnvVar, offenders, materializedComponentPath)

	// The allow-listed file must actually exist and SET the variable —
	// otherwise this test passes vacuously the day someone deletes the
	// materialized component, which is the failure mode it exists to catch.
	b, readErr := os.ReadFile(allowed)
	require.NoErrorf(t, readErr, "the materialized shared component %s is missing — nothing injects %s any more", materializedComponentPath, otlpEnvVar)
	require.Truef(t, setsOtlpEndpoint(string(b)), "the materialized shared component %s no longer sets %s", materializedComponentPath, otlpEnvVar)
}

// setsOtlpEndpoint reports whether a deploy source SETS the OTLP endpoint, as
// opposed to merely naming it in prose. Comment lines are skipped before
// matching, so a `# NOT typed here: OTEL_EXPORTER_OTLP_ENDPOINT: ...` note
// cannot convict the file that documents why the key is absent.
func setsOtlpEndpoint(content string) bool {
	for _, line := range strings.Split(content, "\n") {
		if strings.HasPrefix(strings.TrimSpace(line), "#") {
			continue
		}
		if otlpSetterLine.MatchString(line) || otlpEnvEntryLine.MatchString(line) {
			return true
		}
	}
	return false
}
