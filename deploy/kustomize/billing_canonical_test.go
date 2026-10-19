package kustomize

import (
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestBillingCanonicalProfiles(t *testing.T) {
	for _, profile := range []string{"base", "dev", "crew-yafet", "crew-env-yafet"} {
		t.Run(profile, func(t *testing.T) {
			rendered := renderWikiRetirementProfile(t, profile, nil)
			data := crewWikiEnv(t, rendered)
			require.NotContains(t, data, "ORVEX_BILLING_API_URL", "retired input must not remain a provider")
			require.Equal(t, wikiLiveInputs(profile)["ORVEX_BILLING_URL"], data["ORVEX_BILLING_URL"])
			for _, mutation := range []string{"missing-canonical", "changed-target", "restored-legacy"} {
				t.Run(mutation, func(t *testing.T) {
					changed := make(map[string]string, len(data))
					for k, v := range data {
						changed[k] = v
					}
					switch mutation {
					case "missing-canonical":
						delete(changed, "ORVEX_BILLING_URL")
					case "changed-target":
						changed["ORVEX_BILLING_URL"] = "unexpected"
					case "restored-legacy":
						changed["ORVEX_BILLING_API_URL"] = changed["ORVEX_BILLING_URL"]
					}
					require.ErrorContains(t, validateWikiRetirement(changed, wikiLiveInputs(profile)), "ORVEX_BILLING")
				})
			}
		})
	}
}

func TestBillingCanonicalRejectsStalePatchAfterRealRender(t *testing.T) {
	for _, component := range []string{"staging", "crew"} {
		t.Run(component, func(t *testing.T) {
			work := filepath.Join(t.TempDir(), "kustomize")
			require.NoError(t, os.CopyFS(work, os.DirFS(thisDir(t))))
			path := filepath.Join(work, "kustomization.yaml")
			raw, err := os.ReadFile(path)
			require.NoError(t, err)
			// Insert inside the actual root component order, before replacements.
			components := regexp.MustCompile(`(?m)^components:\n(?:  - .*\n)+`)
			require.True(t, components.Match(raw))
			require.NoError(t, os.WriteFile(path, components.ReplaceAll(raw, []byte("${0}  - components/"+component+"\n")), 0o600))
			path = filepath.Join(work, "components", component, "kustomization.yaml")
			raw, err = os.ReadFile(path)
			require.NoError(t, err)
			const canonical = "path: /data/ORVEX_BILLING_URL"
			require.Equal(t, 1, strings.Count(string(raw), canonical))
			require.NoError(t, os.WriteFile(path, []byte(strings.Replace(string(raw), canonical, "path: /data/ORVEX_BILLING_API_URL", 1)), 0o600))
			output, err := exec.Command(kustomizeBin(t), "build", work).CombinedOutput()
			require.NoError(t, err)
			// Kustomize currently permits this obsolete JSON patch and adds
			// a legacy field; the actual rendered-provider guard must reject it.
			data := crewWikiEnv(t, string(output))
			require.Contains(t, data, "ORVEX_BILLING_API_URL")
			require.ErrorContains(t, validateWikiRetirement(data, wikiLiveInputs(map[string]string{"staging": "dev", "crew": "crew-yafet"}[component])), "ORVEX_BILLING_API_URL")
		})
	}
}
