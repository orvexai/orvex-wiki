#!/usr/bin/env bash
# shared-build-conform.sh — the build-substrate conformance scanner (ENG-3154).
#
#   usage: scripts/shared-build-conform.sh <candidate-tree>
#          scripts/shared-build-conform.sh --fleet-root <dir>
#
# Interface: (candidate manifest set) → PASS/FAIL verdict. It reads a candidate
# service repo tree and reds on every class AD-29/AD-30 outlaw. It is the
# refusal half of `make deploy-validate`; ArgoCD/Tekton never see a
# non-conforming unit promoted, and no branch protection is involved (AD-4).
#
# Rules (each keyed to the AC it discharges):
#   R1/AC2  no inlined build pipeline: no tekton/*-build-pipeline*.yaml, and no
#           tekton/ file that declares `kind: Pipeline`.
#   R2/AC3  no literal family image tag and no PLACEHOLDER_BRANCH_TAG anywhere
#           under tekton/ or deploy/; AND no `image-tag` PipelineRun param
#           handed to the shared pipeline — SCOPED to the `params:` list that
#           is a sibling of `pipelineRef:` in the same `spec:` (ENG-3356
#           AC-item-1). A `TriggerTemplate`'s OWN `image-tag` param (the
#           branch-slug carrier for `generateName`/labels/`rollout-namespace`
#           — never an image tag, see the per-repo trigger.yaml header) is NOT
#           a pipeline param and does not trip this rule; the old whole-file
#           grep could not tell the two apart and reded every conforming
#           trigger in the fleet.
#   R3/AC6  no kind: Application / kind: ApplicationSet in a service repo.
#   R4/AC8  no credential material in tekton/ (stringData/password/token/…);
#           credentials ride the resolver and the cluster ServiceAccount.
#   R5/AC1  every pipelineRef resolves the SHARED pipeline through the git
#           resolver, pinned to a my-idp-apps release tag — never `dev`, never a
#           branch, never a bare in-cluster `name:`. Either resolver shape is
#           accepted: API mode (org/repo, a GitHub Contents REST call) or
#           CLONE mode (url/gitToken/gitTokenKey, a plain git clone — the
#           shape ENG-3377 pins the fleet to, since it is not billed against
#           the org's shared, chronically-exhausted installation rate limit).
#   R6/AC12 absence is FAIL: a candidate with no tekton/ tree at all is a red
#           row, never a silent pass and never "not applicable".
#   R7/AC4  a candidate that deploys a WORKLOAD must consume the shared
#           image-injection component, materialized in-repo (ENG-3296,
#           PO-2026-07-30-1). R2 deletes every mechanism that used to deliver an
#           image; without R7 a repo could satisfy R2 by delivering none at all,
#           which is exactly how the old positive fixture — a deploy/ tree with
#           no Deployment in it — passed against a state no service can reach.
#           A cross-repo `components:` reference does NOT satisfy it: ArgoCD's
#           repo-server silently drops a component it cannot resolve and renders
#           on without it, Healthy and wrong.
#
# Scope: a candidate is a SERVICE repo (a consumer of the substrate). It is not
# meant to be pointed at my-idp-apps itself, which legitimately declares the
# one `kind: Pipeline` and the one `image-tag` result — R1/R2 would (correctly)
# red on the substrate's own home.
#
# `--fleet-root <dir>` (ENG-3356 F2): the REAL caller this scanner never had.
# Every OTHER my-idp-apps fleet-consuming gate (eso-provisioning-conform.py,
# mint-path-conform.py) takes a `--fleet-root` of sibling checkouts because
# this repo's own CI cannot check out the private service repos (the
# ENG-3155 double precedent, restated in the Makefile). This scanner had NO
# such mode at all — `git grep shared-build-conform` across the whole fleet
# returned zero hits; the only thing that ever ran it was this repo's own
# fixture-only pytest suite. `--fleet-root` scans every immediate
# subdirectory of <dir> that looks like a service repo (has tekton/ or
# deploy/), reports each one's verdict, and exits non-zero if ANY repo is
# non-conforming — never a silent aggregate pass (AD-4). It is invoked from
# `make deploy-validate-fleet`, which — like the fleet-root leg of the
# eso-provisioning/mint-path gates — runs where a fleet checkout exists,
# never inside my-idp-apps' own CI.
#
# Loud: every violation prints `FAIL(Rn/ACn): <path>: <why>`; exit 1 if any.
set -uo pipefail

# ── scan_root — the whole rule set against ONE candidate tree ───────────────
# Declares its own `fails`/`fail()`; bash's dynamic scoping means a `local`
# here is what every nested call (including the python subshells' `$?`
# bookkeeping below) actually increments, so fleet mode can call this in a
# loop without one repo's count bleeding into the next.
scan_root() {
  local ROOT="$1"
  local fails=0
  fail() { echo "FAIL($1): $2: $3"; fails=$((fails + 1)); }

  local TEKTON="${ROOT}/tekton"

  # ── R6/AC12 — absence is FAIL ──────────────────────────────────────────────
  # A missing tekton/ tree is a violation in its own right, and it used to
  # `exit 1` on the spot. That early exit made R6 MASK every rule below it: R2
  # (literal tag), R3 (rogue Application/ApplicationSet), R4 (repo-held
  # credential) and R7 (image-injection) do not read tekton/ at all, yet none
  # of them was reached for a repo with no tekton/ tree.
  #
  # The repo that proves it is orvex-studio-workflows — the ONE repo in the
  # whole fleet that still carried a `kind: Application` (ENG-3154 AC6/T5). It
  # has no tekton/ tree (it builds through kpack), so this scanner reported
  # exactly one violation, R6, and never looked at the file the AC6 clause is
  # about. A gate that stops at the first finding cannot be used to say a repo
  # is clean of the other four, which is the claim ENG-3154's AC6 rests on.
  #
  # So R6 is now RECORDED and the scan CONTINUES. Only the rules that genuinely
  # need tekton/ (R1, R4, R5) are skipped, and the skip is printed — never
  # silent, because "not run" and "passed" must not look the same (AD-4).
  local HAVE_TEKTON=1
  if [ ! -d "${TEKTON}" ]; then
    HAVE_TEKTON=0
    fail "R6/AC12" "${ROOT}" "no tekton/ tree — absence is FAIL, never 'not applicable' (AD-4)"
    echo "SKIP(R1,R4,R5): ${ROOT}: no tekton/ tree to scan — these rules were NOT evaluated (not 'passed'). R2/R3/R7 below still apply."
  fi

  # ── R1/AC2 — no inlined build pipeline ─────────────────────────────────────
  if [ "${HAVE_TEKTON}" -eq 1 ]; then
    while IFS= read -r f; do
      [ -n "${f}" ] || continue
      fail "R1/AC2" "${f}" "inlined build pipeline file — the shared pipeline is the sole build path (AD-29)"
    done < <(find "${TEKTON}" -name '*-build-pipeline*.yaml' -type f 2>/dev/null)

    while IFS= read -r f; do
      [ -n "${f}" ] || continue
      fail "R1/AC2" "${f}" "declares 'kind: Pipeline' — a service repo may not define a build pipeline (AD-29)"
    done < <(grep -rlE '^kind:[[:space:]]*Pipeline[[:space:]]*$' "${TEKTON}" 2>/dev/null)
  fi

  # ── R2/AC3 — no literal tag / placeholder ──────────────────────────────────
  # The `image-tag`-param clause moved into the R5 python block below
  # (ENG-3356 AC-item-1): it needs the same pipelineRef/spec block parser, so
  # it can tell "an `image-tag` param handed to the pipeline invocation" apart
  # from "a TriggerTemplate's own same-named param used only for the run's
  # generateName/labels" — a whole-file grep cannot make that distinction and
  # reded every conforming trigger in the fleet.
  for dir in "${TEKTON}" "${ROOT}/deploy"; do
    [ -d "${dir}" ] || continue
    while IFS= read -r hit; do
      [ -n "${hit}" ] || continue
      fail "R2/AC3" "${hit%%:*}" "PLACEHOLDER_BRANCH_TAG — a hand-written image tag (AD-29)"
    done < <(grep -rn 'PLACEHOLDER_BRANCH_TAG' "${dir}" 2>/dev/null)
    while IFS= read -r hit; do
      [ -n "${hit}" ] || continue
      fail "R2/AC3" "${hit%%:*}" "kustomize 'newTag:' replacement — the image is injected, not written (AD-29/AD-35)"
    done < <(grep -rnE '^[[:space:]]*newTag:' "${dir}" 2>/dev/null)
  done

  # ── R3/AC6 — no Application / ApplicationSet in a service repo ────────────
  while IFS= read -r hit; do
    [ -n "${hit}" ] || continue
    fail "R3/AC6" "${hit%%:*}" "kind: Application/ApplicationSet — ArgoCD registration lives in my-idp-apps only (AD-30)"
  done < <(grep -rnE '^kind:[[:space:]]*(Application|ApplicationSet)[[:space:]]*$' "${ROOT}" 2>/dev/null)

  # ── R4/AC8 — secret-free to resolve ────────────────────────────────────────
  if [ "${HAVE_TEKTON}" -eq 1 ]; then
    while IFS= read -r hit; do
      [ -n "${hit}" ] || continue
      fail "R4/AC8" "${hit%%:*}" "credential material in tekton/ — credentials ride the resolver/ServiceAccount (AD-30)"
    done < <(grep -rnE '^[[:space:]]*(stringData|password|clientSecret):|OPENBAO_|HARBOR_[A-Z_]*SECRET' "${TEKTON}" 2>/dev/null)
  fi

  # ── R5/AC1 — the shared pipeline, by git resolver, pinned to a release tag,
  #             plus R2's scoped image-tag clause (ENG-3356 AC-item-1) ───────
  # TWO pipelineRef reference forms are legal (ENG-3377): API mode
  # (org/repo/token/tokenKey/scmType — a GitHub Contents REST call, billed
  # against the org's shared installation rate limit) and CLONE mode
  # (url/gitToken/gitTokenKey — a plain `git clone` over the same basic-auth
  # credential, which is NOT billed against that REST bucket). ENG-3377 pins
  # the fleet to clone mode specifically because the org-wide installation
  # (shared by 6 OpenBao permission sets, including ArgoCD's own
  # ApplicationSet controller) is chronically rate-limited; API mode is left
  # accepted here too so a future repo is not forced onto clone mode if that
  # installation limit is ever fixed at the source (isolated installation /
  # raised quota). Anything else is a build path we cannot version. Reused
  # for R2: the same block match tells us where a PipelineRun's `spec:` is,
  # so the sibling `params:` list (what is actually HANDED to the pipeline
  # invocation) can be checked for a stray `image-tag` without also catching
  # a TriggerTemplate's own like-named param.
  if [ "${HAVE_TEKTON}" -eq 1 ]; then
python3 - "${TEKTON}" <<'PY'
import pathlib, re, sys

tekton = pathlib.Path(sys.argv[1])
RELEASE_TAG = re.compile(r'^v\d+\.\d+\.\d+$')
SHARED_PATH = "tekton/orvex-shared-build-pipeline.yaml"
CLONE_URL = "https://github.com/orvexai/my-idp-apps.git"
fails = 0

def fail(rule, path, why):
    global fails
    print(f"FAIL({rule}): {path}: {why}")
    fails += 1

for f in sorted(tekton.rglob("*.yaml")):
    text = f.read_text()
    if "pipelineRef" not in text:
        continue
    # Each pipelineRef block runs to the next line at or below its indent that
    # is not part of it; a params list under it is what R5 cares about.
    blocks = list(re.finditer(r'^([ \t]*)pipelineRef:[ \t]*\n((?:\1[ \t]+.*\n|[ \t]*\n)*)', text, re.M))
    # Fail CLOSED: a pipelineRef this parser cannot read (e.g. flow style
    # `pipelineRef: {name: x}`) must not slip through unexamined.
    if len(blocks) != len(re.findall(r'(?m)^[ \t]*pipelineRef:', text)):
        fail("R5/AC1", f, "a pipelineRef is not in block style — the conformance parser cannot "
                "verify it, and an unverifiable build path is a FAIL, not a pass")
    for m in blocks:
        indent, block = m.group(1), m.group(2)
        if re.search(r'^\s*resolver:\s*git\s*$', block, re.M) is None:
            fail("R5/AC1", f, "pipelineRef does not use 'resolver: git' — the shared pipeline "
                    "is referenced by resolved revision, not by in-cluster name (AD-30)")
        else:
            def param(name):
                mm = re.search(r'-\s*name:\s*' + name + r'\s*\n\s*value:\s*["\']?([^"\'\n]+)', block)
                return mm.group(1).strip() if mm else None
            url = param("url")
            org, repo = param("org"), param("repo")
            path_in_repo, revision = param("pathInRepo"), param("revision")
            if url is not None:
                # CLONE mode (ENG-3377's chosen shape).
                if url != CLONE_URL:
                    fail("R5/AC1", f, f"clone-mode pipelineRef resolves url {url!r}, not "
                            f"{CLONE_URL!r} — the substrate is homed in my-idp-apps (AD-30)")
                if not param("gitToken"):
                    fail("R5/AC1", f, "clone-mode pipelineRef has no gitToken — an anonymous "
                            "clone cannot reach a private repo, and a silently-anonymous fallback "
                            "is not verifiable (AD-30)")
            elif org is not None or repo is not None:
                # API mode (still legal — see note above).
                if (org, repo) != ("orvexai", "my-idp-apps"):
                    fail("R5/AC1", f, f"pipelineRef resolves org/repo {org}/{repo}, not orvexai/my-idp-apps "
                            "— the substrate is homed in my-idp-apps (AD-30)")
            else:
                fail("R5/AC1", f, "pipelineRef carries neither clone-mode ('url') nor API-mode "
                        "('org'/'repo') params — the build path cannot be identified as the shared "
                        "pipeline (AD-30)")
            if path_in_repo != SHARED_PATH:
                fail("R5/AC1", f, f"pipelineRef pathInRepo is {path_in_repo!r}, not {SHARED_PATH!r} "
                        "— there is exactly one shared pipeline (AD-29)")
            if revision is None or not RELEASE_TAG.match(revision):
                fail("R5/AC1", f, f"pipelineRef revision {revision!r} is not a my-idp-apps release tag "
                        "(vX.Y.Z) — pins are release tags only, never a branch or @dev")

        # ── R2/AC3 (ENG-3356 AC-item-1): the SIBLING params: list ──────────
        # pipelineRef and params are both direct children of the same spec:,
        # i.e. both sit at `indent`. Walk forward from the end of THIS
        # pipelineRef block looking for the next line at exactly `indent`; if
        # it opens `params:`, that is the list actually handed to the
        # pipeline run, and it is scanned for a stray `image-tag` entry. Any
        # other line at `indent` (or shallower) means this spec: carries no
        # params: at all — nothing to scope the check to, and R2 is silent
        # for this pipelineRef (there is no params list to smuggle a tag
        # through).
        #
        # KNOWN LIMIT (documented, not silent): this match requires BLOCK
        # style, same as R5's pipelineRef match above. A flow-style sibling
        # (`params: [{name: image-tag, ...}]`) does not match `sib` and is
        # NOT flagged. Every real trigger in the fleet is block style (R5
        # already fails closed if pipelineRef itself is flow style, which
        # would make this file unparseable well before R2 is reached), so
        # this is a live gap only against a shape nothing in the fleet uses
        # today — recorded here rather than fixed blind, per CS honesty: a
        # disclosed limitation beats an undisclosed one.
        rest = text[m.end():]
        sib = re.match(
            r'(?:[ \t]*\n)*' + re.escape(indent) + r'params:[ \t]*\n'
            r'((?:' + re.escape(indent) + r'[ \t]+.*\n|[ \t]*\n)*)',
            rest,
        )
        if sib:
            params_block = sib.group(1)
            if re.search(r'-\s*name:\s*image-tag\b', params_block):
                fail("R2/AC3", f, "'image-tag' param handed to the pipelineRef's own PipelineRun "
                        "invocation — the tag is derived by the shared pipeline, never passed in "
                        "(AD-29); a TriggerTemplate's own same-named param (the branch-slug carrier "
                        "for generateName/labels/rollout-namespace) is a DIFFERENT list and does not "
                        "trip this rule")

sys.exit(1 if fails else 0)
PY
    local r5=$?
    [ "${r5}" -eq 0 ] || fails=$((fails + 1))
  fi

  # ── R7/AC4 — a deployed workload must be stamped by the shared component ──
  local DEPLOY="${ROOT}/deploy"
  if [ -d "${DEPLOY}" ]; then
    # A Knative Service counts too — billing's metering worker and identity's
    # deprovisioner are family workloads and nothing else in their repos would
    # trip a kind-name match. It is detected by GROUP, because a bare
    # `kind: Service` is the core Service every repo has and is not a workload.
    local workloads
    workloads=$(
      {
        grep -rlE '^kind:[[:space:]]*(Deployment|StatefulSet|DaemonSet|CronJob)[[:space:]]*$' "${DEPLOY}" 2>/dev/null
        grep -rl 'serving\.knative\.dev' "${DEPLOY}" 2>/dev/null | xargs -r grep -lE '^kind:[[:space:]]*Service[[:space:]]*$' 2>/dev/null
      } | sort -u || true
    )

    # A remote component reference is banned outright, workload or not. Parsed
    # rather than grepped: the ban is on the ENTRY, and a remote URL need not
    # contain the word "component" anywhere for kustomize to resolve it as one.
    python3 - "${DEPLOY}" <<'PY'
import pathlib, re, sys

deploy = pathlib.Path(sys.argv[1])
REMOTE = re.compile(r'^(https?://|git::|ssh://|git@|[a-z0-9.-]+\.[a-z]{2,}[:/])', re.I)
fails = 0
for f in sorted(list(deploy.rglob("kustomization.yaml")) + list(deploy.rglob("kustomization.yml"))):
    inside = False
    for line in f.read_text().splitlines():
        if re.match(r'^\s*components:\s*$', line):
            inside = True
            continue
        if inside:
            m = re.match(r'^\s*-\s*(\S+)', line)
            if not m:
                # any non-item line (a new key, or a blank) closes the block
                if line.strip() and not line.startswith((' ', '\t')):
                    inside = False
                continue
            entry = m.group(1).strip('"\'')
            if REMOTE.match(entry):
                print(f"FAIL(R7/AC4): {f}: components entry {entry!r} is a CROSS-REPO reference "
                      "— ArgoCD SILENTLY DROPS a component it cannot resolve and renders without "
                      "it while reading Healthy; materialize it in-repo instead (PO-2026-07-30-1)")
                fails += 1
sys.exit(1 if fails else 0)
PY
    local r7remote=$?
    [ "${r7remote}" -eq 0 ] || fails=$((fails + 1))

    if [ -n "${workloads}" ]; then
      if ! grep -rqE '^[[:space:]]*-[[:space:]]*\.*[^[:space:]]*components/image-injection[/[:space:]]*$' "${DEPLOY}" 2>/dev/null; then
        fail "R7/AC4" "${DEPLOY}" "deploys a workload but no kustomization consumes the shared image-injection component — nothing stamps the derived image reference, so the manifest cannot name what the pipeline built (AD-29/AD-35, ENG-3296)"
      fi
      if [ -z "$(find "${DEPLOY}" -path '*/components/image-injection/kustomization.yaml' -type f 2>/dev/null)" ]; then
        fail "R7/AC4" "${DEPLOY}" "no materialized components/image-injection/kustomization.yaml in the tree — the component is consumed by in-repo copy, held byte-identical by contracts' manifest-copy-check (PO-2026-07-30-1)"
      fi
    fi
  fi

  if [ "${fails}" -gt 0 ]; then
    echo "shared-build-conform: FAIL — ${fails} violation(s) in ${ROOT}."
    return 1
  fi

  echo "shared-build-conform: PASS — ${ROOT} builds only through the shared pipeline."
  return 0
}

# ── main ──────────────────────────────────────────────────────────────────
if [ "${1:-}" = "--fleet-root" ]; then
  FLEET_ROOT="${2:-}"
  if [ -z "${FLEET_ROOT}" ] || [ ! -d "${FLEET_ROOT}" ]; then
    echo "shared-build-conform: FATAL: usage: $0 --fleet-root <dir> (got '${FLEET_ROOT}')" >&2
    exit 2
  fi

  scanned=0
  red_repos=0
  declare -a RED_NAMES=()
  for d in "${FLEET_ROOT}"/*/; do
    d="${d%/}"
    name="$(basename "${d}")"
    case "${name}" in
      .* | my-idp-apps) continue ;;  # not a service repo; skip dotdirs and a self-checkout
    esac
    [ -d "${d}/tekton" ] || [ -d "${d}/deploy" ] || continue
    scanned=$((scanned + 1))
    echo "=== ${name} ==="
    if ! scan_root "${d}"; then
      red_repos=$((red_repos + 1))
      RED_NAMES+=("${name}")
    fi
    echo
  done

  if [ "${scanned}" -eq 0 ]; then
    echo "shared-build-conform: FATAL: --fleet-root ${FLEET_ROOT} holds no repository with a tekton/ or deploy/ tree — refusing to report a fleet-wide verdict against zero candidates (AD-4: absence is FAIL, not vacuously green)." >&2
    exit 2
  fi

  echo "shared-build-conform (fleet): ${scanned} repo(s) scanned, $((scanned - red_repos)) PASS, ${red_repos} FAIL."
  if [ "${red_repos}" -gt 0 ]; then
    echo "shared-build-conform (fleet): FAIL — red: ${RED_NAMES[*]}"
    exit 1
  fi
  echo "shared-build-conform (fleet): PASS — every scanned repo builds only through the shared pipeline."
  exit 0
fi

ROOT="${1:-}"
if [ -z "${ROOT}" ] || [ ! -d "${ROOT}" ]; then
  echo "shared-build-conform: FATAL: usage: $0 <candidate-tree> | --fleet-root <dir> (got '${ROOT}')" >&2
  exit 2
fi
scan_root "${ROOT}"
exit $?
