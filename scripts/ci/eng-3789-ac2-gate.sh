#!/usr/bin/env bash
set -euo pipefail

# ENG-3789 AC2 is sequenced after ENG-3788. The ENG-3788 owner must set this
# assertion only after the crew posture decision is resolved AND deployed.
if [[ "${ENG_3788_CREW_POSTURE_VERIFIED:-}" != "true" ]]; then
  echo "BLOCKED: ENG-3789 AC2 requires the ENG-3788 crew posture decision and deployment verification first." >&2
  echo "OWNER: ENG-3788 crew/platform decision owner." >&2
  echo "Set ENG_3788_CREW_POSTURE_VERIFIED=true only after that evidence exists." >&2
  exit 1
fi

echo "ENG-3789 AC2 sequencing gate passed: ENG-3788 crew posture was explicitly verified by its owner."
