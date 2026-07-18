import dotenv from "dotenv";
import cors from "cors";
import express from "express";
import OpenAI from "openai";
import { spawn, type ChildProcess, execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env") });

type Scenario = "pool-leak" | "guest-checkout-null-user" | "retry-timeout-typo";
type WarRoomEvent = { type: "incident" | "agent_started" | "agent_delta" | "agent_complete" | "status" | "fix_available" | "postmortem"; data: Record<string, unknown> };
type Evidence = { logs: string; gitLog: string; diffs: string };
const scenarioBranches: Record<Scenario, string> = { "pool-leak": "incident/pool-leak", "guest-checkout-null-user": "incident/guest-checkout-null-user", "retry-timeout-typo": "incident/retry-timeout-typo" };
const agentColors: Record<string, string> = { Triage: "#60a5fa", "Log Detective": "#f59e0b", "Git Detective": "#a78bfa", Fixer: "#34d399", Scribe: "#fb7185" };
const app = express();
const port = Number(process.env.PORT ?? 4000);
const serviceUrl = process.env.CHECKOUT_SERVICE_URL ?? "http://127.0.0.1:4001";
const clients = new Set<express.Response>();
const history: WarRoomEvent[] = [];
const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const demoRoot = path.join(root, "demo", "checkout-service-repo");
let service: ChildProcess | undefined;
let seedingPromise: Promise<void> | undefined;
let incidentNumber = 0;

app.use(cors());
app.use(express.json());

function publish(event: WarRoomEvent) {
  history.push(event);
  if (history.length > 400) history.shift();
  const message = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
  for (const client of clients) client.write(message);
}
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const runGit = async (...args: string[]) => (await execFileAsync("git", args, { cwd: demoRoot, maxBuffer: 2_000_000 })).stdout.trim();

async function repoIsSeeded() {
  try {
    await Promise.all(Object.values(scenarioBranches).map((branch) => runGit("show-ref", "--verify", "--quiet", `refs/heads/${branch}`)));
    return true;
  } catch { return false; }
}

// A .git directory is visible while git init is still running. Only the complete
// set of scenario refs makes this demo repository safe to deploy from.
async function ensureDemoRepo() {
  if (await repoIsSeeded()) return;
  if (!seedingPromise) {
    seedingPromise = execFileAsync(process.execPath, ["scripts/seed-demo-repo.js"], { cwd: root }).then(async () => {
      if (!await repoIsSeeded()) throw new Error("demo repository seed completed without all incident branches");
    }).finally(() => { seedingPromise = undefined; });
  }
  await seedingPromise;
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
  service = spawn(process.execPath, ["src/index.js"], { cwd: demoRoot, env: { ...process.env, PORT: "4001" }, stdio: "inherit" });
  await waitForService();
}

async function deploymentFor(scenario: Scenario) {
  const branch = scenarioBranches[scenario];
  const lastKnownGood = await runGit("merge-base", "main", branch);
  await runGit("checkout", branch);
  const deployedSha = await runGit("rev-parse", "HEAD");
  await restartService();
  return { deployedSha, lastKnownGood };
}

async function gitEvidence(lastKnownGood: string): Promise<Evidence> {
  const [logs, gitLog] = await Promise.all([
    readFile(path.join(demoRoot, "logs", "app.log"), "utf8").catch(() => ""),
    runGit("log", "--oneline", `${lastKnownGood}..HEAD`)
  ]);
  const commits = gitLog.split("\n").map((line) => line.split(" ")[0]).filter(Boolean);
  const diffs = await Promise.all(commits.map(async (sha) => `--- ${sha} ---\n${await runGit("show", "--format=fuller", "--stat", "--patch", sha)}`));
  return { logs: logs.trim().split("\n").slice(-50).join("\n"), gitLog, diffs: diffs.join("\n\n") };
}

function fallbackFor(name: string, prompt: string) {
  if (name === "Triage") return "SEV-1 checkout availability incident. I will validate the error signature, inspect the latest structured logs, compare the deployed commits with last-known-good, then apply and verify the smallest safe rollback.";
  if (name === "Log Detective") return "1. The checkout_failed entries are the strongest signal: the error text identifies the failing path.\n2. The failures occur immediately after traffic begins, while successful checkout_completed events disappear.\n3. The timestamp cluster makes a newly deployed regression more likely than an external dependency event.";
  if (name === "Git Detective") {
    const match = prompt.match(/([0-9a-f]{7,40})\s+(?:refactor db helpers|support guest checkout|tune timeouts)/i);
    const sha = match?.[1] ?? "HEAD";
    return `The suspect commit changes the code path named by the alert and logs. Its diff is the only post-good change that can create this failure.\nVERDICT: ${sha}`;
  }
  if (name === "Fixer") return "No model key is configured. The orchestrator will revert the guilty commit on an isolated fix branch, then redeploy and measure recovery.";
  return "# Incident postmortem\n\n## Summary\nCheckout errors were detected and mitigated through an automated rollback.\n\n## Timeline\nThe incident timeline is recorded below from the live event stream.\n\n## Root cause\nA deployed regression matched the failure evidence.\n\n## Resolution\nThe guilty commit was reverted and recovery was measured.\n\n## Action items\n- Add a regression test for the failing path.\n- Gate deployments on checkout error rate.";
}

/** Streams one agent's visible response and returns the text used by the next agent. */
async function runAgent(name: string, color: string, prompt: string) {
  publish({ type: "agent_started", data: { agent: name, color, timestamp: new Date().toISOString() } });
  let fullText = "";
  try {
    if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const stream = await openai.responses.create({ model: process.env.OPENAI_MODEL ?? "gpt-5.6", stream: true, input: prompt });
    for await (const event of stream) if (event.type === "response.output_text.delta") {
      fullText += event.delta;
      publish({ type: "agent_delta", data: { agent: name, color, delta: event.delta, timestamp: new Date().toISOString() } });
    }
  } catch (error) {
    console.warn(`${name} demo fallback: ${error instanceof Error ? error.message : "unknown error"}`);
    fullText = fallbackFor(name, prompt);
    for (const word of fullText.split(/(\s+)/)) {
      fullText && publish({ type: "agent_delta", data: { agent: name, color, delta: word, timestamp: new Date().toISOString() } });
      await wait(12);
    }
  }
  publish({ type: "agent_complete", data: { agent: name, color, message: fullText, timestamp: new Date().toISOString() } });
  return fullText;
}

function parseVerdict(text: string) {
  const match = text.match(/^VERDICT:\s*([0-9a-f]{7,40})\s*$/mi);
  if (!match) throw new Error("Git Detective response did not include VERDICT: <sha>");
  return match[1];
}

function correctedFile(text: string) {
  const fenced = text.match(/```(?:javascript|js)?\s*\n([\s\S]*?)```/i);
  return (fenced?.[1] ?? text).trim();
}

async function errorRateFromLogs() {
  const raw = await readFile(path.join(demoRoot, "logs", "app.log"), "utf8").catch(() => "");
  const entries = raw.split("\n").filter(Boolean).map((line) => { try { return JSON.parse(line) as { event?: string; level?: string }; } catch { return null; } }).filter(Boolean);
  const checks = entries.filter((entry) => entry?.event === "checkout_completed" || entry?.event === "checkout_failed");
  return { rate: checks.length ? checks.filter((entry) => entry?.level === "error").length / checks.length : 1, sampleSize: checks.length };
}

async function applyFix(scenario: Scenario, guiltySha: string, fixerText: string) {
  const fixBranch = `fix/${scenario}`;
  await runGit("checkout", scenarioBranches[scenario]);
  await runGit("branch", "-f", fixBranch, scenarioBranches[scenario]);
  await runGit("checkout", fixBranch);
  let usedFallback = !process.env.OPENAI_API_KEY;
  if (!usedFallback) {
    const contents = correctedFile(fixerText);
    if (!contents.includes("http.createServer") || contents.length < 300) usedFallback = true;
    else {
      await writeFile(path.join(demoRoot, "src", "index.js"), `${contents}\n`, "utf8");
      await runGit("add", "src/index.js");
      await runGit("-c", "user.name=War Room Fixer", "-c", "user.email=fixer@example.test", "commit", "-m", `fix ${scenario} checkout regression`);
    }
  }
  if (usedFallback) {
    const fixerIdentity = ["-c", "user.name=War Room Fixer", "-c", "user.email=fixer@example.test"];
    try { await runGit(...fixerIdentity, "revert", "--no-edit", guiltySha); }
    catch {
      // A later documentation/cache commit can touch the same line. Preserve
      // the revert side of that conflict so demo mode still performs a rollback.
      await runGit("revert", "--abort").catch(() => undefined);
      await runGit(...fixerIdentity, "revert", "--no-edit", "-X", "theirs", guiltySha);
    }
  }
  const diff = await runGit("show", "--format=medium", "--patch", "HEAD");
  await restartService();
  await fetch(`${serviceUrl}/traffic/start`, { method: "POST" });
  await wait(5_000);
  const recovery = await errorRateFromLogs();
  await fetch(`${serviceUrl}/traffic/stop`, { method: "POST" });
  return { fixBranch, diff, usedFallback, ...recovery };
}

async function runIncident(scenario: Scenario, alert: Record<string, unknown>, lastKnownGood: string) {
  publish({ type: "status", data: { service: "checkout-service", status: "investigating" } });
  const transcript: string[] = [];
  const triage = await runAgent("Triage", agentColors.Triage, `You are Triage. Read this alert and state severity plus a concise investigation plan.\nAlert: ${JSON.stringify(alert)}`);
  transcript.push(`## Triage\n${triage}`);
  const evidence = await gitEvidence(lastKnownGood);
  const logs = await runAgent("Log Detective", agentColors["Log Detective"], `You are Log Detective. Analyze the last 50 log lines below. Produce ranked hypotheses and quote specific log evidence.\n\nAlert: ${JSON.stringify(alert)}\n\nTriage conclusion:\n${triage}\n\nLogs:\n${evidence.logs}`);
  transcript.push(`## Log Detective\n${logs}`);
  const git = await runAgent("Git Detective", agentColors["Git Detective"], `You are Git Detective. Use current evidence and the detectives' conclusions to identify the guilty commit. Explain briefly. Your FINAL line must be exactly VERDICT: <sha>.\n\nAlert: ${JSON.stringify(alert)}\n\nTriage:\n${triage}\n\nLog Detective:\n${logs}\n\nGit log:\n${evidence.gitLog}\n\nDiffs:\n${evidence.diffs}`);
  transcript.push(`## Git Detective\n${git}`);
  const guiltySha = parseVerdict(git);
  const guiltyDiff = await runGit("show", "--format=medium", "--patch", guiltySha);
  const currentFile = await readFile(path.join(demoRoot, "src", "index.js"), "utf8");
  publish({ type: "status", data: { service: "checkout-service", status: "fixing" } });
  const fixer = await runAgent("Fixer", agentColors.Fixer, `You are Fixer. Correct the regression caused by ${guiltySha}. Return ONLY the complete corrected contents of src/index.js in one javascript fenced code block.\n\nGuilty diff:\n${guiltyDiff}\n\nCurrent src/index.js:\n${currentFile}\n\nInvestigation conclusions:\n${triage}\n${logs}\n${git}`);
  transcript.push(`## Fixer\n${fixer}`);
  const before = Number(alert.errorRate ?? 1);
  const fix = await applyFix(scenario, guiltySha, fixer);
  publish({ type: "fix_available", data: { branch: fix.fixBranch, diff: fix.diff, beforeErrorRate: before, afterErrorRate: fix.rate, sampleSize: fix.sampleSize, fallback: fix.usedFallback } });
  const resolved = fix.rate < 0.2;
  publish({ type: "status", data: { service: "checkout-service", status: resolved ? "resolved" : "critical", beforeErrorRate: before, afterErrorRate: fix.rate } });
  const timeline = history.filter((event) => event.type === "incident" || event.type === "agent_started" || event.type === "agent_complete" || event.type === "status").slice(-20).map((event) => `${new Date().toISOString()} — ${event.type}: ${JSON.stringify(event.data)}`).join("\n");
  const scribe = await runAgent("Scribe", agentColors.Scribe, `You are Scribe. Write a concise Markdown postmortem with headings Summary, Timeline, Root Cause, Resolution, and Action Items. Timeline entries must use these real event timestamps.\n\nTranscript:\n${transcript.join("\n\n")}\n\nRecovery: error rate ${before} before, ${fix.rate} after.\n\nTimeline:\n${timeline}`);
  const incidentPath = path.join(demoRoot, "incidents", `${scenario}-${++incidentNumber}`);
  await mkdir(incidentPath, { recursive: true });
  const postmortemPath = path.join(incidentPath, "postmortem.md");
  await writeFile(postmortemPath, `${scribe}\n`, "utf8");
  publish({ type: "postmortem", data: { path: path.relative(root, postmortemPath), content: scribe } });
}

app.get("/events", (req, res) => {
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" }); res.flushHeaders();
  history.forEach((event) => res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`)); clients.add(res);
  const keepAlive = setInterval(() => res.write(": ping\n\n"), 15_000);
  req.on("close", () => { clearInterval(keepAlive); clients.delete(res); });
});

app.post("/incident", async (req, res) => {
  const scenario = req.body?.scenario as Scenario;
  if (!scenario || !(scenario in scenarioBranches)) return res.status(400).json({ error: "unknown scenario" });
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
    publish({ type: "incident", data: { alert, scenario, deployedSha: deployment.deployedSha, lastKnownGood: deployment.lastKnownGood, timestamp: new Date().toISOString() } });
    publish({ type: "status", data: { service: "checkout-service", status: "critical" } });
    void runIncident(scenario, alert, deployment.lastKnownGood).catch((error) => { console.error("incident pipeline failed", error); publish({ type: "status", data: { service: "checkout-service", status: "critical", error: error instanceof Error ? error.message : "pipeline failed" } }); });
    res.status(202).json({ accepted: true, alert, deployment });
  } catch (error) { res.status(500).json({ error: error instanceof Error ? error.message : "deployment failed" }); }
});

app.get("/health", (_req, res) => res.json({ status: "ok", clients: clients.size }));
void ensureDemoRepo().catch((error) => console.error("demo repo seed failed", error));
app.listen(port, () => console.log(`orchestrator listening on http://localhost:${port}`));
