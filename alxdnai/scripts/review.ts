// Reads transcript logs and flags turns worth a human look, so real failures become eval cases.
// Usage: npm run review [-- --days 7] [--all]   (--all prints every turn, not just flagged ones)
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { config } from "../src/config.ts";
import type { TranscriptRecord } from "../src/transcripts.ts";

const daysArg = process.argv.indexOf("--days");
const days = daysArg >= 0 ? Number(process.argv[daysArg + 1]) : 7;
const all = process.argv.includes("--all");
const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

const dir = config.transcriptDir;
if (!existsSync(dir)) {
  console.log(`No transcripts yet in ${dir}`);
  process.exit(0);
}
const records: TranscriptRecord[] = readdirSync(dir)
  .filter((f) => f.endsWith(".jsonl") && f.slice(0, 10) >= since)
  .sort()
  .flatMap((f) => readFileSync(`${dir}/${f}`, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)));

// Each rule names a pattern that has meant a bad answer before.
const rules: { flag: string; test: (r: TranscriptRecord) => boolean }[] = [
  { flag: "error", test: (r) => Boolean(r.error) },
  { flag: "redacted", test: (r) => r.redacted },
  { flag: "model called no tools", test: (r) => !r.error && r.tools.every((t) => t.auto) && /\b(alex|he|she|they|work|built|experience)\b/i.test(r.user) },
  { flag: "said I don't know", test: (r) => /don't know|do not know|not sure|no information|couldn't find/i.test(r.reply) },
  { flag: "declined", test: (r) => /only answer questions about alex/i.test(r.reply) },
  { flag: "slow (>30s)", test: (r) => r.latencyMs > 30_000 },
  { flag: "long reply", test: (r) => r.reply.length > 900 },
  { flag: "tool error", test: (r) => r.tools.some((t) => t.resultChars < 60) },
];

const sessions = new Set(records.map((r) => r.sessionId));
const latencies = records.filter((r) => !r.error).map((r) => r.latencyMs).sort((a, b) => a - b);
const pct = (p: number) => (latencies.length ? (latencies[Math.floor((latencies.length - 1) * p)] / 1000).toFixed(1) : "-");

console.log(`# alxdnAI transcript review since ${since}\n`);
console.log(`${records.length} turns across ${sessions.size} sessions. Latency p50 ${pct(0.5)}s, p90 ${pct(0.9)}s.\n`);

const counts = new Map<string, number>();
for (const r of records) {
  const flags = rules.filter((rule) => rule.test(r)).map((rule) => rule.flag);
  if (flags.length === 0 && !all) continue;
  for (const f of flags) counts.set(f, (counts.get(f) ?? 0) + 1);
  console.log(`## ${r.ts} session ${r.sessionId.slice(0, 8)}${flags.length ? ` [${flags.join(", ")}]` : ""}`);
  console.log(`Q: ${r.user}`);
  console.log(`A: ${r.reply || r.error}`);
  console.log(`Tools: ${r.tools.map((t) => `${t.name}(${t.args})`).join(", ") || "none"}\n`);
}
console.log("## Flag totals");
for (const [f, n] of counts) console.log(`- ${f}: ${n}`);
console.log("\nTurn each real failure into a case in evals/cases.json, fix the prompt, tool, or knowledge, then rerun npm run eval.");
