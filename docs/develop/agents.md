# Add or change an agent

All agent code is on the server. The dashboard and the event stream need no changes: they show whatever agents the
server runs.

## Change a prompt

Each agent's prompt is written inline where it is called, in the `respond` function of `apps/server/src/incident.ts`.
For example, the Log Detective:

```ts
const logs = await runAgent(
  "Log Detective",
  "Analyze the most recent service logs. Produce ranked hypotheses, each quoting specific log lines as evidence." +
    `\n\nTriage:\n${triage}\n\n${alertJson}\n\n${untrusted("logs", evidence.logs)}`,
  () => demoScripts.logDetective(alert),
);
```

`runAgent(name, prompt, demoText)` streams the reply to the dashboard and returns the full text. The third argument is
used instead of the model in demo mode.

Instructions shared by every agent are the `instructions` constant in `apps/server/src/agents.ts`.

!!! warning "Keep evidence wrapped"

    Pass alerts, logs, diffs and source code through `untrusted(label, content)`. The shared instructions tell the
    model to treat text in those tags as data. Leaving evidence unwrapped makes prompt injection easier.

If you change what the Git Detective returns, keep the `VERDICT: <sha>` line: `parseVerdict` in `incident.ts` reads it.
If you change the Fixer, keep the single fenced code block containing the whole file: `commitPatch` reads it.

## Add an agent

Say you want a **Comms** agent that writes a short status update for customers after the fix.

**1. Register it** in `apps/server/src/agents.ts`. The name joins the `AgentName` type and gets a color. The order of
`colors` is the order of `hello.agents` on the event stream.

```ts
export type AgentName = "Triage" | "Log Detective" | "Git Detective" | "Fixer" | "Comms" | "Scribe";

const colors: Record<AgentName, string> = {
  Triage: "#60a5fa",
  "Log Detective": "#f59e0b",
  "Git Detective": "#a78bfa",
  Fixer: "#34d399",
  Comms: "#22d3ee",
  Scribe: "#fb7185",
};
```

**2. Write its demo script** in `apps/server/src/demo-scripts.ts`, so the project still works without a key:

```ts
comms: (before: number, after: number) =>
  `Checkout errors are resolved. Failures dropped from ${percent(before)} to ${percent(after)}. ` +
  "No action is needed from customers.",
```

**3. Call it** in `respond` in `apps/server/src/incident.ts`, after the fix is measured:

```ts
const comms = await runAgent(
  "Comms",
  "Write a three-sentence status update for customers about this incident. No internal details." +
    `\n\nRoot cause:\n${git}\n\nError rate ${percent(before)} before the fix, ${percent(fix.errorRate)} after.`,
  () => demoScripts.comms(before, fix.errorRate),
);
```

Pass `comms` to the Scribe's prompt too if the postmortem should mention it.

**4. Test it.** Run `pnpm check`, then `pnpm build && pnpm test:e2e`, then watch a run with `pnpm dev`. The new agent
appears in the feed with its color, and the agent counter shows six.

## Use a different model provider

Model calls are in one function, `streamModel` in `apps/server/src/agents.ts`. It receives the prompt and an `emit`
callback for each piece of text. To use another provider, replace the body of that function with that provider's
streaming call and call `emit(text)` for each chunk. Nothing else in War Room needs to change. Support for choosing a
provider through settings is on the [roadmap](../project/roadmap.md).
