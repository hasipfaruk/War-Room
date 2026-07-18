# War Room: AI Incident Response

An AI incident-response team that diagnoses a production outage, finds the guilty
commit, ships a verified fix, and writes the postmortem — in minutes, with every
agent's reasoning streamed live to a mission-control dashboard.

## What it does

Press one button to "deploy" a real regression into a real service. Then watch a
five-agent team resolve the incident live:

| Agent | Role |
|---|---|
| **Triage** | Reads the alert, sets severity, plans the investigation |
| **Log Detective** | Analyzes real structured logs, forms ranked hypotheses with quoted evidence |
| **Git Detective** | Correlates evidence with the deployed commit range and names the guilty commit SHA |
| **Fixer** | Writes the corrective patch, commits it to a `fix/*` branch, redeploys, and **measures recovery** (error rate before vs. after) |
| **Scribe** | Writes the postmortem with the real incident timeline |

Nothing is faked. The demo service is a standalone git repository with authored
history in which three "guilty commits" introduce genuine bugs (a connection-pool
leak, a null dereference, a timeout typo). Fault injection literally checks out
the bad commit and restarts the service; a traffic generator then produces
organic failures, stack traces, and an error-rate alert. The Git Detective
receives real `git log` output and diffs of a multi-commit suspect window — the
guilty commit is buried among innocent ones and is never revealed to the agents
or the dashboard.

## Quickstart

Requirements: Node.js 22+, git. Works on Windows, macOS, and Linux.

```bash
npm install -g pnpm    # if pnpm is not installed yet
pnpm install
cp .env.example .env   # Windows: copy .env.example .env
pnpm dev
```

Open http://localhost:5173, pick a scenario, and press **Deploy incident**.
(Ports used: 5173 dashboard, 4000 orchestrator, 4001 demo service — make sure
they are free.)

- With `OPENAI_API_KEY` set in `.env`, all five agents run live on **GPT-5.6**
  (model configurable via `OPENAI_MODEL`).
- Without a key, a deterministic demo mode streams scripted reasoning and the
  Fixer performs a real `git revert` — the full loop (deploy → outage → alert →
  investigation → fix → measured recovery → postmortem) still runs end-to-end,
  so the project is testable with zero credentials.

The demo repository is seeded automatically on first run at
`demo/checkout-service-repo`. Delete that folder any time to regenerate it.

## Incident scenarios

| Scenario | Guilty commit | Real failure produced |
|---|---|---|
| Pool leak | "refactor db helpers" drops a `release()` call | `database pool exhausted` after connections run out |
| Guest checkout | "support guest checkout" removes a null guard | `TypeError: Cannot read properties of null (reading 'loyaltyTier')` |
| Timeout tuning | "tune timeouts" sets 30 ms where 30 s was intended | `payment gateway timeout after 30ms` |

## Architecture

```
dashboard (Vite + React) ── SSE ──> orchestrator (Node + Express)
                                       │  runs the 5-agent pipeline on GPT-5.6
                                       │  parses VERDICT/patches, manages deploys
                                       ▼
                             demo/checkout-service-repo
                             standalone git repo, dependency-free Node service
                             child process; deploys = git checkout + restart
                             traffic generator + error-rate alerting from logs
```

- `packages/orchestrator` — SSE event bus, agent pipeline, git evidence
  collection, fix application, recovery measurement, postmortem persistence
  (written to `demo/checkout-service-repo/incidents/<scenario>-<n>/postmortem.md`).
- `packages/dashboard` — war-room UI: live multi-agent chat feed, incident
  lifecycle (NOMINAL → CRITICAL → INVESTIGATING → FIXING → RESOLVED), alert
  metrics, fix diff, and postmortem panels.
- `scripts/seed-demo-repo.js` — authors the demo service and its git history,
  one isolated branch per scenario so each outage has exactly one root cause.

## License

MIT — see [LICENSE](LICENSE).
