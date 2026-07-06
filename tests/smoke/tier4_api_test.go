package smoke

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// TestTier4API drives the engine's HTTP health surface: the aggregate terminus
// report (/api/health) must be 200 with status ok and both database + redis up,
// and the liveness probe (/api/health/live) must be 200. Addressable via
// `go test -run TestTier4`.
//
// NOTE (D-S13): a message-broker readiness check is intentionally absent here —
// no Kafka is claimed by the deploy tree yet. That check joins this tier when
// the delivery outbox is built.
func TestTier4API(t *testing.T) {
	base := strings.TrimRight(requireEnv(t, "APP_URL"), "/")
	client := &http.Client{Timeout: opTimeout}

	tests := []struct {
		name       string
		path       string
		wantStatus int
		checkBody  func(t *testing.T, body []byte)
	}{
		{
			name:       "health_ok_with_database_and_redis_up",
			path:       "/api/health",
			wantStatus: http.StatusOK,
			checkBody: func(t *testing.T, body []byte) {
				var payload struct {
					Status string `json:"status"`
					Info   map[string]struct {
						Status string `json:"status"`
					} `json:"info"`
				}
				require.NoError(t, json.Unmarshal(body, &payload),
					"health: response body is not valid JSON: %s", string(body))
				require.Equal(t, "ok", payload.Status,
					"health: overall status is not ok: %s", string(body))
				require.Equal(t, "up", payload.Info["database"].Status,
					"health: database indicator is not up: %s", string(body))
				require.Equal(t, "up", payload.Info["redis"].Status,
					"health: redis indicator is not up: %s", string(body))
			},
		},
		{
			name:       "health_live_returns_200",
			path:       "/api/health/live",
			wantStatus: http.StatusOK,
			checkBody:  nil,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			ctx := opContext(t)
			target := base + tc.path

			req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
			require.NoError(t, err, "api: building request for %s failed", target)

			resp, err := client.Do(req)
			if err != nil {
				// Unreachable engine is a hard FAIL naming the exact address.
				t.Fatalf("api: GET %s failed (engine unreachable?): %v", target, err)
			}
			defer func() { _ = resp.Body.Close() }()

			body, err := io.ReadAll(resp.Body)
			require.NoError(t, err, "api: reading body from %s failed", target)
			require.Equalf(t, tc.wantStatus, resp.StatusCode,
				"api: GET %s unexpected status; body=%s", target, string(body))

			if tc.checkBody != nil {
				tc.checkBody(t, body)
			}
		})
	}
}
