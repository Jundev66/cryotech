#!/usr/bin/env bash
# Seed entries and feed consumptions for existing data
set -euo pipefail

API="http://localhost:3011/api"

# Credentials and record ids come from the environment. This file is committed:
# a password written here is a password published, and a hardcoded id points at
# rows that only exist in one database.
#
#   SEED_EMAIL=... SEED_PASSWORD=... \
#   SEED_COMPANY_ID=... SEED_FEED_PRODUCT_ID=... SEED_CHICK_PRODUCT_ID=... \
#   SEED_BATCH_1_ID=... SEED_BATCH_2_ID=... \
#   ./scripts/seed-entries.sh
SEED_EMAIL="${SEED_EMAIL:?falta SEED_EMAIL}"
SEED_PASSWORD="${SEED_PASSWORD:?falta SEED_PASSWORD}"

TOKEN=$(curl -s -X POST "$API/auth/login" -H "Content-Type: application/json" \
  -d "$(python3 -c "
import json, os
print(json.dumps({'email': os.environ['SEED_EMAIL'], 'password': os.environ['SEED_PASSWORD']}))" )" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")
COMPANY_ID="${SEED_COMPANY_ID:?falta SEED_COMPANY_ID}"
HEADERS=(-H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -H "X-Company-Id: $COMPANY_ID")

# Existing catalog and batch rows this seed writes against.
P1_ID="${SEED_FEED_PRODUCT_ID:?falta SEED_FEED_PRODUCT_ID}"    # Alimento Inicio
P2_ID="${SEED_CHICK_PRODUCT_ID:?falta SEED_CHICK_PRODUCT_ID}"  # Pollitos BB
B1_ID="${SEED_BATCH_1_ID:?falta SEED_BATCH_1_ID}"              # Lote 1
B2_ID="${SEED_BATCH_2_ID:?falta SEED_BATCH_2_ID}"              # Lote 2

echo "=== Creating entries ==="

# L1: 50 Pollitos BB - 30/04/2026 - 50,350 Bs (proportional cost from 63,850 total)
E1=$(curl -s -X POST "$API/entries" "${HEADERS[@]}" \
  -d "{\"productId\":\"$P2_ID\",\"batchId\":\"$B1_ID\",\"quantity\":50,\"totalCost\":50350,\"entryDate\":\"2026-04-30\",\"notes\":\"50 pollitos BB para Lote 1\"}")
E1_ID=$(echo "$E1" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "1. Pollitos L1 (50 unid, 50350 Bs): $E1_ID"

# L1: 40kg Alimento Inicio - 30/04/2026 - 13,500 Bs (rest from 63,850 total)
E2=$(curl -s -X POST "$API/entries" "${HEADERS[@]}" \
  -d "{\"productId\":\"$P1_ID\",\"batchId\":\"$B1_ID\",\"quantity\":40,\"totalCost\":13500,\"entryDate\":\"2026-04-30\",\"notes\":\"Saco 40kg para Lote 1 (parte de compra combinada 63850 Bs)\"}")
E2_ID=$(echo "$E2" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "2. Alimento L1 (40 kg, 13500 Bs): $E2_ID"

# General: 20kg Alimento - 15/05/2026 - 11,900 Bs
E3=$(curl -s -X POST "$API/entries" "${HEADERS[@]}" \
  -d "{\"productId\":\"$P1_ID\",\"quantity\":20,\"totalCost\":11900,\"entryDate\":\"2026-05-15\",\"notes\":\"Medio saco alimento\"}")
E3_ID=$(echo "$E3" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "3. Alimento general (20 kg, 11900 Bs): $E3_ID"

# L2: 20kg Alimento - 19/05/2026 - 11,900 Bs (proportional from 44,100)
E4=$(curl -s -X POST "$API/entries" "${HEADERS[@]}" \
  -d "{\"productId\":\"$P1_ID\",\"batchId\":\"$B2_ID\",\"quantity\":20,\"totalCost\":11900,\"entryDate\":\"2026-05-19\",\"notes\":\"Medio saco para Lote 2 (parte de compra combinada)\"}")
E4_ID=$(echo "$E4" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "4. Alimento L2 (20 kg, 11900 Bs): $E4_ID"

# L2: 35 Pollitos BB - 21/05/2026 - 32,200 Bs (rest from 44,100)
E5=$(curl -s -X POST "$API/entries" "${HEADERS[@]}" \
  -d "{\"productId\":\"$P2_ID\",\"batchId\":\"$B2_ID\",\"quantity\":35,\"totalCost\":32200,\"entryDate\":\"2026-05-21\",\"notes\":\"35 pollitos BB para Lote 2 (parte de compra combinada 44100 Bs)\"}")
E5_ID=$(echo "$E5" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "5. Pollitos L2 (35 unid, 32200 Bs): $E5_ID"

echo ""
echo "=== Receiving all entries ==="
for EID in $E1_ID $E2_ID $E3_ID $E4_ID $E5_ID; do
  RES=$(curl -s -X PATCH "$API/entries/$EID/receive" "${HEADERS[@]}")
  STATUS=$(echo "$RES" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','ERROR'))" 2>/dev/null || echo "ERROR: $RES")
  echo "  $EID -> $STATUS"
done

echo ""
echo "=== Adjusting stock to match reality ==="
# Total alimento bought: 40 + 20 + 20 = 80 kg
# Receive added 80 kg to stock (which started at 2)
# Real stock should be ~2 kg (78 kg consumed)
# But stock was initialized at 2, so after receiving 80kg it's 82.
# We need to deduct 80 via feed consumption to get back to 2.

echo ""
echo "=== Creating feed consumption records ==="
# L1: ~55 kg consumed (30/04 - 22/05, 23 days, 50 birds)
FC1=$(curl -s -X POST "$API/feed/consumptions" "${HEADERS[@]}" \
  -d "{\"batchId\":\"$B1_ID\",\"productId\":\"$P1_ID\",\"consumptionDate\":\"2026-05-22\",\"quantityKg\":55,\"notes\":\"Consumo estimado acumulado Lote 1 (30/04 - 22/05, 23 dias)\"}")
FC1_ID=$(echo "$FC1" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "Consumo L1: $FC1_ID (55 kg)"

# L2: ~23 kg consumed (21/05 - 22/05, 2 days, 35 birds)
FC2=$(curl -s -X POST "$API/feed/consumptions" "${HEADERS[@]}" \
  -d "{\"batchId\":\"$B2_ID\",\"productId\":\"$P1_ID\",\"consumptionDate\":\"2026-05-22\",\"quantityKg\":23,\"notes\":\"Consumo estimado acumulado Lote 2 (21/05 - 22/05, 2 dias)\"}")
FC2_ID=$(echo "$FC2" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "Consumo L2: $FC2_ID (23 kg)"

echo ""
echo "=== Approving feed consumptions (deducts stock) ==="
curl -s -X PATCH "$API/feed/consumptions/$FC1_ID/approve" "${HEADERS[@]}" | python3 -c "import sys,json; print(f'L1 -> {json.load(sys.stdin).get(\"status\",\"ERROR\")}')"
curl -s -X PATCH "$API/feed/consumptions/$FC2_ID/approve" "${HEADERS[@]}" | python3 -c "import sys,json; print(f'L2 -> {json.load(sys.stdin).get(\"status\",\"ERROR\")}')"

echo ""
echo "=== Final verification ==="
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
    cost_str = f'{cost} Bs' if cost else 'sin costo'
    print(f'  {pname}: qty={e[\"quantity\"]}, {cost_str}, status={e[\"status\"]}')
"

echo ""
echo "--- Transactions (auto-generated from entries) ---"
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
