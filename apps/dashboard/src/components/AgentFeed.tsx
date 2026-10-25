import { useEffect, useRef } from "react";
import type { AgentMessage } from "../types";
import { Markdown } from "./Markdown";

const initials = (agent: string) =>
  agent
    .split(" ")
    .map((word) => word[0])
    .join("");

export function AgentFeed({ messages, running }: { messages: AgentMessage[]; running: boolean }) {
  const feed = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  // Follow new output only while the reader is already at the bottom.
  useEffect(() => {
    const element = feed.current;
    if (element && pinned.current) element.scrollTop = element.scrollHeight;
  }, [messages]);

  const onScroll = () => {
    const element = feed.current;
    if (element) pinned.current = element.scrollHeight - element.scrollTop - element.clientHeight < 40;
  };

  return (
    <section className="panel feed-panel">
      <div className="feed-heading">
        <div>
          <p className="label">MULTI-AGENT INCIDENT FEED</p>
          <h2>
            {running ? "Agents are investigating" : messages.length ? "Response complete" : "Awaiting incident signal"}
          </h2>
        </div>
        <span>{messages.length} / 5 AGENTS</span>
      </div>
      <div className="feed" ref={feed} onScroll={onScroll} aria-busy={running}>
        {messages.length ? (
          messages.map((message, index) => (
            <article className="chat" key={`${message.agent}-${index}`}>
              <div className="avatar" style={{ background: message.color }} aria-hidden="true">
                {initials(message.agent)}
              </div>
              <div className="chat-body">
                <p className="agent-name" style={{ color: message.color }}>
                  {message.agent}
                  {message.simulated && <em>SCRIPTED</em>}
                  {!message.complete && <em>STREAMING</em>}
                </p>
                <div className={`bubble ${message.error ? "failed" : ""}`}>
                  {message.text ? <Markdown source={message.text} /> : "…"}
                  {!message.complete && <span className="cursor">▋</span>}
                  {message.error && <p className="error-text">{message.error}</p>}
                </div>
              </div>
            </article>
          ))
        ) : (
          <p className="empty">Every agent’s evidence and conclusion will appear here in real time.</p>
        )}
      </div>
    </section>
  );
}
