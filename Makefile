# orvex-wiki — Foundation Makefile (M2). Self-documenting: run `make` / `make help`.
# Local prod-parity doctrine: same engine families as the deploy claims
# (Postgres 17 CNPG-family, Redis 8, S3/MinIO — no Mongo, D-S12). CI substrate
# doctrine (CS §13): CI validates only; images are Tekton-built, never local.

SHELL := /usr/bin/env bash
.DEFAULT_GOAL := help

COMPOSE := docker compose --env-file .env.dev -f docker-compose.dev.yml

# Load .env.dev into a recipe: $(call with-env, <command>)
define with-env
	set -a && . ./.env.dev && set +a && $(1)
endef

.PHONY: help build test test-server test-client lint typecheck security \
        env-up env-down env-destroy env-status env-logs env-info secrets \
        db-migrate run-local

help: ## Show this help
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z0-9_-]+:.*##/ {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2} /^##@/ {printf "\n\033[1m%s\033[0m\n", substr($$0, 5)}' $(MAKEFILE_LIST)

##@ Build & quality gates
build: ## Full monorepo build (nx run-many -t build)
	pnpm build

test: test-server test-client ## All unit tests

test-server: ## Server unit tests (jest)
	pnpm --dir apps/server test

test-client: ## Client unit tests (vitest)
	pnpm --dir apps/client test

lint: ## Per-app eslint (check-only) + repo import-boundary fence
	pnpm --dir apps/client lint
	pnpm --dir apps/server run lint:check
	pnpm lint:boundary

typecheck: ## Typecheck client + server (workspace package dists required: run `make build` first)
	pnpm --dir apps/client exec tsc
	pnpm --dir apps/server exec tsc -p tsconfig.build.json --noEmit

security: ## Dependency audit (fails on high+; triage in M7)
	pnpm audit --audit-level=high

##@ Local prod-parity environment (Postgres 17 CNPG-family + Redis 8 + MinIO S3)
env-up: .env.dev ## Start engines, create the bucket, wait until healthy
	$(COMPOSE) up -d --wait postgres redis minio
	$(COMPOSE) up minio-init
	@echo "Environment healthy. Run 'make env-info' for endpoints."

env-down: ## Stop engines (data volumes kept)
	$(COMPOSE) down

env-destroy: ## Stop engines and DELETE data volumes
	$(COMPOSE) down -v

env-status: ## Engine health/status
	$(COMPOSE) ps

env-logs: ## Tail engine logs
	$(COMPOSE) logs -f --tail=100

env-info: .env.dev ## Print every local endpoint + credential source
	@echo "Local prod-parity environment (creds in .env.dev, never committed):"
	@echo "  Postgres   postgresql://orvex-wiki:<DEV_POSTGRES_PASSWORD>@localhost:55432/orvex-wiki"
	@echo "  Redis      redis://:<DEV_REDIS_PASSWORD>@localhost:56379"
	@echo "  MinIO S3   http://localhost:59000  (console http://localhost:59001, bucket orvex-wiki-bucket)"
	@echo "  App        http://localhost:3000   (make run-local; health: /api/health, /api/health/live)"
	@grep -E '^(DEV_|APP_URL|DATABASE_URL|REDIS_URL|AWS_S3_ENDPOINT|AWS_S3_BUCKET)' .env.dev | sed 's/=.*PASSWORD.*/=<redacted>/; s/\(PASSWORD=\).*/\1<redacted>/; s#\(://[^:]*:\)[^@]*@#\1<redacted>@#'

secrets: ## (Re)generate .env.dev (scripts/dev-secrets.sh; --rotate to force)
	./scripts/dev-secrets.sh --rotate

.env.dev:
	./scripts/dev-secrets.sh

##@ Database
db-migrate: .env.dev ## Run engine migrations against the local env
	$(call with-env, pnpm --dir apps/server run migration:latest)

run-local: .env.dev ## Boot the built server against the local env (build first)
	$(call with-env, node apps/server/dist/main)
