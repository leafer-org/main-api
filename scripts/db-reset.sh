#!/usr/bin/env bash
set -euo pipefail

echo "=== Stopping all services... ==="
docker compose down --volumes 2>/dev/null || true

echo "=== Starting all services... ==="
docker compose up -d
echo "Waiting for services to be healthy..."

until docker compose exec postgres pg_isready -U devuser -d devdb > /dev/null 2>&1; do
  sleep 1
done
echo "  ✓ Postgres"

until docker compose exec redis redis-cli ping > /dev/null 2>&1; do
  sleep 1
done
echo "  ✓ Redis"

until docker compose exec redpanda rpk cluster health --exit-when-healthy > /dev/null 2>&1; do
  sleep 1
done
echo "  ✓ Redpanda"

until curl -sf http://localhost:7700/health > /dev/null 2>&1; do
  sleep 1
done
echo "  ✓ Meilisearch"

until curl -sf http://localhost:9000/minio/health/live > /dev/null 2>&1; do
  sleep 1
done
echo "  ✓ MinIO"

echo "=== Running migrations... ==="
npx drizzle-kit migrate

echo "=== Running DB seeds... ==="
npx tsx scripts/seed.ts

echo "=== Starting API server... ==="
yarn build
node dist/apps/main.js &
SERVER_PID=$!

# Wait for server to accept connections
echo "  Waiting for API server..."
for i in $(seq 1 30); do
  if curl -so /dev/null http://localhost:3012/cms/cities 2>/dev/null; then
    break
  fi
  sleep 1
done
echo "  ✓ API server ready (PID: $SERVER_PID)"

echo "=== Running CMS seeds... ==="
npx tsx scripts/seed-cms.ts

echo "=== Stopping API server... ==="
kill $SERVER_PID 2>/dev/null || true
wait $SERVER_PID 2>/dev/null || true

echo ""
echo "=== Done! All seeds applied. ==="
