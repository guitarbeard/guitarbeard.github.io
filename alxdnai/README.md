# alxdnAI

The agent that answers visitors' questions on [alxdna.dev](https://alxdna.dev). It runs an open-weights model on my own server, looks facts up with tools instead of guessing, keeps private details out of its replies, and has to pass an eval suite before any change ships. No paid AI API is involved.

```
browser widget (alxdnai.js)
   │  POST /api/chat, streamed back as Server-Sent Events
   ▼
Cloudflare Tunnel (ai.alxdna.dev, no open ports on the server)
   ▼
alxdnAI server (Node 22 + TypeScript, no dependencies)
   ├─ agent loop: routed prefetch → model → tool calls → tool results → model → answer
   ├─ tools: search_work, get_profile, get_contact (read knowledge/*.json)
   ├─ guardrails: input limits, phone-number redaction on the stream, rate limits, a one-at-a-time queue
   └─ transcripts: data/transcripts/YYYY-MM-DD.jsonl (salted visitor hash, no IPs)
   ▼
Ollama serving Qwen2.5 3B (OpenAI-compatible /v1 API) on an Oracle Cloud Always Free ARM VM
```

## How it works

**Knowledge, not training.** Everything the agent knows is in `knowledge/profile.json` and `knowledge/work.json`, which are written by hand from my resume and this site. Fine-tuning a small model on a resume makes it confidently wrong. Retrieval through tools keeps every answer traceable, and updating it means editing JSON. There is no phone number in either file, and a unit test enforces that.

**Tools.** The model gets three function-calling tools:

| Tool | What it returns |
| --- | --- |
| `search_work(query)` | The top three matching jobs, client projects, or personal projects, scored by keyword overlap with titles, tags, and summaries |
| `get_profile(section)` | One of summary, skills, education, about, availability, or timeline |
| `get_contact()` | Email, LinkedIn, GitHub, and the resume link |

Small models often skip tools and answer from memory, so before the model's first turn the agent routes the question to the tools it most likely needs (a keyword router plus a search) and runs them itself. The model reads those results and can call more tools if they don't cover the question. The loop allows up to three tool rounds, then withholds tools so the model has to answer.

**Guardrails that don't rely on the prompt.** The system prompt asks the model to stay on topic and never share a phone number, but small models don't always listen. So the server also redacts anything shaped like a phone number from the streamed reply (holding back a short tail so a number split across chunks is still caught), caps input length and history, rate-limits each visitor, and queues requests so a CPU-only box never runs two generations at once.

**Model host is swappable.** The server speaks the OpenAI-compatible `/chat/completions` API, so it runs against Ollama in production and llama.cpp's `llama-server` in development. Changing models is one environment variable.

## Evals

`evals/cases.json` holds 31 cases across facts, contact, privacy, honesty (questions it should *not* be able to answer), scope (off-topic and prompt injection), multi-turn, and style. Each case says which tools must be called, which phrases must appear, and which patterns must never appear. The checks are deterministic, so a run is cheap and repeatable.

```sh
npm run eval                 # all cases
npm run eval -- --only privacy   # one category or id
npm run eval -- --repeat 3       # catch flaky cases
```

Results land in `evals/results/latest.json`. See [EVALS.md](EVALS.md) for what failed on the first runs and how each failure was fixed.

## Reviewing real conversations

```sh
npm run review -- --days 7
```

This reads the transcript logs and flags turns worth a look: errors, redactions, answers given without a tool call, "I don't know" replies, refusals, slow replies, and long replies. Each real failure becomes a new eval case before it gets fixed.

## Running it locally

Needs Node 22.18 or newer (TypeScript runs natively, with no build step) and a model server.

```sh
ollama pull qwen2.5:3b          # or run llama.cpp's llama-server with --jinja
cd alxdnai
npm test                        # unit tests, no model needed
npm run chat                    # talk to it in the terminal
npm start                       # API on http://127.0.0.1:8787
```

For llama-server, set `LLM_BASE_URL=http://127.0.0.1:8080/v1`. To try the widget against a local API, serve the site on port 4000 and open `http://localhost:4000/?ai=http://127.0.0.1:8787`.

Settings live in `src/config.ts` and can be overridden with environment variables (`LLM_MODEL`, `LLM_BASE_URL`, `ALLOWED_ORIGINS`, `RATE_LIMIT_MAX`, and so on).

## Deploying (free)

1. **Create the VM.** In Oracle Cloud, create an Always Free *Ampere A1* instance (up to 4 OCPUs and 24 GB RAM) with Ubuntu 24.04. No inbound ports beyond SSH are needed. Oracle can reclaim Always Free VMs that sit idle, and upgrading the account to Pay As You Go (still free within the Always Free limits) prevents that.
2. **Install everything.** SSH in and run:
   ```sh
   curl -fsSL https://raw.githubusercontent.com/guitarbeard/guitarbeard.github.io/master/alxdnai/deploy/setup.sh | bash
   ```
   That installs Node 22 and Ollama, pulls the model, checks out just this folder to `/opt/alxdnai`, writes `/etc/alxdnai.env`, and starts the `alxdnai` systemd service on `127.0.0.1:8787`.
3. **Expose it with Cloudflare Tunnel** (alxdna.dev's DNS is already on Cloudflare):
   ```sh
   curl -L -o cf.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb
   sudo dpkg -i cf.deb
   cloudflared tunnel login                     # open the printed link and pick alxdna.dev
   cloudflared tunnel create alxdnai
   cloudflared tunnel route dns alxdnai ai.alxdna.dev
   # The system service reads /etc/cloudflared, so put the credentials and config there.
   ID=$(cloudflared tunnel list | awk '/alxdnai/{print $1}')
   sudo mkdir -p /etc/cloudflared && sudo cp ~/.cloudflared/$ID.json /etc/cloudflared/
   sed "s/TUNNEL_ID/$ID/g" /opt/alxdnai/alxdnai/deploy/cloudflared.yml | sudo tee /etc/cloudflared/config.yml
   sudo cloudflared service install
   ```
4. **Check it.** `curl https://ai.alxdna.dev/api/health` should return `{"ok":true,...}`. The site's widget checks the same URL and only shows the "Ask alxdnAI" button when it answers.

To ship a change: run `npm test` and `npm run eval`, merge, then run `deploy/update.sh` on the server.
