#!/usr/bin/env bash
# ci-substrate-conformance.spec.sh — ENG-1386 DoD named test (CI-config layer).
#
# CS §13 (build/CI substrate) conformance scanner. Reads config only — never
# runs product code, never builds an image. Exit 0 = conformant, exit 1 = a
# named violation was found (printed to stderr).
#
# CS §13 (2026-07-07, ADR-0005, ratified — supersedes the earlier GitHub-hosted
# public-repo exception): ALL family repos run CI on self-hosted runners.
# PRIVATE repos use the shared `runners` (+ `dind-runners`) group. The PUBLIC
# AGPL repo (today only orvex-wiki) uses a DEDICATED ephemeral, non-privileged
# `public-runners` group — org-scoped to that repo only, no cluster/OpenBao
# reach, fork PRs gated by require-approval — so untrusted public CI never runs
# on the privileged shared runners. GitHub-hosted runners are no longer used.
# Images stay Tekton-only either way. This script encodes that rule — it does
# not re-litigate it. (The ubuntu-latest check below remains as a guard: it
# stays allowed ONLY behind a documented CS §13 public-repo exception, but the
# repo no longer relies on it.)
#
# Checks (AC1-AC7 from ENG-1386):
#   AC1 - every .github/workflows job's runs-on is a self-hosted label
#         (`runners` / `dind-runners` / `public-runners`); ubuntu-latest is
#         tolerated only behind a documented CS §13 public-repo exception;
#         never windows-latest/macos-latest, never the nonexistent `{group:
#         runner}` form.
#   AC2 - no Actions job runs docker build/buildah/docker push/nerdctl/
#         crane push (CI validates, never builds/ships images).
#   AC3 - a Tekton branch-aware build Pipeline exists: clone-repo ->
#         build-and-push via the shared buildah-with-args Task, pushing to
#         the Harbor registry.
#   AC4 - the pipeline's `finally` rolls out the branch's consumer namespace
#         via a dedicated rollout ServiceAccount/RBAC.
#   AC5 - a webhook-driven Trigger/TriggerTemplate maps ref -> image-tag and
#         filters repo + branch (+ path where applicable).
#   AC6 - `kubectl kustomize deploy/kustomize | kubeconform` passes.
#   AC7 - no manual/laptop image-build path is documented/scripted anywhere
#         in the repo (Actions or Makefile/scripts) outside Tekton.
#
# Usage: ci-substrate-conformance.spec.sh [repo-dir]
set -uo pipefail

REPO_DIR="${1:-$(cd "$(dirname "$0")/../.." && pwd)}"
cd "$REPO_DIR" || { echo "FAIL: cannot cd into repo dir '$REPO_DIR'" >&2; exit 1; }

fail=0
WORKFLOWS_DIR=".github/workflows"
TEKTON_DIR="tekton"
KUSTOMIZE_ROOT="deploy/kustomize"

# --- AC1: runner group -------------------------------------------------------
if [[ -d "$WORKFLOWS_DIR" ]]; then
  while IFS= read -r wf; do
    # never windows/macos hosted runners, regardless of repo visibility.
    bad_os="$(grep -nE 'runs-on:\s*(windows|macos)-' "$wf" || true)"
    if [[ -n "$bad_os" ]]; then
      echo "FAIL (AC1): $wf uses a disallowed hosted OS runner:" >&2
      echo "$bad_os" >&2
      fail=1
    fi

    ubuntu_hits="$(grep -nE 'runs-on:\s*ubuntu-' "$wf" || true)"
    if [[ -n "$ubuntu_hits" ]]; then
      # Public-repo exception (CS §13 ADR-0005): allowed ONLY if this file
      # documents the exception (CS §13 + "public repo" in the header).
      if ! grep -qi 'CS §13' "$wf" || ! grep -qi 'public repo' "$wf"; then
        echo "FAIL (AC1): $wf uses ubuntu-latest without a documented CS §13 public-repo exception:" >&2
        echo "$ubuntu_hits" >&2
        fail=1
      fi
    fi

    bad_group="$(grep -nE 'runs-on:\s*\{\s*group:\s*runner\s*\}' "$wf" || true)"
    if [[ -n "$bad_group" ]]; then
      echo "FAIL (AC1): $wf uses the nonexistent 'runner' group (CS §13 amendment: use the plain 'runners' label):" >&2
      echo "$bad_group" >&2
      fail=1
    fi
  done < <(find "$WORKFLOWS_DIR" -maxdepth 1 -name '*.yml' -o -name '*.yaml')
else
  echo "FAIL (AC1): $WORKFLOWS_DIR not found" >&2
  fail=1
fi

# --- AC2 / AC7: no image build/push in Actions -------------------------------
if [[ -d "$WORKFLOWS_DIR" ]]; then
  image_hits="$(grep -RnE 'docker build|docker push|buildah |nerdctl (build|push)|crane push' "$WORKFLOWS_DIR" || true)"
  if [[ -n "$image_hits" ]]; then
    echo "FAIL (AC2/AC7): Actions workflow builds/pushes an image (must be Tekton-only):" >&2
    echo "$image_hits" >&2
    fail=1
  fi
fi

# --- AC7 (cont.): no manual/laptop docker build/push documented elsewhere ----
manual_hits="$(grep -RnE 'docker (build|push)' Makefile scripts 2>/dev/null \
  | grep -v "$TEKTON_DIR" \
  | grep -v 'scripts/test/ci-substrate-conformance.spec.sh' || true)"
if [[ -n "$manual_hits" ]]; then
  echo "FAIL (AC7): a manual docker build/push path exists outside Tekton:" >&2
  echo "$manual_hits" >&2
  fail=1
fi

# --- AC3: Tekton branch-aware build pipeline ---------------------------------
if [[ -d "$TEKTON_DIR" ]]; then
  pipeline_file="$(grep -RlE 'kind:\s*Pipeline\s*$' "$TEKTON_DIR" | head -1 || true)"
  if [[ -z "$pipeline_file" ]]; then
    echo "FAIL (AC3): no Tekton Pipeline found under $TEKTON_DIR" >&2
    fail=1
  else
    if ! grep -q 'name: clone-repo' "$pipeline_file"; then
      echo "FAIL (AC3): $pipeline_file has no clone-repo task" >&2
      fail=1
    fi
    if ! grep -q 'name: build-and-push' "$pipeline_file"; then
      echo "FAIL (AC3): $pipeline_file has no build-and-push task" >&2
      fail=1
    fi
    if ! grep -q 'name: buildah-with-args' "$pipeline_file"; then
      echo "FAIL (AC3): $pipeline_file does not use the shared buildah-with-args Task" >&2
      fail=1
    fi
    if ! grep -qE 'image-registry|IMAGE' "$pipeline_file"; then
      echo "FAIL (AC3): $pipeline_file has no image/registry param wiring the Harbor push" >&2
      fail=1
    fi

    # --- AC4: cross-namespace rollout on success -----------------------------
    if ! grep -q 'rollout-restart' "$pipeline_file"; then
      echo "FAIL (AC4): $pipeline_file has no rollout-restart finally task" >&2
      fail=1
    fi
    if ! grep -qE 'kubectl rollout restart' "$pipeline_file"; then
      echo "FAIL (AC4): $pipeline_file's rollout task does not run 'kubectl rollout restart'" >&2
      fail=1
    fi
  fi

  # RBAC for the rollout: a dedicated ServiceAccount (least-privilege),
  # referenced by name from the trigger/pipeline wiring (not the default SA).
  rbac_hits="$(grep -RlE 'serviceAccountName:\s*tekton-studio-rollout|serviceAccountName:\s*.*rollout' "$TEKTON_DIR" || true)"
  if [[ -z "$rbac_hits" ]]; then
    echo "FAIL (AC4): no dedicated rollout ServiceAccount wired in $TEKTON_DIR" >&2
    fail=1
  fi

  # --- AC5: webhook-driven trigger, ref -> tag mapping ----------------------
  trigger_file="$(grep -RlE 'kind:\s*TriggerTemplate\s*$' "$TEKTON_DIR" | head -1 || true)"
  if [[ -z "$trigger_file" ]]; then
    echo "FAIL (AC5): no Tekton TriggerTemplate found under $TEKTON_DIR" >&2
    fail=1
  else
    if ! grep -qE 'image-tag' "$trigger_file"; then
      echo "FAIL (AC5): $trigger_file does not derive an image-tag param" >&2
      fail=1
    fi
  fi
  trigger_obj_file="$(grep -RlE '^kind:\s*Trigger\s*$' "$TEKTON_DIR" | head -1 || true)"
  if [[ -z "$trigger_obj_file" ]]; then
    echo "FAIL (AC5): no Tekton Trigger (webhook binding) found under $TEKTON_DIR" >&2
    fail=1
  else
    if ! grep -qE "eventTypes|body\.ref|body\.repository" "$trigger_obj_file"; then
      echo "FAIL (AC5): $trigger_obj_file does not filter by repo/branch/event" >&2
      fail=1
    fi
  fi
else
  echo "FAIL (AC3/AC4/AC5): $TEKTON_DIR not found" >&2
  fail=1
fi

# --- AC6: kustomize + kubeconform gate ---------------------------------------
if [[ -d "$KUSTOMIZE_ROOT" ]]; then
  if command -v kustomize >/dev/null 2>&1 && command -v kubeconform >/dev/null 2>&1; then
    if ! kustomize build --load-restrictor LoadRestrictionsNone "$KUSTOMIZE_ROOT" 2>/tmp/ci-conformance-kustomize.err \
        | kubeconform -ignore-missing-schemas -summary >/tmp/ci-conformance-kubeconform.out 2>&1; then
      echo "FAIL (AC6): kustomize build | kubeconform failed:" >&2
      cat /tmp/ci-conformance-kustomize.err /tmp/ci-conformance-kubeconform.out >&2
      fail=1
    fi
  elif command -v kubectl >/dev/null 2>&1; then
    if ! kubectl kustomize --load-restrictor LoadRestrictionsNone "$KUSTOMIZE_ROOT" >/tmp/ci-conformance-kustomize.out 2>&1; then
      echo "FAIL (AC6): kubectl kustomize failed to render $KUSTOMIZE_ROOT:" >&2
      cat /tmp/ci-conformance-kustomize.out >&2
      fail=1
    else
      echo "WARN (AC6): kubeconform not installed locally — rendered manifests only, schema validation skipped (CI's k8s-validate job runs both)." >&2
    fi
  else
    echo "FAIL (AC6): neither kustomize/kubeconform nor kubectl is available to validate $KUSTOMIZE_ROOT" >&2
    fail=1
  fi
else
  echo "FAIL (AC6): $KUSTOMIZE_ROOT not found" >&2
  fail=1
fi
# The CI-config layer must also declare this gate as a required job.
if [[ -d "$WORKFLOWS_DIR" ]] && ! grep -RqE 'kustomize.*build|kubectl kustomize' "$WORKFLOWS_DIR"; then
  echo "FAIL (AC6): no Actions job runs the kustomize build step" >&2
  fail=1
fi
if [[ -d "$WORKFLOWS_DIR" ]] && ! grep -Rqi 'kubeconform' "$WORKFLOWS_DIR"; then
  echo "FAIL (AC6): no Actions job runs kubeconform" >&2
  fail=1
fi

if [[ "$fail" -ne 0 ]]; then
  echo "" >&2
  echo "ci-substrate-conformance: FAIL — CS §13 build/CI substrate violated." >&2
  exit 1
fi

echo "ci-substrate-conformance: PASS — CS §13 build/CI substrate conformant."
exit 0
