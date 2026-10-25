# Contributing to War Room

Thanks for helping. Bug reports, new scenarios, documentation fixes and pull requests are all welcome. By taking part
you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Where to start

- **Found a bug?** [Open a bug report](https://github.com/hasipfaruk/War-Room/issues/new/choose).
- **Have an idea?** Open a feature request first for anything large, so we can agree on the approach before you
  write code.
- **Want something to work on?** The [roadmap](https://hasipfaruk.github.io/War-Room/docs/project/roadmap/) lists
  planned work and good first issues.
- **Found a security problem?** Do not open an issue. Follow [SECURITY.md](SECURITY.md).

## Setup

You need Node.js 22+, git and pnpm. No API key is needed: without one War Room runs in demo mode.

```bash
pnpm install
pnpm dev
```

The [development guide](https://hasipfaruk.github.io/War-Room/docs/develop/setup/) explains the commands, the tests and
how to work on the docs and the website. These guides cover the most common changes:

- [Add a scenario](https://hasipfaruk.github.io/War-Room/docs/develop/scenarios/)
- [Add or change an agent](https://hasipfaruk.github.io/War-Room/docs/develop/agents/)
- [Build your own dashboard](https://hasipfaruk.github.io/War-Room/docs/develop/custom-ui/)

## Before you open a pull request

```bash
pnpm format
pnpm check
pnpm build
pnpm test:e2e
```

If you changed the docs, also run `mkdocs build --strict` (see the development guide).

CI runs the same checks on Linux, macOS and Windows, and builds the docs.

## Pull request guidelines

- Keep each pull request to one change, and explain why in the description.
- Update the docs when behavior or usage changes.
- Add a line to `CHANGELOG.md` under `[Unreleased]` for anything users will notice.
- Demo mode must keep working without an API key. Every agent needs a demo script.
- Never commit API keys, `.env` files or generated folders (`sandbox/`, `dist/`, `_site/`).
