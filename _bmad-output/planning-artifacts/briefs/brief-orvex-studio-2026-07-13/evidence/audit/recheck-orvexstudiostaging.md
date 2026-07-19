# Recheck: orvexstudiostaging vs brief-orvex-studio-2026-07-13

Scope: 3 pages (Architecture GOacy9kdJz, PRD mOzNDhn322, PRD Addendum P5R7eCXJA0). Prior sweep already covered service mandate/contracts/delivery state, so this pass looks only for product-level concepts the brief neither states nor consciously excludes.

## Candidate gaps

- **Librarian Prompt Pack marketplace (FR-STG29, PRD §4.6)** — missed as a product/packaging concept. Quote: "Tenants can publish and install Librarian Prompt Pack templates through the Studio marketplace surface... v1-minimal = publish / install / rate; no revenue share." Why it matters: this is a *second* marketplace concept (curation-policy templates) distinct from the brief's "Prompt Composer" marketplace-skill idea; the brief's Scope-In list names "the Librarian + staging area (as already ratified)" but never surfaces prompt-pack templates as a user-facing/marketplace feature or packaging idea, so a reader would not know Orvex Studio ships two different marketplaces in v1.

- **Scheduled ChangeSet publishing (FR-STG28, PRD §4.6)** — missed as a user-facing feature. Quote: "An accepted ChangeSet (or accepted subset) can be scheduled to apply at a future time... timezone-aware, cancellable until apply-start." Why it matters: this is a concrete, PO-decided (2026-07-10) v1 capability of the knowledge-curation experience — a scheduling/publishing behavior end users (or admins) will directly interact with — and it appears nowhere in the brief's product narrative or Scope In list, which only speaks of the Librarian in general review/apply terms.

- **Knowledge-manager/curator and admin personas (PRD §2.1 JTBD)** — persona insight not carried into the brief. Quote: "Knowledge managers / curators (customer humans): 'let me review a morning's worth of agent proposals in minutes...'" and "Customer admins: 'let me tune how aggressive the Librarian is.'" Why it matters: the brief's "Who This Serves" section names only consumer personas (Priya, Laura/teachers) and gestures at "the business/teams product" abstractly; it never mentions that the business/enterprise surface has a distinct curator/admin persona with its own JTBD (bulk review workflows, per-space dial tuning) — a gap for a brief claiming the three-surface arc is "planned in from the start."

## Not flagged (covered or consciously in scope-at-brief's-altitude)

Autonomy Dial (recommend/auto-apply-low-risk/full-auto) is already represented in the brief's "confirm-everything → auto-when-confident → fully automated" trust-dial paragraph. Divert-to-workgraph edge, contracts/lib/bridge foundations, and all AD-1..AD-14 architecture invariants are engineering-level and were correctly left to the prior sweep / are the brief's declared "Scope Out"/program-doctrine territory.
