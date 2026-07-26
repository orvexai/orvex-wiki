This fixture deliberately has NO upstream/ tree: it simulates an unreachable
pinned upstream ref. The gate must exit 2 with an INFRA-ERROR line — never a
silent "clean" (exit 0) and never a divergence finding (exit 1).
