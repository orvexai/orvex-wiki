package smoke

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
)

// TestGateM6E2E — ENG-1572, the M6 ("Engine Event Spine & Primitives")
// closing gate's named DoD test.
//
// Behaviour-through-interface: it drives the engine's real public REST
// write interface (an authenticated `POST /api/pages/create`) against a
// REAL running engine (`APP_URL`) + REAL Postgres (`DATABASE_URL`) + REAL
// Kafka (`KAFKA_BROKERS`) — never a mock of an owned package (CS §5 ❌#4).
// No `time.Now()`/`rand` enters any assertion; every timestamp asserted
// comes from event/response payloads, never wall-clock decision logic
// (❌#9) — the only use of `time` in this file is bounding a poll loop's
// deadline, per this suite's existing `opContext`/`opTimeout` convention.
//
// Subtests map 1:1 to ENG-1572's ACs (see the issue body §2):
//
//	AC2 — TestGateM6E2E/AC2_MutationProducesCloudEventOnStudioSpine
//	AC3 — TestGateM6E2E/AC3_OverQuotaWriteReturns402
//	AC4 — TestGateM6E2E/AC4_CrossTenantIDORAndAiPathACL
//	AC5 — TestGateM6E2E/AC5_ByteParityBaselineAndAGPLImportGuard
//
// AC1 (wired-blockedBy-set Done) and AC6 (integration-suite-green +
// coverage snapshot) are coordination-plane, not a code tier (the issue
// body's own tier map says so) — they are evaluated by the Studio delivery
// orchestrator from Linear + CI state, never by this Go process, and this
// harness makes zero Linear writes.
//
// Two explicit, DOCUMENTED scope boundaries (CS §11 honesty — asserting
// past what this repo actually implements would be fabrication, not
// rigor):
//
//   - "a Knative Trigger consumer fires" (AC2 prose) is cross-repo eventing
//     infra; there is no Knative/Trigger object anywhere in this repo. This
//     harness's proof-of-delivery is a REAL consumer read of the Kafka
//     topic itself (the leg this repo actually owns) — the strongest
//     assertion obtainable from inside `orvex-wiki`.
//   - "DLQ wired" (AC2 prose) is NOT implemented anywhere in this repo
//     (grep-verified: zero DLQ/dead-letter code under
//     apps/server/src/orvex/events — see the ENG-1572 build log). This
//     harness does not assert on it; doing so would fabricate a passing
//     check for code that does not exist yet.
func TestGateM6E2E(t *testing.T) {
	base := strings.TrimRight(requireEnv(t, "APP_URL"), "/")
	appSecret := requireEnv(t, "APP_SECRET")
	client := &http.Client{Timeout: opTimeout}
	conn := connectPostgres(t)

	// Both principals live in the SAME workspace — see seedGateM6Workspace's
	// doc comment for why: self-hosted DomainMiddleware pins every request
	// to ONE global workspace, so the real IDOR/tenant boundary this build
	// can exercise is SPACE-level, not workspace-level.
	workspaceID := seedGateM6Workspace(t, conn)
	tenantA := seedGateM6Tenant(t, conn, appSecret, workspaceID, "principal-a")
	tenantB := seedGateM6Tenant(t, conn, appSecret, workspaceID, "principal-b")

	// Shared tracer mutation: tenant A creates one page through the real
	// public REST write interface. AC2 observes its CloudEvent; AC4 reuses
	// the SAME page as the cross-tenant IDOR/ACL target (so a positive
	// control — tenant A reading its own page — proves the negative result
	// for tenant B is a real ACL deny, not a broken endpoint). The page
	// carries a real ProseMirror BODY (not just a title) with a unique
	// marker string: both `/api/orvex/pages/:id/page.md` (DfM renders the
	// body content only — see OrvexLlmsService.renderPageDfm, it never
	// touches `title`) and the export path need real body bytes to prove a
	// leak/no-leak result meaningfully.
	const gateM6ContentMarker = "ENG-1572-gate-m6-body-marker"
	createResp := gateM6Do(t, client, http.MethodPost, base+"/api/pages/create", tenantA.token,
		map[string]any{
			"spaceId": tenantA.spaceID,
			"title":   "ENG-1572 gate-m6 tracer page",
			"format":  "json",
			"content": map[string]any{
				"type": "doc",
				"content": []any{
					map[string]any{
						"type": "paragraph",
						"content": []any{
							map[string]any{"type": "text", "text": gateM6ContentMarker},
						},
					},
				},
			},
		},
	)
	require.Equalf(t, http.StatusOK, createResp.StatusCode,
		"gate-m6: tenant-A page create (the shared tracer mutation) did not succeed; body=%s", string(createResp.Body))
	var created struct {
		ID          string `json:"id"`
		WorkspaceID string `json:"workspaceId"`
	}
	require.NoError(t, json.Unmarshal(createResp.Data, &created),
		"gate-m6: page-create response data did not decode: %s", string(createResp.Data))
	require.NotEmpty(t, created.ID, "gate-m6: created page carries no id")
	require.Equal(t, tenantA.workspaceID, created.WorkspaceID,
		"gate-m6: created page's workspaceId does not match the seeded tenant")

	t.Run("AC2_MutationProducesCloudEventOnStudioSpine", func(t *testing.T) {
		testGateM6AC2(t, conn, created.ID, tenantA.workspaceID)
	})

	t.Run("AC3_OverQuotaWriteReturns402", func(t *testing.T) {
		testGateM6AC3(t, client, base, tenantA)
	})

	t.Run("AC4_CrossTenantIDORAndAiPathACL", func(t *testing.T) {
		testGateM6AC4(t, client, base, tenantA, tenantB, created.ID, gateM6ContentMarker)
	})

	t.Run("AC5_ByteParityBaselineAndAGPLImportGuard", func(t *testing.T) {
		testGateM6AC5(t)
	})
}

// gateM6TraceparentRE is the W3C traceparent grammar
// (`00-<32 hex>-<16 hex>-<2 hex>`) — used to prove the relay's tracing
// extension fields (`orvex-outbox-trace-context.util.ts`) are real, not an
// empty/placeholder string.
var gateM6TraceparentRE = regexp.MustCompile(`^[0-9a-f]{2}-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$`)

// testGateM6AC2 — "Given a running engine with ORVEX_MODULES_ENABLED=true,
// When a page is mutated through the public REST write interface, Then
// exactly one CloudEvent is produced on the Kafka topic
// `orvex.studio-spine.events` and a Knative Trigger consumer fires."
//
// Two independent, REAL-infra observations of the SAME mutation:
//  1. Postgres — the transactional outbox row itself: proves the write and
//     its event enqueue committed atomically (ENG-1383 AC1/AC2) and that
//     the relay (`OutboxRelayService`, polling every 2s) marked it
//     `relayed_at` (dispatched to the broker).
//  2. Kafka — a real consumer read of `orvex.studio-spine.events`: proves
//     the message actually reached the broker, not just the outbox table.
func testGateM6AC2(t *testing.T, conn *pgx.Conn, pageID, workspaceID string) {
	t.Helper()
	ctx := opContext(t)

	// (1) Postgres: exactly one outbox row for this aggregate, relayed.
	var (
		outboxCount   int
		eventType     string
		outboxWSID    string
		relayedAtNull bool
	)
	err := conn.QueryRow(ctx,
		`SELECT count(*) FROM orvex_event_outbox WHERE aggregate_id = $1 AND type = 'page.created'`,
		pageID,
	).Scan(&outboxCount)
	require.NoError(t, err, "gate-m6 AC2: counting orvex_event_outbox rows failed")
	require.Equalf(t, 1, outboxCount,
		"gate-m6 AC2: expected exactly ONE outbox row for aggregate_id=%s type=page.created, got %d", pageID, outboxCount)

	err = conn.QueryRow(ctx,
		`SELECT type, workspace_id, (relayed_at IS NULL) FROM orvex_event_outbox WHERE aggregate_id = $1 AND type = 'page.created'`,
		pageID,
	).Scan(&eventType, &outboxWSID, &relayedAtNull)
	require.NoError(t, err, "gate-m6 AC2: reading the outbox row failed")
	require.Equal(t, "page.created", eventType, "gate-m6 AC2: outbox row has the wrong type")
	require.Equal(t, workspaceID, outboxWSID, "gate-m6 AC2: outbox row has the wrong workspace_id")

	// The relay ticks every 2s (OutboxRelayService.poll @Interval); give it
	// real time to run rather than asserting on the write-time snapshot.
	if relayedAtNull {
		deadline := time.Now().Add(15 * time.Second)
		for time.Now().Before(deadline) && relayedAtNull {
			time.Sleep(1 * time.Second)
			pollCtx := opContext(t)
			err := conn.QueryRow(pollCtx,
				`SELECT (relayed_at IS NULL) FROM orvex_event_outbox WHERE aggregate_id = $1 AND type = 'page.created'`,
				pageID,
			).Scan(&relayedAtNull)
			require.NoError(t, err, "gate-m6 AC2: re-polling relayed_at failed")
		}
	}
	require.Falsef(t, relayedAtNull,
		"gate-m6 AC2: outbox row for aggregate_id=%s was never marked relayed_at (OutboxRelayService not running / not publishing)", pageID)

	// (2) Kafka: a real consumer read of the studio-spine topic. Topic
	// literal per the ENG-1572 drift reconciliation (verified against
	// environment.service.ts getKafkaOutboxTopic()): `orvex.studio-spine.events`,
	// overridable via KAFKA_OUTBOX_TOPIC for a non-default deployment.
	brokers := strings.Split(requireEnv(t, "KAFKA_BROKERS"), ",")
	for i := range brokers {
		brokers[i] = strings.TrimSpace(brokers[i])
	}
	topic := envOrDefault("KAFKA_OUTBOX_TOPIC", "orvex.studio-spine.events")

	msg := gateM6ConsumeStudioSpine(t, brokers, topic, pageID)

	// Field-level assertions on what the relay ACTUALLY emits today
	// (outbox-relay.service.ts `run()`): {type, aggregateId, workspaceId,
	// payload, traceparent, tracestate, correlation_id}. NOT asserted:
	// literal CloudEvents `specversion`/`ce-id`/`ce-type`/`ce-source` — the
	// envelope-shaping catalog leg is cross-repo scope
	// (orvex-studio-contracts, ENG-1365) and does not exist in this repo's
	// message shape yet (see outbox-writer.service.ts / kafka-publisher.port.ts
	// doc comments); asserting those literal field names here would be a
	// fabricated pass.
	require.Equal(t, "page.created", msg["type"], "gate-m6 AC2: Kafka message has the wrong type")
	require.Equal(t, pageID, msg["aggregateId"], "gate-m6 AC2: Kafka message has the wrong aggregateId")
	require.Equal(t, workspaceID, msg["workspaceId"], "gate-m6 AC2: Kafka message has the wrong workspaceId")

	// traceparent/correlation_id are PRESENT-IF-TRACING-IS-ON, never
	// hard-required: `captureOutboxTraceContext` (orvex-outbox-trace-context.util.ts)
	// is explicitly "vanilla-safe" — with no OTel exporter endpoint
	// configured, initOrvexTracing never registers a real TracerProvider/
	// AsyncHooksContextManager, so both fields legitimately round-trip as
	// empty (verified directly against the orvex_event_outbox row while
	// authoring this harness — this is documented engine behaviour, not a
	// gap this gate owns). Asserting non-empty unconditionally would fail
	// a valid, documented boot configuration for a reason unrelated to the
	// M6 spine itself. When a value IS present, it must be well-formed.
	if traceparent, ok := msg["traceparent"].(string); ok && traceparent != "" {
		require.Truef(t, gateM6TraceparentRE.MatchString(traceparent),
			"gate-m6 AC2: Kafka message traceparent %q is not a well-formed W3C traceparent", traceparent)
	}
}

// testGateM6AC3 — "Given an over-quota workspace, When a write hits the
// entitlement chokepoint, Then the engine returns HTTP 402."
//
// This drives the LANDED write chokepoint directly (ENG-1382:
// `page.service.ts` -> `acquireWorkspaceQuotaLock` ->
// `pageRepo.countByWorkspaceId` -> `entitlementService.assertWithinQuota(...,
// 'pages', currentPageCount)`, one atomic tx, throwing `QuotaExceededException`
// -> HTTP 402 `{error:'QUOTA_EXCEEDED', resource, limit}` at-cap) — it does
// NOT gate on `GET /api/orvex/quota` first.
//
// Scope boundary (deliberate, not an oversight): `GET /api/orvex/quota` —
// the entitlement usage-vs-caps READ readout — is FR-W15, tracked as its own
// noop-501 deliverable in docs/delivery-checklist.md ("`orvexGetQuota` —
// FR-W15 — Read the tenant's usage against its effective entitlement caps");
// no ENG-#### owning ticket for FR-W15 was findable in the local cache as of
// this fix (repo has no `.cache/linear/`; a single grep across the repo for
// "FR-W15" surfaced only the checklist entry and the controller's own doc
// comment — neither names an owning issue). FR-W15 is NOT an M6/ENG-1382
// constituent and ENG-1572's own AC3 text (issue body §35) requires only
// "HTTP status == 402 on the write path (F-QUOTA)" — nothing about the read
// surface. Gating this subtest on the read surface's implementation status
// (the bug this fix removes) meant AC3 Fatalf'd before ever exercising the
// write path it actually owns. This subtest asserts NOTHING about
// `GET /api/orvex/quota` in either direction; it is silent on that surface
// by design.
//
// Cap VALUES are billing-SoR, never hard-coded in this engine (CS ❌#10), so
// this probe drives real page creates until either a 402 QUOTA_EXCEEDED
// appears (pass) or a bounded attempt budget is exhausted without ever
// seeing one (fail, naming the exact count) — the only lever a black-box
// harness has to observe "at cap" from the outside.
func testGateM6AC3(t *testing.T, client *http.Client, base string, tenant gateM6Tenant) {
	t.Helper()

	const maxAttempts = 50 // env-overridable ceiling for the exhaustion probe, never a hard-coded CAP VALUE (❌#10 — this bounds the PROBE, it asserts nothing about what the cap should be).
	limit := maxAttempts
	if raw := envOrDefault("ORVEX_TEST_QUOTA_PROBE_MAX", ""); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n > 0 {
			limit = n
		}
	}

	for i := 0; i < limit; i++ {
		resp := gateM6Do(t, client, http.MethodPost, base+"/api/pages/create", tenant.token,
			map[string]any{
				"spaceId": tenant.spaceID,
				"title":   fmt.Sprintf("gate-m6 AC3 quota-probe page %d", i),
			},
		)
		if resp.StatusCode == http.StatusPaymentRequired {
			var body map[string]any
			require.NoError(t, json.Unmarshal(resp.Body, &body),
				"gate-m6 AC3: 402 response body did not decode: %s", string(resp.Body))
			require.Equal(t, "QUOTA_EXCEEDED", body["error"],
				"gate-m6 AC3: 402 response is missing the QUOTA_EXCEEDED error code: %s", string(resp.Body))
			require.Equal(t, "pages", body["resource"],
				"gate-m6 AC3: 402 response names the wrong resource: %s", string(resp.Body))
			return // AC3 satisfied.
		}
		require.Equalf(t, http.StatusOK, resp.StatusCode,
			"gate-m6 AC3: page create #%d returned neither 200 nor 402; body=%s", i, string(resp.Body))
	}

	t.Fatalf(
		"gate-m6 AC3: no 402 QUOTA_EXCEEDED observed after %d successful page creates — the F-QUOTA write chokepoint "+
			"(ENG-1382: entitlementService.assertWithinQuota in PageService.create) is not enforcing on this build; "+
			"either the chokepoint is unwired/bypassed or the seeded workspace never reached its page cap", limit,
	)
}

// testGateM6AC4 — cross-tenant IDOR (export) + AI-path-ACL (llms
// discovery/page.md) negative probes, plus a same-tenant positive control
// on each so a 403/404 for tenant B is provably an ACL deny and not a
// broken endpoint.
func testGateM6AC4(t *testing.T, client *http.Client, base string, owner, stranger gateM6Tenant, pageID, contentMarker string) {
	t.Helper()

	t.Run("export_IDOR", func(t *testing.T) {
		// Positive control: the owning tenant CAN export its own page, and
		// the export genuinely carries the body marker (proving the
		// negative assertion below is a real ACL deny, not a coincidence
		// of empty content).
		ownResp := gateM6Do(t, client, http.MethodPost, base+"/api/pages/export", owner.token,
			map[string]any{"pageId": pageID, "format": "markdown"},
		)
		require.Equalf(t, http.StatusOK, ownResp.StatusCode,
			"gate-m6 AC4: owning tenant could not export its own page (positive control failed); body=%s", string(ownResp.Body))
		require.Containsf(t, string(ownResp.Body), contentMarker,
			"gate-m6 AC4: owning tenant's export is missing the body marker (positive control weak): %s", string(ownResp.Body))

		// Negative: a stranger tenant (zero membership in the owner's
		// space) must be refused, and the refusal body must carry zero
		// bytes of the page's own content.
		strangerResp := gateM6Do(t, client, http.MethodPost, base+"/api/pages/export", stranger.token,
			map[string]any{"pageId": pageID, "format": "markdown"},
		)
		require.NotEqualf(t, http.StatusOK, strangerResp.StatusCode,
			"gate-m6 AC4: IDOR — a stranger tenant with no membership in the owner's space was able to export the page")
		require.NotContainsf(t, string(strangerResp.Body), contentMarker,
			"gate-m6 AC4: cross-tenant export leaked the page body bytes: %s", string(strangerResp.Body))
	})

	t.Run("ai_path_ACL", func(t *testing.T) {
		ownResp := gateM6Do(t, client, http.MethodGet, base+"/api/orvex/pages/"+pageID+"/page.md", owner.token, nil)
		if ownResp.StatusCode == http.StatusNotFound && len(ownResp.Body) == 0 {
			t.Fatalf(
				"gate-m6 AC4: GET /api/orvex/pages/:id/page.md 404'd with an empty body for the OWNING tenant — most " +
					"likely ORVEX_MODULES_ENABLED is not \"true\" on this engine build (OrvexModulesEnabledGuard 404s " +
					"the whole llms surface when unset), which would make this AC's positive control meaningless. " +
					"Set ORVEX_MODULES_ENABLED=true on the engine under test.",
			)
		}
		require.Equalf(t, http.StatusOK, ownResp.StatusCode,
			"gate-m6 AC4: owning tenant could not read its own page via the AI discovery path (positive control failed); body=%s", string(ownResp.Body))
		require.Contains(t, string(ownResp.Body), contentMarker,
			"gate-m6 AC4: owning tenant's page.md response is missing the body marker (positive control weak)")

		strangerResp := gateM6Do(t, client, http.MethodGet, base+"/api/orvex/pages/"+pageID+"/page.md", stranger.token, nil)
		require.NotEqualf(t, http.StatusOK, strangerResp.StatusCode,
			"gate-m6 AC4: AI-path-ACL — a stranger tenant with no membership in the owner's space was able to read the page via /page.md")
		require.NotContainsf(t, string(strangerResp.Body), contentMarker,
			"gate-m6 AC4: cross-tenant AI-path read leaked the page body bytes: %s", string(strangerResp.Body))
	})
}

// gateM6ExpectedOrvexModules is AC5's protected baseline — the CURRENT
// `app.module.ts` shape per the ENG-1572 drift reconciliation §(e):
// `OrvexRootModule.register()` imported ALONGSIDE 6 separately-imported
// Orvex modules. "Untouched and still green" means "not regressed"; the
// single-OrvexRootModule consolidation is ENG-1604's job, not this gate's —
// so this list asserts the CURRENT six, not a future consolidated one.
var gateM6ExpectedOrvexModules = []string{
	"OrvexAttachmentsHostModule",
	"OrvexMailModule",
	"OrvexPageProvenanceModule",
	"OrvexPageVisualsModule",
	"OrvexTransclusionSafeguardModule",
	"OrvexEventsModule",
}

// testGateM6AC5 — "Given ORVEX_MODULES_ENABLED unset, When the engine
// boots, Then it runs byte-for-byte vanilla and the AGPL import-guard is
// green... protected baseline: OrvexRootModule.register() alongside the 6
// separately-imported Orvex modules."
//
// This is a STATIC source-shape assertion against the checked-out
// `app.module.ts` (this test's own working tree, not a network call) — it
// protects the CS §13 static gates (`engine-license-guard.sh`,
// `license-header-check.sh`, `engine-only-import-guard.sh`, all already
// wired as their own CI jobs) from silent regression via ONE additional,
// narrowly-scoped check this gate owns: that the documented 6-module +
// OrvexRootModule shape has not silently changed. It deliberately does NOT
// re-implement those existing static gates (that would be ❌#7 shallow
// duplication) and does NOT attempt a live flag-off vanilla boot (that is
// already covered by `apps/server/src/orvex/http/orvex-http.e2e.spec.ts`
// and is out of reach for a black-box single-instance smoke run against one
// already-running `APP_URL`).
func testGateM6AC5(t *testing.T) {
	t.Helper()

	raw, err := os.ReadFile(gateM6AppModulePath(t))
	require.NoError(t, err, "gate-m6 AC5: could not read app.module.ts")
	src := string(raw)

	require.Contains(t, src, "OrvexRootModule.register()",
		"gate-m6 AC5: app.module.ts no longer calls OrvexRootModule.register() — byte-parity baseline changed")

	for _, mod := range gateM6ExpectedOrvexModules {
		require.Containsf(t, src, mod,
			"gate-m6 AC5: app.module.ts no longer imports %s — the protected 6-module baseline regressed (or ENG-1604's "+
				"consolidation landed without this gate being updated to match its new shape)", mod)
	}
}
