package kustomize

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

var retiredWikiInputs = []string{
	"EVENT_TOPIC_SUFFIX", "ORVEX_AI_URL", "ORVEX_KNOWLEDGE_URL",
	"ORVEX_CONSOLE_URL", "ORVEX_MCP_URL", "ORVEX_WIKI_API_URL",
}

// Preserve the measured deployment policy while removing only dead carriers.
// In particular, the CMP staging APP_URL currently retains its base value.
func wikiLiveInputs(profile string) map[string]string {
	want := map[string]string{
		"APP_URL":    "https://wiki.eu1.orvex.ai",   // cell-lint-allow: test fixture pins the exact pre-retirement own public host
		"COLLAB_URL": "https://collab.eu1.orvex.ai", // cell-lint-allow: test fixture pins the exact pre-retirement own collab host
		"CELL_ID":    "eu1a", "CELL_TOKEN": "eu1", "CLUSTER_NAME": "eu-central-1",
		"ORVEX_ENVIRONMENT":   "prod",
		"ORVEX_IDENTITY_URL":  "http://orvex-studio-identity.orvex-studio-identity.svc.cluster.local",
		"ORVEX_BILLING_URL":   "http://orvex-studio-billing.orvex-studio-billing.svc.cluster.local",
		"ORVEX_EDGE_ISSUER":   "https://identity.edge.orvex.internal/edge-authn",
		"ORVEX_EDGE_JWKS_URL": "http://orvex-studio-identity.orvex-studio-identity.svc.cluster.local/internal/jwks",
		"KAFKA_OUTBOX_TOPIC":  "wiki-events.eu-central-1",
		"KAFKA_BROKERS":       "platform-kafka-kafka-bootstrap.kafka.svc.cluster.local:9092",
	}
	if profile == "dev" {
		want["COLLAB_URL"] = "https://collab.eu1.orvex.dev" // cell-lint-allow: test fixture pins the exact pre-retirement own dev collab host
		want["ORVEX_IDENTITY_URL"] = "http://orvex-studio-identity.orvex-studio-identity-dev.svc.cluster.local"
		want["ORVEX_BILLING_URL"] = "http://orvex-studio-billing.orvex-studio-billing-dev.svc.cluster.local"
		want["ORVEX_EDGE_JWKS_URL"] = "http://orvex-studio-identity.orvex-studio-identity-dev.svc.cluster.local/internal/jwks"
		want["KAFKA_OUTBOX_TOPIC"] = "wiki-events.dev.eu-central-1"
	}
	if strings.HasPrefix(profile, "crew") {
		want["APP_URL"] = "https://wiki.crew-yafet.orvex.dev"      // cell-lint-allow: test fixture pins the authorized crew's own public host
		want["COLLAB_URL"] = "https://collab.crew-yafet.orvex.dev" // cell-lint-allow: test fixture pins the authorized crew's own collab host
		want["CELL_ID"], want["ORVEX_ENVIRONMENT"] = "solo", "crew"
		want["ORVEX_IDENTITY_URL"] = "http://orvex-studio-identity.orvex-studio-identity-crew-yafet.svc.cluster.local:80"
		want["ORVEX_BILLING_URL"] = "http://orvex-studio-billing.orvex-studio-billing-crew-yafet.svc.cluster.local:80"
		want["ORVEX_EDGE_JWKS_URL"] = "http://orvex-studio-identity.orvex-studio-identity-crew-yafet.svc.cluster.local/internal/jwks"
		want["KAFKA_OUTBOX_TOPIC"] = "wiki-events.crew-yafet"
		want["KAFKA_BROKERS"] = "platform-kafka-kafka-bootstrap.kafka.svc.cluster.local:9093"
		want["KAFKA_SASL_USERNAME"] = "orvex-wiki-crew-yafet"
	}
	return want
}

func validateWikiRetirement(data, want map[string]string) error {
	if _, exists := data["ORVEX_BILLING_API_URL"]; exists {
		return fmt.Errorf("retired application input ORVEX_BILLING_API_URL is still provided")
	}
	for _, key := range retiredWikiInputs {
		if _, exists := data[key]; exists {
			return fmt.Errorf("retired application input %s is still provided", key)
		}
	}
	for key, expected := range want {
		if data[key] != expected {
			return fmt.Errorf("live application input %s changed", key)
		}
	}
	return nil
}

// Mirror idp-render prepare: rewrite the authorized branch slug and append the
// profile component INSIDE the root, before root replacements execute. An outer
// overlay cannot establish equivalent crew endpoint/target semantics.
func renderWikiRetirementProfile(t *testing.T, profile string, mutate func(string)) string {
	t.Helper()
	work := filepath.Join(t.TempDir(), "kustomize")
	require.NoError(t, os.CopyFS(work, os.DirFS(thisDir(t))))
	entrypoint, component := work, ""
	switch profile {
	case "dev":
		component = "components/staging"
	case "crew-yafet":
		component = "components/crew"
	case "crew-env-yafet":
		entrypoint = filepath.Join(work, "crew-env")
	}
	if strings.HasPrefix(profile, "crew") {
		path := filepath.Join(entrypoint, "cluster-config.yaml")
		raw, err := os.ReadFile(path)
		require.NoError(t, err)
		pattern := regexp.MustCompile(`(?m)^  branchSlug: .*$`)
		require.True(t, pattern.Match(raw), "missing CMP branchSlug source")
		require.NoError(t, os.WriteFile(path, pattern.ReplaceAll(raw, []byte("  branchSlug: crew-yafet")), 0o600))
	}
	if component != "" {
		path := filepath.Join(work, "kustomization.yaml")
		raw, err := os.ReadFile(path)
		require.NoError(t, err)
		pattern := regexp.MustCompile(`(?m)^components:\n(?:  - .*\n)+`)
		require.True(t, pattern.Match(raw), "missing CMP component list")
		require.NoError(t, os.WriteFile(path, pattern.ReplaceAll(raw, []byte("${0}  - "+component+"\n")), 0o600))
	}
	if mutate != nil {
		mutate(work)
	}
	return renderKustomize(t, kustomizeBin(t), entrypoint)
}

func TestWikiRetiresScaffoldsAcrossActualProfiles(t *testing.T) {
	for _, profile := range []string{"base", "dev", "crew-yafet", "crew-env-yafet"} {
		t.Run(profile, func(t *testing.T) {
			rendered := renderWikiRetirementProfile(t, profile, nil)
			data := crewWikiEnv(t, rendered)
			want := wikiLiveInputs(profile)
			require.NoError(t, validateWikiRetirement(data, want))
			if profile == "crew-env-yafet" {
				// This profile runs the engine on a VM, with a real rendered
				// envFrom ConfigMap rather than a Deployment.
				var refs []struct {
					ConfigMapRef struct{ Name string } `json:"configMapRef"`
				}
				for _, doc := range decodeRendered(t, rendered) {
					if doc.kind == "ConfigMap" && doc.name == "orvex-wiki-vm-env" {
						vmData := doc.doc["data"].(map[string]any)
						require.NoError(t, json.Unmarshal([]byte(vmData["envFrom"].(string)), &refs))
					}
				}
				found := false
				for _, ref := range refs {
					found = found || ref.ConfigMapRef.Name == wikiOutboxConfigMap
				}
				require.True(t, found, "VM must retain the actual runtime ConfigMap binding")
			} else {
				requireWikiConfigMapConsumed(t, rendered)
			}
			for _, key := range []string{"KAFKA_OUTBOX_TOPIC", "COLLAB_URL", "ORVEX_IDENTITY_URL", "ORVEX_BILLING_URL"} {
				t.Run("changed-"+key, func(t *testing.T) {
					changed := make(map[string]string, len(data))
					for k, value := range data {
						changed[k] = value
					}
					changed[key] = "unexpected"
					require.ErrorContains(t, validateWikiRetirement(changed, want), key)
				})
			}
			for _, key := range retiredWikiInputs {
				t.Run("restored-"+key, func(t *testing.T) {
					data[key] = "unexpected"
					defer delete(data, key)
					require.ErrorContains(t, validateWikiRetirement(data, want), key)
				})
			}
		})
	}
}

func TestWikiRetirementDetectsDroppedCrewCollabTarget(t *testing.T) {
	rendered := renderWikiRetirementProfile(t, "crew-yafet", func(work string) {
		path := filepath.Join(work, "components", "crew", "kustomization.yaml")
		raw, err := os.ReadFile(path)
		require.NoError(t, err)
		const target = "      - select:\n          kind: ConfigMap\n          name: orvex-wiki-env\n        fieldPaths:\n          - data.COLLAB_URL\n        options:\n          delimiter: \".\"\n          index: 1\n"
		require.Equal(t, 1, strings.Count(string(raw), target), "the live shared replacement target must exist exactly once")
		require.NoError(t, os.WriteFile(path, []byte(strings.Replace(string(raw), target, "", 1)), 0o600))
	})
	require.ErrorContains(t, validateWikiRetirement(crewWikiEnv(t, rendered), wikiLiveInputs("crew-yafet")), "COLLAB_URL")
}
