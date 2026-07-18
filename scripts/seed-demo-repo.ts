import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.join(root, "demo", "checkout-service-repo");

if (existsSync(repo)) {
  console.log(`Demo repository already exists at ${repo}`);
  process.exit(0);
}

mkdirSync(path.join(repo, "src"), { recursive: true });
const write = (name: string, contents: string) => writeFileSync(path.join(repo, name), contents.trimStart(), "utf8");
const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, stdio: "inherit" });
const commit = (message: string) => { git("add", "."); git("-c", "user.name=Checkout Team", "-c", "user.email=checkout@example.test", "commit", "-m", message); };
git("init");
git("branch", "-M", "main");

write(".gitignore", "logs/\ndist/\nnode_modules/\n");
write("package.json", JSON.stringify({ name: "checkout-service-demo", private: true, type: "module", scripts: { dev: "tsx src/index.ts" }, dependencies: { express: "^5.1.0" } }, null, 2) + "\n");
write("src/index.ts", `
import express from "express";
import { appendFile, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const port = Number(process.env.PORT ?? 4001);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const logFile = path.join(root, "logs", "app.log");
const errorWindowMs = 5_000;
const errorRateThreshold = 0.2;
let trafficTimer: NodeJS.Timeout | undefined;

app.use(express.json());

async function log(level: "info" | "error", event: string, details: Record<string, unknown> = {}) {
  const entry = { timestamp: new Date().toISOString(), level, service: "checkout-service", event, ...details };
  await mkdir(path.dirname(logFile), { recursive: true });
  await appendFile(logFile, JSON.stringify(entry) + "\\n", "utf8");
  console.log(JSON.stringify(entry));
  return entry;
}

const users: Record<string, { id: string; loyaltyTier: "bronze" | "gold" | "platinum" }> = {
  "ada@example.com": { id: "user_ada", loyaltyTier: "gold" },
  "lin@example.com": { id: "user_lin", loyaltyTier: "platinum" }
};

function lookupUser(email?: string) { return email ? users[email.toLowerCase()] ?? null : null; }
function priceForTier(tier?: string) {
  const discounts: Record<string, number> = { bronze: 0.95, gold: 0.85, platinum: 0.75 };
  return Math.round(10_000 * (discounts[tier ?? ""] ?? 1));
}

async function chargeDownstream() { await new Promise((resolve) => setTimeout(resolve, 5)); }

app.get("/health", async (_req, res) => {
  await log("info", "health_check");
  res.json({ status: "ok", service: "checkout-service" });
});

app.post("/checkout", async (req, res) => {
  const orderId = req.body?.orderId ?? crypto.randomUUID();
  const user = lookupUser(req.body?.email);
  try {
    const totalCents = priceForTier(user?.loyaltyTier);
    await chargeDownstream();
    await log("info", "checkout_completed", { orderId, userId: user?.id ?? null, totalCents, endpoint: "/checkout" });
    res.status(201).json({ status: "completed", orderId, totalCents });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    await log("error", "checkout_failed", { orderId, endpoint: "/checkout", error: err.name + ": " + err.message, stack: err.stack });
    res.status(500).json({ status: "failed", orderId, error: err.message });
  }
});

async function latestAlert() {
  const cutoff = Date.now() - errorWindowMs;
  const entries = (await readFile(logFile, "utf8").catch(() => "")).trim().split("\\n").filter(Boolean)
    .map((line) => { try { return JSON.parse(line) as { timestamp: string; level: string; event: string; endpoint?: string; error?: string }; } catch { return null; } })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null && Date.parse(entry.timestamp) >= cutoff && (entry.event === "checkout_completed" || entry.event === "checkout_failed"));
  const errors = entries.filter((entry) => entry.level === "error");
  const errorRate = entries.length ? errors.length / entries.length : 0;
  if (entries.length >= 5 && errorRate >= errorRateThreshold) {
    const latest = errors.at(-1);
    return { timestamp: new Date().toISOString(), level: "error", service: "checkout-service", event: "error_rate_alert", endpoint: latest?.endpoint, error: latest?.error, errorRate, sampleSize: entries.length, threshold: errorRateThreshold };
  }
  return null;
}

function startTraffic() {
  if (trafficTimer) clearInterval(trafficTimer);
  const send = () => void fetch("http://127.0.0.1:" + port + "/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }).catch(() => undefined);
  for (let i = 0; i < 6; i++) send();
  trafficTimer = setInterval(send, 150);
}

app.post("/traffic/start", async (_req, res) => {
  if (trafficTimer) clearInterval(trafficTimer);
  await rm(logFile, { force: true });
  startTraffic();
  await log("info", "traffic_started");
  res.status(202).json({ accepted: true });
});
app.post("/traffic/stop", async (_req, res) => { if (trafficTimer) clearInterval(trafficTimer); trafficTimer = undefined; await log("info", "traffic_stopped"); res.json({ status: "stopped" }); });
app.get("/alerts/latest", async (_req, res) => { const alert = await latestAlert(); if (!alert) return res.status(404).json({ error: "no error-rate alert yet" }); res.json({ alert }); });
app.listen(port, () => console.log("checkout-service listening on http://localhost:" + port));
`);
commit("initialize checkout API");

write("src/db-pool.ts", `
type Client = { query(sql: string): Promise<void>; release(): void };
const maxConnections = 4;
let checkedOut = 0;
export async function acquireClient(): Promise<Client> {
  if (checkedOut >= maxConnections) throw new Error("database pool exhausted: no client available");
  checkedOut += 1;
  let released = false;
  return { async query(_sql: string) { await new Promise((resolve) => setTimeout(resolve, 2)); }, release() { if (!released) { released = true; checkedOut -= 1; } } };
}
export async function withDatabaseClient<T>(work: (client: Client) => Promise<T>): Promise<T> { const client = await acquireClient(); try { return await work(client); } finally { client.release(); } }
export function poolStats() { return { checkedOut, maxConnections }; }
`);
write("src/index.ts", (awaitText("src/index.ts")).replace('import { fileURLToPath } from "node:url";', 'import { fileURLToPath } from "node:url";\nimport { poolStats, withDatabaseClient } from "./db-pool.js";').replace('await chargeDownstream();', 'await withDatabaseClient((client) => client.query("INSERT checkout"));\n    await chargeDownstream();').replace('await log("info", "health_check");', 'await log("info", "health_check", { pool: poolStats() });').replace('res.json({ status: "ok", service: "checkout-service" });', 'res.json({ status: "ok", service: "checkout-service", pool: poolStats() });'));
commit("add lightweight database pool");

write("src/index.ts", (awaitText("src/index.ts")).replace('const totalCents = priceForTier(user?.loyaltyTier);', 'const tier = user?.loyaltyTier;\n    const totalCents = priceForTier(tier);').replace('userId: user?.id ?? null, totalCents', 'userId: user?.id ?? null, tier: tier ?? "guest", totalCents').replace('json({ status: "completed", orderId, totalCents })', 'json({ status: "completed", orderId, totalCents, loyaltyTier: tier ?? "guest" })'));
commit("add loyalty pricing to checkout");

write("src/index.ts", (awaitText("src/index.ts")).replace('const orderId = req.body?.orderId ?? crypto.randomUUID();', 'const orderId = req.body?.orderId ?? crypto.randomUUID();\n  const requestId = req.get("x-request-id") ?? crypto.randomUUID();').replace('{ orderId, userId:', '{ orderId, requestId, userId:').replace('{ orderId, endpoint:', '{ orderId, requestId, endpoint:'));
commit("include request IDs in checkout logs");

write("src/index.ts", (awaitText("src/index.ts")).replace('import { poolStats, withDatabaseClient } from "./db-pool.js";', 'import { acquireClient, poolStats } from "./db-pool.js";').replace('await withDatabaseClient((client) => client.query("INSERT checkout"));', 'const client = await acquireClient();\n    await client.query("INSERT checkout");'));
commit("refactor db helpers");

write("README.md", "# Checkout Service\n\nMinimal checkout API used by the incident-response demo.\n");
commit("document local checkout API");

write("src/index.ts", (awaitText("src/index.ts")).replace('const tier = user?.loyaltyTier;', 'const tier = user.loyaltyTier;'));
commit("support guest checkout");

write("src/index.ts", (awaitText("src/index.ts")).replace('const send = () => void fetch', 'const send = () => void fetch').replace('body: JSON.stringify({})', 'body: JSON.stringify({ orderId: crypto.randomUUID() })'));
commit("make traffic order IDs explicit");

write("src/index.ts", (awaitText("src/index.ts")).replace('async function chargeDownstream() { await new Promise((resolve) => setTimeout(resolve, 5)); }', 'async function chargeDownstream() {\n  const retryTimeoutMs = 30;\n  const gatewayLatencyMs = 80;\n  if (gatewayLatencyMs > retryTimeoutMs) throw new Error(`payment gateway timeout after ${retryTimeoutMs}ms`);\n  await new Promise((resolve) => setTimeout(resolve, gatewayLatencyMs));\n}'));
commit("tune timeouts");

write("src/index.ts", (awaitText("src/index.ts")).replace('res.status(201).json({ status: "completed", orderId, totalCents, loyaltyTier: tier ?? "guest" });', 'res.set("cache-control", "no-store");\n    res.status(201).json({ status: "completed", orderId, totalCents, loyaltyTier: tier ?? "guest" });'));
commit("disable caching for checkout responses");

console.log(`Seeded standalone demo repository at ${repo}`);

function awaitText(name: string) {
  return readFileSync(path.join(repo, name), "utf8");
}
