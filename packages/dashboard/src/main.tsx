import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type Alert = { error?: string; endpoint?: string; errorRate?: number; latencyP95Ms?: number };

function App() {
  const [alert, setAlert] = useState<Alert | null>(null);
  const [transcript, setTranscript] = useState("");
  const [status, setStatus] = useState("NOMINAL");
  const [running, setRunning] = useState(false);
  useEffect(() => {
    const events = new EventSource("/api/events");
    events.addEventListener("incident", (event) => setAlert(JSON.parse(event.data).alert));
    events.addEventListener("agent_started", () => { setTranscript(""); setRunning(true); });
    events.addEventListener("agent_delta", (event) => setTranscript((current) => current + JSON.parse(event.data).delta));
    events.addEventListener("agent_complete", () => setRunning(false));
    events.addEventListener("status", (event) => setStatus(JSON.parse(event.data).status.toUpperCase()));
    return () => events.close();
  }, []);
  const inject = async () => { setRunning(true); await fetch("/api/incident", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scenario: "guest-checkout-null-user" }) }); };
  return <main>
    <header><div><p className="eyebrow">WAR ROOM / LIVE INCIDENT RESPONSE</p><h1>Checkout Service</h1></div><div className={`status ${status.toLowerCase()}`}>● {status}</div></header>
    <section className="grid">
      <article className="panel alert"><p className="label">LATEST ALERT</p>{alert ? <><h2>Checkout error-rate breach</h2><code>{alert.error}</code><div className="metrics"><span>ERROR RATE <b>{Math.round(Number(alert.errorRate ?? 0) * 100)}%</b></span><span>P95 LATENCY <b>{alert.latencyP95Ms ?? "n/a"}ms</b></span><span>ENDPOINT <b>{alert.endpoint}</b></span></div></> : <p>Standing by for a fault injection.</p>}</article>
      <article className="panel detective"><p className="label"><i /> GIT DETECTIVE {running && <em>STREAMING</em>}</p><h2>Commit investigation</h2><div className="message">{transcript || "Awaiting incident signal."}<span className={running ? "cursor" : "hidden"}>▋</span></div></article>
    </section>
    <button onClick={inject} disabled={running}>{running ? "Investigating…" : "Inject guest checkout fault"}</button>
  </main>;
}
createRoot(document.getElementById("root")!).render(<App />);
