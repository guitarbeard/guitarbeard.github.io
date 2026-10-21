// Replies that don't need the model: meows, greetings, thanks, and questions about alxdnAI itself.
// Small models answer these badly (a greeting got a dump of work history), and they're instant here.
import { isMeow, meowReply } from "./meow.ts";

const SKIMS = "You could ask what Alex built for SKIMS, or what his tech stack is.";

// Each pattern has to match the whole message, so "hi, what did Alex build for SKIMS?" still goes to the model.
const CANNED: { test: RegExp; reply: string }[] = [
  { test: /^(hi+|hello+|hey+|hiya|howdy|yo|hola|bonjour|greetings|good (morning|afternoon|evening))( there| alxdnai)?$/,
    reply: `Hi! I'm alxdnAI, and I answer questions about Alex Medina's work. ${SKIMS}` },
  { test: /^((hi|hey|hello) )?(how are you( doing)?( today)?|how('s| is) it going|how are things|what's up|whats up|sup|wassup)$/,
    reply: `I'm doing well, thanks for asking! ${SKIMS}` },
  { test: /^(thanks?( you)?( so much| a lot)?|thx|ty|cheers|appreciate it|much appreciated)$/,
    reply: "You're welcome! If you'd like to talk to Alex directly, email him at alxdna@gmail.com." },
  { test: /^(ok(ay)?|k|cool|nice|great|neat|awesome|got it|sounds good|interesting|wow)$/,
    reply: "Anything else you'd like to know? You could ask about Alex's Shopify work, Maps On Maps, or how he built me." },
  { test: /^(bye|goodbye|see ya|see you|later|cya|good night)$/,
    reply: "Thanks for stopping by! You can reach Alex at alxdna@gmail.com." },
  { test: /^((who|what) are you|what is (this|alxdnai)|who is alxdnai|are you (a bot|an ai|human|real))$/,
    reply: `I'm alxdnAI, the assistant on Alex Medina's site. Alex built me on an open-weights model running on his own server, and I answer questions about his work. ${SKIMS}` },
  { test: /^(who am i|do you know (who i am|me)|what('s| is) my name)$/,
    reply: `I can't see who you are. I only know about Alex. ${SKIMS}` },
];

export function cannedReply(text: string, random = Math.random): string | null {
  if (isMeow(text)) return meowReply(random);
  const said = text.toLowerCase().replace(/[’']/g, "'").replace(/[^\p{L}\p{N}' ]+/gu, " ").replace(/\s+/g, " ").trim();
  return CANNED.find((c) => c.test.test(said))?.reply ?? null;
}
