# Configuration

War Room reads settings from a `.env` file in the repository root. Every setting is optional. Copy `.env.example` to
`.env` to get a file with all of them commented.

Changes take effect when the server restarts.

## Model

| Variable                  | Default   | Description                                                     |
| ------------------------- | --------- | --------------------------------------------------------------- |
| `OPENAI_API_KEY`          | _(empty)_ | Enables live mode. Leave empty for demo mode.                   |
| `OPENAI_MODEL`            | `gpt-5.6` | Model used by every agent, through the OpenAI Responses API.    |
| `WAR_ROOM_DEMO`           | _(unset)_ | Set to `1` to force demo mode even when a key is set.           |
| `AGENT_TIMEOUT_MS`        | `180000`  | Time limit for one agent's reply in live mode, in milliseconds. |
| `AGENT_MAX_OUTPUT_TOKENS` | `16000`   | Output token limit for one agent's reply in live mode.          |

## Network

| Variable         | Default     | Description                                                                     |
| ---------------- | ----------- | ------------------------------------------------------------------------------- |
| `HOST`           | `127.0.0.1` | Interface the server listens on. Read [Security](../project/security.md) first. |
| `SERVER_PORT`    | `4000`      | API port. After `pnpm build`, the dashboard is also served here.                |
| `SERVICE_PORT`   | `4001`      | Port of the sandbox checkout service.                                           |
| `DASHBOARD_PORT` | `5173`      | Port of the dashboard development server (`pnpm dev` only).                     |

The dashboard development server forwards `/api` requests to `SERVER_PORT`, so changing ports in `.env` keeps both in
step.

## Files

| Variable         | Default                    | Description                                          |
| ---------------- | -------------------------- | ---------------------------------------------------- |
| `SANDBOX_DIR`    | `sandbox/checkout-service` | Where the sandbox git repository is created.         |
| `POSTMORTEM_DIR` | `sandbox/postmortems`      | Where postmortems are saved, one Markdown file each. |

Relative paths are resolved from the repository root.

!!! warning

    Never point `SANDBOX_DIR` at a real repository. War Room force-checks-out branches, resets them and runs code an AI
    model wrote inside that folder.

## Fixed limits

These values are constants in `apps/server/src/incident.ts`. Change them there if you need to.

| Constant              | Value  | Meaning                                                             |
| --------------------- | ------ | ------------------------------------------------------------------- |
| `ALERT_TIMEOUT_MS`    | 15 000 | How long to wait for the error-rate alert after deploying.          |
| `RECOVERY_WINDOW_MS`  | 5 000  | How long traffic is replayed to measure the error rate after a fix. |
| `RESOLVED_ERROR_RATE` | 0.2    | Error rate below which the incident counts as resolved.             |
| `MAX_LOG_LINES`       | 50     | Log lines given to the Log Detective.                               |
| `MAX_DIFF_CHARS`      | 60 000 | Characters of commit diffs given to the Git Detective.              |
