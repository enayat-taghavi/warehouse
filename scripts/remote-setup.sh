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

if [[ $# -lt 9 || $# -gt 10 ]]; then
    echo "Usage: remote-setup.sh <domain> <admin_email> <db_name> <db_user> <allowed_hosts> <ssh_port> <bundle_path> <bundle_sha256> <modules> [cert_mode]" >&2
    exit 2
fi
DOMAIN="$1"
ADMIN_EMAIL="$2"
DB_NAME="$3"
DB_USER="$4"
ALLOWED_HOSTS="$5"
SSH_PORT="$6"
BUNDLE_PATH="$7"
BUNDLE_SHA256="$8"
MODULES_ARG="$9"
CERT_MODE_ARG="${10:-http01}"

case "$CERT_MODE_ARG" in
    http01|dns01-cloudflare|cloudflare-origin|custom) ;;
    *)
        echo "ERROR: Invalid cert_mode '$CERT_MODE_ARG'. Must be http01, dns01-cloudflare, cloudflare-origin, or custom." >&2
        exit 1
        ;;
esac

if [[ -z "$ALLOWED_HOSTS" || "$ALLOWED_HOSTS" == "*" ]]; then
    ALLOWED_HOSTS="$DOMAIN"
fi

# Validate every value before it reaches SQL, .env or a command line (F-11, G-13)
if ! [[ "$DOMAIN" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}$ ]]; then
    echo "ERROR: Invalid domain format: $DOMAIN" >&2
    exit 1
fi
for pair in "DB_NAME:$DB_NAME" "DB_USER:$DB_USER"; do
    if ! [[ "${pair#*:}" =~ ^[a-z_][a-z0-9_]{0,62}$ ]]; then
        echo "ERROR: ${pair%%:*} must match ^[a-z_][a-z0-9_]{0,62}\$ (got: ${pair#*:})" >&2
        exit 1
    fi
done
if ! [[ "$ALLOWED_HOSTS" =~ ^[A-Za-z0-9.:,-]+$ ]]; then
    echo "ERROR: Invalid allowed hosts: $ALLOWED_HOSTS" >&2
    exit 1
fi
if ! [[ "$SSH_PORT" =~ ^[0-9]{1,5}$ ]]; then
    echo "ERROR: Invalid SSH port: $SSH_PORT" >&2
    exit 1
fi
if ! [[ "$ADMIN_EMAIL" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]]; then
    echo "ERROR: Invalid admin email: $ADMIN_EMAIL" >&2
    exit 1
fi

# Installable modules in catalog order; same rules as warehouse-deploy (canonical_modules).
KNOWN_MODULES=(warehouse accounting)
canonical_modules() {
    local raw="$1" m k out=() seen=" "
    [[ "$raw" =~ ^[a-z]+(,[a-z]+)*$ ]] || return 1
    IFS=',' read -ra _mods <<<"$raw"
    for m in "${_mods[@]}"; do
        [[ " ${KNOWN_MODULES[*]} " == *" $m "* ]] || return 1
        seen+="$m "
    done
    for k in "${KNOWN_MODULES[@]}"; do
        if [[ "$seen" == *" $k "* ]]; then out+=("$k"); fi
    done
    (IFS=','; echo "${out[*]}")
}
if ! MODULES=$(canonical_modules "$MODULES_ARG"); then
    echo "ERROR: Invalid modules: $MODULES_ARG (known: ${KNOWN_MODULES[*]})" >&2
    exit 1
fi
# A second Setup never changes the installed modules (deploy.ps1 -AddModule adds one; none is removed).
# Checked before any change; a missing or empty WH_MODULES means all modules (installs made before it existed).
if [[ -f /var/www/warehouse/shared/.env && ! -L /var/www/warehouse/shared/.env ]]; then
    HAVE_MODULES=$(sed -n 's/^WH_MODULES=//p' /var/www/warehouse/shared/.env | tail -n 1 | tr -d '\r' || true)
    if [[ -z "$HAVE_MODULES" ]]; then
        HAVE_MODULES=$(IFS=','; echo "${KNOWN_MODULES[*]}")
    elif ! HAVE_MODULES=$(canonical_modules "$HAVE_MODULES"); then
        echo "ERROR: WH_MODULES in /var/www/warehouse/shared/.env is invalid; fix it by hand." >&2
        exit 1
    fi
    if [[ "$HAVE_MODULES" != "$MODULES" ]]; then
        echo "ERROR: Modules mismatch: the server has '${HAVE_MODULES}', the configuration asks for '${MODULES}'." >&2
        echo "Setup never changes the installed modules: add one with deploy.ps1 -AddModule <code>; removing a module is not supported." >&2
        exit 4
    fi
fi

# The bundle and its sha256 are mandatory (G-05): a regular file (no symlink) in the caller's
# /tmp/wh-deploy.* stage directory, checked against the hash computed on the operator's machine.
if ! [[ "$BUNDLE_SHA256" =~ ^[0-9a-f]{64}$ ]]; then
    echo "ERROR: bundle sha256 (64 lowercase hex digits) is required." >&2
    exit 1
fi
if ! [[ "$BUNDLE_PATH" =~ ^/tmp/wh-deploy\.[A-Za-z0-9]{10}/[A-Za-z0-9._-]+$ ]] || [[ ! -f "$BUNDLE_PATH" || -L "$BUNDLE_PATH" ]]; then
    echo "ERROR: bundle must be a regular file inside a /tmp/wh-deploy.* stage directory: $BUNDLE_PATH" >&2
    exit 1
fi

echo "--> Target Domain       : ${DOMAIN}"
echo "--> Admin Email         : ${ADMIN_EMAIL}"
echo "--> Database Name       : ${DB_NAME}"
echo "--> Database User       : ${DB_USER}"
echo "--> Allowed Hosts       : ${ALLOWED_HOSTS}"
echo "--> Configured SSH Port : ${SSH_PORT}"
echo "--> Bundle Path         : ${BUNDLE_PATH}"
echo "--> Modules             : ${MODULES}"

# Verify bundle sha256 (F-19, G-05)
ACTUAL_BUNDLE_SHA=$(sha256sum -- "$BUNDLE_PATH" | cut -d' ' -f1)
if [[ "$ACTUAL_BUNDLE_SHA" != "$BUNDLE_SHA256" ]]; then
    echo "ERROR: Bundle SHA256 checksum mismatch (expected: $BUNDLE_SHA256, actual: $ACTUAL_BUNDLE_SHA)!" >&2
    exit 1
fi
echo "--> Bundle SHA256 verified: ${ACTUAL_BUNDLE_SHA}"

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
    python3-certbot-dns-cloudflare \
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
# Not recursive: on a second Setup shared/ holds the application's media and in-app backups,
# which must keep their owner (warehouse) or the application can no longer write or read them.
chown root:root "${BASE_DIR}/releases" "${BASE_DIR}/venvs" "${SHARED_DIR}"
chmod 755 "${BASE_DIR}/releases" "${BASE_DIR}/venvs" "${SHARED_DIR}"

mkdir -p "${SHARED_DIR}/media" "${SHARED_DIR}/logs" "${SHARED_DIR}/report_exports"
chown warehouse:warehouse "${SHARED_DIR}/media" "${SHARED_DIR}/logs" "${SHARED_DIR}/report_exports"
chmod 755 "${SHARED_DIR}/media" "${SHARED_DIR}/logs" "${SHARED_DIR}/report_exports"
# G-01: backups/ is root's (the application user may only traverse it); only backups/db, where the
# in-app backups go (get_backup_dir() appends /db), belongs to the application user.
# warehouse-deploy --prepare (step 8) also migrates the top-level entries of older layouts to root.
if [[ -L "${SHARED_DIR}/backups" ]]; then
    echo "ERROR: ${SHARED_DIR}/backups is a symlink; refusing to continue." >&2
    exit 1
fi
install -d -o root -g warehouse -m 0710 "${SHARED_DIR}/backups"
# Only now (backups/ no longer writable by the application user) may backups/db be inspected safely.
if [[ -L "${SHARED_DIR}/backups/db" || ( -e "${SHARED_DIR}/backups/db" && ! -d "${SHARED_DIR}/backups/db" ) ]]; then
    echo "ERROR: ${SHARED_DIR}/backups/db is not a plain directory; check it by hand." >&2
    exit 1
fi
install -d -o warehouse -g warehouse -m 0700 "${SHARED_DIR}/backups/db"

# 5. PostgreSQL Database Provisioning (PostgreSQL >= 15 check & stdin SQL)
echo "--> Configuring PostgreSQL service..."
systemctl enable --now postgresql
systemctl enable --now redis-server

PG_VER=$(runuser -u postgres -- psql -V | grep -oE '[0-9]+' | head -n 1 || true)
if [[ -n "$PG_VER" && "$PG_VER" -lt 15 ]]; then
    echo "ERROR: PostgreSQL >= 15 is required. Detected version: $PG_VER." >&2
    exit 1
fi

pg_query() {
    runuser -u postgres -- psql -XAtq -v ON_ERROR_STOP=1 "$@"
}

ENV_FILE="${SHARED_DIR}/.env"
if [[ -L "$ENV_FILE" ]]; then
    echo "ERROR: ${ENV_FILE} is a symlink; refusing to continue." >&2
    exit 1
fi
if [[ ! -f "$ENV_FILE" ]]; then
    # Empty-database guard (6.2, D-04, G-08): without .env this is a first install. Setup never
    # touches existing data, so it stops if the database holds anything or the role owns another database.
    DB_EXISTS=$(pg_query -c "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'")
    if [[ "$DB_EXISTS" == "1" ]]; then
        REL_COUNT=$(pg_query -d "$DB_NAME" -c "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')")
        if [[ "$REL_COUNT" != "0" ]]; then
            echo "ERROR: Database ${DB_NAME} already holds ${REL_COUNT} relation(s) but ${ENV_FILE} is missing." >&2
            echo "Setup never touches existing data. Put the original ${ENV_FILE} back (e.g. from a .env.soft-* backup) and run Setup again." >&2
            exit 1
        fi
    fi
    OTHER_DBS=$(pg_query -c "SELECT count(*) FROM pg_database d JOIN pg_roles r ON r.oid = d.datdba WHERE r.rolname = '${DB_USER}' AND d.datname <> '${DB_NAME}'")
    if [[ "$OTHER_DBS" != "0" ]]; then
        echo "ERROR: Role ${DB_USER} owns ${OTHER_DBS} other database(s); refusing to reset its password." >&2
        exit 1
    fi

    echo "--> Generating cryptographically secure credentials on-server..."
    DB_PASSWORD=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")
    DJANGO_SECRET=$(python3 -c "import secrets; print(secrets.token_urlsafe(50))")

    echo "--> Creating PostgreSQL database user and database (UTF-8, ICU fa-IR collation)..."
    runuser -u postgres -- psql -X -v ON_ERROR_STOP=1 <<EOSQL
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

    if [[ "$DB_EXISTS" != "1" ]]; then
        # D-30: explicit UTF-8 and ICU Persian collation (libc C.UTF-8 and en_US sort Persian letters wrongly).
        pg_query -c "CREATE DATABASE \"${DB_NAME}\" OWNER \"${DB_USER}\" ENCODING 'UTF8' TEMPLATE template0 LOCALE_PROVIDER icu ICU_LOCALE 'fa-IR' LOCALE 'C.UTF-8';"
    fi

    # Persian alphabetical order must hold: be, pe, che, ze, zhe, kaf, gaf, ye (as code points, ASCII-only script).
    PERSIAN_ORDER=$(pg_query -d "$DB_NAME" -c "SELECT string_agg(ascii(x)::text, ',' ORDER BY x) FROM unnest(ARRAY[chr(1740), chr(1711), chr(1705), chr(1688), chr(1586), chr(1670), chr(1662), chr(1576)]) AS t(x)")
    if [[ "$PERSIAN_ORDER" != "1576,1662,1670,1586,1688,1705,1711,1740" ]]; then
        echo "ERROR: Database ${DB_NAME} does not sort Persian correctly (got ${PERSIAN_ORDER})." >&2
        echo "It is empty: drop it by hand and run Setup again so it is created with the ICU fa-IR collation." >&2
        exit 1
    fi
    echo "--> Persian collation order verified."

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
GOOGLE_OAUTH_REDIRECT_URI=https://${DOMAIN}/api/accounts/gdrive/callback/
WH_CANONICAL_DOMAIN=${DOMAIN}
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}
DB_HOST=127.0.0.1
DB_PORT=5432
REDIS_URL=redis://127.0.0.1:6379/1
WH_MODULES=${MODULES}
EOF
    )
    chown root:warehouse "$ENV_FILE"
    chmod 640 "$ENV_FILE"
    printf '%s\n' "$MODULES" > "${SHARED_DIR}/MODULES"
    printf '%s\n' "$CERT_MODE_ARG" > "${SHARED_DIR}/CERT_MODE"
    printf '%s\n' "$DOMAIN" > "${SHARED_DIR}/DOMAIN"
else
    # Second Setup: the database and .env are never touched (6.2). warehouse-deploy --prepare (step 8)
    # appends every missing non-secret key; only the allowed hosts from the configuration are added here.
    echo "--> Existing ${ENV_FILE} preserved; the database is not touched."
    if [[ ! -f "${SHARED_DIR}/CERT_MODE" ]]; then
        printf '%s\n' "$CERT_MODE_ARG" > "${SHARED_DIR}/CERT_MODE"
    fi
    if [[ ! -f "${SHARED_DIR}/DOMAIN" ]]; then
        printf '%s\n' "$DOMAIN" > "${SHARED_DIR}/DOMAIN"
    fi
    if ! grep -q '^DJANGO_ALLOWED_HOSTS=' "$ENV_FILE"; then
        [[ -z "$(tail -c 1 "$ENV_FILE")" ]] || printf '\n' >> "$ENV_FILE"
        echo "DJANGO_ALLOWED_HOSTS=${ALLOWED_HOSTS}" >> "$ENV_FILE"
    fi
    chown root:warehouse "$ENV_FILE"
    chmod 640 "$ENV_FILE"
fi

# 6. Extract bundle and install deployment orchestrator & root gateway
TEMP_BOOTSTRAP=$(mktemp -d /tmp/wh_bootstrap_XXXXXX)
trap 'rm -rf -- "$TEMP_BOOTSTRAP"' EXIT
tar -xzf "$BUNDLE_PATH" -C "$TEMP_BOOTSTRAP"
for f in warehouse-deploy.sh warehouse-nightly-backup.sh warehouse-root-gateway.sh; do
    if [[ ! -f "${TEMP_BOOTSTRAP}/scripts/deploy/${f}" ]]; then
        echo "ERROR: Bundle has no scripts/deploy/${f}." >&2
        exit 1
    fi
done
install -o root -g root -m 755 "${TEMP_BOOTSTRAP}/scripts/deploy/warehouse-deploy.sh" /usr/local/sbin/warehouse-deploy
install -o root -g root -m 755 "${TEMP_BOOTSTRAP}/scripts/deploy/warehouse-nightly-backup.sh" /usr/local/bin/warehouse-nightly-backup.sh
install -o root -g root -m 755 "${TEMP_BOOTSTRAP}/scripts/deploy/warehouse-root-gateway.sh" /usr/local/sbin/warehouse-root-gateway
if [[ -d "${TEMP_BOOTSTRAP}/scripts/deploy/templates" ]]; then
    for u in "${TEMP_BOOTSTRAP}/scripts/deploy/templates"/warehouse-*.service "${TEMP_BOOTSTRAP}/scripts/deploy/templates"/warehouse-*.timer; do
        if [[ -f "$u" ]]; then
            install -m 644 "$u" "/etc/systemd/system/$(basename "$u")"
        fi
    done
fi
rm -rf -- "$TEMP_BOOTSTRAP"
trap - EXIT

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
echo "--> Preparing the release via /usr/local/sbin/warehouse-deploy --prepare..."
PREPARE_OUTPUT=$(/usr/local/sbin/warehouse-deploy --prepare --bundle "$BUNDLE_PATH" --bundle-sha256 "$BUNDLE_SHA256" --domain "$DOMAIN" --modules "$MODULES")
echo "$PREPARE_OUTPUT"
REL=$(echo "$PREPARE_OUTPUT" | sed -n 's/^\[RELEASE\] //p')
BAK=$(echo "$PREPARE_OUTPUT" | sed -n 's/^\[PRE_UPDATE_BACKUP\] //p')
if [[ -z "$REL" || -z "$BAK" ]]; then
    echo "ERROR: warehouse-deploy --prepare did not report the release and its pre-update backup." >&2
    exit 1
fi
echo "--> Activating the release via /usr/local/sbin/warehouse-deploy --activate..."
/usr/local/sbin/warehouse-deploy --activate "$REL" --domain "$DOMAIN" --verified-backup "$BAK"

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
# The activation above already rendered the HTTP site (with the ACME webroot) through the tested
# path of warehouse-deploy, which restores the previous configuration if "nginx -t" fails (G-07).
# Unified certificate path: /etc/warehouse/tls/${DOMAIN}/fullchain.pem and privkey.pem.
# Certificate mode: http01 (webroot), dns01-cloudflare, cloudflare-origin, or custom.
echo "--> Configuring TLS for domain ${DOMAIN} (mode: ${CERT_MODE_ARG})..."
TLS_DIR="/etc/warehouse/tls/${DOMAIN}"
mkdir -p "$TLS_DIR"
CF_INI=/etc/letsencrypt/cloudflare.ini

if [[ "$CERT_MODE_ARG" == "cloudflare-origin" || "$CERT_MODE_ARG" == "custom" ]]; then
    if [[ -f "${TLS_DIR}/fullchain.pem" ]]; then
        /usr/local/sbin/warehouse-deploy --refresh-nginx --domain "$DOMAIN"
        echo "--> HTTPS operational with installed TLS certificate (${CERT_MODE_ARG})!"
    else
        echo "[TLS_PENDING] CertMode is ${CERT_MODE_ARG}: install the certificate files using deploy.ps1 -InstallCert -CertFile <path> -KeyFile <path>."
    fi
else
    # Let's Encrypt modes: http01 or dns01-cloudflare
    if [[ ! -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]]; then
        if [[ "$ADMIN_EMAIL" == *"@example.com" ]]; then
            echo "--> [WARNING] AdminEmail is a placeholder (${ADMIN_EMAIL}); skipping automated Let's Encrypt registration."
        elif [[ "$CERT_MODE_ARG" == "dns01-cloudflare" ]]; then
            if [[ -f "$CF_INI" && ! -L "$CF_INI" ]]; then
                echo "--> Requesting Let's Encrypt TLS certificate via DNS-01 (Cloudflare)..."
                certbot certonly --dns-cloudflare --dns-cloudflare-credentials "$CF_INI" --dns-cloudflare-propagation-seconds 30 \
                    -d "$DOMAIN" --email "$ADMIN_EMAIL" --agree-tos --non-interactive --deploy-hook "systemctl reload nginx" \
                    || echo "--> [WARNING] The DNS-01 certificate request failed (see above)."
            else
                echo "--> [WARNING] CertMode is dns01-cloudflare but Cloudflare token is not set yet; skipping certbot."
            fi
        else
            echo "--> Requesting Let's Encrypt TLS certificate via webroot (HTTP-01)..."
            certbot certonly --webroot -w /var/www/html -d "$DOMAIN" --email "$ADMIN_EMAIL" \
                --agree-tos --non-interactive --deploy-hook "systemctl reload nginx" \
                || echo "--> [WARNING] The HTTP-01 certificate request failed (see above)."
        fi
    fi
    if [[ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]]; then
        ln -sfn "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" "${TLS_DIR}/fullchain.pem"
        ln -sfn "/etc/letsencrypt/live/${DOMAIN}/privkey.pem" "${TLS_DIR}/privkey.pem"
        /usr/local/sbin/warehouse-deploy --refresh-nginx --domain "$DOMAIN"
        echo "--> HTTPS operational with Let's Encrypt TLS certificate!"
    else
        echo "[TLS_PENDING] No certificate yet: the application runs, but nginx only redirects HTTP to HTTPS, so the site is not reachable until a certificate exists. Set the Cloudflare token (deploy.ps1 -SetSecret CLOUDFLARE_DNS_API_TOKEN), then run deploy.ps1 -IssueCert."
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
