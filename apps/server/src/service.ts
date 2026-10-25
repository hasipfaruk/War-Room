import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config, serviceUrl } from "./config.js";
import { wait } from "./util.js";

export type Alert = {
  error?: string;
  endpoint?: string;
  errorRate?: number;
  latencyP95Ms?: number;
  sampleSize?: number;
};

const exitWithParent = fileURLToPath(new URL("../runtime/exit-with-parent.cjs", import.meta.url));
const logFile = () => path.join(config.sandboxDir, "logs", "app.log");

// The sandbox service runs code an LLM may have written, so it gets only what Node
// needs to start, never the server's API keys or other secrets.
const inheritedEnv = new Set(["PATH", "SYSTEMROOT", "TEMP", "TMP", "HOME", "USERPROFILE", "LANG", "TZ"]);
const serviceEnv = () => ({
  ...Object.fromEntries(Object.entries(process.env).filter(([key]) => inheritedEnv.has(key.toUpperCase()))),
  PORT: String(config.servicePort),
});

let child: ChildProcess | undefined;

const isRunning = (proc: ChildProcess) => proc.exitCode === null && proc.signalCode === null;

async function isHealthy() {
  try {
    return (await fetch(`${serviceUrl}/health`, { signal: AbortSignal.timeout(1_000) })).ok;
  } catch {
    return false;
  }
}

async function stopService() {
  const current = child;
  child = undefined;
  if (!current || !isRunning(current)) return;
  const exited = once(current, "exit");
  current.kill();
  await exited;
}

/** Synchronous best-effort stop for process shutdown handlers. */
export function killServiceNow() {
  if (child && isRunning(child)) child.kill();
}

/** (Re)starts the sandbox service from whatever is checked out and waits until it is healthy. */
export async function restartService() {
  await stopService();
  if (await isHealthy()) {
    throw new Error(`Port ${config.servicePort} is already in use by another process. Stop it or set SERVICE_PORT.`);
  }
  const started = spawn(process.execPath, ["--require", exitWithParent, "src/index.js"], {
    cwd: config.sandboxDir,
    env: serviceEnv(),
    stdio: ["ignore", "inherit", "inherit", "ipc"],
  });
  child = started;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (!isRunning(started)) throw new Error(`checkout-service exited during startup (code ${started.exitCode})`);
    if (await isHealthy()) return;
    await wait(100);
  }
  throw new Error("checkout-service did not become healthy within 10 seconds");
}

const post = async (route: string) => {
  const response = await fetch(`${serviceUrl}${route}`, { method: "POST" });
  if (!response.ok) throw new Error(`checkout-service ${route} returned ${response.status}`);
};

/** Starts synthetic checkout traffic. The service clears its log first, so measurements start fresh. */
export const startTraffic = () => post("/traffic/start");
export const stopTraffic = () => post("/traffic/stop");

export async function latestAlert(): Promise<Alert | undefined> {
  const response = await fetch(`${serviceUrl}/alerts/latest`);
  if (!response.ok) return undefined;
  return ((await response.json()) as { alert: Alert }).alert;
}

export async function readServiceLog(lastLines: number) {
  const raw = await readFile(logFile(), "utf8").catch(() => "");
  return raw.trim().split("\n").slice(-lastLines).join("\n");
}

/** Replays traffic for `windowMs` and returns the share of checkouts that failed. No data counts as failing. */
export async function measureErrorRate(windowMs: number) {
  await startTraffic();
  await wait(windowMs);
  await stopTraffic();
  const raw = await readFile(logFile(), "utf8").catch(() => "");
  const checkouts = raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as { event?: string; level?: string };
      } catch {
        return undefined;
      }
    })
    .filter((entry) => entry?.event === "checkout_completed" || entry?.event === "checkout_failed");
  const failed = checkouts.filter((entry) => entry?.level === "error").length;
  return { errorRate: checkouts.length ? failed / checkouts.length : 1, sampleSize: checkouts.length };
}
