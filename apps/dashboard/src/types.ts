export type Mode = "demo" | "live";
export type Status = "nominal" | "deploying" | "critical" | "investigating" | "fixing" | "resolved" | "failed";

export type Scenario = { id: string; label: string; summary: string };

export type Alert = {
  error?: string;
  endpoint?: string;
  errorRate?: number;
  latencyP95Ms?: number;
  sampleSize?: number;
};

export type AgentMessage = {
  agent: string;
  color: string;
  text: string;
  complete: boolean;
  simulated: boolean;
  error?: string;
};

export type Fix = {
  branch: string;
  diff: string;
  method: "patch" | "revert";
  beforeErrorRate: number;
  afterErrorRate: number;
  sampleSize: number;
};

export type Postmortem = { path: string; content: string };

/** Payload of each server-sent event, keyed by event name. */
export type EventPayloads = {
  hello: { mode: Mode; model?: string };
  incident_started: { scenario: string; label: string };
  incident: { alert: Alert };
  status: { status: Status; message?: string };
  agent_started: { agent: string; color: string; simulated: boolean };
  agent_delta: { agent: string; delta: string };
  agent_complete: { agent: string; message: string; error?: string };
  fix_available: Fix;
  postmortem: Postmortem;
};

export type ServerEvent = { [K in keyof EventPayloads]: { type: K; data: EventPayloads[K] } }[keyof EventPayloads];
