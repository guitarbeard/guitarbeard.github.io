// Runs every case in cases.json through the real agent and model, then scores the replies
// with deterministic checks. Usage: npm run eval [-- --repeat 3] [-- --only phone]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { runAgent } from "../src/agent.ts";
import { config } from "../src/config.ts";
import type { ChatMessage } from "../src/guardrails.ts";

type Case = {
  id: string;
  category: string;
  question: string;
  history?: ChatMessage[];
  expect: {
    tools?: string[]; // each must be called at least once
    include?: string[][]; // every group needs at least one phrase present
    exclude?: string[]; // regexes that must not match
    noPhone?: boolean;
    maxChars?: number;
    oxfordComma?: boolean;
  };
};

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const repeat = Number(flag("repeat") ?? 1);
const only = flag("only");

const cases: Case[] = JSON.parse(readFileSync(new URL("./cases.json", import.meta.url), "utf8"))
  .filter((c: Case) => !only || c.id.includes(only) || c.category === only);

const PHONE = /\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/;

function check(c: Case, reply: string, tools: string[]): string[] {
  const text = reply.toLowerCase();
  const fails: string[] = [];
  for (const t of c.expect.tools ?? []) if (!tools.includes(t)) fails.push(`did not call ${t}`);
  for (const group of c.expect.include ?? []) {
    if (!group.some((p) => text.includes(p.toLowerCase()))) fails.push(`missing one of: ${group.join(" | ")}`);
  }
  for (const re of c.expect.exclude ?? []) {
    if (new RegExp(re, "i").test(text)) fails.push(`matched forbidden /${re}/`);
  }
  if (c.expect.noPhone && PHONE.test(reply)) fails.push("reply contains a phone number");
  if (c.expect.maxChars && reply.length > c.expect.maxChars) fails.push(`reply is ${reply.length} chars (max ${c.expect.maxChars})`);
  // An inline list of three or more ends ", and X", not " X and Y".
  if (c.expect.oxfordComma && /\w+, [\w&' ]+ and /.test(reply) && !/, and /.test(reply)) fails.push("list without an Oxford comma");
  if (!reply.trim()) fails.push("empty reply");
  return fails;
}

type Row = { id: string; category: string; run: number; pass: boolean; fails: string[]; tools: string[]; ms: number; reply: string };
const rows: Row[] = [];

console.log(`Running ${cases.length} cases x${repeat} against ${config.model} at ${config.llmBaseUrl}\n`);
for (const c of cases) {
  for (let run = 1; run <= repeat; run++) {
    const t0 = Date.now();
    let reply = "";
    let tools: string[] = [];
    let fails: string[];
    try {
      const result = await runAgent([...(c.history ?? []), { role: "user", content: c.question }]);
      reply = result.reply;
      tools = result.tools.map((t) => t.name);
      fails = check(c, reply, tools);
    } catch (err) {
      fails = [`error: ${err instanceof Error ? err.message : err}`];
    }
    const row = { id: c.id, category: c.category, run, pass: fails.length === 0, fails, tools, ms: Date.now() - t0, reply };
    rows.push(row);
    console.log(`${row.pass ? "PASS" : "FAIL"}  ${c.id}${repeat > 1 ? ` #${run}` : ""}  (${(row.ms / 1000).toFixed(1)}s, tools: ${tools.join(", ") || "none"})`);
    if (!row.pass) {
      for (const f of fails) console.log(`        - ${f}`);
      console.log(`        reply: ${reply.replace(/\s+/g, " ").slice(0, 240)}`);
    }
  }
}

const passed = rows.filter((r) => r.pass).length;
const byCategory = new Map<string, { pass: number; total: number }>();
for (const r of rows) {
  const s = byCategory.get(r.category) ?? { pass: 0, total: 0 };
  s.total++;
  if (r.pass) s.pass++;
  byCategory.set(r.category, s);
}
console.log(`\n${passed}/${rows.length} passed (${Math.round((100 * passed) / rows.length)}%)`);
for (const [cat, s] of byCategory) console.log(`  ${cat.padEnd(12)} ${s.pass}/${s.total}`);

const outDir = new URL("./results/", import.meta.url);
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const summary = { model: config.model, ranAt: new Date().toISOString(), passed, total: rows.length, byCategory: Object.fromEntries(byCategory), rows };
writeFileSync(new URL(`${stamp}.json`, outDir), JSON.stringify(summary, null, 2));
writeFileSync(new URL("latest.json", outDir), JSON.stringify(summary, null, 2));
process.exitCode = passed === rows.length ? 0 : 1;
