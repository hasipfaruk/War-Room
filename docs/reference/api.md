# HTTP API

The server listens on `http://127.0.0.1:4000` by default (`SERVER_PORT`). All routes are under `/api`. Requests and
responses use JSON.

!!! note "Localhost only"

    While `HOST` is a loopback address (the default), the server rejects any request whose `Host` header is not
    `localhost`, `127.0.0.1` or `[::1]` with `403`. It sends no CORS headers, so a page on another origin cannot call the
    API from a browser. Serve your UI from the same origin, or put a proxy in front (see
    [Build your own dashboard](../develop/custom-ui.md)).

## `GET /api/health`

Returns whether the server is up and which mode it runs in.

```json
{ "status": "ok", "mode": "demo" }
```

`mode` is `"demo"` or `"live"`.

## `GET /api/scenarios`

Lists the scenarios you can deploy. The guilty commit is never included.

```json
{
  "scenarios": [
    { "id": "pool-leak", "label": "Pool leak", "summary": "Database connection pool exhaustion" },
    { "id": "guest-checkout-null-user", "label": "Guest checkout", "summary": "Null user dereference" },
    { "id": "retry-timeout-typo", "label": "Timeout tuning", "summary": "Payment gateway timeout typo" }
  ]
}
```

## `POST /api/incident`

Deploys a scenario and starts an incident.

Request body:

```json
{ "scenario": "pool-leak" }
```

The request waits until the error-rate alert fires (usually 5 to 10 seconds, at most 15), then returns while the agents
keep working in the background. Follow their progress on the [event stream](events.md).

| Status | Meaning                                                                                    |
| ------ | ------------------------------------------------------------------------------------------ |
| `202`  | The regression is deployed and the alert fired. The agents are now running.                |
| `400`  | `scenario` is missing or unknown.                                                          |
| `409`  | Another incident is still running. Only one runs at a time.                                |
| `500`  | The deploy failed, for example the alert did not fire within 15 seconds. `error` says why. |

A `202` response:

```json
{
  "alert": {
    "timestamp": "2026-10-25T22:05:06.461Z",
    "level": "error",
    "service": "checkout-service",
    "event": "error_rate_alert",
    "endpoint": "/checkout",
    "error": "TypeError: Cannot read properties of null (reading 'loyaltyTier')",
    "errorRate": 1,
    "sampleSize": 35,
    "threshold": 0.2
  },
  "deployment": {
    "deployedSha": "4f0c1e9...",
    "lastKnownGood": "a81d2c3..."
  }
}
```

An error response:

```json
{ "error": "An incident response is already in progress" }
```

## `GET /api/events`

Opens the live event stream (`text/event-stream`). See [Event stream](events.md).

## Example with curl

```bash
curl http://localhost:4000/api/scenarios

curl -X POST http://localhost:4000/api/incident \
  -H "Content-Type: application/json" \
  -d '{"scenario":"pool-leak"}'

curl -N http://localhost:4000/api/events
```
