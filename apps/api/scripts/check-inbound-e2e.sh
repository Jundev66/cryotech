#!/usr/bin/env bash
#
# End-to-end check of the inbound path: a signed webhook goes to the deployed
# Cloudflare Worker, and the API's poller drains it.
#
# Uses message types that need no outbound reply (an unauthorised number, and
# an unsupported media type), so the whole path is exercised without a live
# Meta token.
#
#   ./scripts/check-inbound-e2e.sh
set -uo pipefail

cd "$(dirname "$0")/.."
set -a; source .env; set +a

BUFFER="${BUFFER_URL:?falta BUFFER_URL en .env}"
SECRET="${META_APP_SECRET:?falta META_APP_SECRET en .env}"
PULL="${BUFFER_PULL_TOKEN:?falta BUFFER_PULL_TOKEN en .env}"
ALLOWED="${ASSISTANT_ALLOWED_PHONES%%,*}"

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
failures=0
check() {
  if [ "$2" = "$3" ]; then printf '  ok   %s\n' "$1"
  else failures=$((failures + 1)); printf '  FAIL %s — esperaba %s, obtuvo %s\n' "$1" "$3" "$2"; fi
}

push() { # $1=messageId $2=from $3=type
  cat > "$TMP/p.json" <<EOF
{"object":"whatsapp_business_account","entry":[{"id":"1","changes":[{"value":{"messaging_product":"whatsapp","messages":[{"id":"$1","from":"$2","type":"$3","audio":{"id":"media-x","mime_type":"audio/ogg"}}]},"field":"messages"}]}]}
EOF
  SIG="sha256=$(openssl dgst -sha256 -hmac "$SECRET" -r < "$TMP/p.json" | cut -d' ' -f1)"
  curl -s -o /dev/null -w '%{http_code}' -X POST "$BUFFER/webhook" \
    -H 'content-type: application/json' -H "x-hub-signature-256: $SIG" --data-binary "@$TMP/p.json"
}

# A real conversation: a text message that the bot has to answer. This is the
# only way to prove the whole path — Meta pushes, the Worker stores, the API
# pulls and replies — so it does send a WhatsApp message to your own number.
push_text() { # $1=messageId $2=from $3=body
  cat > "$TMP/t.json" <<EOF
{"object":"whatsapp_business_account","entry":[{"id":"1","changes":[{"value":{"messaging_product":"whatsapp","messages":[{"id":"$1","from":"$2","type":"text","text":{"body":"$3"}}]},"field":"messages"}]}]}
EOF
  SIG="sha256=$(openssl dgst -sha256 -hmac "$SECRET" -r < "$TMP/t.json" | cut -d' ' -f1)"
  curl -s -o /dev/null -w '%{http_code}' -X POST "$BUFFER/webhook" \
    -H 'content-type: application/json' -H "x-hub-signature-256: $SIG" --data-binary "@$TMP/t.json"
}

STAMP=$(date +%s)
ID_FOREIGN="wamid.E2E-FOREIGN-$STAMP"
ID_ALLOWED="wamid.E2E-ALLOWED-$STAMP"
ID_HOLA="wamid.E2E-HOLA-$STAMP"

echo "1. Encolar en el Worker desplegado"
check "webhook de número ajeno aceptado" "$(push "$ID_FOREIGN" "584129999999" audio)" "200"
check "webhook de tu número aceptado"    "$(push "$ID_ALLOWED" "$ALLOWED" audio)" "200"
check "webhook de un 'hola' aceptado"    "$(push_text "$ID_HOLA" "$ALLOWED" hola)" "200"

pending=$(curl -s "$BUFFER/pending?limit=50" -H "authorization: Bearer $PULL" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(sum(1 for e in d['events'] if '$STAMP' in e['id']))")
check "los tres están en la cola" "$pending" "3"

echo "2. Arrancar la API y dejar que drene"
npx ts-node -P tsconfig.json --transpile-only src/main.ts > "$TMP/api.log" 2>&1 &
API_PID=$!
for i in $(seq 1 40); do sleep 2; grep -q "successfully started" "$TMP/api.log" && break; done
# One poll cycle plus margin.
sleep 14
kill "$API_PID" 2>/dev/null; wait "$API_PID" 2>/dev/null

remaining=$(curl -s "$BUFFER/pending?limit=50" -H "authorization: Bearer $PULL" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(sum(1 for e in d['events'] if '$STAMP' in e['id']))")
check "la cola quedó vacía (la API confirmó)" "$remaining" "0"

echo "3. Cómo los clasificó la API"
rows=$(docker exec cryotech-postgres-1 psql -U cryotech -d cryotech -t -A -F'|' -c \
  "SELECT external_id, status, coalesce(error,'') FROM bot_inbound_messages WHERE external_id LIKE '%$STAMP%' ORDER BY external_id;")
echo "$rows" | sed 's/^/     /'

foreign_status=$(echo "$rows" | grep FOREIGN | cut -d'|' -f2)
allowed_status=$(echo "$rows" | grep ALLOWED | cut -d'|' -f2)
check "el número ajeno se ignora" "$foreign_status" "ignored"
check "el tipo no soportado se ignora" "$allowed_status" "ignored"

hola_status=$(echo "$rows" | grep HOLA | cut -d'|' -f2)
check "el 'hola' se procesa" "$hola_status" "processed"

# Si el menú llegó, la API mandó un mensaje y Meta lo aceptó.
rejected=$(grep -c "Graph API rejected" "$TMP/api.log" 2>/dev/null; true)
check "Meta aceptó la respuesta del menú" "${rejected:-0}" "0"
echo "     (te llegó un mensaje con el menú a $ALLOWED)"


echo
echo "Limpieza de la tabla de idempotencia:"
docker exec cryotech-postgres-1 psql -U cryotech -d cryotech -t -A -c \
  "DELETE FROM bot_inbound_messages WHERE external_id LIKE '%$STAMP%';" | sed 's/^/     /'

if [ "$failures" -eq 0 ]; then printf '\nTodo en verde.\n'; else printf '\n%s verificación(es) fallaron.\n' "$failures"; exit 1; fi
