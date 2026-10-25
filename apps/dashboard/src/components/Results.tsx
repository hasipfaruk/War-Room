import type { Fix, Postmortem } from "../types";
import { Markdown } from "./Markdown";

const percent = (rate: number) => `${Math.round(rate * 100)}%`;

export function Results({ fix, postmortem }: { fix?: Fix; postmortem?: Postmortem }) {
  if (!fix && !postmortem) return null;
  return (
    <section className="details">
      {fix && (
        <details open>
          <summary>
            Fix deployed from <b>{fix.branch}</b> ({fix.method === "patch" ? "AI patch" : "revert"}) · error rate{" "}
            {percent(fix.beforeErrorRate)} → {percent(fix.afterErrorRate)}
            <small> over {fix.sampleSize} checkouts</small>
          </summary>
          <pre>{fix.diff}</pre>
        </details>
      )}
      {postmortem && (
        <details open>
          <summary>
            Postmortem <small>saved to {postmortem.path}</small>
          </summary>
          <div className="postmortem">
            <Markdown source={postmortem.content} />
          </div>
        </details>
      )}
    </section>
  );
}
