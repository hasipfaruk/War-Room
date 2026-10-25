import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { runAgent, untrusted } from "./agents.js";
import { config, demoMode, repoRoot } from "./config.js";
import { demoScripts } from "./demo-scripts.js";
import { beginIncidentLog, incidentEvents, publish, type WarRoomEvent } from "./events.js";
import { ensureDemoRepo, fixerIdentity, runGit } from "./git.js";
import type { Scenario } from "./scenarios.js";
import {
  latestAlert,
  measureErrorRate,
  readServiceLog,
  restartService,
  startTraffic,
  stopTraffic,
  type Alert,
} from "./service.js";
import { errorMessage, execFileAsync, percent, truncate, wait } from "./util.js";

const ALERT_TIMEOUT_MS = 15_000;
const RECOVERY_WINDOW_MS = 5_000;
/** Matches the service's alert threshold: below it the incident counts as resolved. */
const RESOLVED_ERROR_RATE = 0.2;
const MAX_LOG_LINES = 50;
const MAX_DIFF_CHARS = 60_000;

type FixMethod = "patch" | "revert";

export class IncidentInProgressError extends Error {
  constructor() {
    super("An incident response is already in progress");
  }
}

let busy = false;

/**
 * Deploys the scenario's regression and waits for the error-rate alert, then runs
 * the agent pipeline in the background. Only one incident runs at a time because
 * every step checks out branches in the same sandbox repository.
 */
export async function startIncident(scenario: Scenario) {
  if (busy) throw new IncidentInProgressError();
  busy = true;
  try {
    beginIncidentLog();
    publish("incident_started", { scenario: scenario.id, label: scenario.label });
    publish("status", { status: "deploying" });
    const deployment = await deploy(scenario);
    await startTraffic();
    const alert = await waitForAlert();
    publish("incident", { alert, scenario: scenario.id, ...deployment });
    publish("status", { status: "critical" });
    void respond(scenario, alert, deployment.lastKnownGood)
      .catch((error) => {
        console.error("incident response failed", error);
        publish("status", { status: "failed", message: `Incident response stopped: ${errorMessage(error)}` });
      })
      .finally(() => {
        busy = false;
      });
    return { alert, deployment };
  } catch (error) {
    busy = false;
    await stopTraffic().catch(() => undefined);
    publish("status", { status: "failed", message: errorMessage(error) });
    throw error;
  }
}

async function deploy(scenario: Scenario) {
  await ensureDemoRepo();
  const lastKnownGood = await runGit("merge-base", "main", scenario.branch);
  await runGit("checkout", "--force", scenario.branch);
  const deployedSha = await runGit("rev-parse", "HEAD");
  await restartService();
  return { deployedSha, lastKnownGood };
}

async function waitForAlert() {
  for (let elapsed = 0; elapsed < ALERT_TIMEOUT_MS; elapsed += 1_000) {
    await wait(1_000);
    const alert = await latestAlert();
    if (alert) return alert;
  }
  throw new Error(
    `checkout-service did not reach the error-rate alert threshold within ${ALERT_TIMEOUT_MS / 1000} seconds`,
  );
}

async function respond(scenario: Scenario, alert: Alert, lastKnownGood: string) {
  publish("status", { status: "investigating" });
  const evidence = await collectEvidence(lastKnownGood);
  const alertJson = untrusted("alert", JSON.stringify(alert, null, 2));

  const triage = await runAgent(
    "Triage",
    `Read this alert. State the severity and a concise investigation plan.\n\n${alertJson}`,
    () => demoScripts.triage(alert),
  );
  const logs = await runAgent(
    "Log Detective",
    "Analyze the most recent service logs. Produce ranked hypotheses, each quoting specific log lines as evidence." +
      `\n\nTriage:\n${triage}\n\n${alertJson}\n\n${untrusted("logs", evidence.logs)}`,
    () => demoScripts.logDetective(alert),
  );
  const git = await runAgent(
    "Git Detective",
    "Identify the commit in the deployed range that caused this incident, using the evidence and the other agents' conclusions. " +
      "Explain briefly. Your final line must be exactly: VERDICT: <commit sha>" +
      `\n\nTriage:\n${triage}\n\nLog Detective:\n${logs}\n\n${untrusted("git-log", evidence.gitLog)}\n\n${untrusted("diffs", evidence.diffs)}`,
    () => demoScripts.gitDetective(scenario, evidence.gitLog),
  );
  const guiltySha = resolveVerdict(git, evidence.commits);

  publish("status", { status: "fixing" });
  const [guiltyDiff, deployedSource] = await Promise.all([
    runGit("show", "--format=medium", "--patch", guiltySha),
    runGit("show", "HEAD:src/index.js"),
  ]);
  const fixer = await runAgent(
    "Fixer",
    `Correct the regression introduced by commit ${guiltySha}. Make the smallest safe change. ` +
      "Reply with ONLY the complete corrected contents of src/index.js in a single javascript fenced code block." +
      `\n\nGit Detective:\n${git}\n\n${untrusted("guilty-diff", guiltyDiff)}\n\n${untrusted("src/index.js", deployedSource)}`,
    demoScripts.fixer,
  );
  const before = alert.errorRate ?? 1;
  const fix = await applyFix(scenario, guiltySha, fixer);
  publish("fix_available", {
    branch: fix.branch,
    diff: fix.diff,
    method: fix.method,
    beforeErrorRate: before,
    afterErrorRate: fix.errorRate,
    sampleSize: fix.sampleSize,
  });
  const resolved = fix.errorRate < RESOLVED_ERROR_RATE;
  publish("status", {
    status: resolved ? "resolved" : "critical",
    ...(resolved ? {} : { message: `Error rate is still ${percent(fix.errorRate)} after the fix` }),
  });

  const timeline = incidentEvents().map(describe).filter(Boolean).join("\n");
  const guiltyCommit = await runGit("log", "-1", "--format=%h %s", guiltySha);
  const postmortem = await runAgent(
    "Scribe",
    "Write a concise Markdown postmortem with the headings Summary, Timeline, Root Cause, Resolution and Action Items. " +
      "Use the timestamps from the timeline below." +
      `\n\nTriage:\n${triage}\n\nLog Detective:\n${logs}\n\nGit Detective:\n${git}\n\nGuilty commit: ${guiltyCommit}` +
      `\n\nFix: ${fix.method} on branch ${fix.branch}. Error rate ${percent(before)} before, ${percent(fix.errorRate)} after.` +
      `\n\nTimeline:\n${timeline}`,
    () =>
      demoScripts.scribe({
        scenario,
        guiltyCommit,
        before,
        after: fix.errorRate,
        method: fix.method,
        branch: fix.branch,
        timeline,
      }),
  );
  const file = await savePostmortem(scenario, postmortem);
  publish("postmortem", { path: path.relative(repoRoot, file), content: postmortem });
}

async function collectEvidence(lastKnownGood: string) {
  const range = `${lastKnownGood}..HEAD`;
  const [logs, gitLog, revList] = await Promise.all([
    readServiceLog(MAX_LOG_LINES),
    runGit("log", "--oneline", range),
    runGit("rev-list", range),
  ]);
  const commits = revList.split("\n").filter(Boolean);
  const diffs = await Promise.all(commits.map((sha) => runGit("show", "--format=fuller", "--stat", "--patch", sha)));
  return { logs, gitLog, commits, diffs: truncate(diffs.join("\n\n"), MAX_DIFF_CHARS) };
}

/** Accepts `VERDICT: abc1234` with any surrounding Markdown and takes the last one. */
export const parseVerdict = (text: string) =>
  [...text.matchAll(/VERDICT\W*([0-9a-f]{7,40})\b/gi)].at(-1)?.[1]?.toLowerCase();

function resolveVerdict(text: string, suspects: string[]) {
  const sha = parseVerdict(text);
  if (!sha) throw new Error("Git Detective did not finish with a 'VERDICT: <sha>' line");
  const matches = suspects.filter((full) => full.startsWith(sha));
  if (matches.length !== 1)
    throw new Error(`Git Detective named ${sha}, which is not a single commit in the deployed range`);
  return matches[0];
}

async function applyFix(scenario: Scenario, guiltySha: string, fixerText: string) {
  const branch = `fix/${scenario.id}`;
  await runGit("checkout", "--force", "-B", branch, scenario.branch);

  if (!demoMode && (await commitPatch(fixerText, guiltySha))) {
    try {
      await restartService();
      const recovery = await measureErrorRate(RECOVERY_WINDOW_MS);
      if (recovery.errorRate < RESOLVED_ERROR_RATE)
        return { branch, method: "patch" as FixMethod, diff: await headDiff(), ...recovery };
      console.warn(`Fixer patch left the error rate at ${percent(recovery.errorRate)}; falling back to a revert`);
    } catch (error) {
      console.warn(`Fixer patch failed to start (${errorMessage(error)}); falling back to a revert`);
    }
    await runGit("reset", "--hard", scenario.branch);
  }

  await commitRevert(guiltySha);
  await restartService();
  const recovery = await measureErrorRate(RECOVERY_WINDOW_MS);
  return { branch, method: "revert" as FixMethod, diff: await headDiff(), ...recovery };
}

const headDiff = () => runGit("show", "--format=medium", "--patch", "HEAD");

/** Commits the Fixer's file if it is plausible, parses as JavaScript and changes something. */
async function commitPatch(fixerText: string, guiltySha: string) {
  const fenced = fixerText.match(/```(?:javascript|js)?[^\n]*\n([\s\S]*?)```/i);
  const source = (fenced?.[1] ?? fixerText).trim();
  if (!source.includes("http.createServer")) return false;
  const file = path.join(config.sandboxDir, "src", "index.js");
  await writeFile(file, `${source}\n`, "utf8");
  try {
    await execFileAsync(process.execPath, ["--check", file]);
    if (!(await runGit("status", "--porcelain"))) return false;
    await runGit(...fixerIdentity, "commit", "-am", `fix: correct regression from ${guiltySha.slice(0, 7)}`);
    return true;
  } catch {
    await runGit("checkout", "--", "src/index.js");
    return false;
  }
}

async function commitRevert(guiltySha: string) {
  try {
    await runGit(...fixerIdentity, "revert", "--no-edit", guiltySha);
  } catch {
    // A later innocent commit can touch the same line. Keep the revert side of
    // that conflict so the rollback still applies.
    await runGit("revert", "--abort").catch(() => undefined);
    await runGit(...fixerIdentity, "revert", "--no-edit", "-X", "theirs", guiltySha);
  }
}

function describe({ type, data }: WarRoomEvent) {
  const line = (text: string) => `- ${data.timestamp} — ${text}`;
  switch (type) {
    case "incident_started":
      return line(`Regression deployed (scenario: ${data.label})`);
    case "incident": {
      const alert = data.alert as Alert;
      return line(`Error-rate alert fired at ${percent(alert.errorRate)}: ${alert.error}`);
    }
    case "agent_started":
      return line(`${data.agent} started`);
    case "agent_complete":
      return line(`${data.agent} finished`);
    case "status":
      return line(`Status ${String(data.status).toUpperCase()}${data.message ? ` (${data.message})` : ""}`);
    case "fix_available":
      return line(
        `Fix deployed from ${data.branch} by ${data.method}; error rate ${percent(Number(data.beforeErrorRate))} → ${percent(Number(data.afterErrorRate))}`,
      );
    default:
      return undefined;
  }
}

async function savePostmortem(scenario: Scenario, markdown: string) {
  await mkdir(config.postmortemDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(config.postmortemDir, `${stamp}-${scenario.id}.md`);
  await writeFile(file, `${markdown.trim()}\n`, "utf8");
  return file;
}
