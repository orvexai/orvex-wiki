#!/usr/bin/env bash
# image-injection-conform.sh — the deploy-side half of the AD-29 image contract
# (ENG-3296 / ENG-3154 T2-AC4).
#
#   usage: scripts/image-injection-conform.sh <deploy-tree>
#          scripts/image-injection-conform.sh --fleet-root <dir>
#
# Interface: (a kustomize deploy tree) → PASS/FAIL verdict on the image
# references it RENDERS. Its sibling, scripts/shared-build-conform.sh, rules on
# what a repo may CONTAIN; this one rules on what a repo actually EMITS, because
# containment was never the property that mattered. The hole this closes is
# recorded on ENG-3296: the old positive fixture had no workload at all, so the
# gate asserted the absence of a tag and never had to answer how an image
# reaches a pod — it passed against a state no real service could reach.
#
# Rules:
#   I1  the tree RENDERS. A tree kustomize cannot build has no verdict to give.
#   I2  it renders at least one STAMPED workload container image. Absence is
#       FAIL, never "not applicable" (AD-4) — this is exactly the
#       hollow-fixture failure.
#   I3  every rendered image is FULLY RESOLVED: no injection token and no
#       PLACEHOLDER_* survives. An unresolved token means the shared
#       image-injection component was not applied, or its `imageTag` carrier
#       never filled the fail-closed sentinel.
#   I4  every image of a STAMPED kind has the AD-29 shape
#         {pullHost}/{project}/{serviceToken}-{cmd}:{branchSlug}-{shortSha}
#       or its digest-pinned promotion form {repo}@sha256:{64 hex} (AD-36).
#       A bare mutable tag (`:dev`, `:main`, `:latest`) is refused BY SHAPE:
#       the tag half must end in a 7-hex commit short sha, which no
#       hand-written tag has. Unstamped kinds (a bootstrap Job running
#       `alpine:3.20`) are exempt from I4 but NOT from I3.
#   I5  no consuming kustomization targets the substrate-owned `image-ref`
#       ConfigMap (ENG-3337). The three segments are SINGLE-VALUED; an overlay
#       that patches them is applied after the component has already stamped,
#       so the attempt is silently dropped and a VALID reference to the WRONG
#       Harbor project ships. This is the only rule here that reads the SOURCE
#       tree rather than the render — it has to, because the ConfigMap is
#       local-config and the attempt leaves no trace in the output at all.
#
# Loud: every violation prints `FAIL(In): <resource>: <why>`; exit 1 if any.
# Undeterminable inputs exit 2 — a missing renderer or an unreadable tree is a
# refusal to report a verdict, never a pass.
#
# `--fleet-root <dir>` (ENG-3356 F2): the REAL caller this scanner never had.
# `git grep image-injection-conform` across the whole fleet found only PROSE
# comments referencing it — nothing under .github/ or a Makefile executed it.
# `--fleet-root` scans every immediate subdirectory of <dir> that carries a
# `deploy/kustomize/kustomization.yaml`, reports each verdict, and exits
# non-zero if ANY repo fails — never a silent aggregate pass (AD-4). Invoked
# from `make deploy-validate-fleet`, which runs where a fleet checkout exists,
# never inside my-idp-apps' own CI (the ENG-3155 double precedent).
#
# CAVEAT, so a reader of fleet-root output is not misled: I3 (unresolved
# token) is EXPECTED on a raw git checkout, not a bug this mode discovers. The
# `image-ref` ConfigMap's imageTag segment is a BUILD-TIME artifact — the
# shared pipeline's derive step patches it in-cluster before the deploy
# render runs; no commit in source control carries a resolved tag, nor
# should one (that would be exactly the literal-tag AD-29 forbids). Read a
# fleet-root I3 row as "this repo's tree has not been through the pipeline
# yet", not as "this repo is broken". I4 and I5 do not have this caveat: I5
# reads the source tree directly, and I4 is meaningful the moment I3 is not
# masking it (e.g. against a render taken from a live PipelineRun's
# `idp-render` output rather than a raw checkout).
set -uo pipefail

# ── scan_root — I1..I5 against ONE deploy tree ───────────────────────────────
scan_root() {
  local ROOT="$1"

  command -v kustomize >/dev/null 2>&1 || {
    echo "image-injection-conform: FATAL: kustomize is not installed — cannot render, so cannot report a verdict." >&2
    return 2
  }
  # The interpreter that parses the render must have PyYAML. On the `runners`
  # pool the system python3 is PEP-668 externally-managed and carries no
  # PyYAML, while the gate's venv does — so honour $PYTHON (the AD-28 Make
  # seam already threads it through) and fall back to python3. A missing
  # interpreter or a missing PyYAML is exit 2: refuse to report a verdict,
  # never pass by default.
  local PY_BIN="${PYTHON:-python3}"
  command -v "${PY_BIN}" >/dev/null 2>&1 || {
    echo "image-injection-conform: FATAL: '${PY_BIN}' is not installed — cannot parse the render, so cannot report a verdict." >&2
    return 2
  }
  "${PY_BIN}" -c 'import yaml' >/dev/null 2>&1 || {
    echo "image-injection-conform: FATAL: '${PY_BIN}' cannot import PyYAML — cannot parse the render, so cannot report a verdict. Install it, or point \$PYTHON at an interpreter that has it." >&2
    return 2
  }

  local RENDER
  RENDER="$(mktemp)" || {
    echo "image-injection-conform: FATAL: could not create a temp file for the render." >&2
    return 2
  }
  # `trap ... RETURN` rather than EXIT: this function may run many times in
  # fleet mode inside one process, and each call's temp file must be cleaned
  # up on ITS OWN return, not left until the whole script exits.
  trap 'rm -f "${RENDER}"' RETURN

  # ── I1 — the tree renders ──────────────────────────────────────────────────
  if ! kustomize build "${ROOT}" > "${RENDER}" 2>"${RENDER}.err"; then
    echo "FAIL(I1): ${ROOT}: kustomize build failed — a tree that does not render has no image contract to check"
    sed 's/^/    /' "${RENDER}.err" >&2 || true
    rm -f "${RENDER}.err"
    echo "image-injection-conform: FAIL — 1 violation(s) in ${ROOT}."
    return 1
  fi
  rm -f "${RENDER}.err"

  "${PY_BIN}" - "${ROOT}" "${RENDER}" <<'PY'
import os
import re
import sys

import yaml

root, render = sys.argv[1], sys.argv[2]
fails = 0


def fail(rule, where, why):
    global fails
    print(f"FAIL({rule}): {where}: {why}")
    fails += 1


# The tokens the shared component fills in, plus the retired placeholder family.
# Any of them surviving a render means the injection layer did not run.
UNRESOLVED = (
    "IMAGE_REGISTRY",
    "IMAGE_PROJECT",
    "IMAGE_TAG",          # also catches the IMAGE_TAG_UNRESOLVED sentinel
    "PLACEHOLDER_",
)

# {pullHost}/{project}/{serviceToken}-{cmd}:{branchSlug}-{shortSha}
TAGGED = re.compile(
    r"^[a-z0-9][a-z0-9.-]*\.[a-z0-9.-]+(:[0-9]+)?"   # a dotted registry host
    r"/[a-z0-9][a-z0-9._-]*"                          # the Harbor project
    r"/[a-z0-9][a-z0-9._-]*"                          # {serviceToken}-{cmd}
    r":[a-z0-9][a-z0-9._-]*-[0-9a-f]{7}$"             # {branchSlug}-{shortSha}
)
# The AD-36 promotion unit: same repository, pinned by digest.
PINNED = re.compile(
    r"^[a-z0-9][a-z0-9.-]*\.[a-z0-9.-]+(:[0-9]+)?"
    r"/[a-z0-9][a-z0-9._-]*"
    r"/[a-z0-9][a-z0-9._-]*"
    r"@sha256:[0-9a-f]{64}$"
)

# Where a container list lives, per workload kind. `(group, kind)` — group ""
# means the core/apps group, i.e. matched by kind alone.
POD_SPEC_AT = {
    ("apps", "Deployment"): ("spec", "template", "spec"),
    ("apps", "StatefulSet"): ("spec", "template", "spec"),
    ("apps", "DaemonSet"): ("spec", "template", "spec"),
    ("apps", "ReplicaSet"): ("spec", "template", "spec"),
    ("batch", "Job"): ("spec", "template", "spec"),
    ("batch", "CronJob"): ("spec", "jobTemplate", "spec", "template", "spec"),
    ("", "Pod"): ("spec",),
    ("serving.knative.dev", "Service"): ("spec", "template", "spec"),
}

# The kinds the shared component actually stamps. Only these are held to the
# AD-29 SHAPE — the rest are still checked for a surviving injection token,
# because a token anywhere is unambiguously a bug, but their images may
# legitimately be third-party. The fleet's only Jobs are bootstrap scaffolding
# running `alpine`/`python`; demanding an AD-29 shape of those would red two
# repos for doing nothing wrong, and stamping them would break their renders.
STAMPED = {
    ("apps", "Deployment"),
    ("apps", "StatefulSet"),
    ("apps", "DaemonSet"),
    ("batch", "CronJob"),
    ("serving.knative.dev", "Service"),
}


# ── I5 (ENG-3337) — the substrate-owned ConfigMap is not overridable ────────
#
# The three segments this component stamps are SUBSTRATE-OWNED and
# SINGLE-VALUED. A consuming overlay cannot change them: its `patches:` are
# applied AFTER the component's `replacements:` have already stamped the image
# string, so patching the `image-ref` ConfigMap changes the ConfigMap and
# NOTHING ELSE — kustomize exits 0, prints no warning, and renders the DEFAULT
# reference. Measured on kustomize v5.8.1 (ENG-3337), for `imageProject` and
# `imageRegistry` alike.
#
# That silence is the defect. A valid, deployable reference to the WRONG Harbor
# project is worse than a refusal, because it deploys. So an attempt is a red.
#
# WHY THIS RULE READS THE SOURCE TREE, NOT THE RENDER. It has to: the attempt
# is invisible downstream by definition. The `image-ref` ConfigMap carries
# `config.kubernetes.io/local-config: "true"`, so it is not even IN the render
# — the patched value goes nowhere at all. Nothing about the emitted manifest
# distinguishes "no override attempted" from "override attempted and dropped".
#
# WHAT IT COVERS: every shape that names the `image-ref` ConfigMap as a target
# of a consuming kustomization — `patches:`, the retired `patchesJson6902:`,
# `patchesStrategicMerge:` (inline document or file path), and a
# `configMapGenerator:` that would merge into it.
#
# STATED LIMIT, so no reader mistakes this for more than it is: an overlay that
# re-stamps the image by OTHER means — its own `replacements:` over
# `containers.*.image`, or an `images:` newName/newTag block — is NOT what this
# rule looks for. Those shapes take effect rather than being swallowed, so they
# are a different failure (an undeclared second opinion about a substrate-owned
# segment) with a different remedy; I4 still holds their output to the AD-29
# shape. I5 is scoped to the silently-ignored shape the deleted promise taught.
IMAGE_REF_NAME = "image-ref"
COMPONENT_DIR = os.path.join("components", "image-injection")


def _names_image_ref(node):
    """Does this mapping select/declare the substrate-owned ConfigMap?"""
    if not isinstance(node, dict):
        return False
    if node.get("name") != IMAGE_REF_NAME:
        return False
    kind = node.get("kind")
    # An absent kind is a WIDER selector, not a narrower one — it matches every
    # kind, ConfigMap included. Treating absence as "not a ConfigMap" would let
    # the exact override the ticket measured (which does name the kind) be
    # evaded by deleting one line.
    return kind in (None, "ConfigMap")


def _strategic_merge_hits(entry, kustomization_path):
    """`patchesStrategicMerge` entries: an inline document or a file path."""
    if not isinstance(entry, str):
        return False
    text = entry
    if "\n" not in entry.strip():
        candidate = os.path.join(os.path.dirname(kustomization_path), entry)
        if not os.path.isfile(candidate):
            # A path we cannot read is not silently treated as clean.
            fail(
                "I5",
                kustomization_path,
                f"patchesStrategicMerge entry {entry!r} is neither an inline document "
                "nor a readable file — this rule cannot tell whether it targets the "
                f"substrate-owned {IMAGE_REF_NAME!r} ConfigMap, and refuses to assume it does not",
            )
            return False
        with open(candidate, encoding="utf-8") as fh:
            text = fh.read()
    try:
        parsed = [d for d in yaml.safe_load_all(text) if isinstance(d, dict)]
    except yaml.YAMLError:
        return False
    return any(_names_image_ref(d.get("metadata") or {}) and d.get("kind") in (None, "ConfigMap") for d in parsed)


def check_no_image_ref_override(tree_root):
    for dirpath, _dirnames, filenames in os.walk(tree_root):
        for filename in filenames:
            if filename not in ("kustomization.yaml", "kustomization.yml", "Kustomization"):
                continue
            path = os.path.join(dirpath, filename)
            # The component's OWN kustomization legitimately reads this
            # ConfigMap — it is the replacement SOURCE — so it is exempt, by its
            # canonical directory rather than by content: narrow and greppable.
            #
            # The exemption covers a CONSUMER's materialized copy too
            # (`<overlay>/components/image-injection/`), which is correct: that
            # copy IS the component. It is not an escape hatch either, because
            # the copy is hash-gated — editing it to smuggle a `patches:` block
            # in reds contracts' `manifest-copy-check` (and this repo's own
            # TestMaterializedCopyIsInSync).
            if COMPONENT_DIR in os.path.normpath(path):
                continue
            try:
                with open(path, encoding="utf-8") as fh:
                    doc = yaml.safe_load(fh)
            except (OSError, yaml.YAMLError) as exc:
                fail("I5", path, f"kustomization could not be parsed ({exc}) — refusing to assume it is clean")
                continue
            if not isinstance(doc, dict):
                continue
            targets = []
            for entry in doc.get("patches") or []:
                if isinstance(entry, dict):
                    targets.append(("patches", entry.get("target")))
            for entry in doc.get("patchesJson6902") or []:
                if isinstance(entry, dict):
                    targets.append(("patchesJson6902", entry.get("target")))
            for entry in doc.get("configMapGenerator") or []:
                if isinstance(entry, dict):
                    targets.append(("configMapGenerator", {"kind": "ConfigMap", "name": entry.get("name")}))
            for source, target in targets:
                if _names_image_ref(target):
                    fail(
                        "I5",
                        path,
                        f"`{source}:` targets the substrate-owned {IMAGE_REF_NAME!r} ConfigMap. "
                        "imageRegistry / imageProject / imageTag are SINGLE-VALUED and owned by "
                        "components/image-injection (AD-29 / ENG-3337); a consuming overlay CANNOT "
                        "change them. This patch is applied after the component has already stamped "
                        "the image, so it would be SILENTLY IGNORED and the render would carry the "
                        "default reference — a valid, deployable image in the wrong place. Remove it; "
                        "if the value genuinely must change, change it in the component",
                    )
            for entry in doc.get("patchesStrategicMerge") or []:
                if _strategic_merge_hits(entry, path):
                    fail(
                        "I5",
                        path,
                        f"`patchesStrategicMerge:` targets the substrate-owned {IMAGE_REF_NAME!r} "
                        "ConfigMap — same silently-ignored override as above (AD-29 / ENG-3337)",
                    )


check_no_image_ref_override(root)


def gvk(doc):
    api_version = doc.get("apiVersion") or ""
    group = api_version.split("/")[0] if "/" in api_version else ""
    return group, doc.get("kind")


def dig(doc, path):
    node = doc
    for key in path:
        if not isinstance(node, dict):
            return None
        node = node.get(key)
    return node


with open(render, encoding="utf-8") as fh:
    docs = [d for d in yaml.safe_load_all(fh) if isinstance(d, dict)]

seen = 0
for doc in docs:
    group, kind = gvk(doc)
    path = POD_SPEC_AT.get((group, kind))
    if path is None:
        continue
    pod_spec = dig(doc, path)
    if not isinstance(pod_spec, dict):
        continue
    stamped = (group, kind) in STAMPED
    name = (doc.get("metadata") or {}).get("name", "<unnamed>")
    for field in ("initContainers", "containers"):
        for container in pod_spec.get(field) or []:
            if not isinstance(container, dict):
                continue
            image = container.get("image")
            where = f"{kind}/{name}[{field}:{container.get('name', '?')}]"
            if not image:
                fail("I2", where, "container declares no image — nothing to resolve")
                continue
            if stamped:
                seen += 1
            token = next((t for t in UNRESOLVED if t in image), None)
            if token is not None:
                fail(
                    "I3",
                    where,
                    f"image {image!r} still carries the unresolved token {token!r} — "
                    "the shared image-injection component did not stamp this workload, "
                    "or its imageTag carrier never replaced the fail-closed sentinel "
                    "(AD-29 / ENG-3296)",
                )
                continue
            # Only the kinds the shared component stamps are held to the AD-29
            # shape. An unstamped kind (a bootstrap Job running `alpine:3.20`)
            # has already been checked for a surviving token, which is the part
            # that is always a bug.
            if not stamped:
                continue
            if TAGGED.match(image) or PINNED.match(image):
                continue
            fail(
                "I4",
                where,
                f"image {image!r} is not an AD-29 reference — expected "
                "{pullHost}/{project}/{serviceToken}-{cmd}:{branchSlug}-{shortSha} "
                "or its {repo}@sha256:... promotion form. A mutable tag is refused by "
                "shape: the tag must end in the 7-hex short sha the shared pipeline "
                "derived",
            )

# I2 — absence is FAIL, never a silent pass (AD-4). A render with no workload is
# precisely the hollow positive fixture this gate exists to make impossible.
if seen == 0:
    fail(
        "I2",
        root,
        "the render contains no workload container image at all — there is nothing "
        "here to prove an image reaches a pod, so this is a red row, not 'not applicable'",
    )

if fails:
    print(f"image-injection-conform: FAIL — {fails} violation(s) in {root}.")
    sys.exit(1)

print(
    f"image-injection-conform: PASS — {root} renders {seen} image(s), "
    "every one fully resolved and AD-29 shaped."
)
PY
  return $?
}

# ── main ──────────────────────────────────────────────────────────────────
if [ "${1:-}" = "--fleet-root" ]; then
  FLEET_ROOT="${2:-}"
  if [ -z "${FLEET_ROOT}" ] || [ ! -d "${FLEET_ROOT}" ]; then
    echo "image-injection-conform: FATAL: usage: $0 --fleet-root <dir> (got '${FLEET_ROOT}')" >&2
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
    tree="${d}/deploy/kustomize"
    # Candidacy matches every filename kustomize itself (and the I5 checker
    # above) recognizes — not just `.yaml` — or a repo using `.yml`/bare
    # `Kustomization` would be silently OMITTED from the fleet report rather
    # than scanned or loudly skipped (AD-4: absence is FAIL, never a quiet
    # non-candidate).
    [ -f "${tree}/kustomization.yaml" ] || [ -f "${tree}/kustomization.yml" ] || [ -f "${tree}/Kustomization" ] || continue
    scanned=$((scanned + 1))
    echo "=== ${name} ==="
    if ! scan_root "${tree}"; then
      red_repos=$((red_repos + 1))
      RED_NAMES+=("${name}")
    fi
    echo
  done

  if [ "${scanned}" -eq 0 ]; then
    echo "image-injection-conform: FATAL: --fleet-root ${FLEET_ROOT} holds no repository with a deploy/kustomize/kustomization.yaml — refusing to report a fleet-wide verdict against zero candidates (AD-4: absence is FAIL, not vacuously green)." >&2
    exit 2
  fi

  echo "image-injection-conform (fleet): ${scanned} repo(s) scanned, $((scanned - red_repos)) PASS, ${red_repos} FAIL."
  if [ "${red_repos}" -gt 0 ]; then
    echo "image-injection-conform (fleet): FAIL — red: ${RED_NAMES[*]}"
    echo "image-injection-conform (fleet): NOTE — an I3 row on a raw checkout is EXPECTED (see the --fleet-root header comment): the resolved tag is a build-time artifact, not a source-tree property."
    exit 1
  fi
  echo "image-injection-conform (fleet): PASS — every scanned repo's deploy tree renders a fully resolved, AD-29-shaped image."
  exit 0
fi

ROOT="${1:-}"
if [ -z "${ROOT}" ] || [ ! -d "${ROOT}" ]; then
  echo "image-injection-conform: FATAL: usage: $0 <deploy-tree> | --fleet-root <dir> (got '${ROOT}')" >&2
  exit 2
fi
scan_root "${ROOT}"
exit $?
