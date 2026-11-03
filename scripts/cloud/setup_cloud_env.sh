#!/usr/bin/env bash
# Prepare a Claude Code cloud session (Ubuntu) for backend tests and frontend specs.
# Idempotent; run once per session before tests: bash scripts/cloud/setup_cloud_env.sh
# The database role and password are the development defaults from backend/config/settings.py.
set -euo pipefail
cd "$(dirname "$0")/../.."
SUDO=""; [ "$(id -u)" -ne 0 ] && SUDO="sudo"
export DEBIAN_FRONTEND=noninteractive

if ! command -v pg_ctlcluster >/dev/null 2>&1; then
  $SUDO apt-get update -qq
  $SUDO apt-get install -y -qq postgresql postgresql-contrib
fi
$SUDO service postgresql start
$SUDO -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='warehouse_user'" | grep -q 1 \
  || $SUDO -u postgres psql -c "CREATE ROLE warehouse_user LOGIN PASSWORD 'warehouse_password' CREATEDB"
$SUDO -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='warehouse_db'" | grep -q 1 \
  || $SUDO -u postgres createdb -O warehouse_user warehouse_db

[ -x backend/venv/bin/python ] || python3 -m venv backend/venv
backend/venv/bin/pip install -q -r backend/requirements.txt

[ -d frontend/node_modules ] || (cd frontend && npm ci --no-audit --no-fund)

echo "cloud setup ok: PYTHONUTF8=1 backend/venv/bin/python manage.py test <app labels> (from backend/)"
