#!/usr/bin/env bash
#
# Exercises the buffer against a locally running `wrangler dev`.
#
# The signature is computed over the exact bytes that get sent, which is why the
# payload is written to a file and posted with --data-binary. Using -d would let
# curl normalise newlines and the HMAC would never match.
#
#   npm run dev &         # in another shell
#   ./scripts/check-worker.sh
set -euo pipefail

BASE="${BASE:-http://localhost:8787}"
SECRET="${META_APP_SECRET:-test_app_secret_for_local_only}"
VERIFY="${META_WHATSAPP_VERIFY_TOKEN:-test_verify_token}"
PULL="${PULL_TOKEN:-test_pull_token}"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

failures=0
check() {
  if [ "$2" = "$3" ]; then
    printf '  ok   %s\n' "$1"
  else
    failures=$((failures + 1))
    printf '  FAIL %s — esperaba %s, obtuvo %s\n' "$1" "$3" "$2"
  fi
}

MSG_ID="wamid.CHECK$(date +%s)"
cat > "$TMP/payload.json" <<EOF
{"object":"whatsapp_business_account","entry":[{"id":"1","changes":[{"value":{"messaging_product":"whatsapp","messages":[{"id":"$MSG_ID","from":"584120000000","type":"text","text":{"body":"hola"}}]},"field":"messages"}]}]}
EOF

SIG="sha256=$(openssl dgst -sha256 -hmac "$SECRET" -r < "$TMP/payload.json" | cut -d' ' -f1)"

echo "1. Verificación del webhook (GET)"
code=$(curl -s -o "$TMP/o" -w '%{http_code}' "$BASE/webhook?hub.mode=subscribe&hub.verify_token=$VERIFY&hub.challenge=ABC123xyz")
check "token correcto devuelve 200" "$code" "200"
check "devuelve el challenge tal cual" "$(cat "$TMP/o")" "ABC123xyz"
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/webhook?hub.mode=subscribe&hub.verify_token=malo&hub.challenge=ABC")
check "token incorrecto devuelve 403" "$code" "403"

echo "2. Firma del webhook (POST)"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/webhook" \
  -H "content-type: application/json" -H "x-hub-signature-256: sha256=$(printf '0%.0s' {1..64})" \
  --data-binary "@$TMP/payload.json")
check "firma inválida devuelve 403" "$code" "403"

code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/webhook" \
  -H "content-type: application/json" --data-binary "@$TMP/payload.json")
check "sin firma devuelve 403" "$code" "403"

code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/webhook" \
  -H "content-type: application/json" -H "x-hub-signature-256: $SIG" \
  --data-binary "@$TMP/payload.json")
check "firma válida devuelve 200" "$code" "200"

echo "3. Autenticación de la cola"
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/pending")
check "sin bearer devuelve 401" "$code" "401"

echo "4. Drenar la cola"
curl -s "$BASE/pending?limit=10" -H "authorization: Bearer $PULL" > "$TMP/pending.json"
found=$(python3 -c "import json,sys; d=json.load(open('$TMP/pending.json')); print(sum(1 for e in d['events'] if e['id']=='$MSG_ID'))")
check "el mensaje está en la cola" "$found" "1"

echo "5. Idempotencia"
curl -s -o /dev/null -X POST "$BASE/webhook" -H "content-type: application/json" \
  -H "x-hub-signature-256: $SIG" --data-binary "@$TMP/payload.json"
curl -s "$BASE/pending?limit=50" -H "authorization: Bearer $PULL" > "$TMP/pending2.json"
found=$(python3 -c "import json,sys; d=json.load(open('$TMP/pending2.json')); print(sum(1 for e in d['events'] if e['id']=='$MSG_ID'))")
check "reenviar el mismo mensaje no lo duplica" "$found" "1"

echo "6. Confirmar procesado"
acked=$(curl -s -X POST "$BASE/ack" -H "authorization: Bearer $PULL" \
  -H 'content-type: application/json' -d "{\"ids\":[\"$MSG_ID\"]}" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['acked'])")
check "el ack marca un evento" "$acked" "1"

curl -s "$BASE/pending?limit=50" -H "authorization: Bearer $PULL" > "$TMP/pending3.json"
found=$(python3 -c "import json,sys; d=json.load(open('$TMP/pending3.json')); print(sum(1 for e in d['events'] if e['id']=='$MSG_ID'))")
check "ya no aparece como pendiente" "$found" "0"

echo "7. Eventos que no son mensajes"
cat > "$TMP/status.json" <<'EOF'
{"object":"whatsapp_business_account","entry":[{"id":"1","changes":[{"value":{"statuses":[{"id":"wamid.STATUS","status":"delivered"}]},"field":"messages"}]}]}
EOF
SIG2="sha256=$(openssl dgst -sha256 -hmac "$SECRET" -r < "$TMP/status.json" | cut -d' ' -f1)"
curl -s -o /dev/null -X POST "$BASE/webhook" -H "content-type: application/json" \
  -H "x-hub-signature-256: $SIG2" --data-binary "@$TMP/status.json"
curl -s "$BASE/pending?limit=50" -H "authorization: Bearer $PULL" > "$TMP/pending4.json"
found=$(python3 -c "import json,sys; d=json.load(open('$TMP/pending4.json')); print(sum(1 for e in d['events'] if 'STATUS' in e['id']))")
check "los acuses de entrega no entran a la cola" "$found" "0"

echo "8. Proxy de la tasa del BCV"
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/bcv")
check "sin bearer devuelve 401" "$code" "401"

# El BCV se cae con frecuencia, así que 502 es una respuesta correcta: lo que se
# comprueba aquí es que la ruta existe y exige el token, no que la fuente esté
# en pie. Si contesta 200, entonces sí tiene que traer el bloque del dólar.
code=$(curl -s -o "$TMP/bcv.html" -w '%{http_code}' "$BASE/bcv" -H "authorization: Bearer $PULL")
case "$code" in
  200)
    if grep -q 'id="dolar"' "$TMP/bcv.html"; then
      printf '  ok   la página trae el bloque del dólar\n'
    else
      failures=$((failures + 1))
      printf '  FAIL la página no trae id="dolar" — ¿cambió el markup?\n'
    fi
    ;;
  502) printf '  ok   502: el BCV no responde ahora mismo (la ruta funciona)\n' ;;
  *)
    failures=$((failures + 1))
    printf '  FAIL con bearer esperaba 200 o 502, obtuvo %s\n' "$code"
    ;;
esac

if [ "$failures" -eq 0 ]; then
  printf '\nTodo en verde.\n'
else
  printf '\n%s verificación(es) fallaron.\n' "$failures"
  exit 1
fi
