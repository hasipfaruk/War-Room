export type Scenario = {
  id: string;
  label: string;
  summary: string;
  /** Branch in the sandbox repository whose tip contains the regression. */
  branch: string;
  /** Subject of the guilty commit. Only demo mode reads it; it is never sent to agents or the dashboard. */
  guiltySubject: string;
};

export const scenarios: Scenario[] = [
  {
    id: "pool-leak",
    label: "Pool leak",
    summary: "Database connection pool exhaustion",
    branch: "incident/pool-leak",
    guiltySubject: "refactor db helpers",
  },
  {
    id: "guest-checkout-null-user",
    label: "Guest checkout",
    summary: "Null user dereference",
    branch: "incident/guest-checkout-null-user",
    guiltySubject: "support guest checkout",
  },
  {
    id: "retry-timeout-typo",
    label: "Timeout tuning",
    summary: "Payment gateway timeout typo",
    branch: "incident/retry-timeout-typo",
    guiltySubject: "tune timeouts",
  },
];

export const findScenario = (id: unknown) => scenarios.find((scenario) => scenario.id === id);
