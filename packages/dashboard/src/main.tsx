import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type Scenario = "pool-leak" | "guest-checkout-null-user" | "retry-timeout-typo";
type Alert = { error?: string; endpoint?: string; errorRate?: number; latencyP95Ms?: number };
type Message = { agent: string; color: string; text: string; complete?: boolean };
const scenarios: { id: Scenario; label: string; detail: string }[] = [
  { id: "pool-leak", label: "Pool leak", detail: "Database pool exhaustion" },
  { id: "guest-checkout-null-user", label: "Guest checkout", detail: "Null user error" },
  { id: "retry-timeout-typo", label: "Timeout tuning", detail: "Downstream retry storm" }
];
function App() {
  const [alert, setAlert] = useState<Alert | null>(null); const [status, setStatus] = useState("NOMINAL"); const [scenario, setScenario] = useState<Scenario>("guest-checkout-null-user");
  const [messages, setMessages] = useState<Message[]>([]); const [fix, setFix] = useState<{ diff: string; beforeErrorRate: number; afterErrorRate: number; branch: string } | null>(null); const [postmortem, setPostmortem] = useState<string>(""); const [running, setRunning] = useState(false); const feed = useRef<HTMLDivElement>(null);
  const lifecycle = ["NOMINAL", "CRITICAL", "INVESTIGATING", "FIXING", "RESOLVED"];
  useEffect(() => { feed.current?.scrollTo({ top: feed.current.scrollHeight, behavior: "smooth" }); }, [messages]);
  useEffect(() => { const events = new EventSource("/api/events");
    events.addEventListener("incident", (event) => { setAlert(JSON.parse(event.data).alert); setMessages([]); setFix(null); setPostmortem(""); setRunning(true); });
    events.addEventListener("agent_started", (event) => { const data = JSON.parse(event.data); setMessages((current) => [...current, { agent: data.agent, color: data.color, text: "" }]); });
    events.addEventListener("agent_delta", (event) => { const data = JSON.parse(event.data); setMessages((current) => { const next = [...current]; const index = next.map((message) => message.agent).lastIndexOf(data.agent); if (index >= 0) next[index] = { ...next[index], text: next[index].text + data.delta }; return next; }); });
    events.addEventListener("agent_complete", (event) => { const data = JSON.parse(event.data); setMessages((current) => current.map((message, index) => index === current.map((item) => item.agent).lastIndexOf(data.agent) ? { ...message, complete: true } : message)); });
    events.addEventListener("status", (event) => { const data = JSON.parse(event.data); const next = String(data.status).toUpperCase(); setStatus(next); if (next === "RESOLVED" || (next === "CRITICAL" && data.error)) setRunning(false); });
    events.addEventListener("fix_available", (event) => setFix(JSON.parse(event.data)));
    events.addEventListener("postmortem", (event) => { setPostmortem(JSON.parse(event.data).content); setRunning(false); });
    return () => events.close(); }, []);
  const activeIndex = useMemo(() => lifecycle.indexOf(status), [status]);
  const deploy = async () => { setRunning(true); await fetch("/api/incident", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scenario }) }); };
  return <main><header><div><p className="eyebrow">WAR ROOM / LIVE INCIDENT RESPONSE</p><h1>Checkout Service</h1></div><div className={`status ${status.toLowerCase()}`}>● {status}</div></header>
    <ol className="lifecycle">{lifecycle.map((item, index) => <li className={index <= activeIndex ? "reached" : ""} key={item}>{item}</li>)}</ol>
    <section className="top-grid"><article className="panel alert"><p className="label">LATEST ALERT</p>{alert ? <><h2>Checkout error-rate breach</h2><code>{alert.error}</code><div className="metrics"><span>ERROR RATE <b>{Math.round(Number(alert.errorRate ?? 0) * 100)}%</b></span><span>P95 LATENCY <b>{alert.latencyP95Ms ?? "n/a"}ms</b></span><span>ENDPOINT <b>{alert.endpoint}</b></span></div></> : <p>Standing by for a deployment.</p>}</article><article className="panel controls"><p className="label">DEPLOY INCIDENT SCENARIO</p><div className="scenarios">{scenarios.map((item) => <button className={`scenario ${scenario === item.id ? "selected" : ""}`} key={item.id} onClick={() => setScenario(item.id)} disabled={running}><b>{item.label}</b><small>{item.detail}</small></button>)}</div><button className="deploy" onClick={deploy} disabled={running}>{running ? "Response in progress…" : "Deploy incident"}</button></article></section>
    <section className="panel feed-panel"><div className="feed-heading"><div><p className="label">MULTI-AGENT INCIDENT FEED</p><h2>{running ? "Agents are investigating" : "Awaiting incident signal"}</h2></div><span>{messages.length} AGENTS</span></div><div className="feed" ref={feed}>{messages.length ? messages.map((message, index) => <article className="chat" key={`${message.agent}-${index}`}><div className="avatar" style={{ background: message.color }}>{message.agent.split(" ").map((word) => word[0]).join("")}</div><div><p style={{ color: message.color }}>{message.agent} {!message.complete && <em>STREAMING</em>}</p><div className="bubble">{message.text || "…"}{!message.complete && <span className="cursor">▋</span>}</div></div></article>) : <p className="empty">Every agent’s evidence and conclusion will appear here in real time.</p>}</div></section>
    {(fix || postmortem) && <section className="details">{fix && <details open><summary>Fix deployed from <b>{fix.branch}</b> — error rate {(fix.beforeErrorRate * 100).toFixed(0)}% → {(fix.afterErrorRate * 100).toFixed(0)}%</summary><pre>{fix.diff}</pre></details>}{postmortem && <details open><summary>Postmortem</summary><pre>{postmortem}</pre></details>}</section>}
  </main>;
}
createRoot(document.getElementById("root")!).render(<App />);
