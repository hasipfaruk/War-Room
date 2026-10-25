# Build your own dashboard

The bundled dashboard is one way to show an incident. The server doesn't depend on it: anything that can read the
[event stream](../reference/events.md) and call the [HTTP API](../reference/api.md) can be a War Room client. Ideas:

- a big-screen wall display for a team room
- a terminal UI
- a Slack or Discord bot that posts each agent's conclusion
- a timeline view that replays saved incidents

## A minimal client

This page is a complete War Room client. It lists scenarios, deploys one and prints each agent's reply as it streams.

```html
<!doctype html>
<meta charset="utf-8" />
<title>Minimal War Room client</title>
<select id="scenario"></select>
<button id="deploy">Deploy</button>
<p id="status">nominal</p>
<div id="feed"></div>

<script type="module">
  const $ = (id) => document.getElementById(id);
  const messages = new Map();

  const { scenarios } = await (await fetch("/api/scenarios")).json();
  for (const s of scenarios) $("scenario").append(new Option(s.label, s.id));

  $("deploy").onclick = async () => {
    const response = await fetch("/api/incident", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario: $("scenario").value }),
    });
    if (!response.ok) alert((await response.json()).error);
  };

  const events = new EventSource("/api/events");
  const on = (type, handler) => events.addEventListener(type, (e) => handler(JSON.parse(e.data)));

  // hello and incident_started both mean "start from a clean slate".
  const reset = () => {
    messages.clear();
    $("feed").replaceChildren();
  };
  on("hello", reset);
  on("incident_started", reset);

  on("status", (d) => ($("status").textContent = d.message ? `${d.status}: ${d.message}` : d.status));

  on("agent_started", (d) => {
    const block = document.createElement("pre");
    block.style.borderLeft = `4px solid ${d.color}`;
    block.textContent = `${d.agent}\n`;
    $("feed").append(block);
    messages.set(d.agent, block);
  });
  on("agent_delta", (d) => (messages.get(d.agent).textContent += d.delta));

  on("fix_available", (d) => console.log(`Error rate ${d.beforeErrorRate} -> ${d.afterErrorRate}`));
  on("postmortem", (d) => console.log(d.content));
</script>
```

Note that it uses `textContent`, never `innerHTML`. Agent replies come from a model that reads logs and commit messages,
so treat them as untrusted text. If you render Markdown, use a renderer that escapes HTML.

## Serving your client

The server accepts browser requests only from its own origin. Pick one of these:

**Let the server host your files.** The built server hosts whatever is in `apps/dashboard/dist`. Build only the server
with `pnpm --filter @war-room/server build` (a full `pnpm build` would overwrite that folder with the bundled
dashboard), copy your files into `apps/dashboard/dist`, then run `pnpm start` and open <http://localhost:4000>.

**Use a development proxy.** If your UI has its own dev server, forward `/api` to War Room. With Vite:

```ts
// vite.config.ts
export default {
  server: {
    proxy: { "/api": { target: "http://127.0.0.1:4000", changeOrigin: true } },
  },
};
```

**Use it outside a browser.** Bots, terminal UIs and scripts aren't affected by browser origin rules. Connect to
`http://127.0.0.1:4000/api/events` directly and parse the stream. `scripts/e2e-demo.mjs` contains a small stream parser
for Node.js you can copy.

## Tips

- **Drive everything from events.** Don't poll. The stream already tells you every change, and replays the current
  incident when you connect.
- **Key messages by agent.** Append `agent_delta` to the most recent message from that agent, and replace it with
  `agent_complete.message` when it finishes.
- **Show the mode.** If `hello.mode` is `"demo"`, label agent text as scripted so viewers aren't misled.
- **Handle `failed`.** A `status` event with `"failed"` ends the incident early; `message` says why.
- **Use the roster.** `hello.agents` lists every agent with its color, so you can draw the whole team before the
  first one starts.

## Changing the bundled dashboard

The bundled dashboard is in `apps/dashboard/src`. All event handling is in `useWarRoom.ts`, which folds events into one
state object. Components only read that state, so you can restyle or rearrange them without touching the event logic.
Colors and spacing are CSS variables at the top of `styles.css`.
