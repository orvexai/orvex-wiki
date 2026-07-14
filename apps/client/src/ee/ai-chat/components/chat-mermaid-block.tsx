import { useEffect, useState, useId } from "react";
import DOMPurify from "dompurify";
import { getMermaid } from "../lib/mermaid-loader";
import classes from "../styles/chat-message.module.css";

type Props = {
  code: string;
};

// Renders an in-chat mermaid diagram via the module-singleton loader
// (`getMermaid()` — initialize() called at most once). On load/render
// failure it falls back to a visible inline code block — never an empty
// node (CS §10 never-white-screen).
export default function ChatMermaidBlock({ code }: Props) {
  const id = useId().replace(/[:]/g, "-");
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const mermaid = await getMermaid();
      if (!mermaid) {
        if (!cancelled) setFailed(true);
        return;
      }
      try {
        const { svg: rendered } = await mermaid.render(`mermaid-${id}`, code);
        if (!cancelled) setSvg(rendered);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, id]);

  if (svg) {
    return (
      <div
        className={classes.mermaidDiagram}
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(svg) }}
      />
    );
  }

  if (failed) {
    return (
      <pre className={classes.mermaidFallback} data-testid="mermaid-fallback">
        <code>{code}</code>
      </pre>
    );
  }

  // Rendering in flight: show the raw code so there is never an empty node.
  return (
    <pre className={classes.mermaidFallback} data-testid="mermaid-fallback">
      <code>{code}</code>
    </pre>
  );
}
