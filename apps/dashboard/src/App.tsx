import { useEffect, useState } from "react";
import { AgentFeed } from "./components/AgentFeed";
import { AlertPanel } from "./components/AlertPanel";
import { Header } from "./components/Header";
import { Results } from "./components/Results";
import { ScenarioPanel } from "./components/ScenarioPanel";
import type { Scenario } from "./types";
import { useWarRoom } from "./useWarRoom";

export function App() {
  const state = useWarRoom();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selected, setSelected] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [requestError, setRequestError] = useState<string>();

  useEffect(() => {
    fetch("/api/scenarios")
      .then((response) => response.json() as Promise<{ scenarios: Scenario[] }>)
      .then(({ scenarios }) => {
        setScenarios(scenarios);
        setSelected((current) => current ?? scenarios[0]?.id);
      })
      .catch(() => setRequestError("Could not load scenarios. Is the War Room server running?"));
  }, []);

  async function deploy() {
    setSubmitting(true);
    setRequestError(undefined);
    try {
      const response = await fetch("/api/incident", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario: selected }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setRequestError(body.error ?? `Deploy failed with HTTP ${response.status}`);
      }
    } catch {
      setRequestError("Could not reach the War Room server.");
    } finally {
      setSubmitting(false);
    }
  }

  const banner = requestError ?? state.statusMessage;
  return (
    <main>
      <Header status={state.status} mode={state.mode} model={state.model} connectionLost={state.connectionLost} />
      {banner && (
        <p className={`banner ${state.status === "failed" || requestError ? "error" : "warning"}`} role="alert">
          {banner}
        </p>
      )}
      <section className="top-grid">
        <AlertPanel alert={state.alert} scenarioLabel={state.scenarioLabel} />
        <ScenarioPanel
          scenarios={scenarios}
          selected={selected}
          onSelect={setSelected}
          onDeploy={deploy}
          busy={submitting || state.running}
        />
      </section>
      <AgentFeed messages={state.messages} running={state.running} agentCount={state.agentCount} />
      <Results fix={state.fix} postmortem={state.postmortem} />
    </main>
  );
}
