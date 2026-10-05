#!/usr/bin/env bash
# ==============================================================================
# Warehouse Management System - Remote Continuous Update Script
# Target OS: Ubuntu 22.04 / 24.04 LTS
# Note: Strictly ASCII / English to prevent encoding corruption.
# ==============================================================================
set -euo pipefail

echo "======================================================================"
echo " Starting Application Update Process"
echo "======================================================================"

# 1. Verify root execution
if [ "$(id -u)" -ne 0 ]; then
    echo "ERROR: This script must be executed as root (or with sudo)." >&2
    exit 1
fi

APP_DIR="/var/www/warehouse"
BACKEND_DIR="${APP_DIR}/warehouse-backend"
BACKUP_DIR="/var/backups/warehouse"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p "${BACKUP_DIR}"

# 2. Extract DB_NAME from .env if available
DB_NAME="warehouse_db"
if [ -f "${BACKEND_DIR}/.env" ]; then
    DB_NAME=$(grep -E '^DB_NAME=' "${BACKEND_DIR}/.env" | head -n 1 | cut -d '=' -f2 | tr -d ' ' || echo "warehouse_db")
fi

# 3. Create Pre-Update Database Snapshot (pg_dump)
echo "--> Creating pre-update database snapshot for '${DB_NAME}'..."
if sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
    sudo -u postgres pg_dump -Fc "${DB_NAME}" | gzip > "${BACKUP_DIR}/pre_update_${TIMESTAMP}.dump.gz"
    echo "--> Database backup saved: ${BACKUP_DIR}/pre_update_${TIMESTAMP}.dump.gz"
    
    # Rotate backups: retain latest 10
    echo "--> Rotating database snapshots (retaining 10 most recent)..."
    ls -t "${BACKUP_DIR}"/pre_update_*.dump.gz 2>/dev/null | tail -n +11 | xargs -r rm -f
else
    echo "WARNING: Database '${DB_NAME}' was not found. Skipping snapshot."
fi

# 4. Extract new bundle
if [ -f "/tmp/deploy_bundle.zip" ]; then
    echo "--> Extracting updated application bundle..."
    unzip -q -o /tmp/deploy_bundle.zip -d "${APP_DIR}"
    rm -f /tmp/deploy_bundle.zip
else
    echo "WARNING: /tmp/deploy_bundle.zip not found. Proceeding with existing filesystem code."
fi

# 5. Virtual environment & dependencies
echo "--> Updating Python dependencies..."
cd "${BACKEND_DIR}"
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi

./venv/bin/pip install --upgrade pip setuptools wheel
if [ -f "requirements.txt" ]; then
    ./venv/bin/pip install -r requirements.txt
fi

# 6. Apply database migrations
echo "--> Applying database migrations..."
./venv/bin/python manage.py migrate --noinput

# 7. Collect static files
echo "--> Collecting static assets..."
./venv/bin/python manage.py collectstatic --noinput

# 8. Set permissions
chmod -R 755 "${APP_DIR}"
if [ -f "${BACKEND_DIR}/.env" ]; then
    chmod 600 "${BACKEND_DIR}/.env"
fi

# 9. Restart Backend & Reload Nginx
echo "--> Restarting Daphne ASGI service..."
systemctl restart warehouse-backend
systemctl restart warehouse-gdrive-worker 2>/dev/null || true

echo "--> Reloading Nginx..."
nginx -t
systemctl reload nginx

# 10. Verify Health Status
echo "======================================================================"
echo " Application Update Successfully Completed!"
echo " Timestamp      : ${TIMESTAMP}"
echo " Backend Status : $(systemctl is-active warehouse-backend)"
echo " Nginx Status   : $(systemctl is-active nginx)"
echo "======================================================================"
