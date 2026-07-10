import { getSubdomainHost } from "@/lib/config.ts";

/**
 * Open-redirect guard (T7 / SE-Arch 4i): a discovery response's cellHost is
 * attacker-influenceable network input and MUST be allow-listed before it is
 * ever handed to window.location.replace. The allow-list anchor is the
 * workspace's own SUBDOMAIN_HOST family root — the same root cloud workspace
 * hostnames already resolve under (apps/server SUBDOMAIN_HOST /
 * apps/client/src/ee/utils.ts getHostnameUrl). A cellHost must be that root
 * itself or a subdomain of it; anything else (a bare attacker-controlled
 * domain) is rejected and resolveCell reports an error instead of redirecting.
 */
export function validateCellHost(cellHost: unknown): cellHost is string {
  if (typeof cellHost !== "string" || cellHost.length === 0) return false;
  const root = getSubdomainHost();
  if (!root) return false;
  return cellHost === root || cellHost.endsWith(`.${root}`);
}
