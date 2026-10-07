#!/usr/bin/env bash
# ==============================================================================
# Warehouse Management System - Nightly Database & Media Backup Script
# Location: /usr/local/bin/warehouse-nightly-backup.sh
# Scheduled via systemd timer at 02:30 Asia/Tehran
# Note: Strictly ASCII / English to prevent encoding corruption.
# ==============================================================================
set -euo pipefail

# --prefix nightly|manual|pre_restore (default nightly). deploy.ps1 uses manual and pre_restore
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
    nightly|manual|pre_restore) ;;
    *) echo "[ERROR] --prefix must be nightly, manual or pre_restore" >&2; exit 2 ;;
esac

LOCK_FILE="/var/lock/warehouse-backup.lock"
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

mkdir -p "$BACKUP_DIR"
chown -R warehouse:warehouse "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

TS=$(date +"%Y%m%d_%H%M%S")
echo "=== [1/5] Starting Nightly Backup at ${TS} ==="

# 1. Disk Space Safety Guard (Section 4.2 / D-12)
# Ensure at least 10% or 2GB free space on backup volume to prevent crashing PostgreSQL
AVAIL_KB=$(df -P "$BACKUP_DIR" | awk 'NR==2 {print $4}')
TOTAL_KB=$(df -P "$BACKUP_DIR" | awk 'NR==2 {print $2}')
AVAIL_PCT=$(( AVAIL_KB * 100 / TOTAL_KB ))

echo "[INFO] Disk status on ${BACKUP_DIR}: ${AVAIL_PCT}% available (${AVAIL_KB} KB free)."
if [ "$AVAIL_PCT" -lt 10 ] || [ "$AVAIL_KB" -lt 2097152 ]; then
    echo "[ERROR] Disk free space is below safety threshold (<10% or <2GB free). Aborting backup to protect database service!" >&2
    exit 1
fi

if [ "$AVAIL_PCT" -lt 20 ]; then
    echo "[WARNING] Disk space is below 20%! High disk usage warning." >&2
fi

# 2. Database Backup (PostgreSQL custom format .dump)
echo "=== [2/5] Creating Database Snapshot ==="
DB_NAME="warehouse_db"
if [[ -f "$ENV_FILE" ]]; then
    ENV_DB=$(grep '^DB_NAME=' "$ENV_FILE" | cut -d'=' -f2 || true)
    if [[ -n "$ENV_DB" ]]; then
        DB_NAME="$ENV_DB"
    fi
fi

DB_DUMP_FILE="${BACKUP_DIR}/db_${PREFIX}_${TS}.dump"
# Written to .part and renamed only after verification, so a failed dump never appears as a complete *.dump.
DB_DUMP_PART="${DB_DUMP_FILE}.part"
su - postgres -c "pg_dump -Fc \"$DB_NAME\"" > "$DB_DUMP_PART"

# Verify dump file integrity with pg_restore list
su - postgres -c "pg_restore --list" < "$DB_DUMP_PART" > /dev/null
chown warehouse:warehouse "$DB_DUMP_PART"
chmod 600 "$DB_DUMP_PART"

# Generate SHA256 checksum
DB_DUMP_SHA256=$(sha256sum "$DB_DUMP_PART" | cut -d' ' -f1)
mv -n -- "$DB_DUMP_PART" "$DB_DUMP_FILE"
[[ -f "$DB_DUMP_FILE" && ! -e "$DB_DUMP_PART" ]] || { echo "[ERROR] Could not move the verified dump into place." >&2; exit 1; }
printf '%s  %s\n' "$DB_DUMP_SHA256" "$DB_DUMP_FILE" > "${DB_DUMP_FILE}.sha256.tmp"
chown warehouse:warehouse "${DB_DUMP_FILE}.sha256.tmp"
chmod 600 "${DB_DUMP_FILE}.sha256.tmp"
mv -f -- "${DB_DUMP_FILE}.sha256.tmp" "${DB_DUMP_FILE}.sha256"
echo "[SUCCESS] Verified database backup: ${DB_DUMP_FILE}"

# 3. Environment Secrets Backup
echo "=== [3/5] Backing up Environment File ==="
if [[ -f "$ENV_FILE" ]]; then
    ENV_BACKUP="${BACKUP_DIR}/.env.soft-${TS}"
    cp "$ENV_FILE" "$ENV_BACKUP"
    chown warehouse:warehouse "$ENV_BACKUP"
    chmod 600 "$ENV_BACKUP"
    sha256sum "$ENV_BACKUP" > "${ENV_BACKUP}.sha256"
    chown warehouse:warehouse "${ENV_BACKUP}.sha256"
    chmod 600 "${ENV_BACKUP}.sha256"
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

    rsync "${RSYNC_OPTS[@]}" "${MEDIA_DIR}/" "${CURRENT_MEDIA_BACKUP}/"
    chown -R warehouse:warehouse "$CURRENT_MEDIA_BACKUP"
    chmod 700 "$CURRENT_MEDIA_BACKUP"

    # Update latest symlink
    ln -sfn "$CURRENT_MEDIA_BACKUP" "$LATEST_MEDIA_LINK"
    echo "[SUCCESS] Media backup completed: ${CURRENT_MEDIA_BACKUP}"
fi

# 5. Backup Retention Policy
# Per user decision (Section 1.2, 4.2), ZERO automatic deletion is performed.
echo "=== [5/5] Backup Completed Successfully at $(date) ==="
echo "[BACKUP_DB] $(basename "$DB_DUMP_FILE")"
echo "[BACKUP_DB_SHA256] ${DB_DUMP_SHA256}"
