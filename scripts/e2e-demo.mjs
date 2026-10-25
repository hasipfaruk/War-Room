// End-to-end test of the full incident loop in demo mode, so it needs no API key.
// Run `pnpm build` first. It starts the built server on spare ports with a throwaway
// sandbox, runs every scenario and checks that each one resolves with a postmortem.
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const port = 4100;
const api = `http://127.0.0.1:${port}/api`;
const work = await mkdtemp(path.join(tmpdir(), "war-room-e2e-"));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let serverOutput = "";
const server = spawn(process.execPath, [path.join(root, "apps", "server", "dist", "index.js")], {
  env: {
    ...process.env,
    WAR_ROOM_DEMO: "1",
    OPENAI_API_KEY: "",
    SERVER_PORT: String(port),
    SERVICE_PORT: String(port + 1),
    SANDBOX_DIR: path.join(work, "checkout-service"),
    POSTMORTEM_DIR: path.join(work, "postmortems"),
  },
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.on("data", (chunk) => (serverOutput += chunk));
server.stderr.on("data", (chunk) => (serverOutput += chunk));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if ((await fetch(`${api}/health`)).ok) return;
    } catch {
      // still starting
    }
    await wait(200);
  }
  throw new Error("server did not start");
}

/** Parses the server-sent event stream into { type, data } objects. */
async function* events(signal) {
  const response = await fetch(`${api}/events`, { signal });
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let end;
    while ((end = buffer.indexOf("\n\n")) >= 0) {
      const raw = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const type = /^event: (.*)$/m.exec(raw)?.[1];
      const data = /^data: (.*)$/m.exec(raw)?.[1];
      if (type && data) yield { type, data: JSON.parse(data) };
    }
  }
}

const postIncident = (scenario) =>
  fetch(`${api}/incident`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenario }),
  });

async function runScenario(id) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`${id} timed out`)), 120_000);
  let started = false;
  let fix;
  let postmortem;
  try {
    for await (const event of events(controller.signal)) {
      if (event.type === "hello") {
        const response = await postIncident(id);
        assert(response.status === 202, `POST /incident returned ${response.status}: ${await response.text()}`);
        const second = await postIncident(id);
        assert(second.status === 409, `a concurrent incident should be rejected with 409, got ${second.status}`);
        continue;
      }
      if (event.type === "incident_started" && event.data.scenario === id) started = true;
      if (!started) continue;
      if (event.type === "status" && event.data.status === "failed") throw new Error(event.data.message);
      if (event.type === "fix_available") fix = event.data;
      if (event.type === "postmortem") {
        postmortem = event.data;
        break;
      }
    }
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
  assert(fix, "no fix was deployed");
  assert(fix.beforeErrorRate >= 0.2, `error rate before the fix was only ${fix.beforeErrorRate}`);
  assert(fix.afterErrorRate < 0.2, `error rate after the fix is still ${fix.afterErrorRate}`);
  assert(postmortem, "no postmortem was published");
  const saved = await readFile(path.resolve(root, postmortem.path), "utf8");
  assert(saved.includes("## Root Cause"), "saved postmortem is missing a Root Cause section");
  console.log(
    `✓ ${id}: error rate ${fix.beforeErrorRate.toFixed(2)} → ${fix.afterErrorRate.toFixed(2)} (${fix.method})`,
  );
}

let failed = false;
try {
  await waitForServer();
  const { scenarios } = await (await fetch(`${api}/scenarios`)).json();
  assert(scenarios.length > 0, "no scenarios");
  assert(!("guiltySubject" in scenarios[0]), "scenario list leaks the guilty commit");
  for (const scenario of scenarios) await runScenario(scenario.id);
} catch (error) {
  failed = true;
  console.error(`✗ ${error instanceof Error ? error.message : error}\n\n--- server output ---\n${serverOutput}`);
} finally {
  server.kill();
  await new Promise((resolve) => (server.exitCode === null ? server.once("exit", resolve) : resolve()));
  await rm(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => undefined);
}
process.exit(failed ? 1 : 0);
