import { Select } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useAiModelsQuery } from "../queries/ai-chat-query";

type Props = {
  value: string | undefined;
  onChange: (model: string | undefined) => void;
  disabled?: boolean;
};

// Presentational model switcher: forwards the user's choice from the
// service-provided model roster. The client does NOT decide model
// capabilities (AC7 thinness guard) — it only lists and forwards.
export default function ChatModelPicker({ value, onChange, disabled }: Props) {
  const { t } = useTranslation();
  const { data: models } = useAiModelsQuery();

  return (
    <Select
      aria-label={t("Model")}
      data={(models || []).map((m) => ({ value: m.id, label: m.label }))}
      value={value || null}
      onChange={(val) => onChange(val || undefined)}
      disabled={disabled}
      placeholder={t("Default model")}
      size="xs"
      clearable
    />
  );
}
