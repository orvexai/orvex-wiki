import { HoverCard } from "@mantine/core";
import type { AiChatCitation } from "../types/ai-chat.types";
import { citationUrl } from "../utils/citation-url";
import classes from "../styles/citation.module.css";

type Props = {
  citation: AiChatCitation;
  index: number;
};

// Presentational citation hover-card: renders the cited page title + link.
// No relevance/ranking logic — the citation list arrives pre-computed from
// the AI service (AC7 thinness guard).
export default function CitationCard({ citation, index }: Props) {
  const href = citationUrl(citation);

  return (
    <HoverCard width={280} shadow="md" openDelay={0} closeDelay={0} withinPortal={false}>
      <HoverCard.Target>
        <button
          type="button"
          className={classes.citationMarker}
          data-testid="citation-marker"
          aria-label={`Citation ${index + 1}: ${citation.title}`}
        >
          {index + 1}
        </button>
      </HoverCard.Target>
      <HoverCard.Dropdown>
        <div
          className={classes.citationCard}
          data-testid="citation-card"
          role="article"
        >
          <a href={href} className={classes.citationCardTitle}>
            {citation.title}
          </a>
          {citation.snippet && (
            <div className={classes.citationCardSnippet}>
              {citation.snippet}
            </div>
          )}
        </div>
      </HoverCard.Dropdown>
    </HoverCard>
  );
}
