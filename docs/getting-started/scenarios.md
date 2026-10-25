# Scenarios

A scenario is a git branch in the sandbox repository whose history contains one buggy commit among several harmless
ones. Deploying a scenario checks out that branch and restarts the service, so the bug runs for real.

| Scenario           | Guilty commit            | What breaks                                                         | Error in the logs                                                   |
| ------------------ | ------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Pool leak**      | `refactor db helpers`    | Checkout stops releasing database connections, so the pool runs out | `database pool exhausted: no client available`                      |
| **Guest checkout** | `support guest checkout` | A null check is removed, so every checkout without a user crashes   | `TypeError: Cannot read properties of null (reading 'loyaltyTier')` |
| **Timeout tuning** | `tune timeouts`          | A retry timeout is set to 30 ms where 30 s was intended             | `payment gateway timeout after 30ms`                                |

## What each branch looks like

Every scenario branch starts from `main` and adds, in order:

1. `document <name> checkout behavior` (harmless, README change)
2. `add request IDs to <name> logs` (harmless, logging change)
3. **the guilty commit**
4. `add <name> operational notes` (harmless, new docs file)
5. `disable caching for <name> responses` (harmless, response header change)

The Git Detective sees all five commits and their diffs. Nothing tells it which commit is guilty. In demo mode the
scripted Git Detective uses the known commit message, which is why demo-mode answers are labelled **SCRIPTED**.

## Resetting the sandbox

The sandbox repository lives in `sandbox/checkout-service`. Fix branches (`fix/<scenario>`) are recreated on every run,
so you can deploy the same scenario again without cleaning up. To start completely fresh, stop War Room, delete the
`sandbox/` folder and start it again.

To add your own scenario, see [Add a scenario](../develop/scenarios.md).
