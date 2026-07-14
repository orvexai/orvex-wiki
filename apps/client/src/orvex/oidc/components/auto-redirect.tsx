import { useEffect } from "react";

export interface AutoRedirectProps {
  hostname?: string;
  enabled?: boolean;
  autoRedirect?: boolean;
  enforceSso?: boolean;
  loginUrl?: string;
}

/**
 * Redirects to the server-derived SSO login URL, but ONLY when the server
 * config (`enabled`, `autoRedirect`) AND the workspace policy
 * (`enforceSso`) all agree, and a target `loginUrl` + `hostname` are
 * present. A pure AND-gate over server-supplied verdicts — the client makes
 * no auth decision of its own (po-ruling 10 / AC3).
 */
export function AutoRedirect({
  hostname,
  enabled,
  autoRedirect,
  enforceSso,
  loginUrl,
}: AutoRedirectProps) {
  useEffect(() => {
    if (enabled && autoRedirect && enforceSso && hostname && loginUrl) {
      window.location.href = loginUrl;
    }
  }, [hostname, enabled, autoRedirect, enforceSso, loginUrl]);

  return null;
}

export default AutoRedirect;
