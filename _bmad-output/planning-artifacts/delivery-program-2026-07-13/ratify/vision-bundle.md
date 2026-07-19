# Ratify receipt — Vision amendment bundle (CSqjqciAX9)

- **Page:** `CSqjqciAX9` — "Vision — Knowledge & Prompt Management for AI (for everyone)" (space `orvexstudio`)
- **URL:** https://docs.eu-central-1.myidp.cloud/s/orvexstudio/p/vision-knowledge-prompt-management-for-ai-for-everyone-CSqjqciAX9
- **Authority:** PO Daniel ratify-all (verbal, session 2026-07-13). Bundle defined by two durable page comments (`019f5aeb…`, `019f5afa…`).
- **Method:** ProseMirror-JSON surgery (page carries `{dfm}` mention embeds in "See also" → no markdown patch). CAS write via `--content-json` + `--if-version`.
- **Status:** page was already `canonical`; no draft→canonical promotion required. Applied the three content edits in place; status unchanged (`canonical`).
- **Version:** if-version `2026-07-12T17:44:18.759Z` → new `2026-07-13T12:54:46.034Z` (outcome: `updated`, exit 0, no conflict).
- **Invariants held:** top-level nodes 37→37; tables 0→0; mentions 3→2 (only ApOYJwtWnK removed).

## Edit 1 — Wedge re-ratification (comment 019f5aeb)

Phase-1 wedge paragraph + expansion-path line rewritten. Product story stays "for everyone non-technical"; launch wedge is now **teachers** (richest validated persona; demo data leads with a teacher). Surrounding structure/length preserved; current-state-only wording.

- Node 26 (wedge): `…for a single locked vertical (estate agents or SMB marketing).` → `…for a single locked vertical — teachers, the launch wedge (our richest validated persona; the demo data leads with a teacher).`
- Node 29 (expansion): `…sector by sector (estate agents → SMB marketing → education → …).` → `…sector by sector (teachers → SMB marketing → estate agents → …).`
- Untouched (out of scope): "In short" blockquote and "Who it is for" already frame the product as for all non-technical professionals.

## Edit 2 — Wizard rewording (comment 019f5afa)

Node 15 (UX philosophy). Generate-by-selection stays the DEFAULT entry; the wizard-driven TASK-FIRST prompt builder is sanctioned as an alternative entry; pure unguided free-form remains out.

- Old: `Generate-by-selection, not free-form: … Free-form generation is fast-follow after a quality spike — it is not the default.`
- New: `Generate-by-selection, not unguided free-form, is the default entry: … A wizard-driven, task-first prompt builder is a sanctioned alternative entry — guided composition from marketplace skills plus your own Memory/wiki context via RAG. Pure unguided free-form generation stays out.`

## Edit 3 — Link hygiene (comment 019f5aeb)

Dropped the "see also" bullet pointing to `ApOYJwtWnK` ("What We Will Not Build" — superseded, parked in OPS Archive) with its overstated "Phase 1 reconciliation (what changed and why)" gloss. Preferred drop (NOT-list content already lives in this Vision's own Phase-1 constraints). Remaining two "see also" links kept: `WA9A1sEol7` (Product brief), `eO3CSNGaoU` (Phase 1 build spec).

## Verification (re-fetch)

- Markdown re-fetch: new wizard/wedge/expansion strings present; old strings absent; `ApOYJwtWnK` (raw + base64 `QXBPWUp3dFduSw`) absent.
- PM re-fetch: mentions = `['WA9A1sEol7','eO3CSNGaoU']`; See-also bulletList = 2 items; tables 0; 37 top-level nodes.
- (Markdown-string checks for the two kept slugIds report false-negative because mentions serialise as base64 `dfm` tokens in markdown — confirmed present via PM.)

## Notes for the ratify pass

- The two page comments remain unresolved on the page. They describe the queued bundle now executed; a follow-up may resolve them, but resolving comments was not in this task's scope.
