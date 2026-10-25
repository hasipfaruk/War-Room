# Quick start

## Requirements

- **Node.js 22 or newer.** Check with `node --version`.
- **git.** War Room uses it to deploy and revert commits in its sandbox repository.
- **pnpm.** Install it with `npm install -g pnpm` if you don't have it.

War Room runs on Windows, macOS and Linux.

## Install and run

```bash
git clone https://github.com/hasipfaruk/War-Room.git
cd War-Room
pnpm install
```

Create your settings file from the example:

=== "macOS and Linux"

    ```bash
    cp .env.example .env
    ```

=== "Windows"

    ```powershell
    copy .env.example .env
    ```

Start the server and the dashboard:

```bash
pnpm dev
```

Open <http://localhost:5173>, pick a scenario and press **Deploy incident**. A full run takes about 25 seconds in demo
mode.

On first start, War Room creates its sandbox repository at `sandbox/checkout-service`. This takes a few seconds.

## Demo mode and live mode

War Room decides the mode when the server starts.

| Mode     | When                                            | What the agents do                                    |
| -------- | ----------------------------------------------- | ----------------------------------------------------- |
| **Demo** | `OPENAI_API_KEY` is empty, or `WAR_ROOM_DEMO=1` | Stream scripted text. Everything else runs for real.  |
| **Live** | `OPENAI_API_KEY` is set                         | Call the model in `OPENAI_MODEL` and stream its reply |

To use live mode, put your key in `.env` and restart `pnpm dev`:

```ini
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5.6
```

The dashboard header shows which mode is active: **DEMO MODE** or **LIVE** with the model name.

!!! tip "Set a spending limit"

    Each live incident makes five model calls. The Fixer returns a whole source file, so it uses the most tokens. Use
    an API key with a monthly spending limit.

## Production build

`pnpm dev` runs two development servers with live reload. To run the built version on a single port:

```bash
pnpm build
pnpm start
```

Then open <http://localhost:4000>. The server hosts the dashboard and the API together.

## Next steps

- [Using the dashboard](dashboard.md) explains each part of the screen.
- [Scenarios](scenarios.md) describes the three built-in bugs.
- If something doesn't start, see [Troubleshooting](troubleshooting.md).
