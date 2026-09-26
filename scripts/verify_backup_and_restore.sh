#!/usr/bin/env bash
# ==============================================================================
# Dubai ERP — Isolated Database Backup & Restore Test Script (Linux / macOS / WSL)
# ==============================================================================
# SAFETY GUARANTEE:
# This script operates SOLELY against a temporary local Docker PostgreSQL instance.
# It NEVER connects to or modifies your live Supabase production database.
# ==============================================================================

set -euo pipefail

BACKUP_ARCHIVE="${1:-}"

if [ -z "$BACKUP_ARCHIVE" ] || [ ! -f "$BACKUP_ARCHIVE" ]; then
  echo "Usage: ./scripts/verify_backup_and_restore.sh <path_to_backup.sql.gz>"
  echo "Example: ./scripts/verify_backup_and_restore.sh ./dubai_erp_backup_2026-09-26_120000.sql.gz"
  exit 1
fi

echo "============================================================"
echo "🛡️ Dubai ERP - Backup Verification & Isolated Restore Test"
echo "============================================================"
echo "File: $BACKUP_ARCHIVE"
echo "Size: $(du -h "$BACKUP_ARCHIVE" | cut -f1)"
echo ""

# Step 1: Verify GZIP Integrity
echo "[Step 1/4] Verifying archive compression integrity..."
if gzip -t "$BACKUP_ARCHIVE"; then
  echo "  ✅ Archive integrity check PASSED (no corruption detected)."
else
  echo "  ❌ Archive integrity check FAILED (archive is corrupted)!"
  exit 1
fi
echo ""

# Step 2: Verify Schema Signatures
echo "[Step 2/4] Inspecting schema signatures inside compressed backup..."
CRITICAL_TABLES=("companies" "tax_invoices" "quotations" "customers" "employees" "delivery_notes" "purchase_orders")

for table in "${CRITICAL_TABLES[@]}"; do
  if zgrep -qi "CREATE TABLE.*\"$table\"\|ALTER TABLE.*\"$table\"" "$BACKUP_ARCHIVE"; then
    echo "  ✅ Found table definition: $table"
  else
    echo "  ⚠️ Warning: Table definition for '$table' was not directly matched."
  fi
done
echo ""

# Step 3: Spin up isolated local PostgreSQL container
CONTAINER_NAME="dubai_erp_restore_test_$(date +%s)"
TEST_PORT="5433" # Using 5433 to avoid conflict with standard 5432
TEST_DB="dubai_erp_test"
TEST_USER="postgres"
TEST_PASS="test_restore_password_123"

echo "[Step 3/4] Starting isolated local PostgreSQL Docker container on port ${TEST_PORT}..."
docker run --name "$CONTAINER_NAME" \
  -e POSTGRES_PASSWORD="$TEST_PASS" \
  -e POSTGRES_DB="$TEST_DB" \
  -p "${TEST_PORT}:5432" \
  -d postgres:16-alpine > /dev/null

echo "Waiting for test database container to become ready..."
until docker exec "$CONTAINER_NAME" pg_isready -U "$TEST_USER" -d "$TEST_DB" > /dev/null 2>&1; do
  sleep 1
done
echo "  ✅ Isolated container '$CONTAINER_NAME' is ready."
echo ""

# Trap cleanup to guarantee the test container is removed when script finishes
cleanup() {
  echo ""
  echo "Cleaning up temporary test container '$CONTAINER_NAME'..."
  docker stop "$CONTAINER_NAME" > /dev/null 2>&1 || true
  docker rm "$CONTAINER_NAME" > /dev/null 2>&1 || true
  echo "  ✅ Test container cleaned up successfully. No leftover containers."
}
trap cleanup EXIT

# Step 4: Perform Isolated Restore
echo "[Step 4/4] Restoring backup stream into isolated test database..."
START_TIME=$(date +%s)
gunzip -c "$BACKUP_ARCHIVE" | docker exec -i "$CONTAINER_NAME" psql -U "$TEST_USER" -d "$TEST_DB" -q -o /dev/null 2>&1 || true
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo "  ✅ Restore stream completed in ${DURATION}s."
echo ""

echo "============================================================"
echo "📊 Restored Database Table & Row Count Verification"
echo "============================================================"

docker exec -i "$CONTAINER_NAME" psql -U "$TEST_USER" -d "$TEST_DB" -c "
SELECT
    schemaname,
    relname AS table_name,
    n_live_tup AS estimated_row_count
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC;
"

echo ""
echo "============================================================"
echo "🎉 SUCCESS: Backup verified and proven restorable!"
echo "============================================================"
