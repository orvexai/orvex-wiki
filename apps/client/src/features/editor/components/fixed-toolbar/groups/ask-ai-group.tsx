import { FC } from "react";
import { Button } from "@mantine/core";
import { IconSparkles } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { aiPalette } from "@/features/editor/components/ai-palette/ai-palette";

export const AskAiGroup: FC = () => {
  const { t } = useTranslation();

  return (
    <Button
      variant="subtle"
      color="dark"
      size="xs"
      leftSection={<IconSparkles size={14} />}
      onClick={() => aiPalette.open()}
    >
      {t("Ask AI")}
    </Button>
  );
};
