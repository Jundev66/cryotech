#!/usr/bin/env bash
#
# Registra (o consulta) el webhook del bot de Telegram.
#
#   scripts/telegram-set-webhook.sh            # registra el de TELEGRAM_WEBHOOK_URL
#   scripts/telegram-set-webhook.sh --info     # solo muestra en qué estado está
#   scripts/telegram-set-webhook.sh --delete   # lo quita (el bot deja de recibir)
#
# Es un script y no un onModuleInit a propósito: `setWebhook` es global al bot,
# así que arrancar la API en un portátil le robaría las entregas a producción.
set -uo pipefail

cd "$(dirname "$0")/.."

ENV_FILE="apps/api/.env"
[ -f "$ENV_FILE" ] || { echo "No encuentro $ENV_FILE"; exit 1; }

# Sin `source`: sourcear el .env entero lo interpreta como shell y corrompe los
# valores con llaves o comillas. Mismo motivo que en check-api.sh.
read_env() { grep -m1 "^$1=" "$ENV_FILE" | cut -d= -f2- | sed "s/^['\"]//; s/['\"]$//"; }

TOKEN="$(read_env TELEGRAM_BOT_TOKEN)"
SECRET="$(read_env TELEGRAM_WEBHOOK_SECRET)"
URL="${TELEGRAM_WEBHOOK_URL:-$(read_env TELEGRAM_WEBHOOK_URL)}"

[ -n "$TOKEN" ] || { echo "Falta TELEGRAM_BOT_TOKEN en $ENV_FILE"; exit 1; }

API="https://api.telegram.org/bot${TOKEN}"

case "${1:-}" in
  --info)
    curl -s "${API}/getWebhookInfo" | python3 -m json.tool
    exit 0
    ;;
  --delete)
    # drop_pending_updates para no recibir de golpe todo lo acumulado al volver.
    curl -s -X POST "${API}/deleteWebhook" \
      -H 'Content-Type: application/json' \
      -d '{"drop_pending_updates":false}' | python3 -m json.tool
    exit 0
    ;;
esac

[ -n "$URL" ] || { echo "Falta TELEGRAM_WEBHOOK_URL (en el entorno o en $ENV_FILE)"; exit 1; }
[ -n "$SECRET" ] || { echo "Falta TELEGRAM_WEBHOOK_SECRET en $ENV_FILE"; exit 1; }
[ "${#SECRET}" -ge 32 ] || { echo "TELEGRAM_WEBHOOK_SECRET debe tener al menos 32 caracteres"; exit 1; }

# Telegram solo acepta A-Z a-z 0-9 _ - en secret_token: un secreto en base64
# con '+' o '/' se rechaza aquí, no en tiempo de entrega, y el bot quedaría
# mudo sin ninguna pista.
if ! printf '%s' "$SECRET" | grep -qE '^[A-Za-z0-9_-]+$'; then
  echo "TELEGRAM_WEBHOOK_SECRET tiene caracteres que Telegram no acepta."
  echo "Genera uno con: openssl rand -hex 32"
  exit 1
fi

echo "Registrando $URL"

# allowed_updates acotado: sin esto llegan ediciones, altas de miembros y
# reacciones, que solo engordan el libro de idempotencia. web_app_data viaja
# dentro de "message", así que no necesita su propia entrada.
RESPONSE="$(curl -s -X POST "${API}/setWebhook" \
  -H 'Content-Type: application/json' \
  -d "$(python3 -c '
import json, sys
print(json.dumps({
    "url": sys.argv[1],
    "secret_token": sys.argv[2],
    "allowed_updates": ["message", "callback_query"],
    "max_connections": 10,
}))' "$URL" "$SECRET")")"

echo "$RESPONSE" | python3 -m json.tool

printf '%s' "$RESPONSE" | grep -q '"ok":true' || exit 1

echo
echo "Estado actual:"
curl -s "${API}/getWebhookInfo" | python3 -m json.tool
