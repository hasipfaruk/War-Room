# War Room

The first end-to-end thin slice of an AI incident-response console.

## Run it

```bash
pnpm install
copy .env.example .env
pnpm dev
```

Open `http://localhost:5173`. Click **Inject guest checkout fault** to write a structured alert to `packages/checkout-service/logs/app.log`, start Git Detective, and watch its streamed investigation in the dashboard.

Set `OPENAI_API_KEY` in `.env` for GPT-5.6. The orchestration route retains a deterministic demo fallback when no key is set, so the whole flow remains runnable.
