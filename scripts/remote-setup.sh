#!/usr/bin/env bash
# ==============================================================================
# Warehouse Management System - Remote Server Provisioning Script
# Target OS: Ubuntu 22.04 / 24.04 LTS
# Note: Strictly ASCII / English to prevent encoding corruption.
# ==============================================================================
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

echo "======================================================================"
echo " Starting Remote Server Provisioning"
echo "======================================================================"

# 1. Verify root execution
if [ "$(id -u)" -ne 0 ]; then
    echo "ERROR: This script must be executed as root (or with sudo)." >&2
    exit 1
fi

export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a

# 2. Parse arguments
DOMAIN="${1:-}"
ADMIN_EMAIL="${2:-admin@example.com}"
DB_NAME="${3:-warehouse_db}"
DB_USER="${4:-warehouse_user}"
DB_PASSWORD="${5:-warehouse_password}"
DJANGO_SECRET_KEY="${6:-}"
ALLOWED_HOSTS="${7:-*}"
SSH_PORT="${8:-22}"

if [ -z "$DJANGO_SECRET_KEY" ]; then
    echo "ERROR: DJANGO_SECRET_KEY argument is required." >&2
    exit 1
fi

echo "--> Target Domain       : ${DOMAIN:-[Direct IP]}"
echo "--> Admin Email         : ${ADMIN_EMAIL}"
echo "--> Database Name       : ${DB_NAME}"
echo "--> Database User       : ${DB_USER}"
echo "--> SSH Port            : ${SSH_PORT}"

# 3. Update system package repository
echo "--> Updating system package index..."
apt-get update -y

# 4. Install system packages and runtime dependencies
echo "--> Installing system packages, runtime dependencies, and services..."
apt-get install -y --no-install-recommends \
    -o Dpkg::Options::="--force-confdef" \
    -o Dpkg::Options::="--force-confold" \
    python3 \
    python3-pip \
    python3-venv \
    python3-dev \
    build-essential \
    libpq-dev \
    libjpeg-dev \
    zlib1g-dev \
    postgresql \
    postgresql-contrib \
    redis-server \
    nginx \
    certbot \
    python3-certbot-nginx \
    ufw \
    unzip \
    curl \
    gzip

# 5. Enable and start core services (Redis & PostgreSQL)
echo "--> Starting and enabling Redis and PostgreSQL..."
systemctl enable --now redis-server
systemctl enable --now postgresql

# 6. Configure PostgreSQL Database & Role
echo "--> Configuring PostgreSQL database and credentials..."
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE USER \"${DB_USER}\" WITH PASSWORD '${DB_PASSWORD}';"

sudo -u postgres psql -c "ALTER USER \"${DB_USER}\" WITH PASSWORD '${DB_PASSWORD}';"
sudo -u postgres psql -c "ALTER USER \"${DB_USER}\" CREATEDB;"

sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE DATABASE \"${DB_NAME}\" OWNER \"${DB_USER}\";"

sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE \"${DB_NAME}\" TO \"${DB_USER}\";"

# Ensure full schema ownership and privileges in PostgreSQL 15/16
sudo -u postgres psql -d "${DB_NAME}" -c "ALTER SCHEMA public OWNER TO \"${DB_USER}\";" || true
sudo -u postgres psql -d "${DB_NAME}" -c "GRANT ALL ON SCHEMA public TO \"${DB_USER}\";"
sudo -u postgres psql -d "${DB_NAME}" -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO \"${DB_USER}\";"
sudo -u postgres psql -d "${DB_NAME}" -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO \"${DB_USER}\";"
sudo -u postgres psql -d "${DB_NAME}" -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"
sudo -u postgres psql -d "${DB_NAME}" -c "CREATE EXTENSION IF NOT EXISTS btree_gin;"

# 7. Unpack application bundle
echo "--> Preparing application directory..."
mkdir -p /var/www/warehouse
mkdir -p /var/backups/warehouse

if [ -f "/tmp/deploy_bundle.zip" ]; then
    echo "--> Unpacking project bundle..."
    unzip -q -o /tmp/deploy_bundle.zip -d /var/www/warehouse
    rm -f /tmp/deploy_bundle.zip
else
    echo "WARNING: /tmp/deploy_bundle.zip not found. Assuming files already placed in /var/www/warehouse."
fi

# 8. Setup Python Virtual Environment & Dependencies
echo "--> Setting up Python virtual environment..."
cd /var/www/warehouse/warehouse-backend
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi

./venv/bin/pip install --upgrade pip setuptools wheel
if [ -f "requirements.txt" ]; then
    echo "--> Installing Python dependencies from requirements.txt..."
    ./venv/bin/pip install -r requirements.txt
fi

# 9. Write Production .env Configuration
echo "--> Generating production .env file..."
cat <<EOF > /var/www/warehouse/warehouse-backend/.env
DJANGO_SECRET_KEY=${DJANGO_SECRET_KEY}
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=${ALLOWED_HOSTS}
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}
DB_HOST=127.0.0.1
DB_PORT=5432
REDIS_URL=redis://127.0.0.1:6379/1
EOF
chmod 600 /var/www/warehouse/warehouse-backend/.env

# 10. Database Migrations & Static Files Collection
echo "--> Applying database migrations..."
./venv/bin/python manage.py migrate --noinput

echo "--> Collecting static files..."
./venv/bin/python manage.py collectstatic --noinput

mkdir -p /var/www/warehouse/warehouse-backend/media
chmod -R 755 /var/www/warehouse

# 11. Create Systemd Service for Daphne ASGI
echo "--> Creating Systemd service (warehouse-backend.service)..."
cat <<EOF > /etc/systemd/system/warehouse-backend.service
[Unit]
Description=Warehouse Daphne ASGI Service
After=network.target postgresql.service redis-server.service
Wants=postgresql.service redis-server.service

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/warehouse/warehouse-backend
ExecStart=/var/www/warehouse/warehouse-backend/venv/bin/daphne -b 127.0.0.1 -p 8000 config.asgi:application
Restart=always
RestartSec=3
KillSignal=SIGTERM
StandardOutput=journal
StandardError=journal
EnvironmentFile=-/var/www/warehouse/warehouse-backend/.env

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable warehouse-backend
systemctl restart warehouse-backend

# 11.1 Create Systemd Service for Google Drive Sync Worker
echo "--> Creating Systemd service for Google Drive Sync Worker (warehouse-gdrive-worker.service)..."
cat <<EOF > /etc/systemd/system/warehouse-gdrive-worker.service
[Unit]
Description=Warehouse Google Drive Sync Worker Service
After=network.target postgresql.service redis-server.service warehouse-backend.service
Wants=postgresql.service redis-server.service

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/warehouse/warehouse-backend
ExecStart=/var/www/warehouse/warehouse-backend/venv/bin/python manage.py run_gdrive_sync_worker --interval 10
Restart=always
RestartSec=10
KillSignal=SIGTERM
StandardOutput=journal
StandardError=journal
EnvironmentFile=-/var/www/warehouse/warehouse-backend/.env

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable warehouse-gdrive-worker
systemctl restart warehouse-gdrive-worker

# 12. Configure Nginx Web Server and Reverse Proxy
echo "--> Configuring Nginx reverse proxy and frontend server..."
SERVER_NAME="${DOMAIN:-_}"
cat <<EOF > /etc/nginx/sites-available/warehouse
server {
    listen 80;
    listen [::]:80;
    server_name ${SERVER_NAME};

    client_max_body_size 50M;

    # Gzip Compression
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json application/javascript application/rss+xml application/atom+xml image/svg+xml;

    # Angular SPA Frontend Root
    root /var/www/warehouse/warehouse-front/dist/warehouse-app/browser;
    index index.html;

    # Static Assets & Service Worker Caching
    location ~* \.(?:ico|css|js|gif|jpe?g|png|woff2?|eot|ttf|svg|webp)$ {
        expires 6M;
        access_log off;
        add_header Cache-Control "public, max-age=15552000, immutable";
        try_files \$uri =404;
    }

    # Django Media Uploads
    location /media/ {
        alias /var/www/warehouse/warehouse-backend/media/;
        expires 30d;
        access_log off;
    }

    # Django Static Files (Admin, DRF)
    location /static/ {
        alias /var/www/warehouse/warehouse-backend/staticfiles/;
        expires 30d;
        access_log off;
    }

    # Django API and Admin Reverse Proxy
    location ~ ^/(api|admin)/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
        proxy_connect_timeout 60s;
    }

    # Daphne WebSockets Reverse Proxy
    location /ws/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # Default SPA routing
    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF

# Enable Nginx site configuration
ln -sf /etc/nginx/sites-available/warehouse /etc/nginx/sites-enabled/warehouse
if [ -f "/etc/nginx/sites-enabled/default" ]; then
    rm -f /etc/nginx/sites-enabled/default
fi

nginx -t
systemctl reload nginx

# 13. Configure UFW Firewall
echo "--> Configuring UFW firewall rules..."
ufw allow "${SSH_PORT}/tcp" || true
ufw allow 80/tcp || true
ufw allow 443/tcp || true
ufw --force enable || true

# 14. SSL Certificate Setup via Certbot (if domain is configured)
if [ -n "$DOMAIN" ] && [ "$DOMAIN" != "_" ]; then
    echo "--> Requesting SSL certificate from Let's Encrypt for ${DOMAIN}..."
    if certbot --nginx --non-interactive --agree-tos --redirect -m "${ADMIN_EMAIL}" -d "${DOMAIN}"; then
        echo "--> SSL certificate successfully installed and configured."
    else
        echo "WARNING: Certbot could not obtain an SSL certificate for ${DOMAIN}."
        echo "This typically occurs if the domain DNS records have not yet propagated to this server IP."
        echo "HTTP remains active. You can run 'certbot --nginx -d ${DOMAIN}' once DNS points here."
    fi
fi

# 15. Final Health Verification
echo "======================================================================"
echo " Server Provisioning Completed Successfully!"
echo " Backend Status : $(systemctl is-active warehouse-backend)"
echo " Nginx Status   : $(systemctl is-active nginx)"
echo " Redis Status   : $(systemctl is-active redis-server)"
echo " Postgres Status: $(systemctl is-active postgresql)"
echo "======================================================================"
