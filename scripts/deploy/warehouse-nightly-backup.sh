#!/usr/bin/env bash
# ==============================================================================
# Warehouse Management System - Nightly Database & Media Backup Script
# Location: /usr/local/bin/warehouse-nightly-backup.sh
# Scheduled via systemd timer at 02:30 Asia/Tehran
# Note: Strictly ASCII / English to prevent encoding corruption.
# ==============================================================================
set -euo pipefail

# --prefix nightly|manual|pre_restore|pre_module (default nightly). deploy.ps1 uses manual, pre_restore and pre_module
# and reads the [BACKUP_DB] / [BACKUP_DB_SHA256] markers printed at the end.
PREFIX="nightly"
while [[ $# -gt 0 ]]; do
    case "$1" in
        --prefix)
            PREFIX="${2:-}"
            shift 2 || { echo "[ERROR] --prefix needs a value" >&2; exit 2; }
            ;;
        *) echo "[ERROR] Unknown argument: $1" >&2; exit 2 ;;
    esac
done
case "$PREFIX" in
    nightly|manual|pre_restore|pre_module) ;;
    *) echo "[ERROR] --prefix must be nightly, manual, pre_restore or pre_module" >&2; exit 2 ;;
esac

# Root-only /run, not the world-writable /var/lock, so no other user can pre-create the lock file.
LOCK_FILE="/run/warehouse-backup.lock"
exec 201>"$LOCK_FILE"
if [[ "$PREFIX" == "nightly" ]]; then
    flock -n 201 || { echo "[WARNING] Another backup is already in progress. Skipping." >&2; exit 0; }
else
    # An on-demand backup must never report success without producing a file.
    flock -w 900 201 || { echo "[ERROR] Another backup held the lock for 15 minutes; no backup was made." >&2; exit 1; }
fi

SHARED_DIR="/var/www/warehouse/shared"
BACKUP_DIR="${SHARED_DIR}/backups"
MEDIA_DIR="${SHARED_DIR}/media"
ENV_FILE="${SHARED_DIR}/.env"

# G-01: backups/ is root:warehouse 0710 (the application user may only traverse it to reach its
# own backups/db). It can therefore never pre-create or swap a name this root script writes, and
# every file and directory written here stays root's.
if [[ -L "$BACKUP_DIR" ]]; then echo "[ERROR] $BACKUP_DIR is a symlink; refusing to continue." >&2; exit 1; fi
mkdir -p "$BACKUP_DIR"
chown root:warehouse "$BACKUP_DIR"
chmod 0710 "$BACKUP_DIR"
umask 077

TS=$(date +"%Y%m%d_%H%M%S")
echo "=== [1/5] Starting Backup (${PREFIX}) at ${TS} ==="

DB_NAME="warehouse_db"
if [[ -f "$ENV_FILE" ]]; then
    ENV_DB=$(sed -n 's/^DB_NAME=//p' "$ENV_FILE" 2>/dev/null | tail -n 1 | tr -d '\r' || true)
    if [[ -n "$ENV_DB" ]]; then
        DB_NAME="$ENV_DB"
    fi
fi

if ! [[ "$DB_NAME" =~ ^[a-z_][a-z0-9_]{0,62}$ ]]; then
    echo "[ERROR] Invalid database name from environment: $DB_NAME" >&2
    exit 1
fi

# 1. Disk Space Safety Guard (Section 4.2 / D-12, F-18)
# Ensure at least 10% or 2GB free space on backup volume, and at least 2x DB size
AVAIL_KB=$(df -P "$BACKUP_DIR" | awk 'NR==2 {print $4}')
TOTAL_KB=$(df -P "$BACKUP_DIR" | awk 'NR==2 {print $2}')
AVAIL_PCT=$(( AVAIL_KB * 100 / TOTAL_KB ))

echo "[INFO] Disk status on ${BACKUP_DIR}: ${AVAIL_PCT}% available (${AVAIL_KB} KB free)."
if [ "$AVAIL_PCT" -lt 10 ] || [ "$AVAIL_KB" -lt 2097152 ]; then
    echo "[ERROR] Disk free space is below safety threshold (<10% or <2GB free). Aborting backup to protect database service!" >&2
    exit 1
fi

DB_SIZE_BYTES=$(runuser -u postgres -- psql -d "$DB_NAME" -XAtq -c "SELECT pg_database_size('$DB_NAME')" 2>/dev/null || echo 0)
if [[ "$DB_SIZE_BYTES" =~ ^[0-9]+$ ]] && [ "$DB_SIZE_BYTES" -gt 0 ]; then
    EST_DUMP_KB=$(( (DB_SIZE_BYTES / 1024) / 2 ))
    if [ "$AVAIL_KB" -lt $(( EST_DUMP_KB * 2 )) ]; then
        echo "[ERROR] Disk free space (${AVAIL_KB} KB) is below 2x estimated compressed dump size (${EST_DUMP_KB} KB). Aborting backup!" >&2
        exit 1
    fi
fi

if [ "$AVAIL_PCT" -lt 20 ]; then
    echo "[WARNING] Disk space is below 20%! High disk usage warning." >&2
fi

# 2. Database Backup (PostgreSQL custom format .dump)
echo "=== [2/5] Creating Database Snapshot ==="
DB_DUMP_FILE="${BACKUP_DIR}/db_${PREFIX}_${TS}.dump"
DB_DUMP_PART="${DB_DUMP_FILE}.part"

MEDIA_STAGE=""
cleanup_dump() {
    rm -f "${DB_DUMP_PART:-}" "${DB_DUMP_FILE:-}.sha256.tmp" 2>/dev/null || true
    if [[ -n "$MEDIA_STAGE" && -d "$MEDIA_STAGE" ]]; then rm -rf -- "$MEDIA_STAGE"; fi
}
trap cleanup_dump EXIT INT TERM

# Run without shell string interpolation (F-08); noclobber never writes through an existing name.
( set -C; runuser -u postgres -- pg_dump -Fc "$DB_NAME" > "$DB_DUMP_PART" )

# Verify dump file integrity with pg_restore list
runuser -u postgres -- pg_restore --list < "$DB_DUMP_PART" > /dev/null

# Generate SHA256 checksum
DB_DUMP_SHA256=$(sha256sum "$DB_DUMP_PART" | cut -d' ' -f1)
mv -n -- "$DB_DUMP_PART" "$DB_DUMP_FILE"
[[ -f "$DB_DUMP_FILE" && ! -e "$DB_DUMP_PART" ]] || { echo "[ERROR] Could not move the verified dump into place." >&2; exit 1; }
( set -C; printf '%s  %s\n' "$DB_DUMP_SHA256" "$DB_DUMP_FILE" > "${DB_DUMP_FILE}.sha256.tmp" )
mv -f -- "${DB_DUMP_FILE}.sha256.tmp" "${DB_DUMP_FILE}.sha256"
echo "[SUCCESS] Verified database backup: ${DB_DUMP_FILE}"

# 3. Environment Secrets Backup
echo "=== [3/5] Backing up Environment File ==="
if [[ -f "$ENV_FILE" ]]; then
    ENV_BACKUP="${BACKUP_DIR}/.env.soft-${TS}"
    ( set -C; cat -- "$ENV_FILE" > "$ENV_BACKUP" )
    ( set -C; sha256sum "$ENV_BACKUP" > "${ENV_BACKUP}.sha256" )
    echo "[SUCCESS] Backed up .env to ${ENV_BACKUP}"
fi

# 4. Incremental Media Backup via rsync hardlinks
echo "=== [4/5] Incremental Media Backup ==="
if [[ "$PREFIX" != "nightly" ]]; then
    echo "[INFO] Media snapshot is taken by the nightly run only."
elif [[ -d "$MEDIA_DIR" ]]; then
    CURRENT_MEDIA_BACKUP="${BACKUP_DIR}/media_daily_${TS}"
    LATEST_MEDIA_LINK="${BACKUP_DIR}/latest_media"

    RSYNC_OPTS=(-a --delete)
    if [[ -d "$LATEST_MEDIA_LINK" ]]; then
        RSYNC_OPTS+=(--link-dest="$LATEST_MEDIA_LINK")
        echo "[INFO] Using hardlink-dest against latest media snapshot."
    fi

    # rsync copies the media directory's owner and mode onto its target, so it writes inside a
    # root-only staging directory; the snapshot is locked down (root:root 0700) before it gets its name.
    MEDIA_STAGE=$(mktemp -d "${BACKUP_DIR}/.incoming_media_XXXXXX")
    rsync "${RSYNC_OPTS[@]}" "${MEDIA_DIR}/" "${MEDIA_STAGE}/media/"
    chown root:root "${MEDIA_STAGE}/media"
    chmod 700 "${MEDIA_STAGE}/media"
    mv -T -- "${MEDIA_STAGE}/media" "$CURRENT_MEDIA_BACKUP"
    rmdir -- "$MEDIA_STAGE"
    MEDIA_STAGE=""

    # Update latest symlink
    ln -sfn "$CURRENT_MEDIA_BACKUP" "$LATEST_MEDIA_LINK"
    echo "[SUCCESS] Media backup completed: ${CURRENT_MEDIA_BACKUP}"
fi

# 4b. TLS Certificate Expiry Logging
DOMAIN_FILE="${SHARED_DIR}/DOMAIN"
if [[ -f "$DOMAIN_FILE" ]] && command -v openssl >/dev/null 2>&1; then
    CERT_DOMAIN=$(head -n 1 "$DOMAIN_FILE" 2>/dev/null | tr -d '\r\n' || true)
    if [[ -n "$CERT_DOMAIN" ]]; then
        CERT_MODE_LOG=$(cat "${SHARED_DIR}/CERT_MODE" 2>/dev/null | tr -d '\r\n' || true)
        if [[ -z "$CERT_MODE_LOG" ]]; then CERT_MODE_LOG="http01"; fi
        CERT_FILE="/etc/warehouse/tls/${CERT_DOMAIN}/fullchain.pem"
        if [[ ! -f "$CERT_FILE" && -f "/etc/letsencrypt/live/${CERT_DOMAIN}/cert.pem" ]]; then
            CERT_FILE="/etc/letsencrypt/live/${CERT_DOMAIN}/cert.pem"
        fi
        if [[ -f "$CERT_FILE" ]]; then
            EXP_DATE=$(openssl x509 -enddate -noout -in "$CERT_FILE" 2>/dev/null | cut -d= -f2 || true)
            if [[ -n "$EXP_DATE" ]]; then
                DAYS_LEFT=$(( ( $(date -d "$EXP_DATE" +%s) - $(date +%s) ) / 86400 ))
                echo "[INFO] TLS certificate (${CERT_MODE_LOG}) for ${CERT_DOMAIN} expires in ${DAYS_LEFT} days (${EXP_DATE})."
                if [[ "$CERT_MODE_LOG" == "cloudflare-origin" || "$CERT_MODE_LOG" == "custom" ]]; then
                    if [[ "$DAYS_LEFT" -lt 30 ]]; then
                        echo "[WARNING] TLS certificate (${CERT_MODE_LOG}) expires in less than 30 days (${DAYS_LEFT} days left)."
                    fi
                elif [[ "$DAYS_LEFT" -lt 21 ]]; then
                    echo "[WARNING] TLS certificate (${CERT_MODE_LOG}) expires in less than 21 days (${DAYS_LEFT} days left)."
                fi
            fi
        fi
    fi
fi

# Reset trap
trap - EXIT INT TERM

# 5. Backup Retention Policy
# Per user decision (Section 1.2, 4.2), ZERO automatic deletion is performed.
echo "=== [5/5] Backup Completed Successfully at $(date) ==="
echo "[BACKUP_DB] $(basename "$DB_DUMP_FILE")"
echo "[BACKUP_DB_SHA256] ${DB_DUMP_SHA256}"
