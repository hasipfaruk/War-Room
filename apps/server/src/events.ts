import type { Response } from "express";

export type EventType =
  | "hello"
  | "incident_started"
  | "incident"
  | "agent_started"
  | "agent_delta"
  | "agent_complete"
  | "status"
  | "fix_available"
  | "postmortem";

export type WarRoomEvent = { type: EventType; data: Record<string, unknown> & { timestamp: string } };

const clients = new Set<Response>();
let history: WarRoomEvent[] = [];

const serialize = ({ type, data }: WarRoomEvent) => `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;

/** Starts a fresh replay buffer, so clients that connect later see only the current incident. */
export function beginIncidentLog() {
  history = [];
}

export function publish(type: EventType, data: Record<string, unknown> = {}) {
  const event: WarRoomEvent = { type, data: { ...data, timestamp: new Date().toISOString() } };
  const message = serialize(event);
  remember(event);
  for (const client of clients) client.write(message);
}

// Streaming produces one event per token. Consecutive deltas from the same agent are
// merged so the replay buffer grows with pipeline steps rather than with tokens.
function remember(event: WarRoomEvent) {
  const last = history.at(-1);
  if (event.type === "agent_delta" && last?.type === "agent_delta" && last.data.agent === event.data.agent) {
    last.data = { ...event.data, delta: `${last.data.delta}${event.data.delta}` };
  } else {
    history.push(event);
  }
}

export const incidentEvents = () => history.filter((event) => event.type !== "agent_delta");

/** Opens an SSE stream: a `hello` event (clients reset their state on it), then a replay of the current incident. */
export function subscribe(res: Response, hello: Record<string, unknown>) {
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.flushHeaders();
  res.write(serialize({ type: "hello", data: { ...hello, timestamp: new Date().toISOString() } }));
  for (const event of history) res.write(serialize(event));
  clients.add(res);
  const keepAlive = setInterval(() => res.write(": ping\n\n"), 15_000);
  res.on("close", () => {
    clearInterval(keepAlive);
    clients.delete(res);
  });
}
