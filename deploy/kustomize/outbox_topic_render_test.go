// ENG-3790 — the outbox topic is an environment-specific provisioned value.
//
// This gate reads the rendered manifests for both environments. Testing the
// resolver with two literals is insufficient because the resolver deliberately
// returns its configured input; only the render proves that prod and dev
// actually provide different configuration to the pod.
package kustomize

import (
	"testing"

	"github.com/stretchr/testify/require"
)

const (
	wikiOutboxConfigMap = "orvex-wiki-env"
	prodWikiEventsTopic = "wiki-events.eu-central-1"
	devWikiEventsTopic  = "wiki-events.dev.eu-central-1"
)

func renderedConfigMapValue(t *testing.T, rendered, configMapName, key string) string {
	t.Helper()

	var values []string
	for _, d := range decodeRendered(t, rendered) {
		if d.kind != "ConfigMap" || d.name != configMapName {
			continue
		}
		data, ok := d.doc["data"].(map[string]any)
		require.Truef(t, ok, "ConfigMap/%s has no data block", configMapName)
		value, ok := data[key].(string)
		require.Truef(t, ok, "ConfigMap/%s does not set %s", configMapName, key)
		values = append(values, value)
	}

	require.Lenf(t, values, 1, "render must contain exactly one ConfigMap/%s", configMapName)
	return values[0]
}

func requireWikiConfigMapConsumed(t *testing.T, rendered string) {
	t.Helper()

	workloads := 0
	for _, d := range decodeRendered(t, rendered) {
		if d.kind != "Deployment" {
			continue
		}
		workloads++
		for i, container := range containersOf(t, d.doc) {
			require.Truef(t, envFromNames(container)[wikiOutboxConfigMap],
				"Deployment/%s containers[%d] must envFrom ConfigMap/%s so the rendered topic reaches the relay",
				d.name, i, wikiOutboxConfigMap)
		}
	}
	require.Positive(t, workloads, "render contains no Deployment to consume ConfigMap/%s", wikiOutboxConfigMap)
}

// TestWikiOutboxTopicIsEnvironmentSpecific renders the real prod and dev
// manifests and asserts the values consumed through Deployment.envFrom. It
// intentionally checks the exact provisioned names, so changing the staging
// overlay to the prod topic (or changing both environments to one derived
// name) fails this gate.
func TestWikiOutboxTopicIsEnvironmentSpecific(t *testing.T) {
	bin := kustomizeBin(t)
	kustomizeDir := thisDir(t)

	prodRendered := renderKustomize(t, bin, kustomizeDir)
	devRendered := renderStagingOverlay(t, bin, kustomizeDir)

	prodTopic := renderedConfigMapValue(t, prodRendered, wikiOutboxConfigMap, "KAFKA_OUTBOX_TOPIC")
	devTopic := renderedConfigMapValue(t, devRendered, wikiOutboxConfigMap, "KAFKA_OUTBOX_TOPIC")
	requireWikiConfigMapConsumed(t, prodRendered)
	requireWikiConfigMapConsumed(t, devRendered)

	require.Equal(t, prodWikiEventsTopic, prodTopic)
	require.Equal(t, devWikiEventsTopic, devTopic)
	require.NotEqual(t, prodTopic, devTopic)
}
