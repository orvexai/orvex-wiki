# orvex/** import boundary — verified invariants (ENG-2476)

Status as of this note: **VERIFIED against HEAD, no production diff.** This
ticket (ENG-2476) is a VERIFY+HARDEN pass — every artifact it checks
(`OrvexRootModule.register()` mount, the single import line, the
`eslint.config.mjs` AGPL boundary block) already existed at HEAD. What this
ticket ADDS is proof: a real-engine DoD test suite
(`apps/server/test/orvex-boundary/orvex-module-boundary-import-guard.e2e-spec.ts`,
`TestOrvexModuleBoundaryImportGuard`) plus three committed fixed-string
fixtures at `apps/server/test/orvex-boundary/fixtures/`.

## What is verified

1. **Single mount point.** `apps/server/src/app.module.ts` imports
   `OrvexRootModule` exactly once (line 32:
   `import { OrvexRootModule } from './orvex/orvex-root.module';`) and mounts
   it exactly once (`OrvexRootModule.register()`, line 137). Two other lines
   in that file mention "OrvexRootModule" in prose comments explaining carve-
   outs for DB-backed modules (session-mint, migrator) that are deliberately
   mounted OUTSIDE the flag-gated tree — the DoD test's grep is anchored at
   line-start (`^import\b`) so it counts only the real import statement, not
   those comments.
2. **AGPL import guard fires for real.** The repo-root `eslint.config.mjs`'s
   `apps/server/src/orvex/**` / `packages/@orvex/**` block
   (`no-restricted-imports` + `@typescript-eslint/no-explicit-any: error`)
   is driven by the REAL programmatic `ESLint` class against the REAL
   committed config file — not a regex reimplementation. Two committed
   negative fixtures (`violates-docmost.ts`, `violates-ee.ts`) prove the ban
   fires; one committed positive fixture (`clean-orvex-import.ts`, importing
   only `@orvex/dfm` + `@nestjs/common`) proves it does not false-positive.
3. **Flag-ON boot.** `OrvexRootModule.register()` compiles and boots
   DB-free with `ORVEX_MODULES_ENABLED=true` via `@nestjs/testing` +
   `FastifyAdapter`, mirroring the established
   `apps/server/src/orvex/http/orvex-http.e2e.spec.ts` harness exactly
   (same `setGlobalPrefix('api')`, same `OrvexRootModule.register()` import).
   The boot proof polls `GET /api/orvex/source` (bounded by attempt count,
   never `Date.now()`/a fixed sleep) rather than a bare `/api/health` — no
   such route exists inside this DB-free `OrvexRootModule.register()` tree in
   isolation; the upstream `/api/health` is mounted only by the full
   `AppModule` via `HealthModule` and needs a real Postgres/Redis DI graph
   out of scope for this ticket's DB-free boot proof.

## Why fixtures live outside `apps/server/src/orvex/**`

The fixtures are committed at `apps/server/test/orvex-boundary/fixtures/`,
which is OUTSIDE the `apps/server/src/orvex/**` glob the AGPL boundary block
scopes to. That is deliberate: a `@docmost`-importing file committed AT that
path would not trip `pnpm lint:boundary` (`eslint . --quiet`, the real
`lint-boundary` CI job already wired into `ci-success`) — CI stays green for
the right reason (the file genuinely isn't in the guarded tree), not because
the ban is broken. The DoD test proves the ban itself works by re-evaluating
the SAME committed bytes through ESLint's `lintText()` API with a synthetic
`filePath` that lands inside the guarded glob — this is how ESLint's flat
config resolves `files:` (against the given `filePath` string, not against
what exists on disk), verified directly against this repo's real config
before being trusted.

## Forward-compat note for ENG-2477 (FR-30)

ENG-2477's FR-30 gate (a second, off-allow-list root import reds the gate) is
**not built by this ticket** and is **not exercised by this suite**. This
ticket proves only the INPUT invariant that a future FR-30 gate would
consume: exactly one `OrvexRootModule` import exists today
(`TestSingleOrvexRootModuleImportInvariant`), and the `orvex/**` tree lints
clean under the real boundary rule. Asserting FR-30's own red-on-violation
behavior from this suite would be fake-green — it is explicitly out of scope
here (AC5 descope) and stays open until ENG-2477 builds and tests that gate
itself.

## Files

- `apps/server/test/orvex-boundary/orvex-module-boundary-import-guard.e2e-spec.ts`
- `apps/server/test/orvex-boundary/fixtures/violates-docmost.ts`
- `apps/server/test/orvex-boundary/fixtures/violates-ee.ts`
- `apps/server/test/orvex-boundary/fixtures/clean-orvex-import.ts`
