# Add a scenario

A scenario is a branch in the sandbox repository with one guilty commit hidden among harmless ones. Adding one touches
two files and takes about fifteen minutes.

## What makes a good scenario

- **The bug fails loudly.** It must make `POST /checkout` fail with a logged error, at least 20% of the time, within a
  few seconds of traffic. Otherwise the alert never fires.
- **One commit causes it.** Reverting that single commit must fix it.
- **The cause is findable from evidence.** The error in the logs should point at code the guilty commit changed, even
  if not obviously.
- **The harmless commits look plausible.** The commit messages alone shouldn't give the answer away; the Git Detective
  should have to read the diffs.

## 1. Write the branch in the seed script

`scripts/seed-demo-repo.js` builds the sandbox with a few helpers:

| Helper                      | What it does                                                        |
| --------------------------- | ------------------------------------------------------------------- |
| `branch(name)`              | Creates and checks out `name` from `main`                           |
| `replace(file, from, to)`   | Replaces the first occurrence of `from` with `to` in a sandbox file |
| `write(file, contents)`     | Writes a whole file                                                 |
| `commit(message)`           | Stages everything and commits with a fixed author                   |
| `addInnocentHistory(label)` | Adds two harmless commits (README change, request IDs in logs)      |
| `addTipHistory(label)`      | Adds two harmless commits after the bug (docs file, cache header)   |

Add your branch after the existing ones, following the same pattern. For example, a scenario where a refactor breaks
the price calculation for one loyalty tier:

```js
branch("incident/tier-pricing");
addInnocentHistory("pricing");
replace(
  "src/index.js",
  "function priceForTier(tier) {",
  'function priceForTier(tier) { if (tier == null) throw new RangeError("unknown loyalty tier"); ',
);
commit("simplify tier pricing");
addTipHistory("pricing");
git("checkout", "main");
```

!!! tip "Check that `replace` matched"

    `replace` does nothing if `from` isn't found, and the scenario then has no bug. Use a string you copied from the
    current file, and run the end-to-end test afterwards.

Then add the branch to the `branches` list at the top of the script, which is used to check that seeding finished:

```js
const branches = [
  "incident/pool-leak",
  "incident/guest-checkout-null-user",
  "incident/retry-timeout-typo",
  "incident/tier-pricing",
];
```

## 2. Register the scenario

Add an entry to `apps/server/src/scenarios.ts`:

```ts
{
  id: "tier-pricing",
  label: "Tier pricing",
  summary: "Pricing fails for checkouts without a loyalty tier",
  branch: "incident/tier-pricing",
  guiltySubject: "simplify tier pricing",
},
```

`guiltySubject` must match the guilty commit's message exactly. Only demo mode reads it, to script the Git Detective's
verdict. It is never sent to the agents in live mode or to the dashboard.

The dashboard reads scenarios from the server, so it shows the new one without changes.

## 3. Test it

```bash
# Delete the old sandbox so it is seeded again with your branch.
rm -rf sandbox        # Windows: Remove-Item -Recurse -Force sandbox
pnpm build
pnpm test:e2e
```

The end-to-end test runs every scenario from `/api/scenarios`, including yours, and checks that the error rate is at
least 20% before the fix and below 20% after. Then try it in the dashboard with `pnpm dev`, and in live mode if you
have a key, to see whether the agents can find it.

## 4. Document it

Add a row to the table in `docs/getting-started/scenarios.md` and in `README.md`.
