import { useEffect, useRef } from "react";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";

const OIDC_ERROR_PARAM = "oidcError";

/**
 * Surfaces a callback-time OIDC error as exactly ONE toast, then cleans the
 * URL so a refresh/back-nav doesn't re-show it. A config-fetch error is an
 * admin concern (logged elsewhere, not shown here) — this component only
 * reacts to the `?oidcError=` callback param (AC5 / CS §10 never-white-screen).
 */
export function OidcErrorToast() {
  const { t } = useTranslation();
  const shownRef = useRef(false);

  useEffect(() => {
    if (shownRef.current) return;

    const params = new URLSearchParams(window.location.search);
    const oidcError = params.get(OIDC_ERROR_PARAM);
    if (!oidcError) return;

    shownRef.current = true;
    notifications.show({
      color: "red",
      message: t("Single sign-on failed. Please try again."),
    });

    params.delete(OIDC_ERROR_PARAM);
    const query = params.toString();
    const cleanedUrl =
      window.location.pathname +
      (query ? `?${query}` : "") +
      window.location.hash;
    window.history.replaceState({}, "", cleanedUrl);
  }, [t]);

  return null;
}

export default OidcErrorToast;
