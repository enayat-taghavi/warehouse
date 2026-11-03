#!/usr/bin/env bash
# Prepare a Claude Code cloud session (Ubuntu) for backend tests and frontend specs.
# Idempotent; run once per session before tests: bash scripts/cloud/setup_cloud_env.sh
# The database role and password are the development defaults from backend/config/settings.py.
set -euo pipefail
cd "$(dirname "$0")/../.."
export DEBIAN_FRONTEND=noninteractive

# root or sudo: commands as root, and as the postgres user
if [ "$(id -u)" -eq 0 ]; then
  as_root() { "$@"; }
  as_pg() { runuser -u postgres -- "$@"; }
else
  as_root() { sudo "$@"; }
  as_pg() { sudo -u postgres "$@"; }
fi

if ! command -v pg_ctlcluster >/dev/null 2>&1; then
  as_root apt-get update -qq
  as_root apt-get install -y -qq postgresql postgresql-contrib
fi
as_root service postgresql start
as_pg psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='warehouse_user'" | grep -q 1 \
  || as_pg psql -c "CREATE ROLE warehouse_user LOGIN PASSWORD 'warehouse_password' CREATEDB"
as_pg psql -tAc "SELECT 1 FROM pg_database WHERE datname='warehouse_db'" | grep -q 1 \
  || as_pg createdb -O warehouse_user warehouse_db
# pg_trgm is needed by migrations; the test database is created from template1, so it inherits it
for db in template1 warehouse_db; do
  as_pg psql -d "$db" -qc "CREATE EXTENSION IF NOT EXISTS pg_trgm"
done

[ -x backend/venv/bin/python ] || python3 -m venv backend/venv
# psycopg2-binary 2.9.9 has no wheel for Python 3.13+; there, install the first release that has one
grep -v '^psycopg2-binary' backend/requirements.txt > /tmp/requirements-cloud.txt
backend/venv/bin/pip install -q -r /tmp/requirements-cloud.txt
backend/venv/bin/pip install -q "psycopg2-binary==2.9.9" 2>/dev/null \
  || backend/venv/bin/pip install -q "psycopg2-binary>=2.9.10,<2.10"

[ -d frontend/node_modules ] || (cd frontend && npm ci --no-audit --no-fund)

echo "cloud setup ok: PYTHONUTF8=1 backend/venv/bin/python manage.py test <app labels> (from backend/)"
