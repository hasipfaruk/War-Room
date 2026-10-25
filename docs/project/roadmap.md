# Roadmap

War Room works end to end against its bundled sandbox. The next steps turn it from a reference into something you can
point at your own services. Each item below is open for contributions; comment on or open an issue before starting a
large one, so work isn't duplicated.

## Planned

### Run against your own service

A config file (for example `warroom.config.json`) that tells War Room:

- which repository to read commits from
- where to read logs, and how to recognise an error
- how to deploy a commit, and how to check health
- how to measure the error rate

Today these are hard-wired to the sandbox in `apps/server/src/service.ts` and `git.ts`.

### Pull requests and human approval

Push the fix branch, open a pull request with the diff, the evidence and the postmortem, and wait for a person to
approve before deploying. This is the most important step before War Room touches anything real.

### Container sandbox

Run the service that executes AI-written code inside a container with no network and no access to the host. Today it
runs as a normal process with a minimal environment (see [Security](security.md)).

### More model providers

Choose the provider and model through settings. Model calls are already isolated in one function, `streamModel` in
`apps/server/src/agents.ts`, so each provider is a small addition.

### Cancel a running incident

A button and an API route to stop the current incident, roll back to `main` and release the lock.

## Good first issues

Smaller changes that are a good way to learn the code:

- **A new scenario.** For example a cache that never expires, or an off-by-one in pagination. See
  [Add a scenario](../develop/scenarios.md).
- **Postmortem history.** List saved postmortems in the dashboard and open old ones.
- **Unit tests.** `parseVerdict` and the Markdown renderer have no unit tests yet; only the end-to-end test covers them.
- **P95 latency.** The alert panel has a P95 latency field, but the sandbox service doesn't report latency yet.
- **Light theme.** The dashboard is dark only.

Have another idea? [Open a feature request](https://github.com/hasipfaruk/War-Room/issues/new/choose).
