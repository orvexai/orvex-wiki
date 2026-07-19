## 🎯 Story

As a **maintainer of the identity service**, I want the **three LOW SE-Arch repo-side cleanups reconciled — the stale base `httproute.yaml` comment removed/corrected (F7), the Deployment-vs-Knative topology + binary-name drift reconciled to a recorded decision (F8), and the config struct aligned with the delivered ExternalSecret keys (F10)** — so that the scaffold's deploy plumbing and config surface stop contradicting the architecture and the delivered secrets, before the verify path lands on top of them.

**Definition of Done:** `TestIdentityRepoSideAuditCleanups` (manifest-conformance + config unit) — the base `httproute.yaml` carries no stale "orvex.dev is NOT wired" comment; the server workload topology + binary names match a recorded decision (Knative min-scale ≥ 1 as `authd`/`lifecycled`, or the plain-Deployment reversal explicitly recorded); and `config.go` reads the load-bearing `CLERK_JWKS_URL` (supplied by the ExternalSecret) with no unread `CLERK_PUBLISHABLE_KEY`.
*Final H1–H17 elaboration + the F8 topology decision are pinned at pack certification (ENG-2101); this story is dispatch-blocked until that tag exists.*

## ✅ Acceptance Criteria

- [ ] **AC1 (F7)** — Given the base `httproute.yaml`, When reviewed, Then the stale comment **"orvex.dev is NOT wired on this cluster"** is deleted or corrected to match the `components/staging` wiring of `auth.orvex.dev` on `orvex-dev-https`. *assert: no contradictory `orvex.dev`-not-wired comment remains in the base; functional config unchanged.* [Source: YuY9XWpKPS F7]
- [ ] **AC2 (F8)** — Given `deployment-server.yaml` (plain `apps/v1` Deployment, 2 replicas) versus arch §1 + NFR-I2 (`authd` as a Knative Service, min-scale ≥ 1) with binary-name drift (`server`/`deprovisioner` vs `authd`/`lifecycled`), When reconciled, Then the topology + binary names **match a single recorded decision** — either the Knative min-scale ≥ 1 path renamed to `authd`/`lifecycled`, or the plain-Deployment path with its reversal explicitly recorded. *assert: rendered workload topology + binary names equal the recorded decision; no silent divergence.* [Source: YuY9XWpKPS F8]
- [ ] **AC3 (F10)** — Given `config.go`, When it loads config, Then it reads the load-bearing **`CLERK_JWKS_URL`** (supplied by the ExternalSecret, required for A-IDP JWKS-cache-per-issuer verification) and does **not** read the never-supplied **`CLERK_PUBLISHABLE_KEY`** (removed or explicitly justified). *assert: config struct reads `CLERK_JWKS_URL`; no unread `CLERK_PUBLISHABLE_KEY` field.* [Source: YuY9XWpKPS F10]

## 🔨 Tasks

- [ ] RED: `TestIdentityRepoSideAuditCleanups` — assert config reads `CLERK_JWKS_URL`, no `CLERK_PUBLISHABLE_KEY`; assert rendered topology/binary names match the recorded decision (AC2, AC3).
- [ ] GREEN (F7): delete/correct the stale base `httproute.yaml` comment (AC1).
- [ ] GREEN (F8): reconcile the Deployment-vs-Knative topology + binary names to the recorded decision (AC2).
- [ ] GREEN (F10): align the config struct with the delivered ExternalSecret keys (AC3).

## 🧠 Context

**🧾 Gap provenance (2026-07-15):** traceability-matrix sweep (225 canon pages, id-level join). F7, F8, and F10 are three LOW audit findings with **open-decision / fixed-in-draft-choice** repo-side dispositions that were never bound to a story — the audit fixed the arch-side wording but explicitly left the repo-side deletions/reconciles for Act-1. Consolidated into one cleanup ticket per instruction (all three are small, repo-side, and adjacent to the deploy/config surface).

Tier: deploy manifests (`deploy/kustomize/**`, `httproute.yaml`, `deployment-server.yaml`) + `internal/config/config.go`. F10's `CLERK_JWKS_URL` is load-bearing for the JWKS-cache-per-issuer verify path (E1 verification spine) — this cleanup lands the config alignment so the verify story does not inherit a placeholder-drift bug. F8 must land as a **single recorded decision**, not a silent reversal (no-fallbacks doctrine).

## 🧪 Testing

`TestIdentityRepoSideAuditCleanups` (manifest-conformance via `kubectl kustomize` + a config-loader unit test). CS §5: assert against the real rendered manifests + the real config loader, not a fixture.

## 📏 Guidance

CS `6aMAzsYeQb` §§0/10/11 (config-as-code; honesty — no stale/contradictory comments; no baked/unread keys). SE-Arch `8sYi523i4t`: Operational Excellence (topology reconcile, config-key alignment); no-fallbacks (F8 reversal must be recorded, never silent).

## 🔗 References

Architecture Audit — SE-Arch review `YuY9XWpKPS` — **F7** (stale base `httproute.yaml` comment vs `components/staging` `auth.orvex.dev` wiring), **F8** (plain `apps/v1` Deployment vs Knative min-scale ≥ 1 `authd`; binary-name drift `server`/`deprovisioner` vs `authd`/`lifecycled`), **F10** (config reads never-supplied `CLERK_PUBLISHABLE_KEY`, ignores delivered `CLERK_JWKS_URL` needed for A-IDP JWKS-cache-per-issuer verification).

## 🔗 Dependencies

Blocked by: **ENG-2101** (identity pack). Project **Orvex Studio Identity**, milestone **B8 — Persistence, cell-contract conformance & security ops**. F10 config alignment must-resolve before the E1 verify path lands on it.

## 📡 Protocol

CLAIM → PLAN → PROGRESS → COMMITS ("Part of ENG-NNN", never closes) → HANDOFF → REVIEW (reviewer ≠ implementer) → TICK → DONE (orchestrator-only) → ESCALATE.
