import type { AiChatCitation } from "../types/ai-chat.types";
import CitationCard from "./citation-card";
import classes from "../styles/citation.module.css";

type Props = {
  citations: AiChatCitation[];
};

// Presentational list of citation markers rendered below an assistant
// message. Ordering/dedup only — no relevance ranking.
export default function CitationSourceList({ citations }: Props) {
  if (!citations.length) return null;

  return (
    <div className={classes.citationSourceList} data-testid="citation-source-list">
      {citations.map((citation, index) => (
        <CitationCard key={citation.id} citation={citation} index={index} />
      ))}
    </div>
  );
}
