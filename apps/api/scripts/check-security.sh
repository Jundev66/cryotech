#!/usr/bin/env bash
#
# Verifies the tenant-isolation and session fixes over real HTTP.
#
# Registers a throwaway user, points it at the main company's UUID, and checks
# it cannot read it. Also checks that the refresh token round-trips, which it
# did not: the client sent it as a bearer header while the API read it from the
# body, so every refresh failed and logged the user out after 15 minutes.
#
#   API=http://localhost:3011/api ./scripts/check-security.sh <victimCompanyId>
set -uo pipefail

API="${API:-http://localhost:3011/api}"
ENV_FILE="$(dirname "$0")/../.env"

# One door to the database. `psql` when available, otherwise the Compose
# container — whose name depends on the project directory, so it is asked for.
db_url() {
  if [ -n "${DATABASE_URL:-}" ]; then echo "$DATABASE_URL"; return; fi
  [ -f "$ENV_FILE" ] && grep -m1 '^DATABASE_URL=' "$ENV_FILE" | cut -d= -f2-
}

query_db() {
  local url; url="$(db_url)"
  if [ -n "$url" ] && command -v psql >/dev/null 2>&1; then
    psql "$url" -t -A -c "$1" 2>/dev/null
    return
  fi
  local container="${PG_CONTAINER:-$(docker compose ps -q postgres 2>/dev/null)}"
  [ -n "$container" ] || return 1
  docker exec "$container" psql -U "${PG_USER:-cryotech}" -d "${PG_DB:-cryotech}" -t -A -c "$1" 2>/dev/null
}

# Aquí sí conviene la empresa real: lo que se prueba es que un desconocido no
# pueda leer **tus** datos. Solo lee — el usuario de prueba que registra es lo
# único que se crea, y se borra al final.
VICTIM_COMPANY="${1:-$(grep -m1 '^ASSISTANT_COMPANY_ID=' "$(dirname "$0")/../.env" | cut -d= -f2)}"
# A fresh clone has no ASSISTANT_COMPANY_ID, and `check-api.sh` calls this with
# no argument, so without this fallback the suite never ran. The test company
# works just as well: what is checked is that a stranger cannot read data that
# is not theirs.
if [ -z "$VICTIM_COMPANY" ]; then
  VICTIM_COMPANY="$(query_db "SELECT id FROM companies WHERE name='ZZ Empresa de Pruebas' LIMIT 1;")"
fi
[ -n "$VICTIM_COMPANY" ] || {
  echo "usage: check-security.sh <companyId>"
  echo "  (sin argumento busca ASSISTANT_COMPANY_ID en apps/api/.env y, si no,"
  echo "   la empresa de pruebas — que crea cualquier suite de scripts/check-*)"
  exit 1
}
STAMP="$(date +%s)"
EMAIL="zz-check-${STAMP}@example.test"
# Generada en cada ejecución, nunca escrita en el repositorio.
#
# Antes era la constante `ZzCheck.2026`, y eso convirtió a este script —que
# existe para comprobar la seguridad— en el agujero más grande que tenía el
# sistema: cada ejecución dejaba una cuenta real viva, la limpieza era una línea
# impresa por pantalla que nadie ejecutaba, y al publicar la API en internet
# quedaron veinte cuentas cuya contraseña estaba en el repositorio para quien
# quisiera leerla. La contraseña se genera al vuelo y la cuenta se borra sola.
PASS="Zz$(openssl rand -hex 8)."

# Se borra pase lo que pase: con `set -e`, con un curl colgado, o con Ctrl-C a
# mitad. Dejarlo como instrucción impresa al final fue exactamente lo que falló.
cleanup() {
  local status=$?
  query_db "DELETE FROM refresh_tokens WHERE user_id IN (SELECT id FROM users WHERE email='$EMAIL'); DELETE FROM users WHERE email='$EMAIL';" >/dev/null 2>&1

  # Que la limpieza falle no puede pasar en silencio: la cuenta se queda viva y
  # nadie se entera, que es como llegamos hasta aquí.
  if leftover=$(check_user_exists) && [ "$leftover" = "1" ]; then
    printf '\n  AVISO: no pude borrar %s — bórralo a mano antes de seguir.\n' "$EMAIL"
    status=1
  fi
  exit $status
}

check_user_exists() {
  query_db "SELECT count(*) FROM users WHERE email='$EMAIL';"
}

trap cleanup EXIT INT TERM

# One field out of a JSON response. Node, not python3: node is already a
# requirement, and on Windows `python3` is a Store alias that fails.
json_field() {
  node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{process.stdout.write(String(JSON.parse(s)[process.argv[1]]??''))}catch{}})" "$1"
}

failures=0
check() {
  if [ "$2" = "$3" ]; then printf '  ok   %s\n' "$1"
  else failures=$((failures + 1)); printf '  FAIL %s — esperaba %s, obtuvo %s\n' "$1" "$3" "$2"; fi
}

echo "1. Usuario ajeno intenta leer tu empresa"
REG=$(curl -s -X POST "$API/auth/register" -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"confirmPassword\":\"$PASS\",\"fullName\":\"ZZ Check\"}")
TOKEN=$(printf '%s' "$REG" | json_field accessToken)
REFRESH=$(printf '%s' "$REG" | json_field refreshToken)

if [ -z "$TOKEN" ]; then
  echo "  no pude registrar el usuario de prueba: $REG"
  exit 1
fi

code=$(curl -s -o /dev/null -w '%{http_code}' "$API/companies/$VICTIM_COMPANY" \
  -H "Authorization: Bearer $TOKEN")
check "no puede leer una empresa que no es suya" "$code" "404"

code=$(curl -s -o /dev/null -w '%{http_code}' "$API/sales" \
  -H "Authorization: Bearer $TOKEN" -H "X-Company-Id: $VICTIM_COMPANY")
check "no puede listar ventas ajenas" "$code" "403"

code=$(curl -s -o /dev/null -w '%{http_code}' "$API/treasury/accounts" \
  -H "Authorization: Bearer $TOKEN" -H "X-Company-Id: $VICTIM_COMPANY")
check "no puede ver la tesorería ajena" "$code" "403"

code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/assistant/simulate" \
  -H "Authorization: Bearer $TOKEN" -H "X-Company-Id: $VICTIM_COMPANY" \
  -H 'content-type: application/json' -d '{"imageBase64":"x"}')
check "no puede usar el asistente contra una empresa ajena" "$code" "403"

echo "2. Refresh de sesión"
REFRESHED=$(curl -s -X POST "$API/auth/refresh" -H 'content-type: application/json' \
  -d "{\"refreshToken\":\"$REFRESH\"}")
NEW_TOKEN=$(printf '%s' "$REFRESHED" | json_field accessToken)
check "el refresh devuelve un token nuevo" "$([ -n "$NEW_TOKEN" ] && echo yes || echo no)" "yes"

code=$(curl -s -o /dev/null -w '%{http_code}' "$API/users/me" -H "Authorization: Bearer $NEW_TOKEN")
check "el token nuevo sirve" "$code" "200"

echo "3. Sin autenticar"
code=$(curl -s -o /dev/null -w '%{http_code}' "$API/companies/$VICTIM_COMPANY")
check "no se puede leer una empresa sin token" "$code" "401"

if [ "$failures" -eq 0 ]; then printf '\nTodo en verde.\n'; else printf '\n%s verificación(es) fallaron.\n' "$failures"; exit 1; fi
