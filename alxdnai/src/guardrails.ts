// Checks that run outside the model, so they hold even when the prompt doesn't.
import { config } from "./config.ts";

export type ChatMessage = { role: "user" | "assistant"; content: string };

// US-style phone numbers, with or without separators and a leading +1.
const PHONE = /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;

export function redact(text: string): { text: string; redacted: boolean } {
  let redacted = false;
  const out = text.replace(PHONE, () => {
    redacted = true;
    return "[phone number removed, email alxdna@gmail.com instead]";
  });
  return { text: out, redacted };
}

// Validates and trims the history a browser sends. Returns an error string for bad input.
export function cleanHistory(input: unknown): ChatMessage[] | string {
  if (!Array.isArray(input) || input.length === 0) return "messages must be a non-empty array";
  const msgs: ChatMessage[] = [];
  for (const m of input) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") {
      return "each message needs a role of user or assistant and string content";
    }
    msgs.push({ role: m.role, content: m.content.slice(0, config.maxInputChars * 2) });
  }
  const last = msgs[msgs.length - 1];
  if (last.role !== "user") return "the last message must be from the user";
  if (!last.content.trim()) return "the message is empty";
  if (last.content.length > config.maxInputChars) return `keep messages under ${config.maxInputChars} characters`;
  return msgs.slice(-config.maxHistoryMessages);
}

const OFF_SCRIPT = "I only answer questions about Alex's work. For example, you could ask what Alex built for SKIMS.";

// Last line of defense for replies the prompt should have prevented: code, or a hijacked persona.
export function offScript(reply: string): boolean {
  return /```|^\s*(def|class|function|import|const|let|public)\s/m.test(reply) || /\bI am (?!alxdnAI)[A-Z]{2,}\b/.test(reply);
}

// Small models sometimes loop ("X that X that X that..."). Cut the reply where a long phrase repeats.
export function cutRepetition(reply: string): string {
  const m = /(.{24,}?)\1{2,}/s.exec(reply);
  if (!m) return reply;
  const kept = reply.slice(0, m.index + m[1].length).trim();
  const lastStop = Math.max(kept.lastIndexOf(". "), kept.endsWith(".") ? kept.length - 1 : -1);
  return lastStop > 0 ? kept.slice(0, lastStop + 1) : kept;
}

// The prompt asks for two to four sentences, but small models run on. Lists are left alone.
export function capSentences(reply: string, max = 4): string {
  if (/^\s*(-|\d+\.)\s/m.test(reply)) return reply;
  const sentences = reply.split(/(?<=[.!?])\s+(?=[A-Z])/);
  return sentences.length > max ? sentences.slice(0, max).join(" ") : reply;
}

export function checkReply(reply: string): string {
  return offScript(reply) ? OFF_SCRIPT : capSentences(cutRepetition(reply));
}

// "[Link](https://...)" should read as the URL, not "Link (https://...)".
const GENERIC_LABEL = /^\s*(link|here|click here|this|website|site|url|profile|page)\s*$/i;

// The widget shows plain text, so turn the Markdown small models like to write into readable text.
export function plainText(reply: string): string {
  return reply
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label: string, url: string) =>
      label.replace(/\/$/, "") === url.replace(/\/$/, "") || GENERIC_LABEL.test(label) ? url : `${label} (${url})`)
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*\*\s+/gm, "- ");
}
