#!/usr/bin/env bash
#
# Corre las suites de verificación de la API y resume.
#
# Corren contra "ZZ Empresa de Pruebas", que cada suite crea la primera vez y
# después reutiliza. Correrlas contra la empresa real fue lo que adelantó la
# numeración de ventas cincuenta números y descuadró el inventario.
#
#   scripts/check-api.sh          # todas
#   scripts/check-api.sh wizard   # solo las que coincidan
set -uo pipefail

cd "$(dirname "$0")/.."

ENV_FILE="apps/api/.env"
[ -f "$ENV_FILE" ] || { echo "No encuentro $ENV_FILE"; exit 1; }

# Se leen las dos variables que hacen falta, sin `source`. Sourcear el .env
# entero lo interpreta como shell: a `WHATSAPP_FLOW_IDS={"sale":"109..."}` le
# quita las comillas y lo deja como `{sale:109...}`, que ya no es JSON. Esa
# corrupción hacía que los formularios parecieran no estar publicados.
read_env() { grep -m1 "^$1=" "$ENV_FILE" | cut -d= -f2- | sed "s/^['\"]//; s/['\"]$//"; }

# Sin companyId: cada suite resuelve la empresa de pruebas por su cuenta.
# Correr contra la empresa real fue lo que adelantó la numeración de ventas
# cincuenta números y descuadró el inventario de beneficiados. Para
# reproducir algo contra datos reales, se le pasa el id a la suite.

API_PORT="$(read_env PORT)"
API_PORT="${API_PORT:-3011}"
if ! curl -s -o /dev/null --max-time 3 "http://localhost:$API_PORT/api/payables"; then
  echo "La API no responde en :$API_PORT — arráncala con 'make dev' y vuelve a intentar."
  exit 1
fi

FILTER="${1:-}"

# `check-tenancy` va primera y aparte del resto: crea sus dos empresas de la
# nada y no toca la de pruebas. Si el aislamiento entre empresas está roto, todo
# lo que venga después mide sobre datos que pueden estar contaminados.
#
# En orden de qué tan adentro llegan: primero el asistente y los formularios,
# después el dinero, al final las consultas.
SUITES=(
  check-tenancy
  check-wizard
  check-telegram
  check-assistant-e2e
  check-flows
  check-payables
  check-purchases
  check-treasury
  check-queue
  check-receivables
)

total_ok=0
total_fail=0
failed_suites=()

for suite in "${SUITES[@]}"; do
  [ -n "$FILTER" ] && [[ "$suite" != *"$FILTER"* ]] && continue

  printf '  %-22s' "$suite"
  output=$(cd apps/api && npx ts-node -P tsconfig.json --transpile-only "scripts/$suite.ts" 2>&1)
  status=$?

  # `grep -c` imprime 0 pero sale con 1 cuando no hay coincidencias, así que
  # `|| echo 0` agregaría un segundo cero. Se traga el código de salida.
  ok=$(printf '%s' "$output" | grep -cE '^  ok' ; true)
  bad=$(printf '%s' "$output" | grep -cE '^  FAIL' ; true)

  # Contar solo las líneas era mirar por la ventana equivocada: una suite que
  # revienta a mitad no imprime ningún FAIL, así que salía "todas en verde"
  # habiendo corrido la mitad de las comprobaciones. Lo que no llegó a correr
  # no pasó.
  if [ "$status" -ne 0 ] && [ "$bad" -eq 0 ]; then
    bad=1
    crashed=1
  else
    crashed=0
  fi

  total_ok=$((total_ok + ok))
  total_fail=$((total_fail + bad))

  if [ "$bad" -eq 0 ]; then
    printf '%3s ok\n' "$ok"
  else
    printf '%3s ok, %s FAIL\n' "$ok" "$bad"
    failed_suites+=("$suite")
    if [ "$crashed" -eq 1 ]; then
      printf '      la suite se cortó (salida %s) — las últimas líneas:\n' "$status"
      printf '%s' "$output" | tail -n 6 | sed 's/^/      /'
    else
      printf '%s' "$output" | grep -E '^  FAIL' | sed 's/^/      /'
    fi
  fi
done

# Estas dos van aparte: una necesita bash y la otra el Worker desplegado.
if [ -z "$FILTER" ] || [[ "check-security" == *"$FILTER"* ]]; then
  printf '  %-22s' "check-security"
  output=$(cd apps/api && bash scripts/check-security.sh 2>&1)
  status=$?
  ok=$(printf '%s' "$output" | grep -cE '^  ok' ; true)
  bad=$(printf '%s' "$output" | grep -cE '^  FAIL' ; true)
  [ "$status" -ne 0 ] && [ "$bad" -eq 0 ] && bad=1
  total_ok=$((total_ok + ok)); total_fail=$((total_fail + bad))
  [ "$bad" -eq 0 ] && printf '%3s ok\n' "$ok" || { printf '%3s ok, %s FAIL\n' "$ok" "$bad"; failed_suites+=(check-security); }
fi

echo
if [ "$total_fail" -eq 0 ]; then
  echo "  $total_ok verificaciones, todas en verde."
else
  echo "  $total_fail fallaron de $((total_ok + total_fail)): ${failed_suites[*]}"
  exit 1
fi
