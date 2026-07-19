
## Memory gap-closure — requirements (fold-in)

> Source of record: PRD `g9vWbSYplh` + Architecture Spine `iiCcKhGptV` + Fold-in Map `vBvVDFklZo`. Merged verbatim (no loss). Owned slice: **F0 onboarding + F1 client compose (NEW component)**.

- **FR-O1** A new user MUST reach a **first useful, memory-enriched output within their first session**, via a guided seed: a short profession-aware setup that produces starter Memory + a seeded demo world (per the onboarding/demo-data research, `axvs1ZzxGn`).
- **FR-O3** Every memory surface MUST have a **designed empty state** that teaches the next action (not a blank screen), and a demo/real separation so seeded content is never mistaken for the user's own or lost on clear.
- **FR-O4** "Connect an assistant in one guided step" (FR-D2) MUST have a concrete acceptance test: a non-technical user completes connection in **≤ 3 taps and ≤ 2 minutes with no config file or command line**, verified by first-run usability testing.
- **FR-D1** Orvex MUST deliver a composed prompt enriched with relevant Memory into the **ChatGPT and Gemini web UIs without copy/paste**. `[ASSUMPTION]` a browser extension is the mechanism; alternatives (bookmarklet, native helper) are weighed in architecture (OQ1).
- **FR-D2** A non-technical user MUST be able to connect an assistant in **one guided step** — no MCP configuration, no local server, no JSON — with clear per-assistant connection status. *Acceptance:* FR-O4.
- **FR-D3** Delivery MUST cover the beachhead assistants (ChatGPT, Claude, Gemini, Grok), with honest "not yet supported" messaging for others.
- **FR-D4** Delivery MUST honor the personal↔employer firewall and **per-use consent** for private memories — never silent injection.
- **FR-D5** Delivery MUST NOT scrape or breach provider ToS: it injects into the user's *own* session/compose surface, and **degrades to copy/paste** when a provider blocks injection.
- **FR-D6** Outbound Memory sync MUST continue for vendors with native memory APIs (Claude adapter); ChatGPT is reached via FR-D1 until/unless an API exists.
- **FR-D7** Delivery MUST **detect its own breakage** (a provider changing its web UI) and fail loud — notify the user, fall back to copy/paste, and alert the team — rather than silently injecting into the wrong place or nothing.
