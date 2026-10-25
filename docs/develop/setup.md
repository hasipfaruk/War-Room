# Development setup

## Run from source

Follow the [Quick start](../getting-started/quickstart.md), then use `pnpm dev`. It starts:

- the server with `tsx watch`, which restarts it when a file in `apps/server/src` changes
- the dashboard with Vite, which updates the page when a file in `apps/dashboard/src` changes

You don't need an API key for development. Demo mode runs the whole loop.

## Commands

| Command             | What it does                                                         |
| ------------------- | -------------------------------------------------------------------- |
| `pnpm dev`          | Runs the server and dashboard with live reload                       |
| `pnpm check`        | Type-checks both apps                                                |
| `pnpm build`        | Builds both apps                                                     |
| `pnpm start`        | Runs the built server, which also hosts the built dashboard          |
| `pnpm test:e2e`     | Runs every scenario end to end in demo mode (run `pnpm build` first) |
| `pnpm format`       | Formats all files with Prettier                                      |
| `pnpm format:check` | Checks formatting without changing files                             |

## The end-to-end test

`scripts/e2e-demo.mjs` starts the built server on ports 4100 and 4101 with a temporary sandbox, so it doesn't touch
your own `sandbox/` folder or a running `pnpm dev`. For every scenario it checks that:

- the deploy returns `202` and a second deploy at the same time returns `409`
- the error rate is 20% or more before the fix and below 20% after
- a postmortem with a Root Cause section is saved
- the scenario list does not reveal the guilty commit

It takes about a minute. CI runs it on Linux, macOS and Windows for every push and pull request.

## Working on the docs

The documentation is built with [MkDocs Material](https://squidfunk.github.io/mkdocs-material/). You need Python 3.10
or newer.

```bash
python -m venv .venv
.venv/bin/pip install -r requirements-docs.txt      # Windows: .venv\Scripts\pip install -r requirements-docs.txt
.venv/bin/mkdocs serve                              # Windows: .venv\Scripts\mkdocs serve
```

Open <http://127.0.0.1:8000>. Pages reload as you edit files in `docs/`. Before opening a pull request, run
`mkdocs build --strict`; it fails on broken links and on pages missing from the navigation, the same as CI.

## Working on the website

The landing page in `website/` is plain HTML, CSS and JavaScript with no build step. Serve the folder with any static
server, for example:

```bash
python -m http.server 8080 -d website
```

The replay plays `website/recording.json`, a list of `{ t, type, data }` events captured from a real demo-mode run,
where `t` is milliseconds since the incident started.

## Code style

- TypeScript in strict mode in both apps.
- Prettier formats everything (`pnpm format`); CI fails on unformatted files.
- Keep modules small and focused. Add a comment where the reason for the code isn't obvious from the code.

## Sending a change

See [CONTRIBUTING.md](https://github.com/hasipfaruk/War-Room/blob/main/CONTRIBUTING.md) for the pull request process.
