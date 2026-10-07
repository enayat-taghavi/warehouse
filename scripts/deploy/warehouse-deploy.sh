#!/usr/bin/env bash
# ==============================================================================
# Warehouse Management System - Production Atomic Deployment Script
# Target: /usr/local/sbin/warehouse-deploy
# Note: Strictly ASCII / English to prevent encoding corruption.
# ==============================================================================
set -euo pipefail

# If running --activate without detachment, detach FIRST before acquiring the lock (F-09)
if [[ "${1:-}" == "--activate" && -z "${WAREHOUSE_DETACHED:-}" ]]; then
    export WAREHOUSE_DETACHED=1
    mkdir -p /var/log/warehouse
    REL_NAME=""
    for arg in "$@"; do
        if [[ "$arg" != -* && "$arg" != "--activate" ]]; then
            REL_NAME="$arg"
            break
        fi
    done
    ACTIVATE_LOG="/var/log/warehouse/activate-${REL_NAME:-deploy}.log"
    touch "$ACTIVATE_LOG"
    chmod 600 "$ACTIVATE_LOG"
    trap '' HUP PIPE
    setsid -w "$0" "$@" > "$ACTIVATE_LOG" 2>&1 &
    CHILD_PID=$!
    tail -f --pid="$CHILD_PID" "$ACTIVATE_LOG"
    wait "$CHILD_PID"
    exit $?
fi

LOCK_FILE="/var/lock/warehouse-deploy.lock"
exec 200>"$LOCK_FILE"
python3 -c "import fcntl; fcntl.fcntl(200, fcntl.F_SETFD, fcntl.FD_CLOEXEC)" 2>/dev/null || true
flock -n 200 || { echo "[ERROR] Another deployment is already in progress. Aborting." >&2; exit 1; }


# Base filesystem layout (must be defined before rollback block for Guardian 53)
BASE_DIR="/var/www/warehouse"
RELEASES_DIR="${BASE_DIR}/releases"
VENVS_DIR="${BASE_DIR}/venvs"
SHARED_DIR="${BASE_DIR}/shared"
CURRENT_LINK="${BASE_DIR}/current"
BACKUPS_DIR="${SHARED_DIR}/backups"

# Common fail-closed migration compatibility check (E-05, F-05)
check_migration_compatibility() {
    local target="$1"
    if [[ ! -x "${target}/venv/bin/python" || ! -f "${target}/warehouse-backend/manage.py" ]]; then
        echo "[ERROR] Cannot verify migrations: target release missing venv or manage.py" >&2
        return 1
    fi
    local res
    res=$(su -s /bin/bash warehouse -c "
        cd \"${target}/warehouse-backend\"
        export DJANGO_SETTINGS_MODULE=config.settings
        export DJANGO_ENV=production
        \"${target}/venv/bin/python\" -c '
import sys, os, django
sys.path.insert(0, os.path.abspath(\".\"))
django.setup()
from django.db import connection
from django.db.migrations.loader import MigrationLoader
try:
    loader = MigrationLoader(connection, ignore_no_migrations=True)
    loader.build_graph()
    applied = set(loader.applied_migrations.keys())
    disk = set(loader.disk_migrations.keys())
    replaced = set()
    for key, mig_obj in loader.disk_migrations.items():
        for r in getattr(mig_obj, \"replaces\", []):
            replaced.add(r)
    forward = applied - disk - replaced
    if forward:
        print(\"FORWARD_MIGRATIONS:\" + \", \".join(f\"{a}.{b}\" for a, b in forward))
        sys.exit(2)
    sys.exit(0)
except Exception as e:
    print(\"MIGRATION_CHECK_ERROR:\" + str(e))
    sys.exit(3)
' 2>&1" || true)

    if [[ "$res" =~ FORWARD_MIGRATIONS:(.+) ]]; then
        echo "[CRITICAL] Target release ${target} does not contain applied migrations: ${BASH_REMATCH[1]}" >&2
        return 2
    elif [[ "$res" =~ MIGRATION_CHECK_ERROR:(.+) ]]; then
        echo "[CRITICAL] Migration compatibility check failed: ${BASH_REMATCH[1]}" >&2
        return 3
    fi
    return 0
}

# ==============================================================================
# Mode: --rollback
# ==============================================================================
if [[ "${1:-}" == "--rollback" ]]; then
    echo "=== Initiating Release Rollback ==="
    ACTIVE_RELEASE=$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)
    
    # Prefer explicitly registered previous release (F-05)
    PREV_RELEASE=""
    if [[ -f "${SHARED_DIR}/PREVIOUS_RELEASE" ]]; then
        CANDIDATE="${RELEASES_DIR}/$(cat "${SHARED_DIR}/PREVIOUS_RELEASE" 2>/dev/null || true)"
        if [[ -d "$CANDIDATE" && "$CANDIDATE" != "$ACTIVE_RELEASE" ]]; then
            PREV_RELEASE="$CANDIDATE"
        fi
    fi
    if [[ -z "$PREV_RELEASE" ]]; then
        # shellcheck disable=SC2012
        PREV_RELEASE=$(ls -1dt "${RELEASES_DIR}"/*/ 2>/dev/null | sed -e 's/\/$//' | grep -v "^${ACTIVE_RELEASE}$" | head -n 1 || true)
    fi

    if [[ -z "$PREV_RELEASE" || ! -d "$PREV_RELEASE" ]]; then
        echo "[ERROR] No previous release directory found in ${RELEASES_DIR} to rollback to!" >&2
        exit 1
    fi

    echo "[INFO] Inspecting target rollback release (${PREV_RELEASE}) migration compatibility..."
    if ! check_migration_compatibility "$PREV_RELEASE"; then
        echo "[CRITICAL] Automatic rollback rejected to prevent database schema mismatch. Restore pre-update backup manually." >&2
        exit 1
    fi

    echo "[INFO] Rolling back symlink to previous release: $PREV_RELEASE"
    ln -sfn "$PREV_RELEASE" "${BASE_DIR}/current_tmp"
    mv -Tf "${BASE_DIR}/current_tmp" "$CURRENT_LINK"
    
    # Update active release record
    basename "$PREV_RELEASE" > "${SHARED_DIR}/ACTIVE_RELEASE"
    if [[ -n "$ACTIVE_RELEASE" ]]; then
        basename "$ACTIVE_RELEASE" > "${SHARED_DIR}/PREVIOUS_RELEASE"
    fi

    systemctl daemon-reload
    systemctl restart warehouse-backend warehouse-gdrive-worker warehouse-export-worker
    nginx -t
    systemctl reload nginx
    echo "[SUCCESS] Symlink rolled back successfully to: $PREV_RELEASE"
    exit 0
fi

# ==============================================================================
# Mode: --prepare
# ==============================================================================
if [[ "${1:-}" == "--prepare" ]]; then
    shift
    BUNDLE_PATH=""
    BUNDLE_SHA256=""
    DOMAIN="soft.farsalish.ir"
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --bundle) BUNDLE_PATH="${2:-}"; shift 2 || true ;;
            --bundle-sha256) BUNDLE_SHA256="${2:-}"; shift 2 || true ;;
            --domain) DOMAIN="${2:-}"; shift 2 || true ;;
            *) echo "[ERROR] Unknown prepare option: $1" >&2; exit 1 ;;
        esac
    done

    # Validate Domain format (F-11)
    if ! [[ "$DOMAIN" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}$ ]]; then
        echo "[ERROR] Invalid domain format: $DOMAIN" >&2
        exit 1
    fi

    if [[ -z "$BUNDLE_PATH" || ! -f "$BUNDLE_PATH" ]]; then
        echo "[ERROR] Valid bundle file path required for --prepare." >&2
        exit 1
    fi

    # Check bundle sha256 checksum (F-19)
    if [[ -n "$BUNDLE_SHA256" ]]; then
        ACTUAL_SHA=$(sha256sum "$BUNDLE_PATH" | cut -d' ' -f1)
        if [[ "$ACTUAL_SHA" != "$BUNDLE_SHA256" ]]; then
            echo "[ERROR] Bundle SHA256 checksum mismatch (expected: $BUNDLE_SHA256, actual: $ACTUAL_SHA)!" >&2
            exit 1
        fi
        echo "[INFO] Bundle SHA256 checksum verified: $ACTUAL_SHA"
    fi

    mkdir -p "$RELEASES_DIR" "$VENVS_DIR" "$SHARED_DIR" "$BACKUPS_DIR"
    mkdir -p "${SHARED_DIR}/media" "${SHARED_DIR}/logs" "${SHARED_DIR}/report_exports"
    chown -R warehouse:warehouse "${SHARED_DIR}/media" "${SHARED_DIR}/logs" "${SHARED_DIR}/report_exports"
    chmod 700 "$BACKUPS_DIR"

    # Merge missing .env configuration keys during prepare (D-16, F-17)
    if [[ -f "${SHARED_DIR}/.env" ]]; then
        for key in DJANGO_MEDIA_ACCEL_REDIRECT WAREHOUSE_REPORT_EXPORT_DIR WAREHOUSE_BACKUP_DIR GOOGLE_OAUTH_REDIRECT_URI; do
            if ! grep -q "^${key}=" "${SHARED_DIR}/.env"; then
                case "$key" in
                    DJANGO_MEDIA_ACCEL_REDIRECT) echo "DJANGO_MEDIA_ACCEL_REDIRECT=1" >> "${SHARED_DIR}/.env" ;;
                    WAREHOUSE_REPORT_EXPORT_DIR) echo "WAREHOUSE_REPORT_EXPORT_DIR=${SHARED_DIR}/report_exports" >> "${SHARED_DIR}/.env" ;;
                    WAREHOUSE_BACKUP_DIR) echo "WAREHOUSE_BACKUP_DIR=${SHARED_DIR}/backups" >> "${SHARED_DIR}/.env" ;;
                    GOOGLE_OAUTH_REDIRECT_URI) echo "GOOGLE_OAUTH_REDIRECT_URI=https://${DOMAIN}/api/auth/google/callback" >> "${SHARED_DIR}/.env" ;;
                esac
            fi
        done
    fi

    # Pre-Update Database Snapshot (E-04, E-30, D-12, F-08, F-18)
    AVAIL_KB=$(df -P "$BACKUPS_DIR" | awk 'NR==2 {print $4}')
    TOTAL_KB=$(df -P "$BACKUPS_DIR" | awk 'NR==2 {print $2}')
    AVAIL_PCT=$(( AVAIL_KB * 100 / TOTAL_KB ))
    if [ "$AVAIL_PCT" -lt 10 ] || [ "$AVAIL_KB" -lt 2097152 ]; then
        echo "[ERROR] Disk space low on ${BACKUPS_DIR} (<10% or <2GB free). Aborting pre-update snapshot!" >&2
        exit 1
    fi

    DB_NAME="warehouse_db"
    if [[ -f "${SHARED_DIR}/.env" ]]; then
        ENV_DB=$(sed -n 's/^DB_NAME=//p' "${SHARED_DIR}/.env" 2>/dev/null | tail -n 1 | tr -d '\r' || true)
        if [[ -n "$ENV_DB" ]]; then DB_NAME="$ENV_DB"; fi
    fi

    if ! [[ "$DB_NAME" =~ ^[a-z_][a-z0-9_]{0,62}$ ]]; then
        echo "[ERROR] Invalid database name: $DB_NAME" >&2
        exit 1
    fi

    # Database size guard check (F-18)
    DB_SIZE_BYTES=$(runuser -u postgres -- psql -d "$DB_NAME" -XAtq -c "SELECT pg_database_size('$DB_NAME')" 2>/dev/null || echo 0)
    if [[ "$DB_SIZE_BYTES" =~ ^[0-9]+$ ]] && [ "$DB_SIZE_BYTES" -gt 0 ]; then
        EST_DUMP_KB=$(( (DB_SIZE_BYTES / 1024) / 2 ))
        if [ "$AVAIL_KB" -lt $(( EST_DUMP_KB * 2 )) ]; then
            echo "[ERROR] Disk free space (${AVAIL_KB} KB) is below 2x estimated database size (${EST_DUMP_KB} KB). Aborting snapshot!" >&2
            exit 1
        fi
    fi

    TS=$(date +"%Y%m%d_%H%M%S")
    PRE_DUMP="${BACKUPS_DIR}/db_pre_update_${TS}.dump"
    PRE_DUMP_PART="${PRE_DUMP}.part"

    cleanup_prep() {
        rm -f "${PRE_DUMP_PART:-}" "${PRE_DUMP}.sha256.tmp" 2>/dev/null || true
    }
    trap cleanup_prep EXIT INT TERM

    # Write dump to .part, verify integrity without shell injection (F-08)
    runuser -u postgres -- pg_dump -Fc "$DB_NAME" > "$PRE_DUMP_PART"
    runuser -u postgres -- pg_restore --list < "$PRE_DUMP_PART" > /dev/null
    chown warehouse:warehouse "$PRE_DUMP_PART" 2>/dev/null || true
    chmod 600 "$PRE_DUMP_PART"

    PRE_DUMP_SHA256=$(sha256sum "$PRE_DUMP_PART" | cut -d' ' -f1)
    mv -n -- "$PRE_DUMP_PART" "$PRE_DUMP"
    [[ -f "$PRE_DUMP" && ! -e "$PRE_DUMP_PART" ]] || { echo "[ERROR] Failed to finalize pre-update dump." >&2; exit 1; }

    printf '%s  %s\n' "$PRE_DUMP_SHA256" "$PRE_DUMP" > "${PRE_DUMP}.sha256.tmp"
    chown warehouse:warehouse "${PRE_DUMP}.sha256.tmp" 2>/dev/null || true
    chmod 600 "${PRE_DUMP}.sha256.tmp"
    mv -f -- "${PRE_DUMP}.sha256.tmp" "${PRE_DUMP}.sha256"

    trap - EXIT INT TERM

    # Extract Bundle and Normalize Permissions (bsdtar sets 0666/0777)
    TEMP_EXTRACT=$(mktemp -d /tmp/wh_release_XXXXXX)
    tar -xzf "$BUNDLE_PATH" -C "$TEMP_EXTRACT"

    find "$TEMP_EXTRACT" -type d -exec chmod 755 {} +
    find "$TEMP_EXTRACT" -type f -exec chmod 644 {} +
    find "$TEMP_EXTRACT" -name "*.sh" -exec chmod 755 {} +
    if [[ -f "${TEMP_EXTRACT}/warehouse-backend/manage.py" ]]; then
        chmod 755 "${TEMP_EXTRACT}/warehouse-backend/manage.py"
    fi
    chown -R root:root "$TEMP_EXTRACT"

    SHA="unknown"
    if [[ -f "${TEMP_EXTRACT}/RELEASE" ]]; then
        SHA=$(grep '^COMMIT=' "${TEMP_EXTRACT}/RELEASE" | cut -d'=' -f2 | head -c 12)
    fi
    if [[ -z "$SHA" ]]; then SHA=$(date +%s); fi

    RELEASE_NAME="${TS}_${SHA}"
    RELEASE_DIR="${RELEASES_DIR}/${RELEASE_NAME}"
    mv "$TEMP_EXTRACT" "$RELEASE_DIR"

    # Link shared environment file
    if [[ -f "${SHARED_DIR}/.env" ]]; then
        ln -sf "${SHARED_DIR}/.env" "${RELEASE_DIR}/warehouse-backend/.env"
    else
        echo "[ERROR] Production environment file ${SHARED_DIR}/.env does not exist!" >&2
        exit 1
    fi

    # Record deploy metadata for activate binding (F-19)
    cat <<EOF > "${RELEASE_DIR}/.deploy_metadata"
RELEASE_NAME=${RELEASE_NAME}
PRE_UPDATE_BACKUP=$(basename "$PRE_DUMP")
PRE_UPDATE_BACKUP_SHA256=${PRE_DUMP_SHA256}
EOF

    # Resolve Python Virtual Environment (F-06: direct creation at target path)
    LOCK_FILE_PATH="${RELEASE_DIR}/warehouse-backend/requirements.lock"
    REQ_FILE_PATH="${RELEASE_DIR}/warehouse-backend/requirements.txt"
    if [[ -f "$LOCK_FILE_PATH" ]]; then
        TARGET_REQ="$LOCK_FILE_PATH"
        PIP_FLAGS="--require-hashes"
    else
        TARGET_REQ="$REQ_FILE_PATH"
        PIP_FLAGS=""
    fi

    PY_VER=$(python3 --version 2>&1 | awk '{print $2}')
    REQ_HASH=$(sha256sum "$TARGET_REQ" | cut -d' ' -f1)
    FULL_VENV_HASH=$(printf "%s_%s" "$REQ_HASH" "$PY_VER" | sha256sum | awk '{print $1}' | head -c 16)
    VENV_DIR="${VENVS_DIR}/${FULL_VENV_HASH}"

    if [[ ! -d "$VENV_DIR" || ! -f "$VENV_DIR/.complete" ]]; then
        rm -rf "$VENV_DIR" 2>/dev/null || true
        python3 -m venv "$VENV_DIR"
        "$VENV_DIR/bin/pip" install --upgrade "pip==24.0" "setuptools==69.5.1" "wheel==0.43.0"
        "$VENV_DIR/bin/pip" install --no-cache-dir $PIP_FLAGS -r "$TARGET_REQ"
        find "$VENV_DIR" -type d -exec chmod 755 {} +
        find "$VENV_DIR" -type f -exec chmod 644 {} +
        find "$VENV_DIR/bin" -type f -exec chmod 755 {} +
        touch "$VENV_DIR/.complete"
    fi
    ln -sfn "$VENV_DIR" "${RELEASE_DIR}/venv"

    # Preserve Frontend Chunks from Active Release (E-23, E-30, F-18)
    if [[ -d "${CURRENT_LINK}/warehouse-front/dist/warehouse-app/browser" ]]; then
        PREV_BROWSER="${CURRENT_LINK}/warehouse-front/dist/warehouse-app/browser"
        NEW_BROWSER="${RELEASE_DIR}/warehouse-front/dist/warehouse-app/browser"
        if [[ -d "$NEW_BROWSER" ]]; then
            if [[ -f "${PREV_BROWSER}/ngsw.json" ]]; then
                grep -oE '"/[^"]+-[A-Za-z0-9]{8}\.(js|css)"' "${PREV_BROWSER}/ngsw.json" 2>/dev/null | tr -d '"/' | while read -r chunk; do
                    if [[ -f "${PREV_BROWSER}/${chunk}" && ! -f "${NEW_BROWSER}/${chunk}" ]]; then
                        cp -p "${PREV_BROWSER}/${chunk}" "${NEW_BROWSER}/" 2>/dev/null || true
                    fi
                done || true
            else
                find "${PREV_BROWSER}" -maxdepth 1 -type f -name "*-[A-Za-z0-9]{8}.*" \
                    -exec cp -n {} "${NEW_BROWSER}/" \; 2>/dev/null || true
            fi
        fi
    fi

    # Pre-deployment Django checks
    su -s /bin/bash warehouse -c "
        cd ${RELEASE_DIR}/warehouse-backend
        export DJANGO_SETTINGS_MODULE=config.settings
        export DJANGO_ENV=production
        ${RELEASE_DIR}/venv/bin/python manage.py check --deploy
    "

    # Show migrate --plan
    echo "=== Planned Database Migrations ==="
    su -s /bin/bash warehouse -c "
        cd ${RELEASE_DIR}/warehouse-backend
        export DJANGO_SETTINGS_MODULE=config.settings
        export DJANGO_ENV=production
        ${RELEASE_DIR}/venv/bin/python manage.py migrate --plan
    " 2>&1 || true

    # Clean unreferenced venvs (E-30)
    for v in "${VENVS_DIR}"/*; do
        if [[ -d "$v" ]]; then
            in_use=0
            for r in "${RELEASES_DIR}"/*; do
                if [[ -L "${r}/venv" ]] && [[ "$(readlink -f "${r}/venv" 2>/dev/null || true)" == "$(readlink -f "$v")" ]]; then
                    in_use=1; break
                fi
            done
            if [[ "$in_use" -eq 0 && "$(readlink -f "$v")" != "$(readlink -f "$VENV_DIR")" ]]; then
                rm -rf "$v" 2>/dev/null || true
            fi
        fi
    done

    # Print markers EXACTLY ONCE
    echo "[RELEASE] ${RELEASE_NAME}"
    echo "[PRE_UPDATE_BACKUP] $(basename "$PRE_DUMP")"
    echo "[PRE_UPDATE_BACKUP_SHA256] ${PRE_DUMP_SHA256}"
    exit 0
fi

# ==============================================================================
# Mode: --activate
# ==============================================================================
if [[ "${1:-}" == "--activate" ]]; then
    shift
    REL_NAME=""
    VERIFIED_BACKUP=""
    DOMAIN="soft.farsalish.ir"
    MAINTENANCE=0

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --verified-backup) VERIFIED_BACKUP="${2:-}"; shift 2 || true ;;
            --domain) DOMAIN="${2:-}"; shift 2 || true ;;
            --maintenance) MAINTENANCE=1; shift ;;
            *)
                if [[ -z "$REL_NAME" ]]; then
                    REL_NAME="$1"; shift
                else
                    echo "[ERROR] Unknown activate option: $1" >&2; exit 1
                fi
                ;;
        esac
    done

    if [[ -z "$REL_NAME" ]]; then
        echo "[ERROR] Release name required for --activate." >&2
        exit 1
    fi

    # Validate Domain format (F-11)
    if ! [[ "$DOMAIN" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}$ ]]; then
        echo "[ERROR] Invalid domain format: $DOMAIN" >&2
        exit 1
    fi

    RELEASE_DIR="${RELEASES_DIR}/${REL_NAME}"
    if [[ ! -d "$RELEASE_DIR" ]]; then
        echo "[ERROR] Release directory not found: $RELEASE_DIR" >&2
        exit 1
    fi

    # Validate binding to prepared backup (F-19)
    if [[ -f "${RELEASE_DIR}/.deploy_metadata" ]]; then
        EXPECTED_BACKUP=$(sed -n 's/^PRE_UPDATE_BACKUP=//p' "${RELEASE_DIR}/.deploy_metadata" | tr -d '\r')
        EXPECTED_SHA=$(sed -n 's/^PRE_UPDATE_BACKUP_SHA256=//p' "${RELEASE_DIR}/.deploy_metadata" | tr -d '\r')
        if [[ -n "$EXPECTED_BACKUP" ]]; then
            if [[ -n "$VERIFIED_BACKUP" && "$VERIFIED_BACKUP" != "$EXPECTED_BACKUP" ]]; then
                echo "[ERROR] Verified backup argument ($VERIFIED_BACKUP) does not match prepared backup ($EXPECTED_BACKUP)!" >&2
                exit 1
            fi
            VERIFIED_BACKUP="$EXPECTED_BACKUP"
            ACTUAL_BACKUP_SHA=$(sha256sum "${BACKUPS_DIR}/${VERIFIED_BACKUP}" | awk '{print $1}')
            if [[ "$ACTUAL_BACKUP_SHA" != "$EXPECTED_SHA" ]]; then
                echo "[ERROR] Prepared backup checksum mismatch ($ACTUAL_BACKUP_SHA != $EXPECTED_SHA)!" >&2
                exit 1
            fi
            echo "[INFO] Verified pre-update backup successfully bound to release: $VERIFIED_BACKUP"
        fi
    fi

    # Verify backup exists if GO_LIVE
    if [[ -f "${SHARED_DIR}/GO_LIVE" ]]; then
        if [[ -z "$VERIFIED_BACKUP" || ! -f "${BACKUPS_DIR}/${VERIFIED_BACKUP}" ]]; then
            echo "[ERROR] Production GO_LIVE is active but verified backup ${VERIFIED_BACKUP} is missing!" >&2
            exit 1
        fi
        if [[ ! -f "${BACKUPS_DIR}/${VERIFIED_BACKUP}.sha256" ]]; then
            echo "[ERROR] Verified backup companion ${VERIFIED_BACKUP}.sha256 is missing!" >&2
            exit 1
        fi
    fi

    # Check Nginx and Infrastructure BEFORE database migrations (F-03)
    echo "=== [1/5] Validating Web Server Configuration (Nginx) & Infrastructure ==="
    rm -f /etc/nginx/sites-enabled/default
    if [[ -n "$DOMAIN" && -d "${RELEASE_DIR}/scripts/deploy/templates" ]]; then
        mkdir -p /var/www/html /etc/nginx/sites-available /etc/nginx/sites-enabled
        NGINX_CONF_TMP="/etc/nginx/sites-available/warehouse.new"
        
        # Check ssl_reject_handshake support (F-12)
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
        fi

        if [[ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" && -f "${RELEASE_DIR}/scripts/deploy/templates/nginx-https.conf" ]]; then
            if [ "$SUPPORT_REJECT" -eq 1 ]; then
                sed -e "s/__DOMAIN__/${DOMAIN}/g" \
                    -e "/__SSL_REJECT_HANDSHAKE_SERVER__/{r $REJECT_FILE" -e 'd}' \
                    "${RELEASE_DIR}/scripts/deploy/templates/nginx-https.conf" > "$NGINX_CONF_TMP"
            else
                sed -e "s/__DOMAIN__/${DOMAIN}/g" \
                    -e '/__SSL_REJECT_HANDSHAKE_SERVER__/d' \
                    "${RELEASE_DIR}/scripts/deploy/templates/nginx-https.conf" > "$NGINX_CONF_TMP"
            fi
        elif [[ -f "${RELEASE_DIR}/scripts/deploy/templates/nginx-http.conf" ]]; then
            sed "s/__DOMAIN__/${DOMAIN}/g" "${RELEASE_DIR}/scripts/deploy/templates/nginx-http.conf" > "$NGINX_CONF_TMP"
        fi
        rm -f "$REJECT_FILE"

        if [[ -f "$NGINX_CONF_TMP" ]]; then
            PREV_CONF="/etc/nginx/sites-available/warehouse.prev"
            if [[ -f /etc/nginx/sites-available/warehouse ]]; then
                cp -f /etc/nginx/sites-available/warehouse "$PREV_CONF"
            fi
            mv -f "$NGINX_CONF_TMP" /etc/nginx/sites-available/warehouse
            ln -sf /etc/nginx/sites-available/warehouse /etc/nginx/sites-enabled/warehouse
            
            if ! nginx -t >/dev/null 2>&1; then
                echo "[ERROR] Nginx configuration test failed on newly rendered template! Aborting switch before database migration." >&2
                if [[ -f "$PREV_CONF" ]]; then
                    mv -f "$PREV_CONF" /etc/nginx/sites-available/warehouse
                fi
                exit 1
            fi
            rm -f "$PREV_CONF"
        fi
    fi

    # Update scripts atomically (E-08)
    if [[ -f "${RELEASE_DIR}/scripts/deploy/warehouse-deploy.sh" ]]; then
        install -m 755 "${RELEASE_DIR}/scripts/deploy/warehouse-deploy.sh" /usr/local/sbin/warehouse-deploy.tmp
        mv -f /usr/local/sbin/warehouse-deploy.tmp /usr/local/sbin/warehouse-deploy
    fi
    if [[ -f "${RELEASE_DIR}/scripts/deploy/warehouse-nightly-backup.sh" ]]; then
        install -m 755 "${RELEASE_DIR}/scripts/deploy/warehouse-nightly-backup.sh" /usr/local/bin/warehouse-nightly-backup.sh.tmp
        mv -f /usr/local/bin/warehouse-nightly-backup.sh.tmp /usr/local/bin/warehouse-nightly-backup.sh
    fi
    if [[ -f "${RELEASE_DIR}/scripts/deploy/warehouse-root-gateway.sh" ]]; then
        install -m 755 "${RELEASE_DIR}/scripts/deploy/warehouse-root-gateway.sh" /usr/local/sbin/warehouse-root-gateway.tmp
        mv -f /usr/local/sbin/warehouse-root-gateway.tmp /usr/local/sbin/warehouse-root-gateway
    fi

    # Update systemd units if changed
    if [[ -d "${RELEASE_DIR}/scripts/deploy/templates" ]]; then
        for unit in "${RELEASE_DIR}/scripts/deploy/templates"/warehouse-*.service "${RELEASE_DIR}/scripts/deploy/templates"/warehouse-*.timer; do
            if [[ -f "$unit" ]]; then
                unit_name=$(basename "$unit")
                dest="/etc/systemd/system/${unit_name}"
                if [[ ! -f "$dest" ]] || ! cmp -s "$unit" "$dest"; then
                    install -m 644 "$unit" "${dest}.tmp"
                    mv -f "${dest}.tmp" "$dest"
                fi
            fi
        done
    fi

    # Enter Maintenance Mode if requested (F-14: fail-closed service stop)
    if [[ "$MAINTENANCE" -eq 1 ]]; then
        echo "[INFO] Entering maintenance mode (503 with Retry-After)..."
        touch "${SHARED_DIR}/MAINTENANCE"
        systemctl stop warehouse-backend warehouse-gdrive-worker warehouse-export-worker
        for s in warehouse-backend warehouse-gdrive-worker warehouse-export-worker; do
            if systemctl is-active --quiet "$s"; then
                echo "[ERROR] Failed to stop $s for maintenance mode! Aborting migration." >&2
                rm -f "${SHARED_DIR}/MAINTENANCE"
                exit 1
            fi
        done
    fi

    echo "=== [2/5] Applying Database Migrations & Collecting Static Files ==="
    su -s /bin/bash warehouse -c "
        set -euo pipefail
        cd ${RELEASE_DIR}/warehouse-backend
        export DJANGO_SETTINGS_MODULE=config.settings
        export DJANGO_ENV=production
        ${RELEASE_DIR}/venv/bin/python manage.py migrate --noinput
    "

    # Make staticfiles writable for warehouse user during collectstatic (E-07)
    chown -R warehouse:warehouse "${RELEASE_DIR}/warehouse-backend"
    su -s /bin/bash warehouse -c "
        set -euo pipefail
        cd ${RELEASE_DIR}/warehouse-backend
        export DJANGO_SETTINGS_MODULE=config.settings
        export DJANGO_ENV=production
        ${RELEASE_DIR}/venv/bin/python manage.py collectstatic --noinput
    "
    chown -R root:root "$RELEASE_DIR"
    chmod -R u=rwX,go=rX "$RELEASE_DIR"

    echo "=== [3/5] Atomic Symlink Switch & Service Restart ==="
    ACTIVE_RELEASE_PREV=$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)
    ln -sfn "$RELEASE_DIR" "${BASE_DIR}/current_tmp"
    mv -Tf "${BASE_DIR}/current_tmp" "$CURRENT_LINK"

    systemctl daemon-reload
    systemctl restart warehouse-backend warehouse-gdrive-worker warehouse-export-worker
    nginx -t
    systemctl reload nginx

    echo "=== [4/5] Live Healthcheck Verification ==="
    HEALTH_FAIL=1
    for attempt in $(seq 1 30); do
        echo "[INFO] Live healthcheck probe ${attempt}/30..."
        sleep 2
        daphne_ok=0; services_ok=0; https_ok=0; workers_ok=0
        
        # Verify Daphne endpoint with proper Host and HTTPS headers (F-04)
        if curl -fsS -H "Host: ${DOMAIN}" -H "X-Forwarded-Proto: https" http://127.0.0.1:8000/api/public/config/ > /dev/null 2>&1; then
            daphne_ok=1
        fi

        active_count=0
        for s in warehouse-backend warehouse-gdrive-worker warehouse-export-worker; do
            if systemctl is-active --quiet "$s"; then active_count=$((active_count + 1)); fi
        done
        if [ "$active_count" -eq 3 ]; then services_ok=1; fi

        # Heartbeat check for background workers (F-13)
        workers_ok=1
        DB_NAME=$(sed -n 's/^DB_NAME=//p' "${SHARED_DIR}/.env" 2>/dev/null | tail -n 1 | tr -d '\r' || true)
        if [[ "$DB_NAME" =~ ^[a-z_][a-z0-9_]{0,62}$ ]]; then
            for pair in "export-worker:reports_exportworkerstatus:alive_at" "gdrive-worker:settings_system_gdrive_config:worker_heartbeat_at"; do
                IFS=: read -r label table column <<<"$pair"
                tbl_exists=$(runuser -u postgres -- psql -d "$DB_NAME" -XAtq -c "SELECT 1 FROM information_schema.tables WHERE table_name='$table'" 2>/dev/null || true)
                if [[ "$tbl_exists" == "1" ]]; then
                    age=$(runuser -u postgres -- psql -d "$DB_NAME" -XAtq -c "SELECT COALESCE(EXTRACT(EPOCH FROM now() - MAX($column))::bigint::text, '') FROM $table" 2>/dev/null || true)
                    if [[ -n "$age" && "$age" -gt 180 ]]; then
                        workers_ok=0
                        break
                    fi
                fi
            done
        fi

        if [[ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]]; then
            if curl -kfsS --resolve "${DOMAIN}:443:127.0.0.1" "https://${DOMAIN}/" > /dev/null 2>&1 && \
               curl -kfsS --resolve "${DOMAIN}:443:127.0.0.1" "https://${DOMAIN}/ngsw.json" > /dev/null 2>&1; then
                https_ok=1
            fi
        else
            https_ok=1
        fi

        if [ "$daphne_ok" -eq 1 ] && [ "$services_ok" -eq 1 ] && [ "$https_ok" -eq 1 ] && [ "$workers_ok" -eq 1 ]; then
            HEALTH_FAIL=0
            break
        fi
    done

    # Rollback or Maintenance Mode Exit
    if [[ "$HEALTH_FAIL" -ne 0 ]]; then
        echo "[CRITICAL] Healthcheck verification failed after 60s!" >&2
        if [[ "$MAINTENANCE" -eq 1 ]]; then
            echo "[CRITICAL] System remains in MAINTENANCE mode. Schema changes may require forward-fix or manual restore." >&2
            exit 1
        else
            echo "[CRITICAL] Attempting safe automatic rollback to previous release..." >&2
            if [[ -n "$ACTIVE_RELEASE_PREV" && -d "$ACTIVE_RELEASE_PREV" ]]; then
                if check_migration_compatibility "$ACTIVE_RELEASE_PREV"; then
                    ln -sfn "$ACTIVE_RELEASE_PREV" "${BASE_DIR}/current_tmp"
                    mv -Tf "${BASE_DIR}/current_tmp" "$CURRENT_LINK"
                    systemctl restart warehouse-backend warehouse-gdrive-worker warehouse-export-worker
                    if nginx -t >/dev/null 2>&1; then systemctl reload nginx 2>/dev/null || true; fi
                    echo "[INFO] Automatic rollback completed after failed deployment." >&2
                else
                    echo "[CRITICAL] Automatic rollback aborted: applied migrations are incompatible with previous release!" >&2
                    touch "${SHARED_DIR}/MAINTENANCE"
                    echo "[CRITICAL] System placed in MAINTENANCE mode to prevent corrupted state." >&2
                fi
            fi
            exit 1
        fi
    fi

    # Exit maintenance mode upon confirmed healthcheck
    if [[ "$MAINTENANCE" -eq 1 ]]; then
        rm -f "${SHARED_DIR}/MAINTENANCE"
        echo "[INFO] Maintenance mode ended successfully."
    fi

    echo "=== [5/5] Deployment Finalized ==="
    # Record active and previous releases (F-05)
    echo "$REL_NAME" > "${SHARED_DIR}/ACTIVE_RELEASE"
    if [[ -n "$ACTIVE_RELEASE_PREV" && -d "$ACTIVE_RELEASE_PREV" ]]; then
        basename "$ACTIVE_RELEASE_PREV" > "${SHARED_DIR}/PREVIOUS_RELEASE"
    fi

    # Prune old releases safely (keep newest 5, never prune current or previous) (F-16)
    CURRENT_BASENAME="$REL_NAME"
    PREV_BASENAME=""
    if [[ -f "${SHARED_DIR}/PREVIOUS_RELEASE" ]]; then
        PREV_BASENAME=$(cat "${SHARED_DIR}/PREVIOUS_RELEASE" 2>/dev/null || true)
    fi

    cd "$RELEASES_DIR"
    # shellcheck disable=SC2012
    for rdir in $(ls -1dt */ 2>/dev/null | sed 's/\/$//' | tail -n +6); do
        if [[ "$rdir" != "$CURRENT_BASENAME" && "$rdir" != "$PREV_BASENAME" ]]; then
            echo "[INFO] Pruning obsolete release: $rdir"
            rm -rf "${RELEASES_DIR:?}/${rdir}" 2>/dev/null || true
        fi
    done

    echo "[SUCCESS] Release activated successfully: $REL_NAME"
    exit 0
fi

echo "[ERROR] warehouse-deploy requires one of: --prepare, --activate, or --rollback" >&2
exit 1
