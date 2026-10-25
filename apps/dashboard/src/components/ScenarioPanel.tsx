import type { Scenario } from "../types";

type Props = {
  scenarios: Scenario[];
  selected?: string;
  onSelect: (id: string) => void;
  onDeploy: () => void;
  busy: boolean;
};

export function ScenarioPanel({ scenarios, selected, onSelect, onDeploy, busy }: Props) {
  return (
    <article className="panel controls">
      <p className="label" id="scenario-label">
        DEPLOY INCIDENT SCENARIO
      </p>
      <div className="scenarios" role="radiogroup" aria-labelledby="scenario-label">
        {scenarios.map((scenario) => (
          <button
            key={scenario.id}
            type="button"
            role="radio"
            aria-checked={selected === scenario.id}
            className={`scenario ${selected === scenario.id ? "selected" : ""}`}
            onClick={() => onSelect(scenario.id)}
            disabled={busy}
          >
            <b>{scenario.label}</b>
            <small>{scenario.summary}</small>
          </button>
        ))}
      </div>
      <button type="button" className="deploy" onClick={onDeploy} disabled={busy || !selected}>
        {busy ? "Response in progress…" : "Deploy incident"}
      </button>
    </article>
  );
}
