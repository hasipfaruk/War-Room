import { Fragment, type ReactNode } from "react";

const listItem = /^\s*([-*]|\d+\.)\s+/;
const blockStart = /^(#{1,4}\s|```|\s*([-*]|\d+\.)\s)/;

/**
 * Renders the small Markdown subset agents produce: headings, lists, code fences,
 * paragraphs, inline code and bold. Text is rendered by React, never as raw HTML.
 */
export function Markdown({ source }: { source: string }) {
  return <div className="markdown">{blocks(source)}</div>;
}

function blocks(source: string) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const key = out.length;
    if (line.startsWith("```")) {
      const code: string[] = [];
      for (i++; i < lines.length && !lines[i].startsWith("```"); i++) code.push(lines[i]);
      i++;
      out.push(<pre key={key}>{code.join("\n")}</pre>);
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const Tag = `h${Math.min(heading[1].length + 2, 6)}` as "h3";
      out.push(<Tag key={key}>{inline(heading[2])}</Tag>);
      i++;
      continue;
    }
    if (listItem.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && listItem.test(lines[i])) items.push(lines[i++].replace(listItem, ""));
      const List = ordered ? "ol" : "ul";
      out.push(
        <List key={key}>
          {items.map((item, n) => (
            <li key={n}>{inline(item)}</li>
          ))}
        </List>,
      );
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const paragraph = [line];
    for (i++; i < lines.length && lines[i].trim() && !blockStart.test(lines[i]); i++) paragraph.push(lines[i]);
    out.push(<p key={key}>{inline(paragraph.join(" "))}</p>);
  }
  return out;
}

function inline(text: string) {
  return text
    .split(/(`[^`]+`|\*\*[^*]+\*\*)/)
    .filter(Boolean)
    .map((part, i) => {
      if (part.length > 2 && part.startsWith("`") && part.endsWith("`"))
        return <code key={i}>{part.slice(1, -1)}</code>;
      if (part.length > 4 && part.startsWith("**") && part.endsWith("**"))
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      return <Fragment key={i}>{part}</Fragment>;
    });
}
