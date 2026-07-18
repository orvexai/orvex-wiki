# Evidence: 2025–2026 State of the Art — Designing CLIs for AI Agents

**Scope of this note.** External web research only (no repo code read). Feeds the Track 2 (AI-first redesign) evaluation of `orvex-cli`, and secondarily informs how `orvex-wiki-api` and `orvex-studio-mcp` should expose machine contracts that a CLI-fronting-agent would rely on. All dates are as reported by the sources at fetch time (2026-07-17).

---

## 1. clig.dev — Command Line Interface Guidelines

**Source:** https://clig.dev/ (project: https://github.com/cli-guidelines/cli-guidelines — formerly a Heroku/GitHub/Google-engineer-authored community guide, actively maintained)

This is still the closest thing the industry has to a canonical CLI design spec, and every 2025–2026 "agent-friendly CLI" article treats it as the baseline to extend, not replace. Relevant excerpts:

| Area | Guidance | Source section |
|---|---|---|
| Exit codes | "Return zero exit code on success, non-zero on failure." | The Basics |
| Output streams | Primary/machine-readable content → `stdout`; log/error messaging → `stderr` | The Basics |
| JSON output | "Display output as formatted JSON if `--json` is passed" — enables `jq`/`curl` composition | Output |
| Plain/tabular fallback | "Use `--plain` to display output in plain, tabular text format for integration with tools like `grep` or `awk`" when human formatting would break machine parsing | Output |
| TTY detection | "The most simple and straightforward heuristic for whether a particular output stream is being read by a human is whether or not it's a TTY" — disable color/animation off-TTY | Output |
| Help text | Concise help with no args; extensive help via `-h`/`--help`; **lead with examples** because "users tend to use examples over other forms of documentation" | Help |
| Confirmation | "Confirm before doing anything dangerous" — prompt for `y`/`yes` interactively, or require `-f`/`--force` non-interactively | Arguments and flags |
| Interactivity | "Only use prompts or interactive elements if `stdin` is an interactive terminal (a TTY)" | Interactivity |
| Subcommand naming | "Be consistent across subcommands. Use the same flag names for the same things, have similar output formatting" | Subcommands |
| Noun-verb grammar | "noun verb" ordering (e.g. `docker container create`) is the common, recommended pattern for object+operation CLIs | Subcommands |
| Robustness | "Crash-only" design — defer cleanup to next run so the program can exit immediately on failure/interrupt; make failures recoverable by simple re-invocation | Robustness |

**Read for the program:** clig.dev predates the agent-as-primary-user framing (it's human-first, "don't output info only understandable by the tool's authors" by default). The 2025–2026 literature (below) treats clig.dev as necessary-but-not-sufficient — every "agent-friendly CLI" article assumes clig.dev compliance and layers agent-specific requirements on top (schema introspection, stable JSON contracts, non-interactive-by-default rather than interactive-by-default-with-a-flag).

---

## 2. `gh` CLI as the reference exemplar

**Sources:**
- GitHub CLI manual, output formatting: https://cli.github.com/manual/gh_help_formatting
- GitHub Engineering blog, "Scripting with GitHub CLI": https://github.blog/engineering/engineering-principles/scripting-with-github-cli/ (published 2021-03-11, updated 2021-05-14 — still the canonical scripting guide referenced across 2025–2026 agent-CLI posts)
- `--json`/`--jq`/`--template` combination discussions: cli/cli#8734, cli/cli#5161, cli/cli#5394, cli/cli#8415 (open GitHub issues, still active in 2025–2026, showing the contract is evolving under real usage pressure)

Key mechanics `gh` demonstrates as the exemplar pattern:

- **`--json <fields>`** — comma-separated field allowlist; omitting the value lists the available fields for that command (self-documenting schema discovery without external docs).
- **`--jq <query>`** — jq-syntax post-filter; the jq binary does **not** need to be installed — `gh` vendors the evaluator, so the machine contract has no external dependency.
- **`--template <go-template>`** — Go-template rendering with helper functions (`autocolor`, `color`, `join`, `pluck`, `tablerow`, `timeago`, `hyperlink`, plus Sprig string functions) for building custom human-readable views without leaving the CLI.
- **`--json` is required to unlock `--jq`/`--template`** — the raw structured shape is the single source of truth; formatting is always a projection of it, never a separate code path.
- **TTY-aware auto-formatting**: piped output automatically switches to tab-delimited machine format vs. the padded/colored table shown in an interactive terminal — no flag needed for the common case.
- **Composability idioms** documented in the blog: `gh pr list | fzf` for interactive fuzzy-selection pipelines; `gh api` as an authenticated, paginating, JSON-decoding low-level escape hatch beneath the higher-level porcelain commands (mirrors git's plumbing/porcelain split).
- Live 2025–2026 GitHub issues show the community still pushing `gh` toward *combining* `--jq` and `--template` in one invocation — evidence the "structured-data-first, projections-on-top" contract is the thing users actually want extended, not replaced.

**Gap noted in the sources:** neither the manual nor the blog post makes an explicit, written **stability/versioning guarantee** for JSON field names across `gh` releases — it's a de facto contract enforced by "don't break userspace" discipline rather than a documented SemVer promise. This is a concrete thing an AI-first CLI spec should do *better than* `gh`: publish an explicit schema-stability guarantee (see §7, Google Workspace CLI reference).

---

## 3. Machine-output contracts: stable JSON, NO_COLOR, TTY, stdout/stderr

- **NO_COLOR**: the informal but widely adopted convention (no-color.org — page could not be fetched live during this research pass due to a DNS timeout, but its content is corroborated verbatim across multiple 2025–2026 secondary sources): *if the `NO_COLOR` environment variable is present and non-empty (regardless of its value), command-line programs should not add ANSI color to their output.* Referenced directly by Trevin Chow's agent-CLI principles (§5) and the "Design Patterns for Agent-Ready CLIs" piece (§7) as a required escape hatch alongside explicit flags.
- **TTY detection practicals** (aggregated from Bash/`isatty`/Deno ecosystem discussion, mid-2025–2026):
  - Shell: `[[ -t 1 ]]` for stdout, `[[ -t 2 ]]` for stderr.
  - C/POSIX: `isatty()` on the target file descriptor.
  - Convention: check `NO_COLOR` **first**, then TTY status, and only emit ANSI escapes if both checks pass — precedence order matters because agents/CI often set env vars but can't always control the pty allocation of the harness they run inside.
- **stdout/stderr discipline**, per clig.dev + the agent-CLI corpus: primary/result data → stdout only; all logging, progress, and diagnostics → stderr, and — critically for agents — **not styled as a log file by default** (no `[ERR]`/`[WARN]` prefixes unless `--verbose`), because agents parsing stderr for an error signal get false positives from decorative log framing.
- **Output format as an API contract**: the InfoQ piece (§7) states this most sharply — *"Every CLI tool that outputs structured data is publishing an API contract."* Recommends JSON Schema/CUE-defined shapes, CI-enforced schema validation, and SemVer discipline where only additive JSON changes are non-breaking. Cites Terraform's practice of embedding a version field inside state/output as the pattern to imitate.

---

## 4. Why agents prefer CLIs — and the CLI-vs-MCP framing from Anthropic

**Source:** Anthropic Engineering, "Equipping agents for the real world with Agent Skills," 2025-10-16 — https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
**Companion source:** Anthropic Engineering, "Code execution with MCP: building more efficient AI agents" — https://www.anthropic.com/engineering/code-execution-with-mcp

Findings:

- Anthropic's own docs state plainly (best-practices guide, corroborated by search synthesis): **"CLI tools are the most context-efficient way to interact with external services."** Direct MCP tool calls pay a context cost per tool definition and per raw result; a CLI invoked via the Bash tool lets the agent write code/shell that filters and shapes data *before* it ever enters the model's context window.
- **Skills as progressive disclosure**, explicitly named a "core design principle": three layers —
  1. Metadata only (name + one-line description) loaded into the system prompt at session start — cheap, always resident.
  2. Full `SKILL.md` body loaded only when Claude judges the skill relevant to the current task.
  3. Additional bundled files (scripts, references, examples) fetched on demand, navigated like a filesystem.
  Anthropic's own framing: "a well-organized manual that starts with a table of contents, then specific chapters, and finally a detailed appendix." Reported real-world cost: ~1,500 tokens total overhead for 40+ installed skills, vs. thousands of tokens if all loaded up front — this is the direct empirical case for **CLI `--help` + skill files over a flat, always-loaded MCP tool manifest**.
  4. Anthropic explicitly frames Skills and MCP as *complementary*, not competing — "Skills can complement Model Context Protocol servers by teaching agents more complex workflows that involve external tools and software" — i.e., MCP supplies typed capability/auth surface, Skills (often CLI-invoking) supply the *procedural know-how* of using that surface well.
- The "Code execution with MCP" companion piece generalizes this: presenting MCP servers *as code APIs* (so the agent writes code that calls tools programmatically, filtering/aggregating locally) is Anthropic's recommended pattern for scaling past dozens of tools — structurally the same argument as "give the agent a CLI/SDK, not a giant flat tool list."

**Program-relevant synthesis:** the intended `orvex-cli` should be thought of as exactly this local, filterable, context-cheap surface — the thing an agent shells out to and pipes/`jq`s locally — while `orvex-studio-mcp`'s 19-verb surface is the typed, authenticated capability layer the CLI (and Skills built for it) sit on top of. This is not a hierarchy dispute; both surfaces already exist in this program and the research says they should stay complementary, not be collapsed into one.

---

## 5. Agent-first CLI argument design & the emerging "7 principles" literature

**Primary source, most rigorous of the set:** Trevin Chow, "7 Principles for Agent-Friendly CLIs," 2026-03-26 — https://trevinsays.com/p/7-principles-for-agent-friendly-clis

| # | Principle | Concrete mechanism |
|---|---|---|
| 1 | Non-interactive by default | No TTY → no prompts, automatically; also support explicit `--no-input`/`--yes`; interactive mode stays available for humans but is never the *only* path |
| 2 | Structured, parseable output | `--json` machine contract over formatted tables; stdout = results, stderr = diagnostics; suppress ANSI off-TTY |
| 3 | Fail fast with actionable errors | Exact problem statement + correct invocation syntax + valid-value suggestions + example — enough to self-correct in one retry, no back-and-forth |
| 4 | Safe retries & explicit mutation boundaries | Idempotence or duplicate-work detection on retry; `--dry-run` for consequential ops; explicit destructive flag (e.g. `--confirm`) for dangerous mutations |
| 5 | Progressive help discovery | Top-level `--help` enumerates commands; subcommand `--help` gives purpose + invocation pattern + required args + concrete examples — mirrors the "deterministic tree search" framing from the noun-verb research below |
| 6 | Composable & predictable structure | stdin/stdout piping support, `-` as stdin alias, consistent naming across sibling subcommands, chainable for automation |
| 7 | Bounded, high-signal responses | Default to narrow/paginated/filterable results; on truncation, teach the caller how to narrow the query rather than dumping the full dataset |

Author's stated thesis: **"Designing for agents as a first-class consumer removes that tax, and the CLI ends up better for humans in the process."** — i.e., agent-first is not a tax on human UX, it's a forcing function toward the same clarity clig.dev already asked for.

**Secondary source, systems/security framing:** Justin Poehnelt, "You Need to Rewrite Your CLI for AI Agents," 2026-03-04 — https://justin.poehnelt.com/posts/rewrite-your-cli-for-ai-agents/

- Central claim: human-optimized and agent-optimized CLIs have **fundamentally different requirements** — don't retrofit, design for the agent as an "untrusted operator" needing defensive architecture (agents hallucinate differently than humans typo — validate for path traversal, control characters, embedded query params, URL-encoded injection).
- Recommends `--json` accepting raw JSON payloads for input (not just output) so agents can construct structured requests instead of composing many flags.
- **Runtime schema introspection** — a command like `<cli> schema` so an agent can query the tool's own capability surface *without needing external docs at all*. This is the single most load-bearing idea from this article for the program's Track 2 design.
- NDJSON pagination and field masks specifically to protect the agent's context window from oversized responses.
- Sanitize API responses against **prompt injection embedded in returned data** — a safety concern specific to agent consumers that human-facing CLI guidance (clig.dev) never had to consider.
- "Encode invariants in skill files and context documentation rather than relying on `--help`" — i.e., `--help` is necessary but not sufficient; ship a Skill/llms.txt-style companion doc for the deeper contract.
- Cites the (illustrative/example) **Google Workspace CLI** as reference implementation and recommends an incremental rollout: JSON output + input validation first, then schema introspection, then skill files.

**Third source, systems/telemetry framing:** Sriram Madapusi Vasudevan, InfoQ, "Keep the Terminal Relevant: Patterns for AI Agent Driven CLIs," 2025-08-08 — https://www.infoq.com/articles/ai-agent-cli/

Five principles, overlapping but adding two things not covered above:

1. **Human conveniences need escape hatches** — explicit flags (`--no-prompt`), env vars (`NO_COLOR`, tool-prefixed vars like `MYCLI_PROFILE`), precedence `flags > env vars`; **semantic exit codes**: `0` success, `1–2` correctable user error, `3–125` app-specific, and these codes must stay **stable across minor versions** — treat the exit-code space itself as part of the versioned contract.
2. **Output formats as API contracts** (detailed in §3 above).
3. **Expose capabilities via MCP** for dynamic, runtime capability discovery — explicitly framed as complementary to the CLI, not a replacement.
4. **Tight feedback loops** — `--syntax-check`/`--check --diff` pre-validation, streamed progress for long-running ops, graceful SIGTERM handling so agents can trust consistent state after interruption.
5. **Data-driven, opt-in telemetry** distinguishing agent traffic from human traffic, with an explicit opt-out (`MYCLI_NO_TELEMETRY=1`).

**Cautionary tale cited (load-bearing for "no fallbacks / no interactive surprises" discipline this program already holds):** AWS CLI v2's pager change to `less` became interactive by default in headless environments and **broke thousands of CI jobs** — cited repeatedly across the 2025–2026 corpus as the canonical example of why "non-interactive by default, not opt-in" (principle #1 above) is non-negotiable, not a nicety.

**Fourth, lighter source (Japanese-authored, corroborating not adding):** "Design Patterns for Agent-Ready CLIs: 10 Rules for Building Command Lines Used by AI" — https://note.com/_kihonushi/n/nd8e57741e1d5?hl=en — converges on the same set: non-interactive mode, `--json`, `--dry-run`, `--yes`, immediate concrete errors, idempotency, predictable structure. Useful mainly as confirmation the consensus is now broad, not a single blogger's opinion.

---

## 6. Safety affordances for autonomous use — synthesis across sources

| Affordance | What the 2025–2026 sources converge on |
|---|---|
| `--dry-run` | Required on every consequential/mutating command; must show the concrete planned diff/effect, not a vague "would proceed" message |
| `--yes` / confirmation bypass | Default path stays interactive-confirm for humans; agents get an explicit, auditable bypass flag — never a silent default-to-yes |
| Idempotency | Prefer **declarative verbs** (`ensure`, `apply`, `sync`) over **imperative verbs** (`create`, `delete`) wherever the operation can be made naturally idempotent; where an operation is inherently imperative, add explicit duplicate/conflict detection so blind retries are safe |
| Typed/actionable errors | Error payload should carry: exact problem, correct invocation, valid-value hints, and an example — sources converge this should be enough for an agent to self-correct in a single retry without a human in the loop |
| Explicit destructive flags | Distinct from the general `--yes` gate — e.g. `--confirm-delete`, matching the "explicit flags for dangerous operations" pattern, so a blanket `--yes` used for routine automation can't accidentally also authorize destruction |
| State observability | "Return enough state in success output to verify what happened" — every mutating command's success response should let the caller (agent) confirm the actual resulting state without a follow-up read call |
| Input adversarial-hardening | Treat agent-constructed input as untrusted: validate against path traversal, control characters, injected query params/URL-encoding — framed explicitly as different from *human* typo-classes of bad input |
| Response sanitization | Sanitize returned data against prompt-injection payloads that could be embedded in stored content (directly relevant to `orvex-wiki-api`/MCP returning wiki page bodies verbatim — untrusted user-authored wiki content flowing back into an agent's context is exactly this threat class) |

---

## 7. Noun-verb grammar & consistency

- clig.dev and the .NET `System.CommandLine` design guidance (https://learn.microsoft.com/en-us/dotnet/standard/commandline/design-guidance) and Nix's CLI guideline (https://nix.dev/manual/nix/2.28/development/cli-guideline.html — pattern: `nix [<GROUP>] <COMMAND> [<ARGS>] [<OPTIONS>]`, GROUP=noun, COMMAND=verb) all converge on **noun-then-verb** (`docker container create`, `gh pr create`) as the dominant, recommended ordering over verb-then-noun.
- The agent-specific value-add found in this pass (from the "Writing CLI Tools That AI Agents Actually Want to Use" search synthesis): noun-verb grouping is **"exceptionally agent-friendly because it naturally groups related actions in the `--help` output. When an agent runs `myctl user --help`, it sees all possible actions (verbs) for that resource. This hierarchical structure turns exploration into a deterministic tree search, rather than a guessing game."** This is a materially different justification from the human-usability rationale in clig.dev — for agents the win is *exploration determinism*, not just readability.
- Consistency rule repeated everywhere: never let two subcommands mean almost-the-same-thing ("update" vs "upgrade" cited as the canonical anti-pattern) — ambiguity that a human resolves by convention/experience is a hard failure mode for an agent choosing between tools by name+description alone.

---

## 8. Daemon/cache patterns for latency

**Source synthesis** (CocoIndex "Invisible Daemon" architecture post; Redis cache-optimization guide; general cold-start/serverless latency literature — no single canonical paper, this is engineering-blog consensus circa 2025–2026):

- Pattern: **auto-start-on-first-use daemon behind a Unix socket**, probed transparently by the CLI's front-end process; **version handshake on every connection** so the daemon can be transparently upgraded without the caller noticing a protocol mismatch.
- Per-request socket connections carry ~0.1ms overhead — negligible for a human-paced CLI invocation, but this overhead compounds when an *agent* is issuing many rapid sequential calls in a single task loop, which is the actual latency-sensitive case for this program (an agent driving `orvex-cli` through dozens of calls per task, not a human typing one command).
- **Proactive/background cache refresh**: update caches speculatively in the background rather than blocking the next request on a cold path — avoids the "first caller after cold start pays the full latency" problem; only one request ever eats a cold miss, subsequent ones ride the warmed cache.
- Persistent code/warm-process caching reported to cut startup latency 60–70% and memory by ~two-thirds for short-lived process invocations — directly applicable to a CLI written in a runtime with slow cold-start (relevant if `orvex-cli`'s successor stack has any non-trivial process-boot cost per invocation, e.g. a large dependency graph).
- Direct tie-in to this program's own memory record: **[Linear cache-first model]** (`.claude` memory: "sync all once, read from cache, refresh-on-write per ticket") is the same pattern independently arrived at for `linearis`/Linear reads — the external research validates that architectural choice as consistent with 2025–2026 best practice, not a local hack.

---

## 9. Exposing CLI docs to agents: help-as-data, llms.txt, skill files

**Sources:**
- Mintlify, "Real llms.txt examples from leading tech companies" — https://www.mintlify.com/blog/real-llms-txt-examples
- Fern, "API Docs for AI Agents: llms.txt Guide," May 2026 — https://buildwithfern.com/post/optimizing-api-docs-ai-agents-llms-txt-guide
- Fern, "Write LLM-friendly docs," March 2026 — https://buildwithfern.com/post/how-to-write-llm-friendly-documentation
- Snowflake docs release note on agent-friendly docs, 2026-04-15 — https://docs.snowflake.com/en/release-notes/2026/other/2026-04-15-agent-friendly-docs

- **`llms.txt`** is described as the convention "the AI-coding ecosystem coalesced around in 2025" — a root-level file (peer to `robots.txt`/`sitemap.xml`) that gives an LLM/agent a curated, markdown, token-budget-aware index into a docs site instead of forcing it to parse rendered HTML, nav chrome, and client-side-rendered content.
- Format: H1 project name, a one/two-sentence blockquote summary, then structured links. Snowflake's 2026-04-15 update is notable for moving to a **hierarchical** llms.txt (root file linking to section-level index files) specifically so "agents and tools can fetch only the sections they need, reducing token usage and improving relevance" — the same progressive-disclosure principle as Anthropic's Skills three-layer model (§4), applied to docs sites instead of tool definitions.
- Mintlify's reported stat (as of their 2026 blog post): **nearly half of documentation-site traffic now comes from AI agents/coding tools** rather than human browsers — the empirical justification for treating "help as data" as a first-class deliverable, not an afterthought.
- **Direct analogue for a CLI** (synthesized from Poehnelt §5 + Anthropic Skills §4, since no source addresses "llms.txt for CLIs" as a named artifact yet): the emerging pattern is (a) rich, example-led `--help` per clig.dev, (b) a runtime `schema`/introspection subcommand so an agent can self-discover the full contract without any external fetch, and (c) a companion Skill file (Claude Code SKILL.md-style, or an equivalent portable format) carrying the *procedural* knowledge `--help` can't — sequencing, common workflows, gotchas, safety invariants. All three layers are named as necessary by at least one 2025–2026 source; none of the sources found treat any single one of the three as sufficient alone.

---

## 10. Research grounding on agent tool-use reliability (why any of this matters)

**Sources (arXiv, 2025–2026):**
- "Agentic Tool Use in Large Language Models" — https://arxiv.org/html/2604.00835v1
- "LLM Agents Already Know When to Call Tools — Even Without Reasoning" — https://arxiv.org/html/2605.09252v1
- "Evaluating Tool-Using Language Agents: Judge Reliability, Propagation Cascades, and Runtime Mitigation in AgentProp-Bench" — https://arxiv.org/html/2604.16706v1
- "Learning to Rewrite Tool Descriptions for Reliable LLM-Agent Tool Use" — https://arxiv.org/pdf/2602.20426
- Survey: quchangle1/LLM-Tool-Survey (GitHub) — https://github.com/quchangle1/LLM-Tool-Survey
- Benchmarks referenced across the corpus: **BFCL** (Berkeley Function-Calling Leaderboard — single-turn/multi-turn/agentic function-calling accuracy across API styles) and **Gorilla** (correct API-call generation), **AgentBench** (8 environments incl. web/DB).
- Standards context: MCP (Anthropic, 2024) and Agent2Agent/A2A (Google, 2025) named as the two standardized interaction protocols the tool ecosystem has converged on for *typed* agent-tool interaction — the layer a well-designed CLI's JSON contract should be compatible with, not competing against.

**Relevance to the CLI design question:** the tool-description-rewriting and propagation-cascade research (AgentProp-Bench, "Learning to Rewrite Tool Descriptions") both converge on the same failure mode this whole literature is defending against by other means: **ambiguous or poorly-specified tool/command surfaces cause errors that cascade** through an agentic loop rather than failing locally. This is the research-side justification for the practitioner consensus above (typed errors, schema introspection, example-led help, noun-verb determinism) — all of it is aimed at collapsing the space of ways an agent can misuse the surface, because a single bad call early in an agentic loop compounds.

---

## Ranked design principles for an AI-first multi-service CLI (orvex-cli)

Synthesized ranking — most load-bearing / highest-leverage first — for the Track 2 redesign of `orvex-cli` as the successor to `docmost-cli`, sitting atop `orvex-wiki-api` (Go /v1) and interoperating with `orvex-studio-mcp` (19-verb surface):

1. **Non-interactive-by-default, not interactive-with-an-escape-hatch.** No TTY → zero prompts, automatically, with `--yes`/`--no-input` as an explicit, auditable override for the rare case a human forces interactivity in a script. (AWS CLI v2 pager incident is the negative case study every source cites — this is the #1 rule because getting it backwards breaks *every* downstream automation, not just agents.)

2. **Structured output is the contract; formatting is a projection of it, never a parallel code path.** `--json` (or a machine-default when piped, à la `gh`) is the single source of truth; human tables, `--jq`, `--template`, `--plain` are all views over the same JSON. Publish the schema explicitly (JSON Schema/CUE) and version it — do what `gh` does NOT explicitly do (§2 gap) and give a written SemVer stability guarantee on field names and exit codes.

3. **Runtime self-description over external docs.** A `<cli> schema` / `<verb> --help --json` introspection path so an agent can discover the full capability surface without fetching anything external — this is the single idea (Poehnelt) most specific to *agent* consumers vs. clig.dev's human-first help design, and it composes with llms.txt/Skill-file docs rather than replacing them.

4. **Noun-verb grammar, applied with zero synonyms.** `orvex-cli <noun> <verb>` uniformly across every service surface (wiki, mcp-adjacent ops, whatever else), so `--help` on any noun turns exploration into deterministic tree search. Never ship two verbs that mean almost the same thing across nouns (the "update vs upgrade" trap) — this is cheap to get right at design time and expensive to fix after agents have learned the surface.

5. **Typed, self-correcting errors.** Every failure returns: exact problem, correct invocation, valid-value suggestions, one example — sufficient for an agent to fix and retry once without a human in the loop. Pair with stable, documented exit-code bands (0 / 1–2 user error / 3–125 app-specific) that don't shift across minor versions.

6. **Idempotent-by-preference verb design.** Favor declarative verbs (`ensure`, `sync`, `apply`) over imperative ones (`create`, `delete`) wherever the domain allows it; where imperative is unavoidable, build in duplicate/conflict detection so a naive agent retry-loop can never double-apply a mutation. Every mutating command returns enough resulting state in its success payload that the caller never needs a same-turn follow-up read to confirm what happened.

7. **`--dry-run` on every consequential command, plus a *separate* explicit flag for destructive operations.** Don't conflate the general `--yes` confirmation-bypass with authorization for irreversible actions — two distinct gates, both explicit, both loggable.

8. **stdout/stderr/NO_COLOR discipline, strictly.** Results only on stdout; diagnostics on stderr with no decorative log framing by default; respect `NO_COLOR` and TTY detection in that precedence order; never emit ANSI when piped.

9. **Adversarial input handling and output sanitization, because the caller is untrusted by construction.** Validate agent-constructed input (path traversal, control chars, encoded injection) more defensively than human-typo handling requires; sanitize returned content (especially wiki page bodies) against embedded prompt-injection before it round-trips into an agent's context — a concern with no clig.dev-era precedent but directly relevant to a wiki CLI that returns user-authored page content.

10. **Layered docs: rich example-led `--help` (clig.dev) + runtime schema introspection (#3) + a portable Skill/llms.txt-style companion doc for procedural knowledge.** No single layer suffices per the 2025–2026 corpus; all three are cheap relative to the reliability they buy, and the Skill layer is exactly the mechanism this program already uses for Claude Code — `orvex-cli` should ship a first-party Skill (or equivalent) rather than leaving agents to reverse-engineer workflow sequencing from `--help` alone.

11. **Daemon/cache the hot paths behind a stable, versioned local socket protocol**, with background/proactive cache warming — justified specifically by agent usage patterns (many rapid sequential calls per task loop) rather than human single-command latency tolerance. This directly validates the program's existing Linear cache-first precedent (see local memory) as aligned with, not orthogonal to, external best practice.

12. **Treat CLI and MCP as complementary layers, not competing ones — and say so in the design doc.** Per Anthropic's own framing: MCP/A2A give typed, authenticated, discoverable capability; the CLI (and Skills built on it) give the context-cheap, composable, agent-scriptable surface for actually driving many calls in a loop. `orvex-cli` should be designed to shell out to `orvex-wiki-api` and be MCP-exposable, not positioned as a rival interface to `orvex-studio-mcp`.

---

## Full source list (URLs cited above)

- https://clig.dev/
- https://github.com/cli-guidelines/cli-guidelines
- https://cli.github.com/manual/gh_help_formatting
- https://github.blog/engineering/engineering-principles/scripting-with-github-cli/
- https://github.com/cli/cli/issues/8734
- https://github.com/cli/cli/issues/5161
- https://github.com/cli/cli/issues/5394
- https://github.com/cli/cli/issues/8415
- https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills (2025-10-16)
- https://www.anthropic.com/engineering/code-execution-with-mcp
- https://trevinsays.com/p/7-principles-for-agent-friendly-clis (Trevin Chow, 2026-03-26)
- https://justin.poehnelt.com/posts/rewrite-your-cli-for-ai-agents/ (Justin Poehnelt, 2026-03-04)
- https://understandingdata.com/posts/rewrite-cli-for-agents/ (mirror/companion)
- https://www.infoq.com/articles/ai-agent-cli/ (Sriram Madapusi Vasudevan, 2025-08-08)
- https://note.com/_kihonushi/n/nd8e57741e1d5?hl=en
- https://dev.to/uenyioha/writing-cli-tools-that-ai-agents-actually-want-to-use-39no
- https://www.propelcode.ai/blog/agent-first-cli-design-coding-agents
- https://codenote.net/en/posts/aws-cli-ai-agent-secure-access-defense-in-depth/
- https://www.padiso.co/blog/building-idempotent-tools-for-long-running-agents/
- https://no-color.org/ (content corroborated via secondary sources; direct fetch DNS-timed-out during this research pass)
- https://learn.microsoft.com/en-us/dotnet/standard/commandline/design-guidance
- https://nix.dev/manual/nix/2.28/development/cli-guideline.html
- https://github.com/leemunroe/cli-style-guide
- https://cocoindex.io/blogs/building-an-invisible-daemon/
- https://redis.io/blog/guide-to-cache-optimization-strategies/
- https://www.mintlify.com/blog/real-llms-txt-examples
- https://buildwithfern.com/post/optimizing-api-docs-ai-agents-llms-txt-guide
- https://buildwithfern.com/post/how-to-write-llm-friendly-documentation
- https://docs.snowflake.com/en/release-notes/2026/other/2026-04-15-agent-friendly-docs
- https://arxiv.org/html/2604.00835v1 ("Agentic Tool Use in Large Language Models")
- https://arxiv.org/html/2605.09252v1 ("LLM Agents Already Know When to Call Tools")
- https://arxiv.org/html/2604.16706v1 (AgentProp-Bench)
- https://arxiv.org/pdf/2602.20426 ("Learning to Rewrite Tool Descriptions for Reliable LLM-Agent Tool Use")
- https://github.com/quchangle1/LLM-Tool-Survey

## Caveats / low-confidence spots

- The `no-color.org` primary source could not be fetched directly (DNS timeout) — its content here is corroborated only via secondary citation, not read first-hand. Recommend a direct re-fetch before citing verbatim in a canon wiki page.
- Several 2026-dated blog sources (Trevin Chow, Justin Poehnelt, the note.com "10 rules" piece) are practitioner blogs, not standards bodies — treated here as *converging practitioner consensus*, not settled spec. clig.dev and the Anthropic engineering posts are the highest-authority sources in this set.
- "llms.txt for CLIs" specifically (as opposed to for docs sites) is a synthesis/extrapolation in §9, not a claim any single source makes explicitly — flagged inline as such.
- The gh CLI blog post's core content dates to 2021 (updated 2021-05-14); it is still the live, current GitHub documentation as of this research pass and is treated as current practice, not superseded — no 2025/2026 replacement was found.
