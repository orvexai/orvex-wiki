import { SegmentedControl } from "@mantine/core";
import { useTranslation } from "react-i18next";

type Props = {
  value: "page" | "workspace";
  onChange: (scope: "page" | "workspace") => void;
  disabled?: boolean;
};

// Presentational scope switcher (page vs. workspace context). Forwards the
// user's choice verbatim — no query-planning logic lives here.
export default function ChatScopeSwitcher({ value, onChange, disabled }: Props) {
  const { t } = useTranslation();

  return (
    <SegmentedControl
      aria-label={t("Chat scope")}
      size="xs"
      value={value}
      onChange={(val) => onChange(val as "page" | "workspace")}
      disabled={disabled}
      data={[
        { label: t("Page"), value: "page" },
        { label: t("Workspace"), value: "workspace" },
      ]}
    />
  );
}
