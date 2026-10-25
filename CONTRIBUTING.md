# Contributing to War Room

Thanks for helping. Bug reports, scenarios and pull requests are all welcome.

## Setup

```bash
pnpm install
pnpm dev
```

You don't need an API key: without one, War Room runs in demo mode (see the README).

## Before you open a pull request

```bash
pnpm format
pnpm check
pnpm build
pnpm test:e2e
```

CI runs the same steps on Linux, macOS and Windows.

## Adding an incident scenario

1. In `scripts/seed-demo-repo.js`, create a branch from `main`, add some innocent history, then add **one** guilty
   commit that produces a real, logged failure on `/checkout`. Follow the existing scenarios.
2. Add the branch name to the `branches` list at the top of the seed script.
3. Add the scenario to `apps/server/src/scenarios.ts`. `guiltySubject` must match the guilty commit's message
   exactly; only demo mode uses it.
4. Delete `sandbox/` so the repository is reseeded, then run `pnpm build && pnpm test:e2e`. The new scenario is tested
   automatically.

## Adding or changing an agent

Agents are defined in `apps/server/src/agents.ts` and wired together in `apps/server/src/incident.ts`. Each one
needs a demo-mode script in `apps/server/src/demo-scripts.ts`, so the project stays testable without credentials.
Pass any logs, diffs or source to the model through `untrusted(...)`.

## Code style

Prettier formats the code (`pnpm format`). Keep modules small and focused, and add a comment where the reason for
the code isn't obvious from the code itself.
