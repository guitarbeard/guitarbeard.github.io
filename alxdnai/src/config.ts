// Runtime settings, all overridable with environment variables.
const env = process.env;

export const config = {
  port: Number(env.PORT ?? 8787),
  host: env.HOST ?? "127.0.0.1",
  // Any OpenAI-compatible chat completions endpoint: Ollama (/v1) or llama.cpp's llama-server.
  llmBaseUrl: (env.LLM_BASE_URL ?? "http://127.0.0.1:11434/v1").replace(/\/$/, ""),
  model: env.LLM_MODEL ?? "qwen2.5:3b",
  temperature: Number(env.LLM_TEMPERATURE ?? 0.2),
  maxTokens: Number(env.LLM_MAX_TOKENS ?? 350),
  llmTimeoutMs: Number(env.LLM_TIMEOUT_MS ?? 90_000),
  maxToolRounds: Number(env.MAX_TOOL_ROUNDS ?? 3),
  allowedOrigins: (env.ALLOWED_ORIGINS ?? "https://alxdna.dev,https://www.alxdna.dev,http://localhost:4000,http://127.0.0.1:4000")
    .split(",").map((s) => s.trim()).filter(Boolean),
  maxInputChars: 800,
  maxHistoryMessages: 12,
  rateLimit: { windowMs: 10 * 60_000, max: Number(env.RATE_LIMIT_MAX ?? 20) },
  // A CPU box can only run one generation well at a time; extra requests wait in line.
  concurrency: Number(env.CONCURRENCY ?? 1),
  maxQueue: Number(env.MAX_QUEUE ?? 6),
  transcriptDir: env.TRANSCRIPT_DIR ?? new URL("../data/transcripts/", import.meta.url).pathname,
  ipSalt: env.IP_SALT ?? "change-me",
};
