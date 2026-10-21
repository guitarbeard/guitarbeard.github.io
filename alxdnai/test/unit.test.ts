// Fast checks for the parts that don't need a model: tools, guardrails, and knowledge files.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { searchWork, getProfile, getContact, runTool } from "../src/tools.ts";
import { redact, cleanHistory, checkReply, plainText, capSentences } from "../src/guardrails.ts";
import { cannedReply } from "../src/canned.ts";
import { prefetch } from "../src/agent.ts";
import { isMeow, meowify, meowReply } from "../src/meow.ts";

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

test("checkReply cuts a reply that loops", () => {
  const loop = "1smartmenu was an online ordering menu builder that ".repeat(6);
  assert.ok(checkReply(loop).length < 60);
  const normal = "Alex built SKIMS on Hydrogen. Alex built Glossier's cart.";
  assert.equal(checkReply(normal), normal);
});

test("meow mode spots cat sounds and nothing else", () => {
  for (const t of ["meow?", "Meow!", "MEOW", "meow meow", "meeeooow", "mew", "miaow", "mrrp?", "purr", "nyan~"]) assert.ok(isMeow(t), t);
  for (const t of ["", "?", "can you meow?", "what did Alex build for SKIMS?", "meow, what's Alex's email?", "homeowner"]) assert.ok(!isMeow(t), t);
});

test("meowify keeps punctuation and capitalization", () => {
  assert.equal(meowify("Hi, I'm alxdnAI! Ask me anything about Alex's work."), "Meow, Meow meow! Meow meow meow meow Meow meow.");
  assert.equal(meowify("Email alxdna@gmail.com, and he'll reply."), "Meow meow@meow.meow, meow meow meow.");
  assert.equal(meowify("SKIMS uses e-commerce, 24/7."), "MEOW meow meow-meow, meow/meow.");
  assert.match(meowReply(() => 0.99), /^[^a-z]*(?:[Mm]eow|MEOW)(?:[^a-z]+(?:[Mm]eow|MEOW))*[^a-z]*$/i);
});

test("small talk gets a canned reply, real questions don't", () => {
  for (const t of ["hi!", "Hello there", "hola!", "how are you doing today?", "ok", "thank you", "Thanks!", "who are you?", "who am i?", "bye"]) {
    assert.ok(cannedReply(t), t);
  }
  assert.match(cannedReply("who am i?")!, /can't see who you are/);
  assert.match(cannedReply("who are you?")!, /I'm alxdnAI/);
  assert.match(cannedReply("meow?", () => 0)!, /^Meow, Meow meow!/);
  for (const t of ["hi, what did Alex build for SKIMS?", "who is Alex?", "ok so what's his stack?", "thanks, does he know Vue?"]) {
    assert.equal(cannedReply(t), null, t);
  }
});

test("music questions route to Alex's background", () => {
  for (const q of ["What instrument does he play?", "what does he play?", "what genre of music does alex play?"]) {
    assert.ok(prefetch([{ role: "user", content: q }]).some((c) => c.name === "get_profile" && c.args.section === "about"), q);
  }
});

test("generic link labels become bare URLs", () => {
  assert.equal(plainText("LinkedIn: [Link](https://www.linkedin.com/in/alxdna/)"), "LinkedIn: https://www.linkedin.com/in/alxdna/");
  assert.equal(plainText("[Resume](https://alxdna.dev/r.pdf)"), "Resume (https://alxdna.dev/r.pdf)");
});

test("long prose replies are capped at four sentences, lists are not", () => {
  assert.equal(capSentences("One. Two. Three. Four. Five."), "One. Two. Three. Four.");
  assert.equal(capSentences("He started a B.S. in Computer Science. Then he left."), "He started a B.S. in Computer Science. Then he left.");
  const list = "Stack:\n- React\n- Node\nA. B. C. D. E.";
  assert.equal(capSentences(list), list);
});
