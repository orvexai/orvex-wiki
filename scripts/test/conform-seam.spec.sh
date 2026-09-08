#!/usr/bin/env bash
# RED-first consumer seam proof for ENG-3385 / ENG-3356.
#
# The gates are run against a temporary copy of this adopter's own Tekton and
# deploy trees. The committed tree remains conforming; every broken shape is
# created and tested only inside WORKDIR.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SHARED_SCANNER="${REPO_ROOT}/shared-build-conform.sh"
IMAGE_SCANNER="${REPO_ROOT}/image-injection-conform.sh"
WORKDIR="$(mktemp -d -t eng-3385-conform-seam.XXXXXX)"
trap 'rm -rf "${WORKDIR}"' EXIT

fail=0

expect_status() {
  local label="$1" want="$2" got="$3" output="$4"
  if [[ "${got}" != "${want}" ]]; then
    echo "FAIL [${label}]: exit ${got}, expected ${want}" >&2
    printf '    %s\n' "${output//$'\n'/$'\n    '}" >&2
    fail=1
  else
    echo "OK: ${label} returned ${got}"
  fi
}

expect_contains() {
  local label="$1" needle="$2" output="$3"
  if ! grep -qF -- "${needle}" <<<"${output}"; then
    echo "FAIL [${label}]: output does not contain '${needle}'" >&2
    printf '    %s\n' "${output//$'\n'/$'\n    '}" >&2
    fail=1
  else
    echo "OK: ${label} named '${needle}'"
  fi
}

# Keep the candidate layout identical to a consumer checkout. The image tag is
# a build-time artifact, so resolve the committed fail-closed sentinel only in
# this temporary copy before exercising the deploy-side scanner.
candidate="${WORKDIR}/candidate"
mkdir -p "${candidate}/deploy"
cp -R "${REPO_ROOT}/tekton" "${candidate}/"
cp -R "${REPO_ROOT}/deploy/kustomize" "${candidate}/deploy/"
image_ref="${candidate}/deploy/kustomize/components/image-injection/image-ref.yaml"
if ! grep -qF 'imageTag: IMAGE_TAG_UNRESOLVED' "${image_ref}"; then
  echo "FAIL [image mutation]: expected the real deploy tree's fail-closed image sentinel" >&2
  fail=1
else
  sed -i 's/imageTag: IMAGE_TAG_UNRESOLVED/imageTag: dev-abcdef1/' "${image_ref}"
fi

# Positive proof: both real gates green against this adopter's own copied tree.
shared_output="$(bash "${SHARED_SCANNER}" "${candidate}" 2>&1)"
shared_status=$?
expect_status "clean shared-build gate" 0 "${shared_status}" "${shared_output}"
expect_contains "clean shared-build gate" \
  "shared-build-conform: PASS" "${shared_output}"

image_output="$(PYTHON=python3 bash "${IMAGE_SCANNER}" "${candidate}/deploy/kustomize" 2>&1)"
image_status=$?
expect_status "clean image-injection gate" 0 "${image_status}" "${image_output}"
expect_contains "clean image-injection gate" \
  "image-injection-conform: PASS" "${image_output}"

# RED proof 1: an adopter's pipeline resolver revision must not float to dev.
trigger="${candidate}/tekton/orvex-wiki-trigger.yaml"
original_revision="$(awk '
  /name:[[:space:]]*revision[[:space:]]*$/ {
    if (getline > 0) {
      sub(/^[[:space:]]*value:[[:space:]]*/, "")
      print
    }
    exit
  }
' "${trigger}")"
if [[ ! "${original_revision}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "FAIL [shared-build mutation]: expected the real trigger's release pin, got '${original_revision:-missing}'" >&2
  fail=1
else
  sed -i "s/value: ${original_revision}/value: dev/" "${trigger}"
  shared_red_output="$(bash "${SHARED_SCANNER}" "${candidate}" 2>&1)"
  shared_red_status=$?
  expect_status "unpinned shared-build gate reds" 1 "${shared_red_status}" "${shared_red_output}"
  expect_contains "unpinned shared-build gate names revision" \
    "pipelineRef revision 'dev'" "${shared_red_output}"
fi

# RED proof 2: a consuming overlay must not patch the substrate-owned image-ref
# ConfigMap. This is the I5 shape measured in the component's source comments.
deploy_root="${candidate}/deploy/kustomize"
python3 - "${deploy_root}/kustomization.yaml" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text()
needle = "replacements:\n"
patch = """patches:
  - target:
      group: ""
      version: v1
      kind: ConfigMap
      name: image-ref
      namespace: image-ref
    patch: |-
      - op: replace
        path: /data/imageProject
        value: deliberately-wrong-project

"""
if needle not in text:
    raise SystemExit("kustomization mutation anchor missing")
path.write_text(text.replace(needle, patch + needle, 1))
PY
image_red_output="$(PYTHON=python3 bash "${IMAGE_SCANNER}" "${deploy_root}" 2>&1)"
image_red_status=$?
expect_status "image-ref override gate reds" 1 "${image_red_status}" "${image_red_output}"
expect_contains "image-ref override names I5" "FAIL(I5)" "${image_red_output}"
expect_contains "image-ref override names offending key" "imageProject" "${image_red_output}"

if [[ "${fail}" -ne 0 ]]; then
  echo "conform-seam.spec.sh: FAIL" >&2
  exit 1
fi
echo "conform-seam.spec.sh: PASS — clean, unpinned-revision, and image-ref override paths are proven."
