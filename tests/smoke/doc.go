// Package smoke is the Foundation M3 smoke suite for the orvex-wiki engine.
//
// It exercises the engine subset that the deploy tree actually claims —
// Postgres + Redis + S3 + the HTTP health API — as a tiered, table-driven Go
// test suite. The subset is deliberately narrow (locked decision D-S12): there
// is NO MongoDB, no Kafka, and no Temporal in the engine.
//
// The suite is addressable per tier via the top-level test functions
// TestTier1Infra, TestTier2Schema, TestTier3DataOps and TestTier4API
// (e.g. `go test -run TestTier1`).
//
// Doctrine:
//   - FAIL, never SKIP. A missing env var or an unreachable engine is a hard
//     t.Fatalf naming the exact variable / address / error. There is no t.Skip
//     anywhere in the suite (grep-provably zero).
//   - Config from the environment ONLY. The Makefile sources .env.dev for local
//     runs; the strict (in-cluster Job) invocation uses pre-set env. Nothing in
//     Go parses a .env file.
//   - Every external call carries a context deadline (Coding Standards §10).
package smoke
