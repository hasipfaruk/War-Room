# Using the dashboard

![War Room dashboard after resolving a pool-leak incident](../assets/screenshot.png)

## Header

- **Status** (top right) shows where the incident is: `NOMINAL`, `DEPLOYING`, `CRITICAL`, `INVESTIGATING`, `FIXING`,
  `RESOLVED` or `FAILED`. Screen readers announce changes to it.
- **Mode badge** shows **DEMO MODE** (scripted agent text) or **LIVE** with the model name.
- **Reconnecting to server** appears only if the connection to the server drops. The dashboard reconnects on its own
  and reloads the current incident.
- **Lifecycle track** lights up each stage as the incident reaches it.

## Latest alert

Once the error-rate alert fires, this panel shows the error message from the logs, the share of failing checkouts and
the endpoint. While the bug is being deployed it says which scenario is deploying.

## Deploy incident scenario

Choose a scenario and press **Deploy incident**. The buttons are disabled while an incident is running, because only
one incident can run at a time. If the deploy fails (for example, the alert never fires), the error appears in a red
banner under the header.

## Multi-agent incident feed

Each agent appears here in the order it runs. Its reply streams in as it is generated and is formatted as Markdown when
it finishes. Labels next to the agent's name:

- **STREAMING**: the agent is still writing.
- **SCRIPTED**: demo mode text, not a model reply.

If an agent fails, its message turns red and shows the error, and the incident status changes to `FAILED`.

The feed follows new text while you are scrolled to the bottom. Scroll up to read something and it stops following.

## Fix and postmortem

After the Fixer runs, two panels appear at the bottom:

- **Fix deployed** shows the branch, whether the fix was an AI patch or a revert, the error rate before and after, and
  the full commit diff.
- **Postmortem** shows the report and where it was saved, by default in `sandbox/postmortems/`.

## Refreshing the page

You can refresh or open a second tab at any time. The server replays the current incident to every new connection, so
the dashboard shows the same state everywhere.
