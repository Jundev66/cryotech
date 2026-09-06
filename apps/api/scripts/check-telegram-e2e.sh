#!/usr/bin/env bash
#
# Verifica el camino de entrada de Telegram de punta a punta: un update llega
# al webhook de la API y termina clasificado en bot_inbound_messages.
#
# Sin Worker de por medio. Telegram entrega directo y se autentica con un
# secreto en cabecera, así que lo único que hay que probar es esta API.
#
# Necesita la base de datos levantada (`make dev-db`). El 'hola' final sí manda
# un mensaje de verdad, así que solo se comprueba si hay TELEGRAM_BOT_TOKEN.
#
#   ./scripts/check-telegram-e2e.sh
set -uo pipefail

cd "$(dirname "$0")/.."

ENV_FILE=".env"
[ -f "$ENV_FILE" ] || { echo "No encuentro apps/api/.env"; exit 1; }

# Sin `source`: sourcear el .env entero lo interpreta como shell y a
# WHATSAPP_FLOW_IDS le quita las comillas hasta dejarlo sin ser JSON.
read_env() { grep -m1 "^$1=" "$ENV_FILE" | cut -d= -f2- | sed "s/^['\"]//; s/['\"]$//"; }

SECRET="$(read_env TELEGRAM_WEBHOOK_SECRET)"
BOT_TOKEN="$(read_env TELEGRAM_BOT_TOKEN)"
ALLOWED_RAW="$(read_env ASSISTANT_ALLOWED_TELEGRAM_IDS)"
ALLOWED="${ALLOWED_RAW%%,*}"
PORT="$(read_env PORT)"; PORT="${PORT:-3011}"

[ -n "$SECRET" ] || { echo "Falta TELEGRAM_WEBHOOK_SECRET en apps/api/.env"; exit 1; }
[ -n "$ALLOWED" ] || { echo "Falta ASSISTANT_ALLOWED_TELEGRAM_IDS en apps/api/.env"; exit 1; }

URL="http://127.0.0.1:${PORT}/api/telegram/webhook"
PSQL=(docker exec cryotech-postgres-1 psql -U cryotech -d cryotech -t -A)

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
failures=0
check() {
  if [ "$2" = "$3" ]; then printf '  ok   %s\n' "$1"
  else failures=$((failures + 1)); printf '  FAIL %s — esperaba %s, obtuvo %s\n' "$1" "$3" "$2"; fi
}

post() { # $1=json $2=cabecera-secreto (vacío = sin cabecera)
  if [ -n "${2:-}" ]; then
    curl -s -o /dev/null -w '%{http_code}' -X POST "$URL" \
      -H 'content-type: application/json' -H "x-telegram-bot-api-secret-token: $2" -d "$1"
  else
    curl -s -o /dev/null -w '%{http_code}' -X POST "$URL" -H 'content-type: application/json' -d "$1"
  fi
}

STAMP=$(date +%s)
ID_FOREIGN=$((STAMP * 10 + 1))
ID_UNSUPPORTED=$((STAMP * 10 + 2))
ID_HOLA=$((STAMP * 10 + 3))

update_text() { printf '{"update_id":%s,"message":{"message_id":1,"chat":{"id":%s},"text":"%s"}}' "$1" "$2" "$3"; }
# Un update sin texto, sin foto y sin documento: llega, se registra y no se
# contesta. Ejercita el camino entero sin gastar un mensaje de salida.
update_empty() { printf '{"update_id":%s,"message":{"message_id":1,"chat":{"id":%s}}}' "$1" "$2"; }

echo "1. Arrancar la API"
npx ts-node -P tsconfig.json --transpile-only src/main.ts > "$TMP/api.log" 2>&1 &
API_PID=$!
trap 'kill "$API_PID" 2>/dev/null; rm -rf "$TMP"' EXIT

for _ in $(seq 1 40); do
  sleep 1
  curl -s -o /dev/null "http://127.0.0.1:${PORT}/api/health" && break
done
curl -s -o /dev/null "http://127.0.0.1:${PORT}/api/health" \
  || { echo "  FAIL la API no arrancó:"; tail -20 "$TMP/api.log"; exit 1; }
echo "  ok   la API responde en :$PORT"

echo "2. Autenticación del webhook"
check "sin cabecera de secreto → 403" "$(post "$(update_empty 1 "$ALLOWED")")" "403"
check "con secreto incorrecto → 403" "$(post "$(update_empty 2 "$ALLOWED")" "no-es-el-secreto-pero-es-largo-igual")" "403"
check "con el secreto correcto → 200" "$(post "$(update_empty "$ID_UNSUPPORTED" "$ALLOWED")" "$SECRET")" "200"

echo "3. Entrega y clasificación"
check "un chat ajeno también se acepta" "$(post "$(update_text "$ID_FOREIGN" 999000111222 hola)" "$SECRET")" "200"
# Reenviar el mismo update_id es lo que hace Telegram cuando duda de la entrega.
check "reenviar el mismo update → 200" "$(post "$(update_empty "$ID_UNSUPPORTED" "$ALLOWED")" "$SECRET")" "200"

if [ -n "$BOT_TOKEN" ]; then
  check "un 'hola' se acepta" "$(post "$(update_text "$ID_HOLA" "$ALLOWED" hola)" "$SECRET")" "200"
else
  echo "  --   sin TELEGRAM_BOT_TOKEN: me salto el 'hola' (mandaría un mensaje real)"
fi

# El webhook responde 200 antes de terminar el trabajo, así que hay que esperar.
sleep 6

rows=$("${PSQL[@]}" -F'|' -c \
  "SELECT external_id, status, coalesce(error,'') FROM bot_inbound_messages
   WHERE channel = 'telegram' AND external_id IN ('$ID_FOREIGN','$ID_UNSUPPORTED','$ID_HOLA')
   ORDER BY external_id;" 2>/dev/null)
echo "$rows" | sed 's/^/     /'

foreign_status=$(echo "$rows" | grep "^$ID_FOREIGN|" | cut -d'|' -f2)
unsupported_status=$(echo "$rows" | grep "^$ID_UNSUPPORTED|" | cut -d'|' -f2)
check "el chat no autorizado se ignora" "$foreign_status" "ignored"
check "el update que no sabemos leer se ignora" "$unsupported_status" "ignored"

duplicates=$("${PSQL[@]}" -c \
  "SELECT count(*) FROM bot_inbound_messages
   WHERE channel = 'telegram' AND external_id = '$ID_UNSUPPORTED';" 2>/dev/null | tr -d ' ')
check "el update reenviado no se registró dos veces" "$duplicates" "1"

if [ -n "$BOT_TOKEN" ]; then
  hola_status=$(echo "$rows" | grep "^$ID_HOLA|" | cut -d'|' -f2)
  check "el 'hola' se procesa" "$hola_status" "processed"
  rejected=$(grep -c "Bot API rejected" "$TMP/api.log" 2>/dev/null; true)
  check "Telegram aceptó la respuesta del menú" "${rejected:-0}" "0"
  echo "     (te llegó un mensaje con el menú al chat $ALLOWED)"
fi

echo
echo "Limpieza de la tabla de idempotencia:"
"${PSQL[@]}" -c \
  "DELETE FROM bot_inbound_messages WHERE channel = 'telegram'
   AND external_id IN ('$ID_FOREIGN','$ID_UNSUPPORTED','$ID_HOLA');" | sed 's/^/     /'

if [ "$failures" -eq 0 ]; then printf '\nTodo en verde.\n'; else printf '\n%s verificación(es) fallaron.\n' "$failures"; exit 1; fi
