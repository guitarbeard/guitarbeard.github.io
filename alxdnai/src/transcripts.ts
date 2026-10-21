// Append-only JSONL transcript log, one file per day, for reviewing real conversations.
import { appendFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { config } from "./config.ts";
import type { ToolTrace } from "./agent.ts";

export type TranscriptRecord = {
  ts: string;
  sessionId: string;
  visitor: string;
  model: string;
  user: string;
  reply: string;
  tools: ToolTrace[];
  rounds: number;
  redacted: boolean;
  latencyMs: number;
  error?: string;
};

// Visitors are tracked by a salted hash, never a raw IP.
export const visitorId = (ip: string) => createHash("sha256").update(config.ipSalt + ip).digest("hex").slice(0, 12);

export async function logTurn(record: TranscriptRecord) {
  await mkdir(config.transcriptDir, { recursive: true });
  const file = `${config.transcriptDir.replace(/\/?$/, "/")}${record.ts.slice(0, 10)}.jsonl`;
  await appendFile(file, JSON.stringify(record) + "\n");
}
