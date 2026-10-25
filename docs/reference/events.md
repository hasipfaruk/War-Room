# Event stream

`GET /api/events` is a [server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
stream. It is the only thing the dashboard listens to, so anything the dashboard shows, your own UI can show too.

## How a connection works

1. The server sends a `hello` event. Clear your state when you receive it.
2. The server replays every event of the current (or most recent) incident, in order.
3. Live events follow as they happen.
4. A comment line (`: ping`) arrives every 15 seconds to keep the connection open. `EventSource` ignores it.

Because of steps 1 and 2, a client that connects late, refreshes or reconnects ends up with the same state as one that
watched from the start. In the replay, consecutive `agent_delta` events from one agent are merged into one.

Each message uses the event name as the SSE `event` field and a JSON object as `data`. Every object has a `timestamp`
(ISO 8601, UTC).

```text
event: status
data: {"status":"investigating","timestamp":"2026-10-25T22:05:06.462Z"}
```

## Events in order

A normal incident produces these events:

```text
hello
incident_started
status (deploying)
incident
status (critical)
status (investigating)
agent_started, agent_delta..., agent_complete     Triage
agent_started, agent_delta..., agent_complete     Log Detective
agent_started, agent_delta..., agent_complete     Git Detective
status (fixing)
agent_started, agent_delta..., agent_complete     Fixer
fix_available
status (resolved or critical)
agent_started, agent_delta..., agent_complete     Scribe
postmortem
```

If something fails, a `status` event with `"status": "failed"` and a `message` ends the incident instead.

## Event reference

### `hello`

First event on every connection.

| Field    | Type                 | Description                                         |
| -------- | -------------------- | --------------------------------------------------- |
| `mode`   | `"demo"` \| `"live"` | Whether agents are scripted or live.                |
| `model`  | string, optional     | Model name in live mode.                            |
| `agents` | array                | Every agent in run order, as `{ "name", "color" }`. |

### `incident_started`

A deploy has begun. Clear the previous incident from your UI.

| Field      | Type   | Description                     |
| ---------- | ------ | ------------------------------- |
| `scenario` | string | Scenario id, e.g. `pool-leak`.  |
| `label`    | string | Display name, e.g. `Pool leak`. |

### `status`

The incident moved to a new state.

| Field     | Type             | Description                                                                 |
| --------- | ---------------- | --------------------------------------------------------------------------- |
| `status`  | string           | `deploying`, `critical`, `investigating`, `fixing`, `resolved` or `failed`. |
| `message` | string, optional | Why the incident failed, or why it is still `critical` after the fix.       |

### `incident`

The error-rate alert fired.

| Field           | Type   | Description                                                                    |
| --------------- | ------ | ------------------------------------------------------------------------------ |
| `alert`         | object | `error`, `endpoint`, `errorRate` (0 to 1), `sampleSize`, `threshold` and more. |
| `scenario`      | string | Scenario id.                                                                   |
| `deployedSha`   | string | Commit that was deployed.                                                      |
| `lastKnownGood` | string | Commit the scenario branch started from.                                       |

### `agent_started`

| Field       | Type    | Description                                                      |
| ----------- | ------- | ---------------------------------------------------------------- |
| `agent`     | string  | `Triage`, `Log Detective`, `Git Detective`, `Fixer` or `Scribe`. |
| `color`     | string  | The agent's display color, e.g. `#60a5fa`.                       |
| `simulated` | boolean | `true` in demo mode.                                             |

### `agent_delta`

A piece of the agent's reply. Append `delta` to the latest message from `agent`.

| Field   | Type   | Description     |
| ------- | ------ | --------------- |
| `agent` | string | Agent name.     |
| `color` | string | Agent color.    |
| `delta` | string | Text to append. |

### `agent_complete`

The agent finished. `message` is the full reply, so you can replace the streamed text with it.

| Field     | Type             | Description                                     |
| --------- | ---------------- | ----------------------------------------------- |
| `agent`   | string           | Agent name.                                     |
| `color`   | string           | Agent color.                                    |
| `message` | string           | Full reply (Markdown). May be partial on error. |
| `error`   | string, optional | Present if the agent failed.                    |

### `fix_available`

The fix was deployed and measured.

| Field             | Type                    | Description                                 |
| ----------------- | ----------------------- | ------------------------------------------- |
| `branch`          | string                  | Fix branch, e.g. `fix/pool-leak`.           |
| `method`          | `"patch"` \| `"revert"` | AI patch, or revert of the guilty commit.   |
| `diff`            | string                  | `git show` output of the fix commit.        |
| `beforeErrorRate` | number                  | Error rate from the alert (0 to 1).         |
| `afterErrorRate`  | number                  | Error rate measured after the fix (0 to 1). |
| `sampleSize`      | number                  | Checkouts counted in the after measurement. |

### `postmortem`

The incident is finished.

| Field     | Type   | Description                                                        |
| --------- | ------ | ------------------------------------------------------------------ |
| `path`    | string | Where the file was saved, relative to the repo root when possible. |
| `content` | string | The postmortem in Markdown.                                        |

## TypeScript types

The dashboard defines these payloads in `apps/dashboard/src/types.ts` as `EventPayloads`. Copy that file if you build a
TypeScript client.
