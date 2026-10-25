import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Repository root; resolves the same from `src/` (dev) and `dist/` (build). */
export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

dotenv.config({ path: path.join(repoRoot, ".env") });

function positiveInt(name: string, fallback: number) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer, got "${raw}"`);
  return value;
}

const fromRoot = (value: string | undefined, fallback: string) => path.resolve(repoRoot, value?.trim() || fallback);

export const config = {
  host: process.env.HOST?.trim() || "127.0.0.1",
  port: positiveInt("SERVER_PORT", 4000),
  servicePort: positiveInt("SERVICE_PORT", 4001),
  sandboxDir: fromRoot(process.env.SANDBOX_DIR, "sandbox/checkout-service"),
  postmortemDir: fromRoot(process.env.POSTMORTEM_DIR, "sandbox/postmortems"),
  openaiApiKey: process.env.OPENAI_API_KEY?.trim() || undefined,
  model: process.env.OPENAI_MODEL?.trim() || "gpt-5.6",
  agentTimeoutMs: positiveInt("AGENT_TIMEOUT_MS", 180_000),
  maxOutputTokens: positiveInt("AGENT_MAX_OUTPUT_TOKENS", 16_000),
};

/** Without an API key (or with WAR_ROOM_DEMO=1) agents stream scripted text instead of calling the model. */
export const demoMode = !config.openaiApiKey || process.env.WAR_ROOM_DEMO === "1";

export const serviceUrl = `http://127.0.0.1:${config.servicePort}`;
