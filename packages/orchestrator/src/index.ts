import dotenv from "dotenv";
import cors from "cors";
import express from "express";
import OpenAI from "openai";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env") });

type WarRoomEvent = { type: "incident" | "agent_started" | "agent_delta" | "agent_complete" | "status"; data: Record<string, unknown> };
const app = express();
const port = Number(process.env.PORT ?? 4000);
const clients = new Set<express.Response>();
const history: WarRoomEvent[] = [];
const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const checkoutRoot = path.join(root, "packages", "checkout-service");

app.use(cors());
app.use(express.json());

function publish(event: WarRoomEvent) {
  history.push(event);
  if (history.length > 200) history.shift();
  const message = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
  for (const client of clients) client.write(message);
}

app.get("/events", (req, res) => {
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.flushHeaders();
  history.forEach((event) => res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`));
  clients.add(res);
  const keepAlive = setInterval(() => res.write(": ping\n\n"), 15_000);
  req.on("close", () => { clearInterval(keepAlive); clients.delete(res); });
});

async function gitEvidence() {
  const runGit = async (...args: string[]) => (await execFileAsync("git", args, { cwd: root, maxBuffer: 1_000_000 })).stdout;
  const [logLines, logOutput] = await Promise.all([
    (await import("node:fs/promises")).readFile(path.join(checkoutRoot, "logs", "app.log"), "utf8").catch(() => ""),
    runGit("log", "--oneline")
  ]);
  const commits = logOutput.trim().split("\n").slice(0, 5).map((line) => line.split(" ")[0]).filter(Boolean);
  const diffs = await Promise.all(commits.map(async (sha) => `--- ${sha} ---\n${await runGit("show", "--format=fuller", "--stat", "--patch", sha)}`));
  return { logs: logLines.trim().split("\n").slice(-50).join("\n"), gitLog: logOutput, diffs: diffs.join("\n\n") };
}

async function* demoInvestigation(evidence: Awaited<ReturnType<typeof gitEvidence>>) {
  const guilty = evidence.gitLog.split("\n").find((line) => /support guest checkout/.test(line))?.split(" ")[0] ?? "unknown";
  const words = `The recent production log lines show TypeError failures on /checkout during guest traffic. Reviewing the supplied git diff evidence, commit ${guilty} named support guest checkout introduces user!.loyaltyTier on the nullable lookup result. That exact dereference matches the stack trace. Roll back or replace it with optional access before calculating loyalty pricing.`.split(" ");
  for (const word of words) {
    await new Promise((resolve) => setTimeout(resolve, 45));
    yield `${word} `;
  }
}

async function runGitDetective(alert: Record<string, unknown>) {
  publish({ type: "agent_started", data: { agent: "Git Detective", color: "#a78bfa" } });
  let fullText = "";
  try {
    const evidence = await gitEvidence();
    if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const stream = await openai.responses.create({
      model: process.env.OPENAI_MODEL ?? "gpt-5.6",
      stream: true,
      input: `You are Git Detective in an incident response war room. Identify the guilty commit SHA solely from the evidence below. Do not infer it from the alert text. Cite the relevant log line and diff.\n\nAlert metadata (context only): ${JSON.stringify(alert)}\n\nLast 50 checkout-service log lines:\n${evidence.logs}\n\nGit log --oneline:\n${evidence.gitLog}\n\nDiffs of the five most recent commits:\n${evidence.diffs}`
    });
    for await (const event of stream) {
      if (event.type === "response.output_text.delta") {
        fullText += event.delta;
        publish({ type: "agent_delta", data: { agent: "Git Detective", delta: event.delta } });
      }
    }
  } catch (error) {
    console.warn(`Git Detective demo mode: ${error instanceof Error ? error.message : "unknown error"}`);
    const evidence = await gitEvidence();
    for await (const delta of demoInvestigation(evidence)) {
      fullText += delta;
      publish({ type: "agent_delta", data: { agent: "Git Detective", delta } });
    }
  }
  publish({ type: "agent_complete", data: { agent: "Git Detective", message: fullText } });
  publish({ type: "status", data: { service: "checkout-service", status: "investigating" } });
}

app.post("/incident", async (req, res) => {
  const scenario = req.body?.scenario ?? "guest-checkout-null-user";
  const checkout = await fetch(`${process.env.CHECKOUT_SERVICE_URL ?? "http://localhost:4001"}/fault`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scenario })
  });
  if (!checkout.ok) return res.status(502).json({ error: "checkout-service fault injection failed" });
  await new Promise((resolve) => setTimeout(resolve, 1_500));
  const alertResponse = await fetch(`${process.env.CHECKOUT_SERVICE_URL ?? "http://localhost:4001"}/alerts/latest`);
  if (!alertResponse.ok) return res.status(504).json({ error: "checkout-service did not reach the error-rate alert threshold" });
  const { alert } = await alertResponse.json() as { alert: Record<string, unknown> };
  publish({ type: "incident", data: { alert } });
  publish({ type: "status", data: { service: "checkout-service", status: "critical" } });
  void runGitDetective(alert);
  res.status(202).json({ accepted: true, alert });
});

app.get("/health", (_req, res) => res.json({ status: "ok", clients: clients.size }));
app.listen(port, () => console.log(`orchestrator listening on http://localhost:${port}`));
