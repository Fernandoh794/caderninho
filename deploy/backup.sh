#!/usr/bin/env bash
# Backup diário do SQLite: cópia consistente, criptografada com GPG e enviada pelo rclone.
# Cron (usuário caderninho): 30 3 * * * /opt/caderninho/deploy/backup.sh
set -euo pipefail

DB_PATH="${DB_PATH:-/var/lib/caderninho/caderninho.db}"
SENHA_ARQUIVO="${BACKUP_SENHA_ARQUIVO:-/etc/caderninho-backup.pass}"
DESTINO="${RCLONE_DESTINO:?defina RCLONE_DESTINO, ex.: gdrive:caderninho-backups}"
MANTER_DIAS="${MANTER_DIAS:-30}"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
nome="caderninho-$(date +%Y-%m-%d).db"

node /opt/caderninho/scripts/backup.js "$DB_PATH" "$tmp/$nome"
gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-file "$SENHA_ARQUIVO" \
  --symmetric --cipher-algo AES256 --output "$tmp/$nome.gpg" "$tmp/$nome"
rclone copy "$tmp/$nome.gpg" "$DESTINO"
rclone delete --min-age "${MANTER_DIAS}d" "$DESTINO"
echo "backup enviado: $nome.gpg"
