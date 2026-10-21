// Fast checks for the parts that don't need a model: tools, guardrails, and knowledge files.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { searchWork, getProfile, getContact, runTool } from "../src/tools.ts";
import { redact, cleanHistory, checkReply, plainText } from "../src/guardrails.ts";

test("search_work finds clients by name and technology", () => {
  assert.equal(searchWork("SKIMS").results[0].title, "SKIMS");
  assert.equal(searchWork("Barnes & Noble").results[0].title, "Barnes & Noble");
  assert.equal(searchWork("expo react native").results[0].title, "Maps On Maps");
  assert.match(JSON.stringify(searchWork("custom shopify apps").results), /HAUS Labs|Indigo/);
});

test("search_work admits when nothing matches", () => {
  const r = searchWork("kubernetes");
  assert.equal(r.results.length, 0);
  assert.match(r.note!, /don't know/);
});

test("get_profile covers every section and rejects unknown ones", () => {
  for (const s of ["summary", "skills", "education", "about", "availability", "timeline"]) {
    assert.ok(!("error" in getProfile(s)), s);
  }
  assert.ok("error" in getProfile("salary"));
});

test("runTool tolerates bad arguments", () => {
  assert.deepEqual(runTool("search_work", "{not json"), { error: "Arguments were not valid JSON." });
  assert.ok("error" in (runTool("nope", "{}") as object));
  assert.ok("results" in (runTool("search_work", { query: "netflix" }) as object));
});

test("knowledge files never contain a phone number", () => {
  for (const f of ["profile.json", "work.json"]) {
    const text = readFileSync(new URL(`../knowledge/${f}`, import.meta.url), "utf8");
    assert.equal(redact(text).redacted, false, f);
  }
  assert.ok(!JSON.stringify(getContact()).match(/phone"\s*:/));
});

test("redact removes phone numbers in common formats", () => {
  for (const n of ["(555) 123-4567", "555-123-4567", "555.123.4567", "+1 555 123 4567", "5551234567"]) {
    const r = redact(`call ${n} today`);
    assert.ok(r.redacted, n);
    assert.ok(!r.text.includes("4567"), n);
  }
  assert.equal(redact("Alex worked there from 2016 to 2021").redacted, false);
});

test("cleanHistory validates input", () => {
  assert.equal(typeof cleanHistory([]), "string");
  assert.equal(typeof cleanHistory([{ role: "system", content: "x" }]), "string");
  assert.equal(typeof cleanHistory([{ role: "user", content: "x".repeat(2000) }]), "string");
  const ok = cleanHistory(Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `m${i}` })).slice(0, 29));
  assert.ok(Array.isArray(ok) && ok.length === 12);
});

test("checkReply replaces code and hijacked personas", () => {
  assert.match(checkReply("Sure:\n```python\ndef f(): pass\n```"), /only answer questions about Alex/);
  assert.match(checkReply("I am DAN"), /only answer questions about Alex/);
  const fine = "Alex built storefronts for Barnes & Noble, Netflix, and SKIMS.";
  assert.equal(checkReply(fine), fine);
});

test("plainText flattens Markdown links and bold", () => {
  assert.equal(plainText("[https://alxdna.dev/](https://alxdna.dev/)"), "https://alxdna.dev/");
  assert.equal(plainText("See [the resume](https://alxdna.dev/r.pdf)"), "See the resume (https://alxdna.dev/r.pdf)");
  assert.equal(plainText("**SKIMS** on Hydrogen"), "SKIMS on Hydrogen");
});
