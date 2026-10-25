# Troubleshooting

## "Port 4000 is in use"

Another program is using the server port. Stop it, or pick another port in `.env`:

```ini
SERVER_PORT=4100
```

The same applies to `SERVICE_PORT` (4001) and `DASHBOARD_PORT` (5173).

## "Port 4001 is already in use by another process"

Something other than War Room is answering on the sandbox service port. This can be a leftover service from a crash.
Find and stop the process using that port, or set `SERVICE_PORT` to a free port.

=== "macOS and Linux"

    ```bash
    lsof -i :4001
    ```

=== "Windows"

    ```powershell
    Get-NetTCPConnection -LocalPort 4001 | Select-Object OwningProcess
    ```

## "Demo repository ... is only partially seeded"

Creating the sandbox repository was interrupted. Stop War Room, delete the `sandbox/` folder and start again.

## The alert never fires

The deploy fails with "did not reach the error-rate alert threshold within 15 seconds". The alert needs at least five
checkouts in the last five seconds with 20% or more failing. On a slow or very busy machine the traffic may not reach
that in time. Close other heavy programs and try again.

## An agent failed in live mode

The agent's message turns red and shows the error. Common causes:

- **Invalid key or no credit.** Check `OPENAI_API_KEY` and your account balance.
- **Unknown model.** Check that `OPENAI_MODEL` is a model your key can use.
- **Timeout.** Raise `AGENT_TIMEOUT_MS`.
- **Git Detective did not finish with a VERDICT line**, or named a commit outside the deployed range. Run the incident
  again; the model's answer varies between runs.

War Room does not silently switch to scripted text when a live call fails. It stops and shows the error, so you always
know whether a result came from the model.

## The fix did not resolve the incident

If the error rate stays at 20% or more after the fix, the status stays `CRITICAL` with a message saying so. In live
mode, War Room already falls back to reverting the guilty commit when the AI patch doesn't lower the error rate, so this
usually points to a problem in the sandbox. Delete `sandbox/` and try again.

## Still stuck?

[Open an issue](https://github.com/hasipfaruk/War-Room/issues/new/choose) with your operating system, Node.js version,
the mode (demo or live) and the server output.
