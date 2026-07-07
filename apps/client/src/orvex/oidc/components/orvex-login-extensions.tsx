import { Skeleton } from "@mantine/core";
import { useOidcConfigQuery } from "@/orvex/oidc/queries/oidc-provider-query.ts";
import { SsoLoginButton } from "@/orvex/oidc/components/sso-login-button.tsx";
import { AutoRedirect } from "@/orvex/oidc/components/auto-redirect.tsx";
import { OidcErrorToast } from "@/orvex/oidc/components/oidc-error-toast.tsx";

export interface OrvexLoginExtensionsProps {
  hostname?: string;
  enforceSso?: boolean;
}

/**
 * Thin composer: reads the server OIDC config and renders/redirects
 * accordingly. Holds NO auth logic of its own — every verdict (whether SSO
 * is enabled, whether to auto-redirect) is server-supplied; this component
 * only reacts (po-ruling 10).
 */
export function OrvexLoginExtensions({
  hostname,
  enforceSso,
}: OrvexLoginExtensionsProps) {
  const { data, isLoading } = useOidcConfigQuery();

  const showButton = Boolean(!isLoading && data?.enabled && hostname);

  return (
    <>
      <OidcErrorToast />
      {isLoading ? (
        <Skeleton data-testid="orvex-oidc-button-skeleton" height={36} />
      ) : showButton ? (
        <SsoLoginButton label={data!.buttonText} loginUrl={data!.loginUrl} />
      ) : null}
      <AutoRedirect
        hostname={hostname}
        enabled={data?.enabled}
        autoRedirect={data?.autoRedirect}
        enforceSso={enforceSso}
        loginUrl={data?.loginUrl}
      />
    </>
  );
}

export default OrvexLoginExtensions;
