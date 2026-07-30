#!/usr/bin/env python3
"""The HIGH+ threshold and exception-ledger gate over an osv-scanner JSON report.

Split out of scripts/ci/audit-osv.sh so the exception mechanism is testable
hermetically (scripts/test/audit-osv-exceptions.spec.sh drives this file with
synthetic reports + ledgers — no network, no scanner).

Usage: osv-gate.py <osv-report.json> <osv-scanner.toml> <max-exception-days>

Exit 0 = clean (or every HIGH/CRITICAL carried by a valid, live exception).
Exit 1 = an un-excepted HIGH/CRITICAL, or a ledger that is not in good standing.

The ledger rules are the whole point — see the header of osv-scanner.toml. An
exception must name an owning ENG ticket, must carry an `ignoreUntil` date that
is in the future and no further out than <max-exception-days>, and must still
match a reported advisory (a stale entry FAILS, so the ledger can only shrink).
"""

import datetime as dt
import json
import os
import re
import sys
import tomllib

BLOCKING = {"HIGH", "CRITICAL"}
TICKET_RE = re.compile(r"\bENG-\d+\b")
RANK = {"CRITICAL": 0, "HIGH": 1, "MODERATE": 2, "MEDIUM": 2, "LOW": 3, "UNKNOWN": 4}


def load_exceptions(path, max_days, today):
    """-> (exceptions_by_id, errors). A malformed ledger raises SystemExit(1)."""
    exceptions, errors = {}, []
    name = os.path.basename(path)
    if not os.path.exists(path):
        return exceptions, errors
    try:
        with open(path, "rb") as fh:
            ledger = tomllib.load(fh)
    except Exception as exc:  # noqa: BLE001 — surfaced loudly, never swallowed
        print(f"SECURITY FAILED: {name} is not valid TOML: {exc}")
        raise SystemExit(1) from exc

    for idx, entry in enumerate(ledger.get("IgnoredVulns", [])):
        where = f"{name} [[IgnoredVulns]] #{idx + 1}"
        vid, reason, until = entry.get("id"), entry.get("reason"), entry.get("ignoreUntil")
        if not vid:
            errors.append(f"{where}: no `id`")
            continue
        where = f"{where} ({vid})"
        if not reason:
            errors.append(f"{where}: no `reason`")
        elif not TICKET_RE.search(reason):
            errors.append(f"{where}: `reason` names no ENG ticket — an exception "
                          "with no owning ticket is a hole, not an exception")
        if until is None:
            errors.append(f"{where}: no `ignoreUntil` — an exception without an "
                          "expiry is a permanent hole")
            continue
        if isinstance(until, dt.datetime):
            until = until.date()
        if not isinstance(until, dt.date):
            errors.append(f"{where}: `ignoreUntil` must be a TOML date "
                          f"(YYYY-MM-DD), got {until!r}")
            continue
        if until < today:
            errors.append(f"{where}: `ignoreUntil` {until} has PASSED — fix the "
                          "dependency, or re-justify with a new date")
            continue
        window = (until - today).days
        if window > max_days:
            errors.append(f"{where}: `ignoreUntil` {until} is {window} days out "
                          f"(max {max_days}) — an exception is not a parking space")
            continue
        exceptions[vid] = {"until": until, "reason": reason, "window": window}
    return exceptions, errors


def load_findings(report):
    findings = []
    for res in report.get("results", []):
        for pkg in res.get("packages", []):
            meta = pkg.get("package", {})
            name, ver = meta.get("name"), meta.get("version")
            for v in pkg.get("vulnerabilities", []):
                sev = (v.get("database_specific") or {}).get("severity", "UNKNOWN").upper()
                findings.append((sev, v.get("id"), name, ver))
    findings.sort(key=lambda f: (RANK.get(f[0], 5), f[2] or ""))
    return findings


def main(argv):
    report_path, exceptions_path, max_days = argv[1], argv[2], int(argv[3])
    today = dt.date.today()
    ledger_name = os.path.basename(exceptions_path)

    with open(report_path, "rb") as fh:
        report = json.load(fh)

    exceptions, ledger_errors = load_exceptions(exceptions_path, max_days, today)
    findings = load_findings(report)

    if findings:
        print("osv-scanner findings (pnpm-lock.yaml) — the COMPLETE list, nothing filtered out:")
        for sev, vid, name, ver in findings:
            mark = f"   <- EXCEPTED until {exceptions[vid]['until']}" if vid in exceptions else ""
            print(f"  [{sev:8}] {name}@{ver}  {vid}  https://osv.dev/{vid}{mark}")
    else:
        print("osv-scanner: no known vulnerabilities in the pnpm-resolved tree.")

    reported_ids = {f[1] for f in findings}

    if exceptions:
        print(f"\nException ledger ({ledger_name}) — dated, expiring, per-advisory:")
        for vid, e in sorted(exceptions.items()):
            print(f"  {vid}  expires {e['until']} (in {e['window']} d)")
            print(f"      {e['reason']}")

    # The ratchet: a stale exception is a failure, not a leftover.
    for vid in sorted(vid for vid in exceptions if vid not in reported_ids):
        ledger_errors.append(
            f"{ledger_name} ({vid}): the advisory is no longer reported by the "
            "scanner — this exception is STALE and must be DELETED (the ledger "
            "only shrinks)")

    blocking = [f for f in findings if f[0] in BLOCKING and f[1] not in exceptions]

    if ledger_errors:
        print(f"\nSECURITY FAILED: the {ledger_name} exception ledger is not in good standing:")
        for err in ledger_errors:
            print(f"  - {err}")

    if blocking:
        print(f"\nSECURITY FAILED: {len(blocking)} un-excepted HIGH/CRITICAL advisory(ies) "
              "in the pnpm dependency tree (gate threshold = high). See above.")

    if ledger_errors or blocking:
        return 1

    carried = [f for f in findings if f[0] in BLOCKING]
    print(f"\nSECURITY PASSED: {len(findings)} advisory(ies) found; {len(carried)} "
          "HIGH/CRITICAL carried under a dated, expiring exception, 0 un-excepted "
          "(gate threshold = high, matching the prior `pnpm audit --audit-level=high`).")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
