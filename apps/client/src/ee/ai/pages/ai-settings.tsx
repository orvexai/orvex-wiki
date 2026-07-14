import { Helmet } from "react-helmet-async";
import { getAppName } from "@/lib/config.ts";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import useUserRole from "@/hooks/use-user-role.tsx";
import { useTranslation } from "react-i18next";
import EnableAiSearch from "@/ee/ai/components/enable-ai-search.tsx";
import EnableGenerativeAi from "@/ee/ai/components/enable-generative-ai.tsx";
import EnableAiChat from "@/ee/ai-chat/components/enable-ai-chat.tsx";
import { Alert, Stack } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { useHasFeature } from "@/ee/hooks/use-feature";
import { Feature } from "@/ee/features";
import { useUpgradeLabel } from "@/ee/hooks/use-upgrade-label";
import { isCloud } from "@/lib/config.ts";

export default function AiSettings() {
  const { t } = useTranslation();
  const { isAdmin } = useUserRole();
  const hasAccess = useHasFeature(Feature.AI);
  const upgradeLabel = useUpgradeLabel();

  if (!isAdmin) {
    return null;
  }

  return (
    <>
      <Helmet>
        <title>AI settings - {getAppName()}</title>
      </Helmet>
      <SettingsTitle title={t("AI settings")} />

      {!hasAccess && (
        <Alert
          icon={<IconInfoCircle />}
          title={upgradeLabel}
          color="blue"
          mb="lg"
        >
          {t(
            "AI is only available in the Docmost enterprise edition. Contact sales@docmost.com.",
          )}
        </Alert>
      )}

      <Stack gap="md">
        {!isCloud() && <EnableAiSearch />}
        <EnableGenerativeAi />
        <EnableAiChat />
      </Stack>
    </>
  );
}
