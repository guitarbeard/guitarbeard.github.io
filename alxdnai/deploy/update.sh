#!/usr/bin/env bash
# Pull the latest alxdnAI code and restart. Run on the server after merging changes.
set -euo pipefail
sudo git -C /opt/alxdnai pull --ff-only
sudo systemctl restart alxdnai
sleep 2
curl -fsS http://127.0.0.1:8787/api/health && echo
