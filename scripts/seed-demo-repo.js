const { execFileSync } = require("node:child_process");
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const repo = path.join(root, "demo", "checkout-service-repo");

if (existsSync(path.join(repo, ".git"))) {
  console.log(`Demo repository already exists at ${repo}`);
  process.exit(0);
}

mkdirSync(path.join(repo, "src"), { recursive: true });
const write = (name, contents) => writeFileSync(path.join(repo, name), contents.trimStart(), "utf8");
const read = (name) => readFileSync(path.join(repo, name), "utf8");
const git = (...args) => execFileSync("git", args, { cwd: repo, stdio: "inherit" });
const commit = (message) => { git("add", "."); git("-c", "user.name=Checkout Team", "-c", "user.email=checkout@example.test", "commit", "-m", message); };
const replace = (name, from, to) => write(name, read(name).replace(from, to));
const branch = (name) => git("checkout", "-b", name, "main");

git("init");
git("branch", "-M", "main");
write(".gitignore", "logs/\n");
write("README.md", "# Checkout Service\n\nDependency-free checkout API used by the incident-response demo. Run with `node src/index.js`.\n");
write("src/index.js", `
const http = require("node:http");
const { appendFile, mkdir, readFile, rm } = require("node:fs/promises");
const path = require("node:path");

const port = Number(process.env.PORT || 4001);
const logFile = path.join(__dirname, "..", "logs", "app.log");
const users = { "ada@example.com": { id: "user_ada", loyaltyTier: "gold" }, "lin@example.com": { id: "user_lin", loyaltyTier: "platinum" } };
let trafficTimer;

async function log(level, event, details = {}) {
  const entry = { timestamp: new Date().toISOString(), level, service: "checkout-service", event, ...details };
  await mkdir(path.dirname(logFile), { recursive: true });
  await appendFile(logFile, JSON.stringify(entry) + "\\n");
  console.log(JSON.stringify(entry));
  return entry;
}
function json(res, status, body) { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); }
function body(req) { return new Promise((resolve) => { let data = ""; req.on("data", (chunk) => data += chunk); req.on("end", () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } }); }); }
function lookupUser(email) { return email ? users[email.toLowerCase()] || null : null; }
function priceForTier(tier) { return Math.round(10000 * ({ bronze: .95, gold: .85, platinum: .75 }[tier] || 1)); }
async function chargeDownstream() { await new Promise((resolve) => setTimeout(resolve, 5)); }
async function latestAlert() {
  const cutoff = Date.now() - 5000;
  const entries = (await readFile(logFile, "utf8").catch(() => "")).trim().split("\\n").filter(Boolean).map((line) => { try { return JSON.parse(line); } catch { return null; } }).filter((entry) => entry && Date.parse(entry.timestamp) >= cutoff && (entry.event === "checkout_completed" || entry.event === "checkout_failed"));
  const errors = entries.filter((entry) => entry.level === "error");
  if (entries.length >= 5 && errors.length / entries.length >= .2) { const latest = errors.at(-1); return { timestamp: new Date().toISOString(), level: "error", service: "checkout-service", event: "error_rate_alert", endpoint: latest && latest.endpoint, error: latest && latest.error, errorRate: errors.length / entries.length, sampleSize: entries.length, threshold: .2 }; }
  return null;
}
function startTraffic() { clearInterval(trafficTimer); const send = () => fetch("http://127.0.0.1:" + port + "/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) }).catch(() => undefined); for (let i = 0; i < 6; i++) send(); trafficTimer = setInterval(send, 150); }
http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (req.method === "GET" && url.pathname === "/health") { await log("info", "health_check"); return json(res, 200, { status: "ok", service: "checkout-service" }); }
  if (req.method === "POST" && url.pathname === "/checkout") {
    const payload = await body(req); const orderId = payload.orderId || crypto.randomUUID(); const user = lookupUser(payload.email);
    try { const totalCents = priceForTier(user && user.loyaltyTier); await chargeDownstream(); await log("info", "checkout_completed", { orderId, userId: user && user.id, totalCents, endpoint: "/checkout" }); return json(res, 201, { status: "completed", orderId, totalCents }); }
    catch (error) { const err = error instanceof Error ? error : new Error(String(error)); await log("error", "checkout_failed", { orderId, endpoint: "/checkout", error: err.name + ": " + err.message, stack: err.stack }); return json(res, 500, { status: "failed", orderId, error: err.message }); }
  }
  if (req.method === "POST" && url.pathname === "/traffic/start") { clearInterval(trafficTimer); await rm(logFile, { force: true }); startTraffic(); await log("info", "traffic_started"); return json(res, 202, { accepted: true }); }
  if (req.method === "POST" && url.pathname === "/traffic/stop") { clearInterval(trafficTimer); trafficTimer = undefined; await log("info", "traffic_stopped"); return json(res, 200, { status: "stopped" }); }
  if (req.method === "GET" && url.pathname === "/alerts/latest") { const alert = await latestAlert(); return alert ? json(res, 200, { alert }) : json(res, 404, { error: "no error-rate alert yet" }); }
  json(res, 404, { error: "not found" });
}).listen(port, () => console.log("checkout-service listening on http://localhost:" + port));
`);
write("src/db-pool.js", `
const maxConnections = 4; let checkedOut = 0;
async function acquireClient() { if (checkedOut >= maxConnections) throw new Error("database pool exhausted: no client available"); checkedOut += 1; let released = false; return { async query() { await new Promise((resolve) => setTimeout(resolve, 2)); }, release() { if (!released) { released = true; checkedOut -= 1; } } }; }
async function withDatabaseClient(work) { const client = await acquireClient(); try { return await work(client); } finally { client.release(); } }
module.exports = { acquireClient, withDatabaseClient, poolStats: () => ({ checkedOut, maxConnections }) };
`);
replace("src/index.js", 'const path = require("node:path");', 'const path = require("node:path");\nconst { poolStats, withDatabaseClient } = require("./db-pool");');
replace("src/index.js", 'await chargeDownstream(); await log', 'await withDatabaseClient((client) => client.query("INSERT checkout")); await chargeDownstream(); await log');
replace("src/index.js", 'await log("info", "health_check"); return json(res, 200, { status: "ok", service: "checkout-service" });', 'await log("info", "health_check", { pool: poolStats() }); return json(res, 200, { status: "ok", service: "checkout-service", pool: poolStats() });');
commit("initialize dependency-free checkout API");

function addInnocentHistory(label) {
  replace("README.md", "Dependency-free checkout API", `Dependency-free ${label} checkout API`); commit("document " + label + " checkout behavior");
  replace("src/index.js", 'const orderId = payload.orderId || crypto.randomUUID();', 'const orderId = payload.orderId || crypto.randomUUID(); const requestId = req.headers["x-request-id"] || crypto.randomUUID();');
  replace("src/index.js", '{ orderId, userId:', '{ orderId, requestId, userId:'); replace("src/index.js", '{ orderId, endpoint:', '{ orderId, requestId, endpoint:'); commit("add request IDs to " + label + " logs");
}
function addTipHistory(label) { write(`docs-${label}.md`, `# ${label}\n\nOperational notes for this checkout deployment.\n`); commit("add " + label + " operational notes"); replace("src/index.js", 'return json(res, 201, { status: "completed", orderId, totalCents });', 'res.setHeader("cache-control", "no-store"); return json(res, 201, { status: "completed", orderId, totalCents });'); commit("disable caching for " + label + " responses"); }

branch("incident/pool-leak"); addInnocentHistory("pool");
replace("src/index.js", 'const { poolStats, withDatabaseClient } = require("./db-pool");', 'const { acquireClient, poolStats } = require("./db-pool");');
replace("src/index.js", 'await withDatabaseClient((client) => client.query("INSERT checkout"));', 'const client = await acquireClient(); await client.query("INSERT checkout");');
commit("refactor db helpers"); addTipHistory("pool"); git("checkout", "main");

branch("incident/guest-checkout-null-user"); addInnocentHistory("guest");
replace("src/index.js", 'const totalCents = priceForTier(user && user.loyaltyTier);', 'const tier = user.loyaltyTier; const totalCents = priceForTier(tier);');
commit("support guest checkout"); addTipHistory("guest"); git("checkout", "main");

branch("incident/retry-timeout-typo"); addInnocentHistory("payments");
replace("src/index.js", 'async function chargeDownstream() { await new Promise((resolve) => setTimeout(resolve, 5)); }', 'async function chargeDownstream() { const retryTimeoutMs = 30; const gatewayLatencyMs = 80; if (gatewayLatencyMs > retryTimeoutMs) throw new Error(`payment gateway timeout after ${retryTimeoutMs}ms`); await new Promise((resolve) => setTimeout(resolve, gatewayLatencyMs)); }');
commit("tune timeouts"); addTipHistory("payments"); git("checkout", "main");

console.log(`Seeded standalone demo repository at ${repo}`);
