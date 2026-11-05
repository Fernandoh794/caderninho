#!/usr/bin/env bash
# Única coisa que a chave de deploy do GitHub Actions pode executar
# (command="/opt/caderninho/deploy/atualizar.sh" no authorized_keys).
set -euo pipefail

cd /opt/caderninho
git fetch --quiet origin main
git merge --ff-only --quiet origin/main
npm ci --omit=dev --no-audit --no-fund --silent
sudo /usr/bin/systemctl restart caderninho
sleep 5
systemctl is-active --quiet caderninho
echo "caderninho atualizado para $(git rev-parse --short HEAD)"
