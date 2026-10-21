// Talk to the agent from the terminal, with tool calls shown: npm run chat
import { createInterface } from "node:readline/promises";
import { runAgent } from "../src/agent.ts";
import type { ChatMessage } from "../src/guardrails.ts";

const rl = createInterface({ input: process.stdin, output: process.stdout });
const history: ChatMessage[] = [];
for (;;) {
  const q = (await rl.question("\nyou> ")).trim();
  if (!q || q === "exit") break;
  history.push({ role: "user", content: q });
  process.stdout.write("alxdnAI> ");
  const result = await runAgent(history, (e) => {
    if (e.type === "delta") process.stdout.write(e.text);
    if (e.type === "tool") process.stdout.write(`[${e.name}] `);
  });
  history.push({ role: "assistant", content: result.reply });
  console.log();
}
rl.close();
