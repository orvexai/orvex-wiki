import { Alert, Button, Group, Text } from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

export interface CellDiscoveryErrorBannerProps {
  onRetry: () => void;
}

/**
 * AC5 — never-white-screen (CS §10): a discovery outage (5xx/timeout) or an
 * invalid discovery response renders this inline banner instead of throwing
 * out of the boot hook; the app still mounts on the current host.
 */
export function CellDiscoveryErrorBanner({
  onRetry,
}: CellDiscoveryErrorBannerProps) {
  const { t } = useTranslation();

  return (
    <Alert
      color="red"
      icon={<IconAlertCircle size={16} />}
      title={t("Connection issue")}
      variant="light"
    >
      <Group justify="space-between" align="center" wrap="nowrap">
        <Text size="sm">
          {t(
            "We couldn't confirm your account's region. Some features may be unavailable.",
          )}
        </Text>
        <Button size="xs" variant="light" onClick={onRetry}>
          {t("Retry")}
        </Button>
      </Group>
    </Alert>
  );
}
