// Minimal client for an OpenAI-compatible /chat/completions endpoint with streaming and tools.
// Works with Ollama's /v1 API and llama.cpp's llama-server, so the model host is swappable.
import { config } from "./config.ts";
import type { ToolSpec } from "./tools.ts";

export type ToolCall = { id: string; name: string; arguments: string };

export type LlmMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type LlmResult = { content: string; toolCalls: ToolCall[] };

export async function complete(
  messages: LlmMessage[],
  tools: ToolSpec[],
  onDelta?: (text: string) => void,
  signal?: AbortSignal,
): Promise<LlmResult> {
  const timeout = AbortSignal.timeout(config.llmTimeoutMs);
  const res = await fetch(`${config.llmBaseUrl}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    body: JSON.stringify({
      model: config.model,
      messages,
      tools: tools.length ? tools : undefined,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      stream: true,
    }),
  });
  if (!res.ok || !res.body) {
    throw new Error(`LLM request failed: ${res.status} ${await res.text().catch(() => "")}`.slice(0, 500));
  }

  let content = "";
  const calls = new Map<number, ToolCall>();
  const decoder = new TextDecoder();
  let buffer = "";

  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk as Uint8Array, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      let parsed: any;
      try {
        parsed = JSON.parse(data);
      } catch {
        continue;
      }
      const delta = parsed.choices?.[0]?.delta;
      if (!delta) continue;
      if (typeof delta.content === "string" && delta.content) {
        content += delta.content;
        onDelta?.(delta.content);
      }
      for (const tc of delta.tool_calls ?? []) {
        const i = tc.index ?? calls.size;
        const prev = calls.get(i) ?? { id: tc.id ?? `call_${i}`, name: "", arguments: "" };
        if (tc.id) prev.id = tc.id;
        if (tc.function?.name) prev.name += tc.function.name;
        if (tc.function?.arguments) {
          prev.arguments += typeof tc.function.arguments === "string" ? tc.function.arguments : JSON.stringify(tc.function.arguments);
        }
        calls.set(i, prev);
      }
    }
  }
  return { content, toolCalls: [...calls.values()].filter((c) => c.name) };
}
