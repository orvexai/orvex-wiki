// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

package kustomize

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
	"gopkg.in/yaml.v3"
)

// renderedOutboxTopic reads the value that the deployed application actually
// receives. Keeping this assertion on the rendered ConfigMaps binds the
// resolver's configured input to the prod and dev environment wiring instead
// of comparing two literals supplied by the test itself.
func renderedOutboxTopic(t *testing.T, rendered string) string {
	t.Helper()

	dec := yaml.NewDecoder(strings.NewReader(rendered))
	for {
		var doc struct {
			Kind     string `yaml:"kind"`
			Metadata struct {
				Name string `yaml:"name"`
			} `yaml:"metadata"`
			Data map[string]string `yaml:"data"`
		}
		if err := dec.Decode(&doc); err != nil {
			break
		}
		if doc.Kind == "ConfigMap" && doc.Metadata.Name == "orvex-wiki-env" {
			topic, ok := doc.Data["KAFKA_OUTBOX_TOPIC"]
			require.True(t, ok, "rendered orvex-wiki-env ConfigMap must carry KAFKA_OUTBOX_TOPIC")
			return topic
		}
	}

	t.Fatal("rendered output did not contain the orvex-wiki-env ConfigMap")
	return ""
}

// TestWikiOutboxTopicsRemainEnvironmentSeparated is the manifest-bound AC2
// regression gate. It must fail if the staging overlay is changed to publish
// to the prod topic, even though resolveWikiEventsTopic itself returns its
// configured argument unchanged.
func TestWikiOutboxTopicsRemainEnvironmentSeparated(t *testing.T) {
	bin := kustomizeBin(t)
	kustomizeDir := thisDir(t)

	prodTopic := renderedOutboxTopic(t, renderKustomize(t, bin, kustomizeDir))
	devTopic := renderedOutboxTopic(t, renderStagingOverlay(t, bin, kustomizeDir))

	require.Equal(t, "wiki-events.eu-central-1", prodTopic)
	require.Equal(t, "wiki-events.dev.eu-central-1", devTopic)
	require.NotEqual(t, prodTopic, devTopic)
}
