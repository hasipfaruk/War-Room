import express, { type NextFunction, type Request, type Response } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { agentRoster } from "./agents.js";
import { config, demoMode, repoRoot } from "./config.js";
import { subscribe } from "./events.js";
import { ensureDemoRepo } from "./git.js";
import { IncidentInProgressError, startIncident } from "./incident.js";
import { findScenario, scenarios } from "./scenarios.js";
import { killServiceNow } from "./service.js";
import { errorMessage } from "./util.js";

const loopback = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

// Browsers send the page's own Host header, so while War Room is bound to loopback
// this rejects DNS-rebinding attacks from websites the user happens to visit.
function rejectForeignHosts(req: Request, res: Response, next: NextFunction) {
  const hostname = (req.headers.host ?? "").replace(/:\d+$/, "").toLowerCase();
  if (!loopback.has(config.host) || loopback.has(hostname)) return next();
  res.status(403).json({ error: "War Room only accepts requests addressed to localhost" });
}

const api = express.Router();

api.get("/health", (_req, res) => {
  res.json({ status: "ok", mode: demoMode ? "demo" : "live" });
});

// Only public fields: the guilty commit is never revealed to the dashboard.
api.get("/scenarios", (_req, res) => {
  res.json({ scenarios: scenarios.map(({ id, label, summary }) => ({ id, label, summary })) });
});

api.get("/events", (_req, res) => {
  subscribe(res, {
    mode: demoMode ? "demo" : "live",
    model: demoMode ? undefined : config.model,
    agents: agentRoster,
  });
});

api.post("/incident", async (req, res) => {
  const scenario = findScenario(req.body?.scenario);
  if (!scenario) {
    res.status(400).json({ error: "Unknown scenario" });
    return;
  }
  try {
    res.status(202).json(await startIncident(scenario));
  } catch (error) {
    res.status(error instanceof IncidentInProgressError ? 409 : 500).json({ error: errorMessage(error) });
  }
});

const app = express();
app.disable("x-powered-by");
app.use(rejectForeignHosts);
app.use(express.json({ limit: "16kb" }));
app.use("/api", api);

// After `pnpm build`, the server also hosts the dashboard on the same port.
const dashboard = path.join(repoRoot, "apps", "dashboard", "dist");
if (existsSync(dashboard)) app.use(express.static(dashboard));

const server = app.listen(config.port, config.host, () => {
  console.log(
    `War Room server listening on http://${config.host}:${config.port} (${demoMode ? "demo mode" : `live, ${config.model}`})`,
  );
});
server.on("error", (error: NodeJS.ErrnoException) => {
  console.error(
    error.code === "EADDRINUSE" ? `Port ${config.port} is in use. Stop the other process or set SERVER_PORT.` : error,
  );
  process.exit(1);
});

process.on("exit", killServiceNow);
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => process.exit(0));

void ensureDemoRepo().catch((error) => console.error("Could not seed the sandbox repository:", errorMessage(error)));
