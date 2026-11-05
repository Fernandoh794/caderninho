# Deploy na VM (Ubuntu, Oracle Always Free)

Pré-requisitos: Node 22.13+, git, gpg, rclone. Faça backup do bot antigo e desligue-o antes de subir este.

1. Usuário e pastas: `sudo useradd --system --create-home --home-dir /var/lib/caderninho caderninho`, clone em `/opt/caderninho` (dono `caderninho`).
2. Segredos: copie `.env.example` para `/etc/caderninho.env`, preencha, `sudo chown root:root /etc/caderninho.env && sudo chmod 600 /etc/caderninho.env`. Use `DB_PATH=/var/lib/caderninho/caderninho.db` e `AUTH_DIR=/var/lib/caderninho/auth`.
3. Serviço: `sudo cp deploy/caderninho.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now caderninho`.
4. Pareamento: `journalctl -u caderninho -f` e escaneie o QR com o WhatsApp do bot.
5. Deploy pelo Actions: gere uma chave só para isso e, em `~caderninho/.ssh/authorized_keys`, prefixe
   `command="/opt/caderninho/deploy/atualizar.sh",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty`.
   Em sudoers: `caderninho ALL=(root) NOPASSWD: /usr/bin/systemctl restart caderninho`.
   Secrets do repositório (environment `producao`): `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`, `DEPLOY_HOST`, `DEPLOY_USER`.
6. Backup: senha em `/etc/caderninho-backup.pass` (600, dono caderninho), configure o rclone e agende
   `30 3 * * * RCLONE_DESTINO=gdrive:caderninho-backups /opt/caderninho/deploy/backup.sh` no cron do usuário `caderninho`.
