#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
unit_name="crew-orvex-wiki.service"
unit_source="$repo_root/crew-service.service"
unit_target="/etc/systemd/system/$unit_name"
build_env="/run/crew/orvex-wiki-build.env"
health_url="http://127.0.0.1:3000/api/health"

cd "$repo_root"

fail() {
  printf 'crew-restart: %s\n' "$*" >&2
  exit 1
}

branch="$(git branch --show-current)"
[[ "$branch" == "crew/yafet" ]] || fail "expected crew/yafet, found ${branch:-detached HEAD}"
[[ -z "$(git status --porcelain)" ]] || fail "checkout must be clean before building"
[[ -f /etc/crew/env/orvex-wiki ]] || fail "missing rendered workload environment: /etc/crew/env/orvex-wiki"
command -v corepack >/dev/null || fail "corepack is required to run the pinned pnpm build"
command -v node >/dev/null || fail "node is required to run the service"
command -v curl >/dev/null || fail "curl is required for the readiness check"

build_sha="$(git rev-parse HEAD)"
printf 'Building orvex-wiki at %s\n' "$build_sha"
corepack_bin="/run/user/$(id -u)/orvex-wiki-corepack"
install -d -m 0755 "$corepack_bin"
corepack enable --install-directory "$corepack_bin" pnpm
PATH="$corepack_bin:$PATH" corepack pnpm build

sudo -n install -o root -g root -m 0644 "$unit_source" "$unit_target"
sudo -n install -d -o root -g root -m 0755 /run/crew
printf 'ORVEX_WIKI_BUILD_SHA=%s\n' "$build_sha" | sudo -n tee "$build_env" >/dev/null
sudo -n chown root:root "$build_env"
sudo -n chmod 0644 "$build_env"
sudo -n systemctl daemon-reload
sudo -n systemctl enable "$unit_name" >/dev/null
sudo -n systemctl restart "$unit_name"

deadline=$((SECONDS + 180))
health_body=""
until health_body="$(curl --silent --fail --max-time 3 "$health_url" 2>/dev/null)"; do
  if (( SECONDS >= deadline )); then
    printf 'crew-restart: readiness check timed out: %s\n' "$health_url" >&2
    sudo -n systemctl --no-pager --full status "$unit_name" >&2 || true
    curl --silent --show-error --include --max-time 5 "$health_url" >&2 || true
    exit 1
  fi
  sleep 2
done

state="$(sudo -n systemctl show --property=ActiveState --value "$unit_name")"
[[ "$state" == "active" ]] || fail "$unit_name state is $state after health check"

pid="$(sudo -n systemctl show --property=MainPID --value "$unit_name")"
[[ "$pid" =~ ^[1-9][0-9]*$ ]] || fail "systemd reported invalid MainPID: $pid"
process_sha="$(tr '\0' '\n' < "/proc/$pid/environ" | sed -n 's/^ORVEX_WIKI_BUILD_SHA=//p')"
[[ "$process_sha" == "$build_sha" ]] || fail "running process SHA ${process_sha:-<missing>} does not match HEAD $build_sha"

printf 'unit=%s state=%s pid=%s\n' "$unit_name" "$state" "$pid"
printf 'running_head=%s\nhealth_url=%s\nhealth_body=%s\n' "$build_sha" "$health_url" "$health_body"
