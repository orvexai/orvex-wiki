# Recheck: orvexstudioknowledge vs brief-orvex-studio-2026-07-13

Pages read in full: INDEX.md, Architecture (azRwTCZMqw), Architecture Audit
(NdH4benMGe), R-9 Search-Stack Consolidation Design (0mFImku9Gp), PRD (dCbFzRQGDr),
PRD Addendum (dcOUbpzE8L), Importer Probe (dm0YOFovjb, empty/archived — skipped
for content). Prior sweep already covered service mandate/contracts/delivery
state, so the below excludes that ground (Kafka spine, ACL choke point, SSE
wire contract, Turbopuffer commitment, tenant-move, etc. are NOT re-flagged).

## Candidate gaps

- **Page/tier quota (PRD `dCbFzRQGDr` FR-K14, "PRD dCbFzRQGDr"):** "UI search
  p95 < 300 ms in-cell against the **LOCKED Free-tier corpus (200 pages/tenant —
  C7/D-S8)**; the £7 Personal tier corpus (20,000 pages — D-S7) is the next
  sizing point." — These are concrete, already-*locked* packaging numbers
  (200 pages free / 20,000 pages on the £5–7 tier). The brief's Scope section
  frames "which cheap-model/free-embedding capabilities clear the ~zero-cost
  bar for free and import/outbound-sync tiering" and "the exact £ price point"
  as still-open ("Open — queued for PRDs"), but does not mention that a
  content-volume quota per tier is already locked elsewhere in the family. Why
  it matters: package/tier composition sign-off is explicitly open in the
  brief, yet a concrete quota dimension (page counts) is already decided
  in a service PRD — the brief should either fold this locked number into its
  pricing framing or flag the inconsistency between "package composition
  pending blessing" and "quota already locked in knowledge PRD."

- **Search availability as a first-class UX guarantee (PRD `dCbFzRQGDr`
  NFR-K5, "Standalone-wiki posture (Decision 2)"):** "in a fully standalone
  deployment where knowledge is not configured/present, search / related / RAG
  / bundle surfaces are simply **absent** — ... the missing search is surfaced
  to the user as 'search unavailable', **never as an error**." This is a
  concrete product-facing behavior/UX ruling (graceful degrade language, not
  an error state) that the brief does not mention at all — not even as a
  consciously-excluded scope item. Why it matters: it is a real user-facing
  contract (how failure states read to end users) that could inform the
  brief's trust/preference-controls narrative but currently has no home there.

## Assessment

Both items are narrow and arguably already implicit in the brief's "Open —
queued for PRDs" quota/pricing bucket and its general trust/degradation
posture; neither rises to a missed *feature* or persona insight on the scale
of the brief's other [NEW]/[RULED] items. No missed personas, no missed
pricing *concept* (only a specific locked number), no missed scope ruling
of consequence. The bulk of both pages (Architecture, Architecture Audit, R-9,
PRD, Addendum) is engineering/program detail — ACL mechanics, Kafka spine,
Turbopuffer procurement, SSE wire contract, tenant-move, ADR filing — which is
out of scope per the task's instruction not to flag program/engineering
minutiae.
