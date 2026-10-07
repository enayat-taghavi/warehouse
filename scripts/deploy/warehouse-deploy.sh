#!/usr/bin/env bash
# ==============================================================================
# Warehouse Management System - Production Atomic Deployment Script
# Target: /usr/local/sbin/warehouse-deploy
# Note: Strictly ASCII / English to prevent encoding corruption.
# ==============================================================================
set -euo pipefail

LOCK_FILE="/var/lock/warehouse-deploy.lock"
exec 200>"$LOCK_FILE"
flock -n 200 || { echo "[ERROR] Another deployment is already in progress. Aborting." >&2; exit 1; }

# Base filesystem layout (must be defined before rollback block for Guardian 53)
BASE_DIR="/var/www/warehouse"
RELEASES_DIR="${BASE_DIR}/releases"
VENVS_DIR="${BASE_DIR}/venvs"
SHARED_DIR="${BASE_DIR}/shared"
CURRENT_LINK="${BASE_DIR}/current"
BACKUPS_DIR="${SHARED_DIR}/backups"

# ==============================================================================
# Mode: --rollback
# ==============================================================================
if [[ "${1:-}" == "--rollback" ]]; then
    echo "=== Initiating Release Rollback ==="
    ACTIVE_RELEASE=$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)
    # shellcheck disable=SC2012
    PREV_RELEASE=$(ls -1dt "${RELEASES_DIR}"/*/ 2>/dev/null | sed -e 's/\/$//' | grep -v "^${ACTIVE_RELEASE}$" | head -n 1 || true)
    if [[ -z "$PREV_RELEASE" || ! -d "$PREV_RELEASE" ]]; then
        echo "[ERROR] No previous release directory found in ${RELEASES_DIR} to rollback to!" >&2
        exit 1
    fi

    # Check forward migration conflict (E-05)
    echo "[INFO] Inspecting target rollback release migration compatibility..."
    if [[ -x "${PREV_RELEASE}/venv/bin/python" && -f "${PREV_RELEASE}/warehouse-backend/manage.py" ]]; then
        MIG_CHECK=$(su -s /bin/bash warehouse -c "
            export DJANGO_SETTINGS_MODULE=config.settings
            export DJANGO_ENV=production
            ${PREV_RELEASE}/venv/bin/python -c '
import sys, django
django.setup()
from django.db import connection
from django.db.migrations.loader import MigrationLoader
try:
    loader = MigrationLoader(connection, ignore_no_migrations=True)
    loader.build_graph()
    applied = set(loader.applied_migrations.keys())
    disk = set(loader.disk_migrations.keys())
    forward = applied - disk
    if forward:
        print(\"FORWARD_MIGRATIONS:\" + \", \".join(f\"{a}.{b}\" for a, b in forward))
        sys.exit(2)
    sys.exit(0)
except Exception as e:
    print(\"MIGRATION_CHECK_ERROR:\" + str(e))
    sys.exit(0)
' 2>&1" || true)
        if [[ "$MIG_CHECK" =~ FORWARD_MIGRATIONS:(.+) ]]; then
            echo "[CRITICAL] Cannot safely rollback to ${PREV_RELEASE}!" >&2
            echo "[CRITICAL] Database has applied migrations unknown to the target release: ${BASH_REMATCH[1]}" >&2
            echo "[CRITICAL] Automatic rollback rejected to prevent database schema mismatch. Restore pre-update backup manually." >&2
            exit 1
        fi
    fi

    echo "[INFO] Rolling back symlink to previous release: $PREV_RELEASE"
    ln -sfn "$PREV_RELEASE" "${BASE_DIR}/current_tmp"
    mv -Tf "${BASE_DIR}/current_tmp" "$CURRENT_LINK"
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

    if [[ -z "$BUNDLE_PATH" || ! -f "$BUNDLE_PATH" ]]; then
        echo "[ERROR] Valid bundle file path required for --prepare." >&2
        exit 1
    fi

    # Check bundle sha256 checksum
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

    # Pre-Update Database Snapshot (E-04, E-30, D-12)
    AVAIL_KB=$(df -P "$BACKUPS_DIR" | awk 'NR==2 {print $4}')
    TOTAL_KB=$(df -P "$BACKUPS_DIR" | awk 'NR==2 {print $2}')
    AVAIL_PCT=$(( AVAIL_KB * 100 / TOTAL_KB ))
    if [ "$AVAIL_PCT" -lt 10 ] || [ "$AVAIL_KB" -lt 2097152 ]; then
        echo "[ERROR] Disk space low on ${BACKUPS_DIR} (<10% or <2GB free). Aborting pre-update snapshot!" >&2
        exit 1
    fi

    DB_NAME="warehouse_db"
    if [[ -f "${SHARED_DIR}/.env" ]]; then
        ENV_DB=$(grep -E '^DB_NAME=' "${SHARED_DIR}/.env" 2>/dev/null | cut -d'=' -f2- | tr -d '\r' || true)
        if [[ -n "$ENV_DB" ]]; then DB_NAME="$ENV_DB"; fi
    fi

    TS=$(date +"%Y%m%d_%H%M%S")
    PRE_DUMP="${BACKUPS_DIR}/db_pre_update_${TS}.dump"
    PRE_DUMP_PART="${PRE_DUMP}.part"

    # Write dump to .part, verify integrity, then atomic rename
    su - postgres -c "pg_dump -Fc \"$DB_NAME\"" > "$PRE_DUMP_PART"
    su - postgres -c "pg_restore --list" < "$PRE_DUMP_PART" > /dev/null
    chown warehouse:warehouse "$PRE_DUMP_PART"
    chmod 600 "$PRE_DUMP_PART"

    PRE_DUMP_SHA256=$(sha256sum "$PRE_DUMP_PART" | cut -d' ' -f1)
    mv -n -- "$PRE_DUMP_PART" "$PRE_DUMP"
    [[ -f "$PRE_DUMP" && ! -e "$PRE_DUMP_PART" ]] || { echo "[ERROR] Failed to finalize pre-update dump." >&2; exit 1; }

    printf '%s  %s\n' "$PRE_DUMP_SHA256" "$PRE_DUMP" > "${PRE_DUMP}.sha256.tmp"
    chown warehouse:warehouse "${PRE_DUMP}.sha256.tmp"
    chmod 600 "${PRE_DUMP}.sha256.tmp"
    mv -f -- "${PRE_DUMP}.sha256.tmp" "${PRE_DUMP}.sha256"

    # Extract Bundle and Normalize Permissions (bsdtar sets 0666/0777)
    TEMP_EXTRACT=$(mktemp -d /tmp/wh_release_XXXXXX)
    tar -xzf "$BUNDLE_PATH" -C "$TEMP_EXTRACT"

    # Normalize permissions immediately
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

    # Resolve Python Virtual Environment
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
        rm -rf "${VENV_DIR}.tmp" 2>/dev/null || true
        python3 -m venv "${VENV_DIR}.tmp"
        "${VENV_DIR}.tmp/bin/pip" install --upgrade "pip==24.0" "setuptools==69.5.1" "wheel==0.43.0" 2>/dev/null || \
            "${VENV_DIR}.tmp/bin/pip" install --upgrade pip setuptools wheel
        "${VENV_DIR}.tmp/bin/pip" install --no-cache-dir $PIP_FLAGS -r "$TARGET_REQ"
        chmod -R 755 "${VENV_DIR}.tmp"
        touch "${VENV_DIR}.tmp/.complete"
        mv -Tf "${VENV_DIR}.tmp" "$VENV_DIR"
    fi
    ln -sfn "$VENV_DIR" "${RELEASE_DIR}/venv"

    # Preserve Frontend Chunks from Previous Release (E-23, E-30)
    if [[ -d "${CURRENT_LINK}/warehouse-front/dist/warehouse-app/browser" ]]; then
        PREV_BROWSER="${CURRENT_LINK}/warehouse-front/dist/warehouse-app/browser"
        NEW_BROWSER="${RELEASE_DIR}/warehouse-front/dist/warehouse-app/browser"
        if [[ -d "$NEW_BROWSER" ]]; then
            find "${PREV_BROWSER}" -maxdepth 1 -type f -name "*-[A-Za-z0-9][A-Za-z0-9][A-Za-z0-9][A-Za-z0-9][A-Za-z0-9][A-Za-z0-9][A-Za-z0-9][A-Za-z0-9].*" \
                -exec cp -n {} "${NEW_BROWSER}/" \; 2>/dev/null || true
        fi
    fi

    # Pre-deployment Django checks
    su -s /bin/bash warehouse -c "
        export DJANGO_SETTINGS_MODULE=config.settings
        export DJANGO_ENV=production
        ${RELEASE_DIR}/venv/bin/python ${RELEASE_DIR}/warehouse-backend/manage.py check --deploy
    "

    # Show migrate --plan
    echo "=== Planned Database Migrations ==="
    su -s /bin/bash warehouse -c "
        export DJANGO_SETTINGS_MODULE=config.settings
        export DJANGO_ENV=production
        ${RELEASE_DIR}/venv/bin/python ${RELEASE_DIR}/warehouse-backend/manage.py migrate --plan
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
    # Detach from SSH terminal session to survive SIGHUP
    trap '' HUP
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

    RELEASE_DIR="${RELEASES_DIR}/${REL_NAME}"
    if [[ ! -d "$RELEASE_DIR" ]]; then
        echo "[ERROR] Release directory not found: $RELEASE_DIR" >&2
        exit 1
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

    # Enter Maintenance Mode if requested
    if [[ "$MAINTENANCE" -eq 1 ]]; then
        echo "[INFO] Entering maintenance mode (503 with Retry-After)..."
        touch "${SHARED_DIR}/MAINTENANCE"
        systemctl stop warehouse-backend warehouse-gdrive-worker warehouse-export-worker 2>/dev/null || true
    fi

    echo "=== [1/5] Applying Database Migrations & Collecting Static Files ==="
    # Database migration with set -e (E-06)
    su -s /bin/bash warehouse -c "
        set -euo pipefail
        export DJANGO_SETTINGS_MODULE=config.settings
        export DJANGO_ENV=production
        ${RELEASE_DIR}/venv/bin/python ${RELEASE_DIR}/warehouse-backend/manage.py migrate --noinput
    "

    # Make staticfiles writable for warehouse user during collectstatic (E-07)
    chown -R warehouse:warehouse "${RELEASE_DIR}/warehouse-backend"
    su -s /bin/bash warehouse -c "
        set -euo pipefail
        export DJANGO_SETTINGS_MODULE=config.settings
        export DJANGO_ENV=production
        ${RELEASE_DIR}/venv/bin/python ${RELEASE_DIR}/warehouse-backend/manage.py collectstatic --noinput
    "
    chown -R root:root "$RELEASE_DIR"
    chmod -R u=rwX,go=rX "$RELEASE_DIR"

    echo "=== [2/5] Updating Infrastructure Files & Testing Nginx ==="
    # Atomic updates of scripts (E-08)
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

    # Render & validate Nginx configuration (E-10, E-22)
    if [[ -n "$DOMAIN" && -d "${RELEASE_DIR}/scripts/deploy/templates" ]]; then
        mkdir -p /var/www/html /etc/nginx/sites-available /etc/nginx/sites-enabled
        NGINX_CONF_TMP="/etc/nginx/sites-available/warehouse.tmp"
        if [[ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" && -f "${RELEASE_DIR}/scripts/deploy/templates/nginx-https.conf" ]]; then
            sed "s/__DOMAIN__/${DOMAIN}/g" "${RELEASE_DIR}/scripts/deploy/templates/nginx-https.conf" > "$NGINX_CONF_TMP"
        elif [[ -f "${RELEASE_DIR}/scripts/deploy/templates/nginx-http.conf" ]]; then
            sed "s/__DOMAIN__/${DOMAIN}/g" "${RELEASE_DIR}/scripts/deploy/templates/nginx-http.conf" > "$NGINX_CONF_TMP"
        fi
        if [[ -f "$NGINX_CONF_TMP" ]]; then
            ln -sf "$NGINX_CONF_TMP" /etc/nginx/sites-enabled/warehouse_test
            if ! nginx -t >/dev/null 2>&1; then
                rm -f /etc/nginx/sites-enabled/warehouse_test "$NGINX_CONF_TMP"
                echo "[ERROR] Nginx configuration test failed on newly rendered template! Aborting switch." >&2
                exit 1
            fi
            rm -f /etc/nginx/sites-enabled/warehouse_test
            mv -f "$NGINX_CONF_TMP" /etc/nginx/sites-available/warehouse
            ln -sf /etc/nginx/sites-available/warehouse /etc/nginx/sites-enabled/warehouse
            rm -f /etc/nginx/sites-enabled/default
        fi
    fi

    echo "=== [3/5] Atomic Symlink Switch & Service Restart ==="
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
        daphne_ok=0; services_ok=0; https_ok=0
        if curl -fsS http://127.0.0.1:8000/api/public/config/ > /dev/null 2>&1; then daphne_ok=1; fi
        active_count=0
        for s in warehouse-backend warehouse-gdrive-worker warehouse-export-worker; do
            if systemctl is-active --quiet "$s"; then active_count=$((active_count + 1)); fi
        done
        if [ "$active_count" -eq 3 ]; then services_ok=1; fi

        if [[ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]]; then
            if curl -fsS --resolve "${DOMAIN}:443:127.0.0.1" "https://${DOMAIN}/" > /dev/null 2>&1 && \
               curl -fsS --resolve "${DOMAIN}:443:127.0.0.1" "https://${DOMAIN}/ngsw.json" > /dev/null 2>&1; then
                https_ok=1
            fi
        else
            https_ok=1
        fi

        if [ "$daphne_ok" -eq 1 ] && [ "$services_ok" -eq 1 ] && [ "$https_ok" -eq 1 ]; then
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
            echo "[CRITICAL] Rolling back symlink to previous release..." >&2
            ACTIVE_RELEASE=$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)
            # shellcheck disable=SC2012
            PREV_RELEASE=$(ls -1dt "${RELEASES_DIR}"/*/ 2>/dev/null | sed -e 's/\/$//' | grep -v "^${ACTIVE_RELEASE}$" | head -n 1 || true)
            if [[ -n "$PREV_RELEASE" && -d "$PREV_RELEASE" ]]; then
                ln -sfn "$PREV_RELEASE" "${BASE_DIR}/current_tmp"
                mv -Tf "${BASE_DIR}/current_tmp" "$CURRENT_LINK"
                systemctl restart warehouse-backend warehouse-gdrive-worker warehouse-export-worker
                if nginx -t >/dev/null 2>&1; then systemctl reload nginx 2>/dev/null || true; fi
                echo "[INFO] Rollback completed after failed deployment." >&2
            fi
            exit 1
        fi
    fi

    # Exit maintenance mode only upon confirmed healthcheck
    if [[ "$MAINTENANCE" -eq 1 ]]; then
        rm -f "${SHARED_DIR}/MAINTENANCE"
        echo "[INFO] Maintenance mode ended successfully."
    fi

    echo "=== [5/5] Deployment Finalized ==="
    # Prune old releases (keep last 5)
    cd "$RELEASES_DIR"
    # shellcheck disable=SC2012,SC2035
    ls -1dt */ 2>/dev/null | tail -n +6 | xargs rm -rf 2>/dev/null || true
    echo "[SUCCESS] Release activated successfully: $REL_NAME"
    exit 0
fi

# ==============================================================================
# Legacy / Combined Orchestration (Fallback & Initial Setup)
# ==============================================================================
BUNDLE_PATH="${1:-/tmp/deploy_bundle.tar.gz}"
DOMAIN="${2:-soft.farsalish.ir}"
MAINTENANCE="${3:-0}"

if [[ ! -f "$BUNDLE_PATH" ]]; then
    echo "[ERROR] Bundle file not found at: $BUNDLE_PATH" >&2
    exit 1
fi

PREPARE_OUTPUT=$(/usr/local/sbin/warehouse-deploy --prepare --bundle "$BUNDLE_PATH" --domain "$DOMAIN")
REL=$(echo "$PREPARE_OUTPUT" | grep '^\[RELEASE\]' | awk '{print $2}')
BAK=$(echo "$PREPARE_OUTPUT" | grep '^\[PRE_UPDATE_BACKUP\]' | awk '{print $2}')

if [[ -z "$REL" ]]; then
    echo "[ERROR] Could not determine prepared release name." >&2
    exit 1
fi

ACT_ARGS=(--activate "$REL" --domain "$DOMAIN" --verified-backup "$BAK")
if [[ "$MAINTENANCE" -eq 1 || "$MAINTENANCE" == "--maintenance" ]]; then
    ACT_ARGS+=(--maintenance)
fi

exec /usr/local/sbin/warehouse-deploy "${ACT_ARGS[@]}"
