#!/usr/bin/env bash
#
# Publishes the form definitions in flows/ to the WhatsApp Business Account.
#
# Three steps per flow, which is how Meta's API works: create the flow object,
# upload the JSON as its asset (this is where validation errors come back), then
# publish. A flow that already exists is updated in place rather than duplicated
# — the id is what the API sends, so it has to stay stable.
#
# The asset upload validates without publishing, so the default run is safe:
# nothing becomes visible to users until --publish is passed.
#
#   ./publish.sh                 # validate every flow, publish none
#   ./publish.sh --publish       # validate and publish
#   ./publish.sh --only sale     # just one
set -uo pipefail

cd "$(dirname "$0")"
ENV_FILE="../../apps/api/.env"
[ -f "$ENV_FILE" ] || { echo "No encuentro $ENV_FILE"; exit 1; }
set -a; source "$ENV_FILE"; set +a

WABA="${WHATSAPP_WABA_ID:?falta WHATSAPP_WABA_ID en apps/api/.env}"
TOKEN="${META_WHATSAPP_TOKEN:?falta META_WHATSAPP_TOKEN en apps/api/.env}"
VERSION="${META_GRAPH_VERSION:-v21.0}"
GRAPH="https://graph.facebook.com/$VERSION"

PUBLISH=0
ONLY=""
while [ $# -gt 0 ]; do
  case "$1" in
    --publish) PUBLISH=1 ;;
    --only) ONLY="$2"; shift ;;
    *) echo "Opción desconocida: $1"; exit 1 ;;
  esac
  shift
done

# Where the flow ids are remembered between runs, so re-publishing updates the
# same flow instead of creating a second one with the same name.
REGISTRY="flow-ids.json"
[ -f "$REGISTRY" ] || echo '{}' > "$REGISTRY"

lookup() { python3 -c "import json,sys; print(json.load(open('$REGISTRY')).get('$1',''))"; }
remember() {
  python3 - "$1" "$2" <<'PY'
import json, sys
path = 'flow-ids.json'
data = json.load(open(path))
data[sys.argv[1]] = sys.argv[2]
json.dump(data, open(path, 'w'), indent=2, sort_keys=True)
PY
}

# Flow "categories" are Meta's own taxonomy; OTHER is the only one that fits an
# internal operations form.
CATEGORY='["OTHER"]'
failures=0

for file in flows/*.json; do
  name="$(basename "$file" .json)"
  [ -n "$ONLY" ] && [ "$ONLY" != "$name" ] && continue

  echo
  echo "── $name"

  if ! python3 -c "import json,sys; json.load(open('$file'))" 2>/dev/null; then
    echo "   ✗ el JSON local no parsea"
    failures=$((failures + 1))
    continue
  fi

  id="$(lookup "$name")"
  if [ -z "$id" ]; then
    created=$(curl -s -X POST "$GRAPH/$WABA/flows" \
      -H "Authorization: Bearer $TOKEN" \
      -F "name=cryotech-$name" \
      -F "categories=$CATEGORY")
    id=$(python3 -c "import json,sys; print(json.loads('''$created''').get('id',''))" 2>/dev/null)
    if [ -z "$id" ]; then
      echo "   ✗ no se pudo crear: $created"
      failures=$((failures + 1))
      continue
    fi
    remember "$name" "$id"
    echo "   creado id=$id"
  else
    echo "   existente id=$id"
  fi

  # Uploading the asset is what validates the JSON. Errors come back here, in
  # `validation_errors`, with the exact component and property at fault.
  upload=$(curl -s -X POST "$GRAPH/$id/assets" \
    -H "Authorization: Bearer $TOKEN" \
    -F "name=flow.json" -F "asset_type=FLOW_JSON" \
    -F "file=@$file;type=application/json")

  ok=$(python3 -c "
import json
try:
    d = json.loads('''$upload''')
except Exception:
    print('parse'); raise SystemExit
if d.get('success') is True and not d.get('validation_errors'):
    print('yes')
else:
    print('no')
    for e in d.get('validation_errors', []) or []:
        print('     ', e.get('error_type',''), e.get('message',''), e.get('pointers',''))
    if 'error' in d:
        print('     ', json.dumps(d['error'])[:400])
" 2>/dev/null)

  if [ "${ok%%$'\n'*}" != "yes" ]; then
    echo "   ✗ validación falló"
    echo "$ok" | tail -n +2
    failures=$((failures + 1))
    continue
  fi
  echo "   ✓ JSON válido"

  if [ "$PUBLISH" -eq 1 ]; then
    published=$(curl -s -X POST "$GRAPH/$id/publish" -H "Authorization: Bearer $TOKEN")
    if python3 -c "import json,sys; d=json.loads('''$published'''); raise SystemExit(0 if d.get('success') else 1)" 2>/dev/null; then
      echo "   ✓ publicado"
    else
      echo "   ✗ no se pudo publicar: $published"
      failures=$((failures + 1))
    fi
  fi
done

echo
echo "Para apps/api/.env:"
echo "WHATSAPP_FLOW_IDS=$(python3 -c "import json; print(json.dumps(json.load(open('$REGISTRY')), separators=(',',':')))")"

echo
if [ "$failures" -eq 0 ]; then
  [ "$PUBLISH" -eq 1 ] && echo "Todos publicados." || echo "Todos válidos. Corre con --publish para publicarlos."
else
  echo "$failures formulario(s) con problemas."
  # "Blocked by Integrity" is not a problem with the form — it is Meta refusing
  # to release forms from an unverified business or a test number.
  if [ "$PUBLISH" -eq 1 ]; then
    echo
    echo "Si dice 'Blocked by Integrity': Meta no publica formularios mientras"
    echo "el negocio no esté verificado y el número siga siendo el de prueba."
    echo "Los diseños ya quedaron validados y creados; solo falta publicarlos."
  fi
  exit 1
fi
