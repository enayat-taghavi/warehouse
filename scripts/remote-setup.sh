#!/usr/bin/env bash
# ==============================================================================
# Warehouse Management System - Hardened Server Provisioning Script
# Target OS: Ubuntu 22.04 / 24.04 LTS
# Note: Strictly ASCII / English to prevent encoding corruption.
# ==============================================================================
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a

echo "======================================================================"
echo " Starting Hardened Server Provisioning"
echo "======================================================================"

if [ "$(id -u)" -ne 0 ]; then
    echo "ERROR: This script must be executed as root (or with sudo)." >&2
    exit 1
fi

if [[ -f "/var/www/warehouse/shared/GO_LIVE" ]]; then
    echo "ERROR: Server is in production GO-LIVE state (/var/www/warehouse/shared/GO_LIVE exists)." >&2
    echo "Initial provisioning is blocked to protect production data." >&2
    exit 1
fi

DOMAIN="${1:-}"
ADMIN_EMAIL="${2:-admin@example.com}"
DB_NAME="${3:-warehouse_db}"
DB_USER="${4:-warehouse_user}"
ALLOWED_HOSTS="${5:-}"
SSH_PORT="${6:-22}"
BUNDLE_PATH="${7:-/tmp/deploy_bundle.tar.gz}"
BUNDLE_SHA256="${8:-}"

if [[ -z "$ALLOWED_HOSTS" || "$ALLOWED_HOSTS" == "*" ]]; then
    ALLOWED_HOSTS="${DOMAIN:-127.0.0.1}"
fi

# Validate domain format if specified (F-11)
if [[ -n "$DOMAIN" ]] && ! [[ "$DOMAIN" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}$ ]]; then
    echo "ERROR: Invalid domain format: $DOMAIN" >&2
    exit 1
fi

echo "--> Target Domain       : ${DOMAIN:-[Direct IP]}"
echo "--> Admin Email         : ${ADMIN_EMAIL}"
echo "--> Database Name       : ${DB_NAME}"
echo "--> Database User       : ${DB_USER}"
echo "--> Allowed Hosts       : ${ALLOWED_HOSTS}"
echo "--> Configured SSH Port : ${SSH_PORT}"
echo "--> Bundle Path         : ${BUNDLE_PATH}"

# Verify bundle sha256 (F-19)
if [[ -f "$BUNDLE_PATH" ]]; then
    ACTUAL_BUNDLE_SHA=$(sha256sum "$BUNDLE_PATH" | cut -d' ' -f1)
    if [[ -n "$BUNDLE_SHA256" ]]; then
        if [[ "$ACTUAL_BUNDLE_SHA" != "$BUNDLE_SHA256" ]]; then
            echo "ERROR: Bundle SHA256 checksum mismatch (expected: $BUNDLE_SHA256, actual: $ACTUAL_BUNDLE_SHA)!" >&2
            exit 1
        fi
    else
        BUNDLE_SHA256="$ACTUAL_BUNDLE_SHA"
    fi
    echo "--> Bundle SHA256 verified: ${ACTUAL_BUNDLE_SHA}"
fi

# 1. System Timezone (Asia/Tehran)
echo "--> Setting server timezone to Asia/Tehran..."
timedatectl set-timezone Asia/Tehran || true

# 2. Package Management & Dependencies (including rsync)
echo "--> Updating package repository..."
apt-get update -y

echo "--> Installing system runtime packages and security tools..."
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
    fail2ban \
    curl \
    tar \
    gzip \
    rsync

# 3. Create Sandboxed System User (warehouse - no login, no home)
echo "--> Ensuring system service user 'warehouse' exists..."
if ! id -u warehouse >/dev/null 2>&1; then
    useradd -r -M -s /usr/sbin/nologin warehouse
fi

# 4. Directory Layout Initialization (F-08: root owns shared/ to prevent privesc)
BASE_DIR="/var/www/warehouse"
SHARED_DIR="${BASE_DIR}/shared"
mkdir -p "${BASE_DIR}/releases" "${BASE_DIR}/venvs" "${SHARED_DIR}"
chown -R root:root "${BASE_DIR}/releases" "${BASE_DIR}/venvs" "${SHARED_DIR}"
chmod 755 "${BASE_DIR}/releases" "${BASE_DIR}/venvs" "${SHARED_DIR}"

mkdir -p "${SHARED_DIR}/media" "${SHARED_DIR}/backups" "${SHARED_DIR}/logs" "${SHARED_DIR}/report_exports"
chown -R warehouse:warehouse "${SHARED_DIR}/media" "${SHARED_DIR}/logs" "${SHARED_DIR}/report_exports" "${SHARED_DIR}/backups"
chmod 755 "${SHARED_DIR}/media" "${SHARED_DIR}/logs" "${SHARED_DIR}/report_exports"
chmod 700 "${SHARED_DIR}/backups"

# 5. PostgreSQL Database Provisioning (PostgreSQL >= 15 check & stdin SQL)
echo "--> Configuring PostgreSQL service..."
systemctl enable --now postgresql
systemctl enable --now redis-server

PG_VER=$(runuser -u postgres -- psql -V | grep -oE '[0-9]+' | head -n 1 || true)
if [[ -n "$PG_VER" && "$PG_VER" -lt 15 ]]; then
    echo "ERROR: PostgreSQL >= 15 is required. Detected version: $PG_VER." >&2
    exit 1
fi

ENV_FILE="${SHARED_DIR}/.env"
if [[ ! -f "$ENV_FILE" ]]; then
    echo "--> Generating cryptographically secure credentials on-server..."
    DB_PASSWORD=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")
    DJANGO_SECRET=$(python3 -c "import secrets; print(secrets.token_urlsafe(50))")

    echo "--> Creating PostgreSQL database user and database with UTF-8 encoding..."
    runuser -u postgres -- psql -v ON_ERROR_STOP=1 <<EOSQL
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${DB_USER}') THEN
        CREATE ROLE "${DB_USER}" WITH LOGIN PASSWORD '${DB_PASSWORD}';
    ELSE
        ALTER ROLE "${DB_USER}" WITH PASSWORD '${DB_PASSWORD}';
    END IF;
END
\$\$;
EOSQL

    DB_EXISTS=$(runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" || true)
    if [[ "$DB_EXISTS" != "1" ]]; then
        runuser -u postgres -- psql -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${DB_NAME}\" OWNER \"${DB_USER}\" ENCODING 'UTF8' TEMPLATE template0;"
    fi

    runuser -u postgres -- psql -v ON_ERROR_STOP=1 -d "${DB_NAME}" <<EOSQL
ALTER SCHEMA public OWNER TO "${DB_USER}";
GRANT ALL ON SCHEMA public TO "${DB_USER}";
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;
EOSQL

    # Write .env with umask 077 and root:warehouse ownership (0640) (F-08)
    (
        umask 027
        cat <<EOF > "$ENV_FILE"
DJANGO_ENV=production
DJANGO_SECRET_KEY=${DJANGO_SECRET}
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=${ALLOWED_HOSTS}
DJANGO_SECURE_PROXY_SSL=1
DJANGO_CSRF_TRUSTED_ORIGINS=https://${DOMAIN}
DJANGO_MEDIA_ACCEL_REDIRECT=1
DJANGO_LOG_DIR=${SHARED_DIR}/logs
DJANGO_MEDIA_ROOT=${SHARED_DIR}/media
WAREHOUSE_REPORT_EXPORT_DIR=${SHARED_DIR}/report_exports
WAREHOUSE_BACKUP_DIR=${SHARED_DIR}/backups
WAREHOUSE_BACKUP_KEEP=0
GOOGLE_OAUTH_REDIRECT_URI=https://${DOMAIN}/api/auth/google/callback
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}
DB_HOST=127.0.0.1
DB_PORT=5432
REDIS_URL=redis://127.0.0.1:6379/1
EOF
    )
    chown root:warehouse "$ENV_FILE"
    chmod 640 "$ENV_FILE"
else
    echo "--> Existing ${ENV_FILE} preserved. Merging missing configuration keys..."
    for key in DJANGO_MEDIA_ACCEL_REDIRECT WAREHOUSE_REPORT_EXPORT_DIR WAREHOUSE_BACKUP_DIR GOOGLE_OAUTH_REDIRECT_URI; do
        if ! grep -q "^${key}=" "$ENV_FILE"; then
            case "$key" in
                DJANGO_MEDIA_ACCEL_REDIRECT) echo "DJANGO_MEDIA_ACCEL_REDIRECT=1" >> "$ENV_FILE" ;;
                WAREHOUSE_REPORT_EXPORT_DIR) echo "WAREHOUSE_REPORT_EXPORT_DIR=${SHARED_DIR}/report_exports" >> "$ENV_FILE" ;;
                WAREHOUSE_BACKUP_DIR) echo "WAREHOUSE_BACKUP_DIR=${SHARED_DIR}/backups" >> "$ENV_FILE" ;;
                GOOGLE_OAUTH_REDIRECT_URI) echo "GOOGLE_OAUTH_REDIRECT_URI=https://${DOMAIN}/api/auth/google/callback" >> "$ENV_FILE" ;;
            esac
        fi
    done
    chown root:warehouse "$ENV_FILE"
    chmod 640 "$ENV_FILE"
fi

# 6. Extract bundle and install deployment orchestrator & root gateway
TEMP_BOOTSTRAP=$(mktemp -d /tmp/wh_bootstrap_XXXXXX)
if [[ -f "$BUNDLE_PATH" ]]; then
    tar -xzf "$BUNDLE_PATH" -C "$TEMP_BOOTSTRAP"
    if [[ -f "${TEMP_BOOTSTRAP}/scripts/deploy/warehouse-deploy.sh" ]]; then
        install -m 755 "${TEMP_BOOTSTRAP}/scripts/deploy/warehouse-deploy.sh" /usr/local/sbin/warehouse-deploy
    fi
    if [[ -f "${TEMP_BOOTSTRAP}/scripts/deploy/warehouse-nightly-backup.sh" ]]; then
        install -m 755 "${TEMP_BOOTSTRAP}/scripts/deploy/warehouse-nightly-backup.sh" /usr/local/bin/warehouse-nightly-backup.sh
    fi
    if [[ -f "${TEMP_BOOTSTRAP}/scripts/deploy/warehouse-root-gateway.sh" ]]; then
        install -m 755 "${TEMP_BOOTSTRAP}/scripts/deploy/warehouse-root-gateway.sh" /usr/local/sbin/warehouse-root-gateway
    fi
    if [[ -d "${TEMP_BOOTSTRAP}/scripts/deploy/templates" ]]; then
        for u in "${TEMP_BOOTSTRAP}/scripts/deploy/templates"/warehouse-*.service "${TEMP_BOOTSTRAP}/scripts/deploy/templates"/warehouse-*.timer; do
            if [[ -f "$u" ]]; then
                install -m 644 "$u" "/etc/systemd/system/$(basename "$u")"
            fi
        done
    fi
fi
rm -rf "$TEMP_BOOTSTRAP"

# 7. Configure sudoers restriction (E-24, F-07, F-15)
# Sudoers only allows warehouse-root-gateway, validated with visudo -cf
SUDO_TARGET_USER="${SUDO_USER:-deploy}"
if id "$SUDO_TARGET_USER" >/dev/null 2>&1; then
    echo "--> Configuring restricted sudoers permissions for ${SUDO_TARGET_USER}..."
    SUDOERS_TMP="/etc/sudoers.d/warehouse.tmp"
    cat <<EOF > "$SUDOERS_TMP"
${SUDO_TARGET_USER} ALL=(ALL) NOPASSWD: /usr/local/sbin/warehouse-root-gateway
EOF
    if visudo -cf "$SUDOERS_TMP" >/dev/null 2>&1; then
        mv -f "$SUDOERS_TMP" /etc/sudoers.d/warehouse
        chmod 440 /etc/sudoers.d/warehouse
    else
        rm -f "$SUDOERS_TMP"
        echo "ERROR: visudo validation failed for /etc/sudoers.d/warehouse.tmp!" >&2
        exit 1
    fi
fi

# 8. Run initial release deployment via orchestrator (F-07: explicit prepare & activate)
if [[ -f "/usr/local/sbin/warehouse-deploy" && -f "$BUNDLE_PATH" ]]; then
    echo "--> Preparing initial release via /usr/local/sbin/warehouse-deploy --prepare..."
    PREPARE_OUTPUT=$(/usr/local/sbin/warehouse-deploy --prepare --bundle "$BUNDLE_PATH" --bundle-sha256 "$BUNDLE_SHA256" --domain "${DOMAIN:-soft.farsalish.ir}")
    echo "$PREPARE_OUTPUT"
    REL=$(echo "$PREPARE_OUTPUT" | grep '^\[RELEASE\]' | awk '{print $2}')
    BAK=$(echo "$PREPARE_OUTPUT" | grep '^\[PRE_UPDATE_BACKUP\]' | awk '{print $2}')
    if [[ -z "$REL" ]]; then
        echo "ERROR: Failed to determine prepared release name from warehouse-deploy." >&2
        exit 1
    fi
    echo "--> Activating initial release via /usr/local/sbin/warehouse-deploy --activate..."
    /usr/local/sbin/warehouse-deploy --activate "$REL" --domain "${DOMAIN:-soft.farsalish.ir}" --verified-backup "$BAK"
fi

# 9. Seed permissions and initialize roles
echo "--> Initializing system permissions and roles..."
if [[ -d "${BASE_DIR}/current" ]]; then
    runuser -u warehouse -- "${BASE_DIR}/current/venv/bin/python" "${BASE_DIR}/current/warehouse-backend/manage.py" seed_permissions
    runuser -u warehouse -- "${BASE_DIR}/current/venv/bin/python" "${BASE_DIR}/current/warehouse-backend/manage.py" init_roles
fi

# 10. Enable application services
systemctl daemon-reload
systemctl enable warehouse-backend warehouse-gdrive-worker warehouse-export-worker warehouse-backup.timer
systemctl start warehouse-backend warehouse-gdrive-worker warehouse-export-worker warehouse-backup.timer

# 11. Web Server (Nginx) & TLS Configuration
if [[ -n "$DOMAIN" ]]; then
    echo "--> Configuring Nginx for domain ${DOMAIN}..."
    mkdir -p /var/www/html /etc/nginx/sites-available /etc/nginx/sites-enabled

    # Stage 1: Temporary HTTP for ACME challenge
    if [[ -f "${BASE_DIR}/current/scripts/deploy/templates/nginx-http.conf" ]]; then
        sed "s/__DOMAIN__/${DOMAIN}/g" "${BASE_DIR}/current/scripts/deploy/templates/nginx-http.conf" > /etc/nginx/sites-available/warehouse
        ln -sf /etc/nginx/sites-available/warehouse /etc/nginx/sites-enabled/warehouse
        rm -f /etc/nginx/sites-enabled/default
        nginx -t
        systemctl reload nginx

        # Stage 2: Request Let's Encrypt TLS certificate via webroot (reject @example.com)
        if [[ "$ADMIN_EMAIL" != *"@example.com"* && -n "$ADMIN_EMAIL" ]]; then
            echo "--> Requesting Let's Encrypt TLS certificate via webroot..."
            certbot certonly --webroot -w /var/www/html -d "$DOMAIN" --email "$ADMIN_EMAIL" \
                --agree-tos --non-interactive --deploy-hook "systemctl reload nginx"
        else
            echo "--> [WARNING] AdminEmail is default or invalid (${ADMIN_EMAIL}); skipping automated Let's Encrypt registration."
        fi
    fi

    # Stage 3: Full HTTPS if certificate obtained
    if [[ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" && -f "${BASE_DIR}/current/scripts/deploy/templates/nginx-https.conf" ]]; then
        SUPPORT_REJECT=0
        if nginx -V 2>&1 | grep -q "nginx version: "; then
            if nginx -V 2>&1 | grep -oE 'nginx/[0-9]+\.[0-9]+' | head -n 1 | awk -F'[/.]' '{ if ($2 > 1 || ($2 == 1 && $3 >= 19)) exit 0; else exit 1; }'; then
                SUPPORT_REJECT=1
            fi
        fi

        REJECT_FILE="/tmp/wh_reject_$$.conf"
        if [ "$SUPPORT_REJECT" -eq 1 ]; then
            cat <<'EOF' > "$REJECT_FILE"
server {
    listen 443 ssl default_server;
    listen [::]:443 ssl default_server;
    server_name _;
    server_tokens off;
    ssl_reject_handshake on;
    return 444;
}
EOF
            sed -e "s/__DOMAIN__/${DOMAIN}/g" \
                -e "/__SSL_REJECT_HANDSHAKE_SERVER__/{r $REJECT_FILE" -e 'd}' \
                "${BASE_DIR}/current/scripts/deploy/templates/nginx-https.conf" > /etc/nginx/sites-available/warehouse
            rm -f "$REJECT_FILE"
        else
            sed -e "s/__DOMAIN__/${DOMAIN}/g" \
                -e '/__SSL_REJECT_HANDSHAKE_SERVER__/d' \
                "${BASE_DIR}/current/scripts/deploy/templates/nginx-https.conf" > /etc/nginx/sites-available/warehouse
        fi
        nginx -t
        systemctl reload nginx
        echo "--> HTTPS operational with Let's Encrypt TLS certificate!"
    fi
fi

# 12. Security Hardening & Firewall (UFW & Fail2ban) (F-15)
echo "--> Configuring UFW firewall and Fail2ban..."
ACTUAL_SSH_PORTS=$(sshd -T 2>/dev/null | grep -i '^port ' | awk '{print $2}' || true)

ufw default deny incoming || true
ufw default allow outgoing || true
if [[ -n "$ACTUAL_SSH_PORTS" ]]; then
    for p in $ACTUAL_SSH_PORTS; do
        ufw allow "${p}/tcp" || true
    done
else
    ufw allow "${SSH_PORT}/tcp" || true
fi
ufw allow 80/tcp || true
ufw allow 443/tcp || true
ufw --force enable || true

systemctl enable --now fail2ban || true

echo "======================================================================"
echo " Hardened Server Provisioning Completed Successfully!"
echo "======================================================================"
