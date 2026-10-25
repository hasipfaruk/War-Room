import type { Alert } from "../types";

export function AlertPanel({ alert, scenarioLabel }: { alert?: Alert; scenarioLabel?: string }) {
  return (
    <article className="panel alert">
      <p className="label">LATEST ALERT</p>
      {alert ? (
        <>
          <h2>Checkout error-rate breach</h2>
          <code>{alert.error}</code>
          <div className="metrics">
            <span>
              ERROR RATE <b>{Math.round((alert.errorRate ?? 0) * 100)}%</b>
            </span>
            <span>
              P95 LATENCY <b>{alert.latencyP95Ms != null ? `${alert.latencyP95Ms}ms` : "n/a"}</b>
            </span>
            <span>
              ENDPOINT <b>{alert.endpoint ?? "n/a"}</b>
            </span>
          </div>
        </>
      ) : scenarioLabel ? (
        <p className="muted">Deploying “{scenarioLabel}” and watching the error rate…</p>
      ) : (
        <p className="muted">Standing by. Deploy a scenario to start an incident.</p>
      )}
    </article>
  );
}
