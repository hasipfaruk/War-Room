import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const execFileAsync = promisify(execFile);

export const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

export const percent = (rate: number | undefined) => `${Math.round((rate ?? 0) * 100)}%`;

/** Keeps prompts bounded on large repositories; the marker tells the model content was cut. */
export function truncate(text: string, maxChars: number) {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n[... truncated ${text.length - maxChars} characters ...]`;
}
