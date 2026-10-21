// HTTP API for the alxdnAI widget. No dependencies: node:http plus Server-Sent Events.
//   GET  /api/health  -> { ok, model }
//   POST /api/chat    { sessionId, messages: [{ role, content }] } -> SSE stream of
//                     tool | delta | reset | done | error events
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { config } from "./config.ts";
import { runAgent } from "./agent.ts";
import { cleanHistory } from "./guardrails.ts";
import { logTurn, visitorId } from "./transcripts.ts";
import { isMeow } from "./meow.ts";

const hits = new Map<string, number[]>();
function rateLimited(visitor: string) {
  const now = Date.now();
  const recent = (hits.get(visitor) ?? []).filter((t) => now - t < config.rateLimit.windowMs);
  recent.push(now);
  hits.set(visitor, recent);
  return recent.length > config.rateLimit.max;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of hits) if (v.every((t) => now - t >= config.rateLimit.windowMs)) hits.delete(k);
}, 60_000).unref();

// A tiny queue so a CPU-only model host never runs more generations than it can handle.
let active = 0;
const waiting: (() => void)[] = [];
async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= config.concurrency) await new Promise<void>((resolve) => waiting.push(resolve));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

function cors(req: IncomingMessage, res: ServerResponse) {
  const origin = req.headers.origin;
  if (origin && config.allowedOrigins.includes(origin)) {
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("vary", "origin");
    res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
    res.setHeader("access-control-allow-headers", "content-type");
  }
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage, limit = 32_000): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("body too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

// Behind Cloudflare Tunnel the visitor's address arrives in cf-connecting-ip.
const clientIp = (req: IncomingMessage) =>
  String(req.headers["cf-connecting-ip"] ?? req.socket.remoteAddress ?? "unknown");

async function handleChat(req: IncomingMessage, res: ServerResponse) {
  let body: any;
  try {
    body = await readBody(req);
  } catch {
    return json(res, 400, { error: "invalid JSON body" });
  }
  const history = cleanHistory(body?.messages);
  if (typeof history === "string") return json(res, 400, { error: history });

  const visitor = visitorId(clientIp(req));
  if (rateLimited(visitor)) return json(res, 429, { error: "Too many messages. Try again in a few minutes, or email alxdna@gmail.com." });
  if (active >= config.concurrency && waiting.length >= config.maxQueue) {
    return json(res, 503, { error: "alxdnAI is busy right now. Try again in a minute." });
  }

  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
  const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const abort = new AbortController();
  res.on("close", () => abort.abort());

  const sessionId = typeof body.sessionId === "string" ? body.sessionId.slice(0, 64) : randomUUID();
  const userText = history[history.length - 1].content;
  const t0 = Date.now();
  send("queued", { position: waiting.length });
  try {
    const run = () => runAgent(history, (e) => (e.type === "delta" ? send("delta", { text: e.text }) : send(e.type, e)), abort.signal);
    // Meows never reach the model, so they skip the queue.
    const result = await (isMeow(userText) ? run() : withSlot(run));
    send("done", { reply: result.reply });
    await logTurn({ ts: new Date().toISOString(), sessionId, visitor, model: config.model, user: userText, reply: result.reply,
      tools: result.tools, rounds: result.rounds, redacted: result.redacted, latencyMs: Date.now() - t0 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!abort.signal.aborted) send("error", { error: "Something went wrong on my end. You can email Alex at alxdna@gmail.com." });
    await logTurn({ ts: new Date().toISOString(), sessionId, visitor, model: config.model, user: userText, reply: "",
      tools: [], rounds: 0, redacted: false, latencyMs: Date.now() - t0, error: message }).catch(() => {});
  }
  res.end();
}

const server = createServer(async (req, res) => {
  cors(req, res);
  const url = new URL(req.url ?? "/", "http://localhost");
  if (req.method === "OPTIONS") return res.writeHead(204).end();
  if (req.method === "GET" && url.pathname === "/api/health") return json(res, 200, { ok: true, model: config.model });
  if (req.method === "POST" && url.pathname === "/api/chat") return handleChat(req, res);
  json(res, 404, { error: "not found" });
});

server.listen(config.port, config.host, () => {
  console.log(`alxdnAI listening on http://${config.host}:${config.port} (model ${config.model} at ${config.llmBaseUrl})`);
});
