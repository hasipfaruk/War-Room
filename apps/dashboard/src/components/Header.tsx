import type { Mode, Status } from "../types";

const lifecycle: Status[] = ["nominal", "critical", "investigating", "fixing", "resolved"];

type Props = { status: Status; mode?: Mode; model?: string; connected: boolean };

export function Header({ status, mode, model, connected }: Props) {
  // "deploying" sits before the alert fires and "failed" can happen at any step;
  // neither advances the lifecycle track.
  const reached = lifecycle.indexOf(status);
  return (
    <>
      <header className="header">
        <div>
          <p className="eyebrow">WAR ROOM · AI INCIDENT RESPONSE</p>
          <h1>checkout-service</h1>
          <div className="badges">
            {mode === "demo" && (
              <span
                className="badge demo"
                title="No OPENAI_API_KEY is set. Agent text is scripted; deploys, fixes and measurements are real."
              >
                DEMO MODE · scripted agents
              </span>
            )}
            {mode === "live" && <span className="badge live">LIVE · {model}</span>}
            {!connected && <span className="badge offline">Reconnecting to server…</span>}
          </div>
        </div>
        <div className={`status ${status}`} role="status" aria-live="polite">
          ● {status.toUpperCase()}
        </div>
      </header>
      <ol className="lifecycle" aria-label="Incident lifecycle">
        {lifecycle.map((step, index) => (
          <li
            key={step}
            className={index <= reached ? "reached" : ""}
            aria-current={index === reached ? "step" : undefined}
          >
            {step.toUpperCase()}
          </li>
        ))}
      </ol>
    </>
  );
}
