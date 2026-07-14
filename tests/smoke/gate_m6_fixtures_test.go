package smoke

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5"
)

// envOrDefault reads an OPTIONAL env var, returning def when unset — unlike
// requireEnv, absence here is a legitimate default, not a hard failure
// (e.g. the Kafka topic literal, which has a real, documented default in
// environment.service.ts).
func envOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// gateM6AppModulePath locates the checked-out app.module.ts relative to
// this test binary's working directory (`go test` runs with CWD = the
// package dir, `tests/smoke`), FAILING LOUDLY (never silently skipping
// AC5) if the monorepo layout this gate depends on has moved.
func gateM6AppModulePath(t *testing.T) string {
	t.Helper()
	const rel = "../../apps/server/src/app.module.ts"
	if _, err := os.Stat(rel); err != nil {
		t.Fatalf("gate-m6 AC5: expected app.module.ts at %s (relative to tests/smoke) but stat failed: %v", rel, err)
	}
	return rel
}

// gateM6Tenant is one seeded space/user fixture used by TestGateM6E2E,
// scoped within the shared workspace seedGateM6Workspace creates. Seeding
// goes straight to Postgres (real, local-substitutable infra per CS §5)
// rather than through the signup/invite REST flow, because the gate's own
// scope is the mutation->CloudEvent spine + the ACL/quota chokepoints, not
// workspace onboarding — CS §5's "test it directly, don't re-derive an
// unrelated flow" discipline applies to fixture setup the same way it
// applies to unit scope.
type gateM6Tenant struct {
	workspaceID string
	spaceID     string
	userID      string
	email       string
	token       string
}

// seedGateM6Workspace creates the ONE shared workspace every gateM6Tenant in
// this test run belongs to.
//
// This is a REAL, verified engine constraint discovered while authoring
// this harness (not a design preference): `DomainMiddleware.use` — the
// self-hosted branch (`environmentService.isSelfHosted()`, the default
// absent `CLOUD=true`) — resolves `req.raw.workspaceId` via
// `workspaceRepo.findFirst()`, i.e. ONE global workspace for every request
// regardless of the caller's own JWT `workspaceId` claim. `JwtStrategy`
// then hard-rejects (401 "Workspace does not match") any token whose
// `workspaceId` differs from that resolved value. So a genuinely
// multi-WORKSPACE cross-tenant probe is only possible in `CLOUD=true` mode
// (hostname/subdomain workspace resolution) — infra this harness does not
// additionally stand up. Within the self-hosted single-workspace topology
// this repo's own deploy tree targets, the REAL tenant/IDOR boundary is
// SPACE-level (exactly what ENG-1373/ENG-1454's ACL layers enforce — see
// AC4), so AC4 exercises two principals in two DIFFERENT spaces of the SAME
// workspace rather than two workspaces. This function also fails loudly if
// the `workspaces` table is not empty at seed time, so a stray pre-existing
// workspace can never silently become the one `findFirst()` picks.
func seedGateM6Workspace(t *testing.T, conn *pgx.Conn) string {
	t.Helper()
	ctx := opContext(t)

	var existing int
	if err := conn.QueryRow(ctx, `SELECT count(*) FROM workspaces`).Scan(&existing); err != nil {
		t.Fatalf("gate-m6 fixture: counting existing workspaces failed: %v", err)
	}
	if existing != 0 {
		t.Fatalf(
			"gate-m6 fixture: expected an EMPTY workspaces table before seeding (self-hosted DomainMiddleware pins "+
				"every request to workspaceRepo.findFirst() — a pre-existing workspace would silently become that "+
				"instance and break every JWT-vs-resolved-workspace check), found %d row(s) already", existing,
		)
	}

	token := randToken(t)
	var workspaceID string
	err := conn.QueryRow(ctx,
		`INSERT INTO workspaces (name, hostname) VALUES ($1, $2) RETURNING id`,
		fmt.Sprintf("gate-m6 %s", token), fmt.Sprintf("gate-m6-%s", token),
	).Scan(&workspaceID)
	if err != nil {
		t.Fatalf("gate-m6 fixture: insert workspace failed: %v", err)
	}
	return workspaceID
}

// seedGateM6Tenant inserts one admin user + one private space + the space
// membership row (within the given, already-seeded, shared workspace)
// directly via SQL (matching the columns
// `apps/server/test/integration/db-test-harness.ts` seeds for the Jest
// integration suite), then mints a real access-token JWT for that user so
// the E2E body can drive the engine's actual public REST surface
// authenticated, without going through the interactive signup/login flow.
func seedGateM6Tenant(t *testing.T, conn *pgx.Conn, appSecret, workspaceID, label string) gateM6Tenant {
	t.Helper()
	ctx := opContext(t)
	token := randToken(t)

	email := fmt.Sprintf("gate-m6-%s-%s@example.test", label, token)
	var userID string
	err := conn.QueryRow(ctx,
		`INSERT INTO users (name, email, workspace_id, email_verified_at) VALUES ($1, $2, $3, now()) RETURNING id`,
		fmt.Sprintf("Gate M6 %s", label), email, workspaceID,
	).Scan(&userID)
	if err != nil {
		t.Fatalf("gate-m6 fixture: insert user (%s) failed: %v", label, err)
	}

	var spaceID string
	err = conn.QueryRow(ctx,
		`INSERT INTO spaces (name, slug, workspace_id, creator_id) VALUES ($1, $2, $3, $4) RETURNING id`,
		fmt.Sprintf("Gate M6 Space %s", label), fmt.Sprintf("gate-m6-space-%s-%s", label, token), workspaceID, userID,
	).Scan(&spaceID)
	if err != nil {
		t.Fatalf("gate-m6 fixture: insert space (%s) failed: %v", label, err)
	}

	_, err = conn.Exec(ctx,
		`INSERT INTO space_members (user_id, space_id, role) VALUES ($1, $2, 'admin')`,
		userID, spaceID,
	)
	if err != nil {
		t.Fatalf("gate-m6 fixture: insert space_members (%s) failed: %v", label, err)
	}

	return gateM6Tenant{
		workspaceID: workspaceID,
		spaceID:     spaceID,
		userID:      userID,
		email:       email,
		token:       mintGateM6AccessToken(t, appSecret, userID, email, workspaceID),
	}
}

// gateM6JwtPayload mirrors `JwtPayload` in
// apps/server/src/core/auth/dto/jwt-payload.ts (the `type: 'access'` shape,
// no `sessionId` — JwtStrategy.validate only checks the session table when
// a sessionId claim is present, so an access token minted without one still
// validates against a real user + workspace row).
type gateM6JwtPayload struct {
	Sub         string `json:"sub"`
	Email       string `json:"email"`
	WorkspaceID string `json:"workspaceId"`
	Type        string `json:"type"`
	jwt.RegisteredClaims
}

// mintGateM6AccessToken signs a real HS256 access token with the engine's
// own APP_SECRET (the exact key `EnvironmentService.getAppSecret()` hands to
// JwtStrategy) so the E2E harness authenticates through the engine's real
// JwtAuthGuard/JwtStrategy path — never a bypassed/mocked auth layer.
func mintGateM6AccessToken(t *testing.T, appSecret, userID, email, workspaceID string) string {
	t.Helper()
	claims := gateM6JwtPayload{
		Sub:         userID,
		Email:       email,
		WorkspaceID: workspaceID,
		Type:        "access",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(10 * time.Minute)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := tok.SignedString([]byte(appSecret))
	if err != nil {
		t.Fatalf("gate-m6 fixture: signing access token failed: %v", err)
	}
	return signed
}

// gateM6Envelope is the global 2xx JSON envelope
// (`TransformHttpResponseInterceptor`: {data, success, status}) every
// non-@SkipTransform engine JSON response carries.
type gateM6Envelope struct {
	Data   json.RawMessage `json:"data"`
	Status int             `json:"status"`
}

// gateM6Response is every field a subtest needs from one HTTP round-trip:
// the raw status/body (for negative-path/leak assertions) plus, on success,
// the unwrapped `data` payload.
type gateM6Response struct {
	StatusCode int
	Body       []byte
	Data       json.RawMessage
}

// gateM6Do drives one authenticated request against the real running engine
// (`APP_URL`) — the "public REST write interface" the gate's DoD names.
// Every call carries a context deadline (CS §10).
func gateM6Do(t *testing.T, client *http.Client, method, url, bearer string, body any) gateM6Response {
	t.Helper()
	ctx := opContext(t)

	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("gate-m6: marshaling request body for %s %s failed: %v", method, url, err)
		}
		reader = strings.NewReader(string(raw))
	}

	req, err := http.NewRequestWithContext(ctx, method, url, reader)
	if err != nil {
		t.Fatalf("gate-m6: building request %s %s failed: %v", method, url, err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	req.Header.Set("Authorization", "Bearer "+bearer)

	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("gate-m6: %s %s failed (engine unreachable?): %v", method, url, err)
	}
	defer func() { _ = resp.Body.Close() }()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("gate-m6: reading response body from %s %s failed: %v", method, url, err)
	}

	out := gateM6Response{StatusCode: resp.StatusCode, Body: raw}
	if resp.StatusCode >= 200 && resp.StatusCode < 300 && len(raw) > 0 {
		var env gateM6Envelope
		// Not every 2xx body is the {data,...} envelope (the llms.txt /
		// page.md routes are @SkipTransform raw Markdown) — only unwrap
		// when it actually parses as the envelope shape.
		if json.Unmarshal(raw, &env) == nil && env.Data != nil {
			out.Data = env.Data
		}
	}
	return out
}

// gateM6ConsumeStudioSpine reads the REAL Kafka topic (`KAFKA_BROKERS`,
// topic literal from `KAFKA_OUTBOX_TOPIC` or the
// `orvex.studio-spine.events` default per `environment.service.ts
// getKafkaOutboxTopic()`) from the beginning of every partition, looking for
// a message whose CloudEvents 1.0 `subject` attribute matches
// wantAggregateID. It
// polls for up to opTimeout*2 (the relay ticks every 2s —
// `OutboxRelayService.poll`) and FAILS loudly (never t.Skip, matching this
// suite's FAIL-never-SKIP doctrine) naming the exact broker address if the
// topic is unreachable, so a missing/unwired Kafka broker is never a false
// green.
func gateM6ConsumeStudioSpine(
	t *testing.T,
	brokers []string,
	topic string,
	wantAggregateID string,
) map[string]any {
	t.Helper()

	deadline := time.Now().Add(30 * time.Second)
	var lastErr error
	for time.Now().Before(deadline) {
		msg, err := gateM6ScanTopicOnce(t, brokers, topic, wantAggregateID)
		if err != nil {
			lastErr = err
		} else if msg != nil {
			return msg
		}
		time.Sleep(1 * time.Second)
	}
	if lastErr != nil {
		t.Fatalf(
			"gate-m6: could not read Kafka topic %q via brokers %v within 30s (broker unreachable/misconfigured?): %v",
			topic, brokers, lastErr,
		)
	}
	t.Fatalf(
		"gate-m6: no message with subject=%s observed on Kafka topic %q within 30s of the outbox relay's poll interval (relay not publishing / event never enqueued)",
		wantAggregateID, topic,
	)
	return nil
}

// gateM6ScanTopicOnce is defined in gate_m6_kafka_test.go (kept separate so
// the kafka-go wiring — the one real external client this file needs — sits
// next to its own imports).
