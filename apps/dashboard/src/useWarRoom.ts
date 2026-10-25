import { useEffect, useReducer } from "react";
import type { AgentMessage, Alert, EventPayloads, Fix, Mode, Postmortem, ServerEvent, Status } from "./types";

export type WarRoomState = {
  connected: boolean;
  mode?: Mode;
  model?: string;
  status: Status;
  statusMessage?: string;
  scenarioLabel?: string;
  alert?: Alert;
  messages: AgentMessage[];
  fix?: Fix;
  postmortem?: Postmortem;
  running: boolean;
};

type Action = ServerEvent | { type: "disconnected" };

const initialState: WarRoomState = { connected: false, status: "nominal", messages: [], running: false };

const eventTypes: (keyof EventPayloads)[] = [
  "hello",
  "incident_started",
  "incident",
  "status",
  "agent_started",
  "agent_delta",
  "agent_complete",
  "fix_available",
  "postmortem",
];

/** Applies `update` to the most recent message from `agent`. */
function updateLatest(state: WarRoomState, agent: string, update: (message: AgentMessage) => AgentMessage) {
  const index = state.messages.findLastIndex((message) => message.agent === agent);
  if (index < 0) return state;
  const messages = [...state.messages];
  messages[index] = update(messages[index]);
  return { ...state, messages };
}

function reducer(state: WarRoomState, action: Action): WarRoomState {
  switch (action.type) {
    case "disconnected":
      return { ...state, connected: false };
    // Sent first on every (re)connection, followed by a replay of the current incident.
    case "hello":
      return { ...initialState, connected: true, mode: action.data.mode, model: action.data.model };
    case "incident_started":
      return {
        ...initialState,
        connected: true,
        mode: state.mode,
        model: state.model,
        scenarioLabel: action.data.label,
        running: true,
      };
    case "incident":
      return { ...state, alert: action.data.alert };
    case "status":
      return {
        ...state,
        status: action.data.status,
        statusMessage: action.data.message,
        running: action.data.status === "failed" ? false : state.running,
      };
    case "agent_started": {
      const { agent, color, simulated } = action.data;
      return { ...state, messages: [...state.messages, { agent, color, simulated, text: "", complete: false }] };
    }
    case "agent_delta":
      return updateLatest(state, action.data.agent, (message) => ({
        ...message,
        text: message.text + action.data.delta,
      }));
    case "agent_complete":
      return updateLatest(state, action.data.agent, (message) => ({
        ...message,
        text: action.data.message || message.text,
        complete: true,
        error: action.data.error,
      }));
    case "fix_available":
      return { ...state, fix: action.data };
    case "postmortem":
      return { ...state, postmortem: action.data, running: false };
  }
}

/** Subscribes to the server's event stream and folds it into dashboard state. */
export function useWarRoom() {
  const [state, dispatch] = useReducer(reducer, initialState);
  useEffect(() => {
    const source = new EventSource("/api/events");
    for (const type of eventTypes) {
      source.addEventListener(type, (event) => dispatch({ type, data: JSON.parse(event.data) } as ServerEvent));
    }
    source.onerror = () => dispatch({ type: "disconnected" });
    return () => source.close();
  }, []);
  return state;
}
