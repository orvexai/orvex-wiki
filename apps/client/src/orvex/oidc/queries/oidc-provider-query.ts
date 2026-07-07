import { useQuery, UseQueryResult } from "@tanstack/react-query";
import api from "@/lib/api-client";

/**
 * Server-derived OIDC login-page config. The client performs NO auth
 * decision — every field here is a verdict rendered by the server; the
 * client only reads it and reacts (render / redirect). See po-ruling 10.
 */
export interface IOidcConfig {
  enabled: boolean;
  autoRedirect: boolean;
  buttonText: string;
  loginUrl: string;
}

export async function getOidcConfig(): Promise<IOidcConfig> {
  const req = await api.post<IOidcConfig>("/auth/oidc/config");
  return req.data;
}

// Query key is a static tuple — no time/rand — so it stays stable across
// renders/requests (CS §5c determinism gate).
export const OIDC_CONFIG_QUERY_KEY = ["oidc-config"] as const;

export function useOidcConfigQuery(): UseQueryResult<IOidcConfig, Error> {
  return useQuery({
    queryKey: OIDC_CONFIG_QUERY_KEY,
    queryFn: () => getOidcConfig(),
    // A config-fetch error is an admin concern, not a user-facing one
    // (AC5) — don't hammer a possibly-missing/erroring endpoint.
    retry: false,
  });
}
