#!/usr/bin/env bash
# Seed real production data for CryoTech
set -euo pipefail

API="http://localhost:3011/api"

# Credentials come from the environment, never from this file: it is committed,
# and a password written here is a password published. The account this seeds
# owns the real books.
#
#   SEED_EMAIL=... SEED_PASSWORD=... ./scripts/seed-production-data.sh
SEED_EMAIL="${SEED_EMAIL:?falta SEED_EMAIL}"
SEED_PASSWORD="${SEED_PASSWORD:?falta SEED_PASSWORD}"
SEED_FULL_NAME="${SEED_FULL_NAME:-Juan Mata}"

echo "=== 1. Register user ==="
REGISTER_RESPONSE=$(curl -s -X POST "$API/auth/register" \
  -H "Content-Type: application/json" \
  -d "$(python3 -c "
import json, os
print(json.dumps({
    'fullName': os.environ['SEED_FULL_NAME'],
    'email': os.environ['SEED_EMAIL'],
    'password': os.environ['SEED_PASSWORD'],
    'confirmPassword': os.environ['SEED_PASSWORD'],
}))" )")
echo "$REGISTER_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'User: {d.get(\"user\",{}).get(\"email\",\"already exists\")}')" 2>/dev/null || echo "$REGISTER_RESPONSE"

echo ""
echo "=== 2. Login ==="
LOGIN_RESPONSE=$(curl -s -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -d "$(python3 -c "
import json, os
print(json.dumps({'email': os.environ['SEED_EMAIL'], 'password': os.environ['SEED_PASSWORD']}))" )")
TOKEN=$(echo "$LOGIN_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")
echo "Token obtained"

echo ""
echo "=== 3. Create company ==="
COMPANY_RESPONSE=$(curl -s -X POST "$API/companies" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Granja Mata","phone":"04121234567"}')
COMPANY_ID=$(echo "$COMPANY_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null || echo "")

if [ -z "$COMPANY_ID" ]; then
  echo "Company may already exist, fetching..."
  COMPANIES=$(curl -s "$API/companies" -H "Authorization: Bearer $TOKEN")
  COMPANY_ID=$(echo "$COMPANIES" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")
fi
echo "Company ID: $COMPANY_ID"

# Re-login to get a token carrying company membership.
LOGIN_RESPONSE=$(curl -s -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -d "$(python3 -c "
import json, os
print(json.dumps({'email': os.environ['SEED_EMAIL'], 'password': os.environ['SEED_PASSWORD']}))" )")
TOKEN=$(echo "$LOGIN_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")

# Helper: all subsequent calls use these headers
HEADERS=(-H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -H "X-Company-Id: $COMPANY_ID")

echo ""
echo "=== 4. Create warehouse ==="
WH_RESPONSE=$(curl -s -X POST "$API/warehouses" "${HEADERS[@]}" \
  -d '{"name":"Principal","capacity":200,"location":"Sector Norte"}')
WH_ID=$(echo "$WH_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null || echo "")
if [ -z "$WH_ID" ]; then
  WH_LIST=$(curl -s "$API/warehouses" "${HEADERS[@]}")
  WH_ID=$(echo "$WH_LIST" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")
fi
echo "Warehouse ID: $WH_ID"

echo ""
echo "=== 5. Get measurement units and product categories ==="
UNITS=$(curl -s "$API/measurement-units" "${HEADERS[@]}")
KG_ID=$(echo "$UNITS" | python3 -c "import sys,json; print([u['id'] for u in json.load(sys.stdin) if u['abbreviation']=='kg'][0])")
UNID_ID=$(echo "$UNITS" | python3 -c "import sys,json; print([u['id'] for u in json.load(sys.stdin) if u['abbreviation']=='unid'][0])")
echo "KG Unit: $KG_ID, UNID Unit: $UNID_ID"

CATS=$(curl -s "$API/product-categories" "${HEADERS[@]}")
FEED_CAT_ID=$(echo "$CATS" | python3 -c "import sys,json; print([c['id'] for c in json.load(sys.stdin) if c['slug']=='feed'][0])")
OTHER_CAT_ID=$(echo "$CATS" | python3 -c "import sys,json; print([c['id'] for c in json.load(sys.stdin) if c['slug']=='other'][0])")
echo "Feed Cat: $FEED_CAT_ID, Other Cat: $OTHER_CAT_ID"

echo ""
echo "=== 6. Create products ==="
P1_RESPONSE=$(curl -s -X POST "$API/products" "${HEADERS[@]}" \
  -d "{\"name\":\"Alimento Inicio\",\"categoryId\":\"$FEED_CAT_ID\",\"unitId\":\"$KG_ID\",\"currentStock\":2,\"minStock\":5,\"productType\":\"consumable\"}")
P1_ID=$(echo "$P1_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "Alimento Inicio: $P1_ID"

P2_RESPONSE=$(curl -s -X POST "$API/products" "${HEADERS[@]}" \
  -d "{\"name\":\"Pollitos BB\",\"categoryId\":\"$OTHER_CAT_ID\",\"unitId\":\"$UNID_ID\",\"currentStock\":0,\"minStock\":0,\"productType\":\"consumable\"}")
P2_ID=$(echo "$P2_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "Pollitos BB: $P2_ID"

echo ""
echo "=== 7. Create batches ==="
B1_RESPONSE=$(curl -s -X POST "$API/batches" "${HEADERS[@]}" \
  -d "{\"breed\":\"Pollo de Engorde\",\"initialQuantity\":50,\"startDate\":\"2026-04-30\",\"warehouseId\":\"$WH_ID\",\"notes\":\"Lote 1 - 50 pollitos BB\"}")
B1_ID=$(echo "$B1_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "Lote 1: $B1_ID"

B2_RESPONSE=$(curl -s -X POST "$API/batches" "${HEADERS[@]}" \
  -d "{\"breed\":\"Pollo de Engorde\",\"initialQuantity\":35,\"startDate\":\"2026-05-21\",\"warehouseId\":\"$WH_ID\",\"notes\":\"Lote 2 - 35 pollitos BB\"}")
B2_ID=$(echo "$B2_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "Lote 2: $B2_ID"

echo ""
echo "=== 8. Transition batches to breeding ==="
S1=$(curl -s -X PATCH "$API/batches/$B1_ID/status" "${HEADERS[@]}" -d '{"status":"breeding"}')
echo "Lote 1 -> breeding: $(echo "$S1" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','ERROR'))" 2>/dev/null || echo "$S1")"
S2=$(curl -s -X PATCH "$API/batches/$B2_ID/status" "${HEADERS[@]}" -d '{"status":"breeding"}')
echo "Lote 2 -> breeding: $(echo "$S2" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','ERROR'))" 2>/dev/null || echo "$S2")"

echo ""
echo "=== 9. Create entries ==="
# Entry 1: 50 Pollitos BB for Lote 1
E1=$(curl -s -X POST "$API/entries" "${HEADERS[@]}" \
  -d "{\"productId\":\"$P2_ID\",\"batchId\":\"$B1_ID\",\"quantity\":50,\"entryDate\":\"2026-04-30\",\"notes\":\"50 pollitos BB para Lote 1\"}")
E1_ID=$(echo "$E1" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "Pollitos L1: $E1_ID"

# Entry 2: 40kg Alimento for Lote 1
E2=$(curl -s -X POST "$API/entries" "${HEADERS[@]}" \
  -d "{\"productId\":\"$P1_ID\",\"batchId\":\"$B1_ID\",\"quantity\":40,\"entryDate\":\"2026-04-30\",\"notes\":\"Saco 40kg para Lote 1\"}")
E2_ID=$(echo "$E2" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "Alimento L1: $E2_ID"

# Entry 3: Combined purchase cost 63850 Bs
E3=$(curl -s -X POST "$API/entries" "${HEADERS[@]}" \
  -d "{\"productId\":\"$P1_ID\",\"batchId\":\"$B1_ID\",\"quantity\":0,\"totalCost\":63850,\"entryDate\":\"2026-04-30\",\"notes\":\"Costo combinado: 50 pollitos + saco 40kg = 63640 + 210 Bs\"}")
E3_ID=$(echo "$E3" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "Costo Combinado L1: $E3_ID"

# Entry 4: 20kg Alimento (general)
E4=$(curl -s -X POST "$API/entries" "${HEADERS[@]}" \
  -d "{\"productId\":\"$P1_ID\",\"quantity\":20,\"totalCost\":11900,\"entryDate\":\"2026-05-15\",\"notes\":\"Medio saco alimento\"}")
E4_ID=$(echo "$E4" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "Medio saco: $E4_ID"

# Entry 5: 20kg Alimento for Lote 2
E5=$(curl -s -X POST "$API/entries" "${HEADERS[@]}" \
  -d "{\"productId\":\"$P1_ID\",\"batchId\":\"$B2_ID\",\"quantity\":20,\"entryDate\":\"2026-05-19\",\"notes\":\"Medio saco para Lote 2\"}")
E5_ID=$(echo "$E5" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "Alimento L2: $E5_ID"

# Entry 6: 35 Pollitos BB for Lote 2
E6=$(curl -s -X POST "$API/entries" "${HEADERS[@]}" \
  -d "{\"productId\":\"$P2_ID\",\"batchId\":\"$B2_ID\",\"quantity\":35,\"entryDate\":\"2026-05-21\",\"notes\":\"35 pollitos BB para Lote 2\"}")
E6_ID=$(echo "$E6" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "Pollitos L2: $E6_ID"

# Entry 7: Combined purchase cost L2 44100 Bs
E7=$(curl -s -X POST "$API/entries" "${HEADERS[@]}" \
  -d "{\"productId\":\"$P1_ID\",\"batchId\":\"$B2_ID\",\"quantity\":0,\"totalCost\":44100,\"entryDate\":\"2026-05-21\",\"notes\":\"Costo combinado L2: medio saco + 35 pollitos = 37690 + 700 + 5710 Bs\"}")
E7_ID=$(echo "$E7" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "Costo Combinado L2: $E7_ID"

echo ""
echo "=== 10. Receive all entries ==="
for EID in $E1_ID $E2_ID $E3_ID $E4_ID $E5_ID $E6_ID $E7_ID; do
  RES=$(curl -s -X PATCH "$API/entries/$EID/receive" "${HEADERS[@]}")
  STATUS=$(echo "$RES" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','ERROR'))" 2>/dev/null || echo "ERROR: $RES")
  echo "  $EID -> $STATUS"
done

echo ""
echo "=== 11. Create feed consumption records ==="
FC1=$(curl -s -X POST "$API/feed/consumptions" "${HEADERS[@]}" \
  -d "{\"batchId\":\"$B1_ID\",\"productId\":\"$P1_ID\",\"consumptionDate\":\"2026-05-22\",\"quantityKg\":55,\"notes\":\"Consumo estimado acumulado Lote 1 (30/04 - 22/05)\"}")
FC1_ID=$(echo "$FC1" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "Consumo L1: $FC1_ID (55 kg)"

FC2=$(curl -s -X POST "$API/feed/consumptions" "${HEADERS[@]}" \
  -d "{\"batchId\":\"$B2_ID\",\"productId\":\"$P1_ID\",\"consumptionDate\":\"2026-05-22\",\"quantityKg\":23,\"notes\":\"Consumo estimado acumulado Lote 2 (21/05 - 22/05)\"}")
FC2_ID=$(echo "$FC2" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "Consumo L2: $FC2_ID (23 kg)"

echo ""
echo "=== 12. Approve feed consumptions ==="
curl -s -X PATCH "$API/feed/consumptions/$FC1_ID/approve" "${HEADERS[@]}" | python3 -c "import sys,json; print(f'L1 consumo -> {json.load(sys.stdin).get(\"status\",\"ERROR\")}')"
curl -s -X PATCH "$API/feed/consumptions/$FC2_ID/approve" "${HEADERS[@]}" | python3 -c "import sys,json; print(f'L2 consumo -> {json.load(sys.stdin).get(\"status\",\"ERROR\")}')"

echo ""
echo "=== 13. Final verification ==="
echo ""
echo "--- Products ---"
curl -s "$API/products" "${HEADERS[@]}" | python3 -c "
import sys,json
for p in json.load(sys.stdin):
    unit = p.get('measurementUnit',{}).get('abbreviation','')
    print(f'  {p[\"name\"]}: stock={p[\"currentStock\"]} {unit}')
"

echo ""
echo "--- Batches ---"
curl -s "$API/batches" "${HEADERS[@]}" | python3 -c "
import sys,json
for b in json.load(sys.stdin):
    print(f'  {b[\"breed\"]} ({b[\"startDate\"][:10]}): qty={b[\"currentQuantity\"]}, status={b[\"status\"]}')
"

echo ""
echo "--- Entries ---"
curl -s "$API/entries" "${HEADERS[@]}" | python3 -c "
import sys,json
for e in json.load(sys.stdin):
    pname = e.get('product',{}).get('name','-')
    cost = e.get('totalCost')
    cost_str = f'cost={cost}' if cost else 'no cost'
    print(f'  {pname}: qty={e[\"quantity\"]}, {cost_str}, status={e[\"status\"]}')
"

echo ""
echo "--- Transactions ---"
curl -s "$API/transactions" "${HEADERS[@]}" | python3 -c "
import sys,json
for t in json.load(sys.stdin):
    print(f'  {t[\"type\"]}: {t[\"amount\"]} Bs ({t[\"category\"]}) src={t.get(\"sourceType\",\"-\")}')
"

echo ""
echo "--- Feed Consumptions ---"
curl -s "$API/feed/consumptions" "${HEADERS[@]}" | python3 -c "
import sys,json
for c in json.load(sys.stdin):
    pname = c.get('product',{}).get('name','-')
    print(f'  {pname}: {c[\"quantityKg\"]}kg, status={c[\"status\"]}')
"

echo ""
echo "=== DONE ==="
echo "Login: $SEED_EMAIL / la contraseña que pasaste en SEED_PASSWORD"
