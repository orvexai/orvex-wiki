import { useTranslation } from "react-i18next";
import { IconAlertTriangle } from "@tabler/icons-react";
import { useAiHealthQuery } from "../queries/ai-chat-query";
import classes from "../styles/ai-chat.module.css";

// Health/budget banner. Renders the matching amber alert when the AI
// service reports it is down / at a hard cap / approaching the soft-cap
// threshold; renders nothing when nominal (or when the health endpoint
// itself errors — never blocks the panel on a health-check failure).
// Ported from the pin's `components/ai-status-banner.tsx#L20-L42`.
export default function AiStatusBanner() {
  const { t } = useTranslation();
  const { data, isError } = useAiHealthQuery();

  if (isError || !data) return null;

  const isDown = data.litellmDown;
  const isHardCap = data.hardCapReached;
  const isSoftCap = !isHardCap && data.budgetPercent >= 80;

  if (!isDown && !isHardCap && !isSoftCap) return null;

  let message: string;
  if (isDown) {
    message = t("The AI provider is currently unavailable. Responses may fail.");
  } else if (isHardCap) {
    message = t("The AI usage budget has been reached. Chat is temporarily unavailable.");
  } else {
    message = t("Approaching the AI usage budget ({{percent}}% used).", {
      percent: data.budgetPercent,
    });
  }

  return (
    <div className={classes.statusBanner} role="alert">
      <IconAlertTriangle size={16} />
      <span>{message}</span>
    </div>
  );
}
