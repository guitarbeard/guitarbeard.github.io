#!/usr/bin/env bash
# One-time setup for alxdnAI on a fresh Ubuntu 22.04 or 24.04 server, such as an
# Oracle Cloud Always Free Ampere (ARM) VM. Run as a sudo-capable user:
#   curl -fsSL https://raw.githubusercontent.com/guitarbeard/guitarbeard.github.io/master/alxdnai/deploy/setup.sh | bash
# Then follow the Cloudflare Tunnel steps in alxdnai/README.md.
set -euo pipefail

MODEL="${LLM_MODEL:-qwen2.5:3b}"
APP_DIR=/opt/alxdnai
REPO=https://github.com/guitarbeard/guitarbeard.github.io.git

echo "==> System packages"
sudo apt-get update -y
sudo apt-get install -y curl git ca-certificates

echo "==> Node.js 22"
if ! node -v 2>/dev/null | grep -q '^v2[2-9]'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

echo "==> Ollama and the $MODEL model"
if ! command -v ollama >/dev/null; then
  curl -fsSL https://ollama.com/install.sh | sh
fi
# Keep the model loaded so the first visitor doesn't wait for it, and run one request at a time.
sudo mkdir -p /etc/systemd/system/ollama.service.d
sudo tee /etc/systemd/system/ollama.service.d/alxdnai.conf >/dev/null <<'CONF'
[Service]
Environment=OLLAMA_KEEP_ALIVE=-1
Environment=OLLAMA_NUM_PARALLEL=1
Environment=OLLAMA_HOST=127.0.0.1:11434
CONF
sudo systemctl daemon-reload
sudo systemctl restart ollama
ollama pull "$MODEL"

echo "==> App code (only the alxdnai folder)"
sudo useradd --system --create-home --home-dir /var/lib/alxdnai --shell /usr/sbin/nologin alxdnai 2>/dev/null || true
if [ ! -d "$APP_DIR/.git" ]; then
  sudo git clone --depth 1 --filter=blob:none --sparse "$REPO" "$APP_DIR"
  sudo git -C "$APP_DIR" sparse-checkout set alxdnai
fi
sudo git -C "$APP_DIR" pull --ff-only

if [ ! -f /etc/alxdnai.env ]; then
  sudo tee /etc/alxdnai.env >/dev/null <<ENV
LLM_BASE_URL=http://127.0.0.1:11434/v1
LLM_MODEL=$MODEL
PORT=8787
HOST=127.0.0.1
ALLOWED_ORIGINS=https://alxdna.dev,https://www.alxdna.dev
TRANSCRIPT_DIR=/var/lib/alxdnai/transcripts
IP_SALT=$(openssl rand -hex 16)
ENV
  sudo chmod 600 /etc/alxdnai.env
fi

echo "==> systemd service"
sudo cp "$APP_DIR/alxdnai/deploy/alxdnai.service" /etc/systemd/system/alxdnai.service
sudo systemctl daemon-reload
sudo systemctl enable --now alxdnai
sleep 2
curl -fsS http://127.0.0.1:8787/api/health && echo
echo "==> Done. alxdnAI is running on 127.0.0.1:8787. Next: Cloudflare Tunnel (see README)."
