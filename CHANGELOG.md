# Changelog

All notable changes to War Room are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/). Before 1.0, a minor version may include breaking changes; they are noted
explicitly.

## [Unreleased]

## [0.2.0] - 2026-10-26

### Added

- Documentation site built with MkDocs Material, published at <https://hasipfaruk.github.io/War-Room/docs/>, covering
  setup, configuration, the HTTP API, the event stream and guides for building on War Room.
- Project website with a replay of a recorded incident, published at <https://hasipfaruk.github.io/War-Room/>.
- `hello` events now list every agent (`agents`), and the dashboard's agent counter uses it.
- Production mode: `pnpm build && pnpm start` serves the dashboard and API on one port.
- End-to-end test of every scenario in demo mode (`pnpm test:e2e`), run in CI on Linux, macOS and Windows.
- Settings for ports, sandbox and postmortem folders, agent time limit and agent token limit.
- **DEMO MODE** badge and **SCRIPTED** labels so demo output is never mistaken for model output.
- Agent replies and postmortems are rendered as Markdown.
- Issue and pull request templates, code of conduct, security policy and Dependabot configuration.

### Changed

- **Breaking:** folders renamed. `packages/orchestrator` is now `apps/server`, `packages/dashboard` is now
  `apps/dashboard`, and the sandbox moved from `demo/checkout-service-repo` to `sandbox/checkout-service`. Delete an
  old `demo/` folder after upgrading.
- **Breaking:** the API moved under `/api` (`/api/events`, `/api/incident`, `/api/scenarios`, `/api/health`).
- **Breaking:** `PORT` and `CHECKOUT_SERVICE_URL` are replaced by `SERVER_PORT` and `SERVICE_PORT`.
- Postmortems are saved to `sandbox/postmortems/<timestamp>-<scenario>.md` and are never overwritten.
- In live mode, a failed model call stops the incident with an error instead of silently switching to scripted text.
- An AI patch is kept only if it parses, starts and lowers the error rate. Otherwise the guilty commit is reverted.

### Fixed

- Refreshing the dashboard during an incident lost early events.
- Postmortem timelines showed the same time for every entry.
- The server hung when restarting a service that had already crashed.
- The deploy button stayed disabled after a failed deploy.
- Messages appeared twice after the dashboard reconnected.
- The "reconnecting" badge showed on every page load.

### Security

- The server listens on `127.0.0.1` only, rejects requests not addressed to localhost and sends no CORS headers.
- The sandbox service no longer receives the server's environment, including `OPENAI_API_KEY`.
- Only one incident can run at a time; concurrent requests get `409 Conflict`.
- Logs, alerts, diffs and source are passed to the model as labelled untrusted data.

## [0.1.0] - 2026-07-19

### Added

- First release: a five-agent incident pipeline (Triage, Log Detective, Git Detective, Fixer, Scribe), a live
  dashboard, a seeded sandbox service with three incident scenarios and a keyless demo mode.

[Unreleased]: https://github.com/hasipfaruk/War-Room/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/hasipfaruk/War-Room/releases/tag/v0.2.0
[0.1.0]: https://github.com/hasipfaruk/War-Room/commits/main
