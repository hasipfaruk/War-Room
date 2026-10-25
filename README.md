# War Room

[![CI](https://github.com/hasipfaruk/War-Room/actions/workflows/ci.yml/badge.svg)](https://github.com/hasipfaruk/War-Room/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**An AI incident-response team you can watch work.** War Room deploys a real regression into a real service, then
five AI agents diagnose the outage, name the guilty commit, ship a fix, prove the service recovered and write the
postmortem. Every agent's reasoning streams live to a mission-control dashboard.

<!-- Add a screenshot or GIF of the dashboard here: docs/screenshot.png -->

## How an incident runs

1. **Deploy.** You pick a scenario. War Room checks out a branch containing a buggy commit in a sandbox git
   repository and restarts the service from it.
2. **Detect.** Synthetic traffic hits the service. Real errors and stack traces land in its structured log, and an
   error-rate alert fires once failures pass 20%.
3. **Respond.** Five agents run in sequence:

   | Agent             | What it does                                                                                                   |
   | ----------------- | -------------------------------------------------------------------------------------------------------------- |
   | **Triage**        | Reads the alert, sets severity, plans the investigation                                                        |
   | **Log Detective** | Reads the latest log lines and ranks hypotheses with quoted evidence                                           |
   | **Git Detective** | Reads the `git log` and diffs since the last good release, then names the guilty commit                        |
   | **Fixer**         | Writes a patch on a `fix/*` branch. If it doesn't parse, start or fix the error rate, War Room reverts instead |
   | **Scribe**        | Writes a postmortem from the real incident timeline                                                            |

4. **Verify.** The fix is redeployed, traffic is replayed and the error rate is measured again (typically 67–100%
   before, about 5% after).

The guilty commit sits among innocent ones, and neither the agents nor the dashboard are told which one it is.

## Quick start

Requirements: **Node.js 22+**, **git** and **pnpm** (`npm install -g pnpm`). Works on Windows, macOS and Linux.

```bash
git clone https://github.com/hasipfaruk/War-Room.git
cd War-Room
pnpm install
cp .env.example .env      # Windows: copy .env.example .env
pnpm dev
```

Open <http://localhost:5173>, pick a scenario and press **Deploy incident**.

### Live mode and demo mode

- **Live mode:** set `OPENAI_API_KEY` in `.env`. All five agents call the model set in `OPENAI_MODEL` through the
  OpenAI Responses API.
- **Demo mode:** with no key, the agents stream scripted text and the dashboard shows a **DEMO MODE** badge. The
  rest of the loop still runs for real: the deploy, errors, alert, `git revert`, redeploy and recovery measurement.
  You can try the whole project without credentials.

### Production build

```bash
pnpm build
pnpm start      # serves the API and the dashboard on http://localhost:4000
```

## Scenarios

| Scenario       | Guilty commit                                        | Failure it causes                                                   |
| -------------- | ---------------------------------------------------- | ------------------------------------------------------------------- |
| Pool leak      | `refactor db helpers` drops a connection `release()` | `database pool exhausted` once connections run out                  |
| Guest checkout | `support guest checkout` removes a null guard        | `TypeError: Cannot read properties of null (reading 'loyaltyTier')` |
| Timeout tuning | `tune timeouts` sets 30 ms where 30 s was intended   | `payment gateway timeout after 30ms`                                |

The sandbox repository is created on first run at `sandbox/checkout-service`. Delete the `sandbox/` folder any time
to regenerate it. Postmortems are saved to `sandbox/postmortems/`.

## Configuration

All settings are optional and live in `.env` at the repository root.

| Variable                  | Default                    | Purpose                                                        |
| ------------------------- | -------------------------- | -------------------------------------------------------------- |
| `OPENAI_API_KEY`          | _(empty: demo mode)_       | Enables live agents                                            |
| `OPENAI_MODEL`            | `gpt-5.6`                  | Model used by every agent                                      |
| `WAR_ROOM_DEMO`           | _(unset)_                  | Set to `1` to force demo mode even when a key is present       |
| `HOST`                    | `127.0.0.1`                | Interface the server binds to (see [SECURITY.md](SECURITY.md)) |
| `SERVER_PORT`             | `4000`                     | API port (and dashboard port after `pnpm build`)               |
| `SERVICE_PORT`            | `4001`                     | Port of the sandbox checkout service                           |
| `DASHBOARD_PORT`          | `5173`                     | Dev-server port for the dashboard                              |
| `SANDBOX_DIR`             | `sandbox/checkout-service` | Where the sandbox repository is created                        |
| `POSTMORTEM_DIR`          | `sandbox/postmortems`      | Where postmortems are written                                  |
| `AGENT_TIMEOUT_MS`        | `180000`                   | Per-agent time limit in live mode                              |
| `AGENT_MAX_OUTPUT_TOKENS` | `16000`                    | Per-agent output token limit in live mode                      |

## Architecture

```
apps/dashboard (Vite + React) ── /api (SSE + JSON) ──> apps/server (Node + Express)
                                                        │  five-agent pipeline, git evidence,
                                                        │  fix + redeploy + recovery measurement
                                                        ▼
                                              sandbox/checkout-service
                                              standalone git repo, dependency-free Node service
                                              deploy = git checkout + restart
```

```
apps/
  server/       API, event stream, agent pipeline, sandbox process management
    src/
      index.ts         HTTP routes and startup
      incident.ts      deploy → alert → agents → fix → verify → postmortem
      agents.ts        model calls and streaming
      demo-scripts.ts  scripted responses for demo mode
      service.ts       starts, stops and measures the sandbox service
      git.ts           git helpers and sandbox seeding
      events.ts        server-sent event bus with replay for late joiners
  dashboard/    war-room UI
scripts/
  seed-demo-repo.js  writes the sandbox service and its git history
  e2e-demo.mjs       end-to-end test of every scenario in demo mode
```

## Development

| Command         | What it does                                                         |
| --------------- | -------------------------------------------------------------------- |
| `pnpm dev`      | Runs the server and dashboard with live reload                       |
| `pnpm check`    | Type-checks both apps                                                |
| `pnpm build`    | Builds both apps                                                     |
| `pnpm test:e2e` | Runs every scenario end to end in demo mode (run `pnpm build` first) |
| `pnpm format`   | Formats the code with Prettier                                       |

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to add a scenario or an agent.

## Limitations and roadmap

War Room currently works only with its bundled sandbox service. It is a working reference for an AI incident loop, not
yet something to point at production systems. Planned work:

- Run against your own repository, logs, deploy command and health check through a config file
- Open real pull requests and require human approval before deploying a fix
- Run model-written code in a container sandbox
- Support other model providers
- Add a cancel button for a running incident

## Security

The Fixer agent writes code that War Room then runs. Read [SECURITY.md](SECURITY.md) before changing `HOST` or
pointing War Room at anything other than the bundled sandbox.

## License

[MIT](LICENSE)
