import express from "express";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { acquireClient, poolStats, withDatabaseClient } from "./db-pool.js";
import { activeFault, activateFault, resetFault } from "./faults.js";

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
  await appendFile(logFile, `${JSON.stringify(entry)}\n`, "utf8");
  console.log(JSON.stringify(entry));
  return entry;
}

const users: Record<string, { id: string; loyaltyTier: "bronze" | "gold" | "platinum" }> = {
  "ada@example.com": { id: "user_ada", loyaltyTier: "gold" },
  "lin@example.com": { id: "user_lin", loyaltyTier: "platinum" }
};

function lookupUser(email?: string) {
  return email ? users[email.toLowerCase()] ?? null : null;
}

function priceForTier(tier?: string) {
  const discounts: Record<string, number> = { bronze: 0.95, gold: 0.85, platinum: 0.75 };
  return Math.round(10000 * (discounts[tier ?? ""] ?? 1));
}

async function chargeDownstream() {
  const timeoutMs = 30_000;
  const downstreamLatencyMs = 5;
  if (downstreamLatencyMs > timeoutMs) {
    const error = new Error(`payment gateway timeout after ${timeoutMs}ms`);
    error.name = "DownstreamTimeoutError";
    throw error;
  }
  await new Promise((resolve) => setTimeout(resolve, downstreamLatencyMs));
}

app.get("/health", async (_req, res) => {
  await log("info", "health_check", { pool: poolStats(), activeFault: activeFault() });
  res.json({ status: "ok", service: "checkout-service", pool: poolStats(), activeFault: activeFault() });
});

app.post("/checkout", async (req, res) => {
  const orderId = req.body?.orderId ?? crypto.randomUUID();
  const user = lookupUser(req.body?.email);
  try {
    // Guest orders have no lookup record, but this deployment path assumes one.
    const tier = activeFault() === "guest-checkout-null-user" ? user!.loyaltyTier : user?.loyaltyTier;
    const totalCents = priceForTier(tier);
    if (activeFault() === "pool-leak") {
      const client = await acquireClient();
      await client.query("INSERT checkout");
      // Refactor regression: the acquired client is never released.
    } else {
      await withDatabaseClient((client) => client.query("INSERT checkout"));
    }
    await chargeDownstream();
    await log("info", "checkout_completed", { orderId, userId: user?.id ?? null, tier: tier ?? "guest", totalCents, endpoint: "/checkout" });
    res.status(201).json({ status: "completed", orderId, totalCents, loyaltyTier: tier ?? "guest" });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    await log("error", "checkout_failed", { orderId, endpoint: "/checkout", scenario: activeFault(), error: `${err.name}: ${err.message}`, stack: err.stack });
    res.status(500).json({ status: "failed", orderId, error: err.message });
  }
});

async function deriveAlert() {
  const cutoff = Date.now() - errorWindowMs;
  const lines = (await readFile(logFile, "utf8").catch(() => "")).trim().split("\n").filter(Boolean)
    .map((line) => { try { return JSON.parse(line) as { timestamp: string; event: string; level: string; endpoint?: string; error?: string }; } catch { return null; } })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null && Date.parse(entry.timestamp) >= cutoff && (entry.event === "checkout_completed" || entry.event === "checkout_failed"));
  const errors = lines.filter((entry) => entry.level === "error");
  const errorRate = lines.length ? errors.length / lines.length : 0;
  if (lines.length >= 5 && errorRate >= errorRateThreshold) {
    const latest = errors.at(-1);
    return log("error", "error_rate_alert", { scenario: activeFault(), endpoint: latest?.endpoint, error: latest?.error, errorRate, sampleSize: lines.length, threshold: errorRateThreshold });
  }
  return null;
}

function startTraffic() {
  if (trafficTimer) clearInterval(trafficTimer);
  const send = () => {
    void fetch(`http://127.0.0.1:${port}/checkout`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: undefined }) }).catch(() => undefined);
  };
  for (let i = 0; i < 6; i++) send();
  trafficTimer = setInterval(send, 150);
}

app.post("/fault", async (req, res) => {
  const scenario = req.body?.scenario ?? "guest-checkout-null-user";
  if (!activateFault(scenario)) return res.status(400).json({ error: `unknown scenario: ${scenario}` });
  startTraffic();
  // The monitor derives an alert from traffic-produced log records, never a canned alert.
  setTimeout(() => { void deriveAlert(); }, 1_200);
  await log("info", "fault_activated", { scenario, traffic: "started" });
  res.status(202).json({ accepted: true, scenario });
});

app.post("/fault/reset", async (_req, res) => {
  resetFault();
  if (trafficTimer) clearInterval(trafficTimer);
  trafficTimer = undefined;
  await log("info", "fault_reset");
  res.json({ status: "safe" });
});

app.get("/alerts/latest", async (_req, res) => {
  const entries = (await readFile(logFile, "utf8").catch(() => "")).trim().split("\n").filter(Boolean)
    .map((line) => { try { return JSON.parse(line) as Record<string, unknown>; } catch { return null; } })
    .filter((entry): entry is Record<string, unknown> => entry !== null);
  const alert = entries.reverse().find((entry) => entry.event === "error_rate_alert");
  if (!alert) return res.status(404).json({ error: "no error-rate alert yet" });
  res.json({ alert });
});

app.listen(port, () => console.log(`checkout-service listening on http://localhost:${port}`));
