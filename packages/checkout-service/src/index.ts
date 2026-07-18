import express from "express";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { poolStats, withDatabaseClient } from "./db-pool.js";

const app = express();
const port = Number(process.env.PORT ?? 4001);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const logFile = path.join(root, "logs", "app.log");
app.use(express.json());
async function log(level: "info" | "error", event: string, details: Record<string, unknown> = {}) { await mkdir(path.dirname(logFile), { recursive: true }); await appendFile(logFile, `${JSON.stringify({ timestamp: new Date().toISOString(), level, service: "checkout-service", event, ...details })}\n`); }
app.get("/health", (_req, res) => res.json({ status: "ok", pool: poolStats() }));
app.post("/checkout", async (req, res) => { const orderId = req.body?.orderId ?? crypto.randomUUID(); try { await withDatabaseClient((client) => client.query("INSERT checkout")); await log("info", "checkout_completed", { orderId, endpoint: "/checkout" }); res.status(201).json({ status: "completed", orderId }); } catch (error) { const message = error instanceof Error ? error.message : String(error); await log("error", "checkout_failed", { orderId, endpoint: "/checkout", error: message }); res.status(500).json({ status: "failed", orderId, error: message }); } });
app.listen(port, () => console.log(`checkout-service listening on http://localhost:${port}`));
