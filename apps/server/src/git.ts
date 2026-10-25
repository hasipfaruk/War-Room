import path from "node:path";
import { config, repoRoot } from "./config.js";
import { scenarios } from "./scenarios.js";
import { execFileAsync } from "./util.js";

/** Runs git inside the sandbox repository. */
export const runGit = async (...args: string[]) =>
  (await execFileAsync("git", args, { cwd: config.sandboxDir, maxBuffer: 10_000_000 })).stdout.trim();

/** Commits made by War Room itself use a fixed identity so they never depend on the user's git config. */
export const fixerIdentity = ["-c", "user.name=War Room Fixer", "-c", "user.email=fixer@war-room.invalid"];

async function repoIsSeeded() {
  try {
    await Promise.all(scenarios.map(({ branch }) => runGit("show-ref", "--verify", "--quiet", `refs/heads/${branch}`)));
    return true;
  } catch {
    return false;
  }
}

let seeding: Promise<void> | undefined;

// A .git directory is visible while `git init` is still running. Only the complete
// set of scenario branches makes the sandbox repository safe to deploy from.
export async function ensureDemoRepo() {
  if (await repoIsSeeded()) return;
  seeding ??= execFileAsync(process.execPath, [path.join(repoRoot, "scripts", "seed-demo-repo.js"), config.sandboxDir])
    .then(async () => {
      if (!(await repoIsSeeded())) throw new Error("Sandbox repository was seeded without all incident branches");
    })
    .finally(() => {
      seeding = undefined;
    });
  await seeding;
}
