# Security

## What the trust model looks like

War Room runs code that a language model wrote. The Fixer agent returns a new `src/index.js`, and War Room commits it
and starts it as a Node.js process on your machine. The model sees service logs and commit history, so anyone who can
write to those could try to steer it (prompt injection).

These safeguards are in place:

- **Loopback only.** The server binds to `127.0.0.1` by default and rejects requests whose `Host` header is not
  `localhost`, which blocks DNS-rebinding attacks. It sends no CORS headers, so other websites cannot call the API
  from your browser.
- **No secrets in the sandbox.** The sandbox service starts with a minimal environment (`PATH`, temp dirs and
  `PORT`). It never receives `OPENAI_API_KEY` or any other variable from your shell.
- **Untrusted evidence is labelled.** Logs, alerts, diffs and source go to the model inside `<untrusted>` tags, with
  instructions to treat them as data.
- **Patches are checked before use.** A patch must parse (`node --check`), start and bring the error rate under the
  alert threshold. Otherwise War Room discards it and reverts the guilty commit instead.
- **One incident at a time.** Concurrent requests get `409 Conflict`, so two runs never race on the same repository.

These safeguards are **not** a sandbox. Model-written code runs with your user's permissions. Until container isolation
lands (see the roadmap in the README):

- Keep `HOST` at `127.0.0.1`. Setting it to `0.0.0.0` lets anyone on your network deploy code and spend your API credit.
- Do not point `SANDBOX_DIR` at a real repository.
- Use an API key with a spending limit.

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's **Report a vulnerability** button under the repository's _Security_
tab, and include steps to reproduce. You should get a reply within a week.
