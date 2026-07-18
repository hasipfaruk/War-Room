import dotenv from "dotenv";
import cors from "cors";
import express from "express";
import OpenAI from "openai";
import { spawn, type ChildProcess, execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env") });

type Scenario = "pool-leak" | "guest-checkout-null-user" | "retry-timeout-typo";
type WarRoomEvent = { type: "incident" | "agent_started" | "agent_delta" | "agent_complete" | "status"; data: Record<string, unknown> };
const scenarioCommits: Record<Scenario, string> = { "pool-leak": "refactor db helpers", "guest-checkout-null-user": "support guest checkout", "retry-timeout-typo": "tune timeouts" };
const app = express();
const port = Number(process.env.PORT ?? 4000);
const serviceUrl = process.env.CHECKOUT_SERVICE_URL ?? "http://127.0.0.1:4001";
const clients = new Set<express.Response>();
const history: WarRoomEvent[] = [];
const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const demoRoot = path.join(root, "demo", "checkout-service-repo");
let service: ChildProcess | undefined;
let stopTrafficTimer: NodeJS.Timeout | undefined;

app.use(cors());
app.use(express.json());

function publish(event: WarRoomEvent) {
  history.push(event);
  if (history.length > 200) history.shift();
  const message = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
  for (const client of clients) client.write(message);
}
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const runGit = async (...args: string[]) => (await execFileAsync("git", args, { cwd: demoRoot, maxBuffer: 1_000_000 })).stdout.trim();

async function ensureDemoRepo() {
  if (existsSync(path.join(demoRoot, ".git"))) return;
  await execFileAsync("pnpm", ["exec", "tsx", "scripts/seed-demo-repo.ts"], { cwd: root });
}

async function waitForService() {
  for (let i = 0; i < 40; i++) {
    try { if ((await fetch(`${serviceUrl}/health`)).ok) return; } catch { /* process is still starting */ }
    await wait(100);
  }
  throw new Error("checkout service did not become healthy");
}

async function restartService() {
  if (service && !service.killed) {
    service.kill();
    await new Promise<void>((resolve) => service?.once("exit", () => resolve()));
  }
  const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
  service = spawn(process.execPath, [tsxCli, "src/index.ts"], { cwd: demoRoot, env: { ...process.env, PORT: "4001" }, stdio: "inherit" });
  await waitForService();
}

async function deploymentFor(scenario: Scenario) {
  const subject = scenarioCommits[scenario];
  const guilty = await runGit("log", "main", "--format=%H", "--grep", `^${subject}$`, "-1");
  if (!guilty) throw new Error(`could not find guilty commit for ${scenario}`);
  const lastKnownGood = await runGit("rev-parse", `${guilty}^`);
  await runGit("checkout", "--detach", guilty);
  await restartService();
  return { guilty, lastKnownGood };
}

async function gitEvidence(lastKnownGood: string) {
  const [logs, gitLog] = await Promise.all([
    (await import("node:fs/promises")).readFile(path.join(demoRoot, "logs", "app.log"), "utf8").catch(() => ""),
    runGit("log", "--oneline", `${lastKnownGood}..HEAD`)
  ]);
  const commits = gitLog.split("\n").map((line) => line.split(" ")[0]).filter(Boolean);
  const diffs = await Promise.all(commits.map(async (sha) => `--- ${sha} ---\n${await runGit("show", "--format=fuller", "--stat", "--patch", sha)}`));
  return { logs: logs.trim().split("\n").slice(-50).join("\n"), gitLog, diffs: diffs.join("\n\n") };
}

async function* demoInvestigation(evidence: Awaited<ReturnType<typeof gitEvidence>>) {
  const words = `The checkout failures align with the deployed diff. The change set after last-known-good contains a single suspect commit whose code path matches the error signature in the traffic logs. That commit should be reverted while the checkout path is patched and covered with a regression test.`.split(" ");
  for (const word of words) { await wait(35); yield `${word} `; }
}

async function runGitDetective(alert: Record<string, unknown>, lastKnownGood: string) {
  publish({ type: "agent_started", data: { agent: "Git Detective", color: "#a78bfa" } });
  let fullText = "";
  try {
    const evidence = await gitEvidence(lastKnownGood);
    if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const stream = await openai.responses.create({ model: process.env.OPENAI_MODEL ?? "gpt-5.6", stream: true, input: `You are Git Detective. Identify the guilty commit SHA solely from this evidence. Cite the log and diff.\n\nAlert: ${JSON.stringify(alert)}\n\nLogs:\n${evidence.logs}\n\nGit log since last-known-good:\n${evidence.gitLog}\n\nDiffs:\n${evidence.diffs}` });
    for await (const event of stream) if (event.type === "response.output_text.delta") { fullText += event.delta; publish({ type: "agent_delta", data: { agent: "Git Detective", delta: event.delta } }); }
  } catch (error) {
    console.warn(`Git Detective demo mode: ${error instanceof Error ? error.message : "unknown error"}`);
    for await (const delta of demoInvestigation(await gitEvidence(lastKnownGood))) { fullText += delta; publish({ type: "agent_delta", data: { agent: "Git Detective", delta } }); }
  }
  publish({ type: "agent_complete", data: { agent: "Git Detective", message: fullText } });
  publish({ type: "status", data: { service: "checkout-service", status: "investigating" } });
}

app.get("/events", (req, res) => {
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" }); res.flushHeaders();
  history.forEach((event) => res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`)); clients.add(res);
  const keepAlive = setInterval(() => res.write(": ping\n\n"), 15_000);
  req.on("close", () => { clearInterval(keepAlive); clients.delete(res); });
});

app.post("/incident", async (req, res) => {
  const scenario = req.body?.scenario as Scenario;
  if (!scenario || !(scenario in scenarioCommits)) return res.status(400).json({ error: "unknown scenario" });
  try {
    await ensureDemoRepo();
    const deployment = await deploymentFor(scenario);
    await fetch(`${serviceUrl}/traffic/start`, { method: "POST" });
    let alert: Record<string, unknown> | undefined;
    for (let elapsed = 0; elapsed < 15_000; elapsed += 1_000) {
      await wait(1_000);
      const response = await fetch(`${serviceUrl}/alerts/latest`);
      if (response.ok) { alert = (await response.json() as { alert: Record<string, unknown> }).alert; break; }
    }
    if (!alert) return res.status(504).json({ error: "checkout-service did not reach the error-rate alert threshold within 15 seconds" });
    publish({ type: "incident", data: { alert, scenario, guiltyCommit: deployment.guilty, lastKnownGood: deployment.lastKnownGood } });
    publish({ type: "status", data: { service: "checkout-service", status: "critical" } });
    if (stopTrafficTimer) clearTimeout(stopTrafficTimer);
    stopTrafficTimer = setTimeout(() => { void fetch(`${serviceUrl}/traffic/stop`, { method: "POST" }); }, 10_000);
    void runGitDetective(alert, deployment.lastKnownGood);
    res.status(202).json({ accepted: true, alert, deployment });
  } catch (error) { res.status(500).json({ error: error instanceof Error ? error.message : "deployment failed" }); }
});

app.get("/health", (_req, res) => res.json({ status: "ok", clients: clients.size }));
void ensureDemoRepo().catch((error) => console.error("demo repo seed failed", error));
app.listen(port, () => console.log(`orchestrator listening on http://localhost:${port}`));
