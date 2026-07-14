import { useState } from "react";
import { Container, Title, Button, Text, Box, Alert } from "@mantine/core";
import {
  OrganizationList,
  SignIn,
  useAuth as useClerkAuth,
  useOrganization,
} from "@clerk/react";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { getAppName } from "@/lib/config.ts";
import { getPostLoginRedirect } from "@/lib/app-route.ts";
import api from "@/lib/api-client.ts";
import classes from "@/features/auth/components/auth.module.css";

// Port fork clerk-login.tsx#L28-L89 @fork-HEAD 050187… — thin bridge only:
// sign in via Clerk, pick/create an org via Clerk's own UI, then exchange
// the Clerk session token for an auth cookie. No tenancy/authority
// decision is made here — org→workspace mapping is server-side (CS §6).
export default function ClerkLoginPage() {
  const { t } = useTranslation();
  const { isLoaded, isSignedIn, getToken } = useClerkAuth();
  const { organization } = useOrganization();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enter = async () => {
    setError(null);
    setLoading(true);
    try {
      const token = await getToken();
      await api.post("/clerk/exchange", { token });
      window.location.href = getPostLoginRedirect();
    } catch (err: unknown) {
      // AC7: exchange failure never white-screens — show the server
      // message inline (or a fallback) and re-enable the button.
      const message =
        (err as { response?: { data?: { message?: string } } })?.response
          ?.data?.message;
      setError(message || t("Something went wrong. Please try again."));
      setLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>
          {t("Login")} - {getAppName()}
        </title>
      </Helmet>
      <Container size={420} className={classes.container}>
        <Title ta="center">{t("Sign in")}</Title>

        {!isLoaded ? null : !isSignedIn ? (
          <SignIn />
        ) : !organization ? (
          <OrganizationList hidePersonal />
        ) : (
          <Box mt="md">
            <Text ta="center" mb="sm">
              {organization.name}
            </Text>
            {error && (
              <Alert color="red" mb="sm" data-testid="clerk-enter-error">
                {error}
              </Alert>
            )}
            <Button fullWidth loading={loading} onClick={enter}>
              {t("Enter workspace")}
            </Button>
          </Box>
        )}
      </Container>
    </>
  );
}
