// Scripted agent responses for demo mode (no API key). They are clearly labelled as
// simulated in the dashboard. Everything else in the loop (deploy, alert, revert,
// redeploy, recovery measurement) still runs for real.
import type { Scenario } from "./scenarios.js";
import type { Alert } from "./service.js";
import { percent } from "./util.js";

export const demoScripts = {
  triage: (alert: Alert) =>
    `SEV-1: checkout-service is failing ${percent(alert.errorRate)} of checkouts on ${alert.endpoint ?? "an unknown endpoint"}.\n\n` +
    "Plan:\n1. Confirm the error signature in the latest structured logs.\n" +
    "2. Compare the deployed commits against the last known good release.\n" +
    "3. Apply the smallest safe fix, redeploy and measure recovery.",

  logDetective: (alert: Alert) =>
    `1. **Most likely: a regression in the checkout path.** Every recent \`checkout_failed\` entry reports \`${alert.error}\`.\n` +
    "2. Failures began immediately after the deploy, and `checkout_completed` events disappeared at the same time.\n" +
    "3. Less likely: a downstream outage. The failures are uniform rather than intermittent, which points at code.",

  gitDetective: (scenario: Scenario, gitLog: string) => {
    const line = gitLog.split("\n").find((entry) => entry.endsWith(scenario.guiltySubject));
    const sha = line?.split(" ")[0] ?? "unknown";
    return (
      `Demo mode: this verdict is scripted for the "${scenario.label}" scenario.\n\n` +
      `Commit ${sha} ("${scenario.guiltySubject}") changes the code path named in the alert and logs. ` +
      "The other commits in the range only touch docs, request IDs and cache headers.\n\n" +
      `VERDICT: ${sha}`
    );
  },

  fixer: () =>
    "Demo mode: no model is configured, so I will revert the guilty commit on a fix branch, redeploy and measure recovery.",

  scribe: (details: {
    scenario: Scenario;
    guiltyCommit: string;
    before: number;
    after: number;
    method: string;
    branch: string;
    timeline: string;
  }) =>
    `# Postmortem: ${details.scenario.label}\n\n` +
    "## Summary\n" +
    `checkout-service failed ${percent(details.before)} of checkouts after a deploy. ` +
    `War Room identified the regression, deployed a fix from \`${details.branch}\` and the error rate fell to ${percent(details.after)}.\n\n` +
    `## Timeline\n${details.timeline}\n\n` +
    `## Root Cause\nCommit \`${details.guiltyCommit}\` introduced a regression in the checkout path (${details.scenario.summary.toLowerCase()}).\n\n` +
    `## Resolution\nThe fix was applied by ${details.method === "patch" ? "patching the code" : "reverting the guilty commit"}, redeployed and verified with replayed traffic.\n\n` +
    "## Action Items\n- Add a regression test covering this failure.\n- Gate deploys on checkout error rate.\n- Require review for changes to the checkout path.",
};
