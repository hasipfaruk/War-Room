export type FaultScenario = "pool-leak" | "guest-checkout-null-user" | "retry-timeout-typo";
let fault: FaultScenario | null = null;
export function activeFault() { return fault; }
export function activateFault(scenario: string): scenario is FaultScenario {
  if (scenario !== "pool-leak" && scenario !== "guest-checkout-null-user" && scenario !== "retry-timeout-typo") return false;
  fault = scenario;
  return true;
}
export function resetFault() { fault = null; }
