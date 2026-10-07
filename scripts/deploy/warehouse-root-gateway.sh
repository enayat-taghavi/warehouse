#!/usr/bin/env bash
# ==============================================================================
# Warehouse Management System - Hardened Root Gateway
# Target: /usr/local/sbin/warehouse-root-gateway
# Purpose: Strictly validated privileged commands gateway for sudoers
# Note: Strictly ASCII / English to prevent encoding corruption.
# ==============================================================================
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
    echo "[ERROR] warehouse-root-gateway must be executed as root (via sudo)." >&2
    exit 1
fi

SUBCMD="${1:-}"
if [ -z "$SUBCMD" ]; then
    echo "[ERROR] warehouse-root-gateway: subcommand required." >&2
    exit 2
fi
shift

SHARED_DIR="/var/www/warehouse/shared"
BACKUPS_DIR="${SHARED_DIR}/backups"
GO_LIVE_FLAG="${SHARED_DIR}/GO_LIVE"

case "$SUBCMD" in
    sha256sum)
        if [ $# -eq 0 ]; then
            echo "[ERROR] sha256sum requires at least one file path." >&2
            exit 2
        fi
        cd "$BACKUPS_DIR"
        exec sha256sum -- "$@"
        ;;

    backup)
        # Invokes nightly or on-demand backup script
        exec /usr/local/bin/warehouse-nightly-backup.sh "$@"
        ;;

    list-backups)
        mkdir -p "$BACKUPS_DIR"
        cd "$BACKUPS_DIR"
        exec find . -mindepth 1 \( -name 'media_daily_*' -o -name 'latest_media' \) -prune -o -type f ! -name '*.part' ! -name '*.tmp' -printf '%s\t%P\0'
        ;;

    list-media)
        M="${BACKUPS_DIR}/latest_media"
        if [ ! -d "$M/" ]; then exit 0; fi
        T=$(readlink -f "$M")
        printf '%s\0' "$T"
        cd "$T"
        exec find . -type f -printf '%s\t%P\0'
        ;;

    tar-media)
        if [ $# -lt 2 ]; then
            echo "[ERROR] tar-media requires snapshot_dir and list_file." >&2
            exit 2
        fi
        SNAPSHOT_DIR="$1"
        LIST_FILE="$2"
        if [ ! -d "$SNAPSHOT_DIR" ] || [ ! -f "$LIST_FILE" ]; then
            echo "[ERROR] tar-media: invalid snapshot_dir or list_file." >&2
            exit 2
        fi
        cd "$SNAPSHOT_DIR"
        exec tar --null --verbatim-files-from --no-recursion --format=pax -T "$LIST_FILE" -cf -
        ;;

    check-go-live)
        if [ -e "$GO_LIVE_FLAG" ]; then
            echo '[GO_LIVE_EXISTS]'
        else
            echo '[NO_GO_LIVE]'
        fi
        exit 0
        ;;

    setup)
        if [ $# -eq 0 ]; then
            echo "[ERROR] setup requires script path." >&2
            exit 2
        fi
        if [ -e "$GO_LIVE_FLAG" ]; then
            echo '[GO_LIVE_EXISTS]'
            exit 3
        fi
        exec bash "$@"
        ;;

    deploy-prepare)
        exec /usr/local/sbin/warehouse-deploy --prepare "$@"
        ;;

    deploy-activate)
        exec /usr/local/sbin/warehouse-deploy --activate "$@"
        ;;

    deploy-rollback)
        exec /usr/local/sbin/warehouse-deploy --rollback "$@"
        ;;

    prune-delete)
        mkdir -p "$BACKUPS_DIR"
        cd "$BACKUPS_DIR"
        for f in "$@"; do
            case "$f" in
                */*|.*|'') echo "[PRUNE_REJECTED] $f"; continue ;;
            esac
            rm -f -- "$f" "$f.sha256"
            if [ ! -e "$f" ] && [ ! -e "$f.sha256" ]; then echo "[PRUNED] $f"; else echo "[PRUNE_FAILED] $f"; fi
        done
        exit 0
        ;;

    restore-list)
        mkdir -p "$BACKUPS_DIR"
        cd "$BACKUPS_DIR"
        shopt -s nullglob
        for f in *.dump; do
            if [ -f "$f.sha256" ]; then printf '%s\0' "$f"; fi
        done
        exit 0
        ;;

    restore-check)
        if [ $# -lt 1 ]; then
            echo "[ERROR] restore-check requires dump filename." >&2
            exit 2
        fi
        TARGET="$1"
        f="${BACKUPS_DIR}/${TARGET}"
        [ -f "$f" ] && [ -f "$f.sha256" ] || { echo "[ERROR] $TARGET or its .sha256 is missing"; exit 2; }
        expected=$(awk '{print $1; exit}' "$f.sha256")
        actual=$(sha256sum -- "$f" | awk '{print $1}')
        [ "$expected" = "$actual" ] || { echo "[ERROR] sha256 mismatch for $TARGET"; exit 2; }
        cat -- "$f" | runuser -u postgres -- pg_restore --list > /dev/null
        echo '[RESTORE_SOURCE_OK]'
        exit 0
        ;;

    restore-stop)
        SERVICES="warehouse-backend warehouse-gdrive-worker warehouse-export-worker"
        systemctl stop $SERVICES || true
        for s in $SERVICES; do
            if systemctl is-active --quiet "$s"; then
                echo "[ERROR] $s did not stop; restore aborted before touching the database. Starting the services again."
                systemctl start $SERVICES || true
                exit 3
            fi
        done
        echo '[STOPPED_OK]'
        exit 0
        ;;

    restore-start)
        SERVICES="warehouse-backend warehouse-gdrive-worker warehouse-export-worker"
        systemctl start $SERVICES
        echo '[STARTED_OK]'
        exit 0
        ;;

    restore-exec)
        if [ $# -lt 2 ]; then
            echo "[ERROR] restore-exec requires dump filename and database name." >&2
            exit 2
        fi
        TARGET="$1"
        DB="$2"
        f="${BACKUPS_DIR}/${TARGET}"
        cat -- "$f" | runuser -u postgres -- pg_restore -d "$DB" --clean --if-exists --single-transaction --exit-on-error
        echo '[RESTORED_OK]'
        exit 0
        ;;

    check-go-live-checklist)
        shopt -s nullglob
        for s in warehouse-backend warehouse-gdrive-worker warehouse-export-worker nginx postgresql warehouse-backup.timer; do
            if systemctl is-active --quiet "$s"; then
                echo "[CHECK] PASS service $s is active"
            else
                echo "[CHECK] FAIL service $s is not active"
            fi
        done
        n=0
        for f in "${BACKUPS_DIR}"/db_nightly_*.dump; do
            if [ -f "$f.sha256" ]; then n=$((n + 1)); fi
        done
        if [ "$n" -gt 0 ]; then
            echo "[CHECK] PASS $n nightly dump(s) with .sha256 on the server"
        else
            echo "[CHECK] FAIL no db_nightly_*.dump with .sha256 on the server"
        fi
        out=$(sshd -T 2>/dev/null || true)
        if grep -qix 'passwordauthentication no' <<<"$out"; then
            echo "[CHECK] PASS sshd PasswordAuthentication is no"
        else
            echo "[CHECK] FAIL sshd PasswordAuthentication is not 'no'"
        fi
        exit 0
        ;;

    set-go-live)
        if [ -e "$GO_LIVE_FLAG" ]; then
            echo '[GO_LIVE_ACTIVE]'
            exit 0
        fi
        install -o root -g root -m 0644 /dev/null "$GO_LIVE_FLAG"
        test -f "$GO_LIVE_FLAG"
        echo '[GO_LIVE_ACTIVE]'
        exit 0
        ;;

    restart)
        SERVICES="warehouse-backend warehouse-gdrive-worker warehouse-export-worker"
        systemctl restart $SERVICES
        nginx -t
        systemctl reload nginx
        sleep 3
        for s in $SERVICES nginx; do
            if ! systemctl is-active --quiet "$s"; then
                echo "[ERROR] $s is not active"
                exit 1
            fi
        done
        echo '[RESTART_OK]'
        exit 0
        ;;

    status)
        DOMAIN="${1:-soft.farsalish.ir}"
        B="${BACKUPS_DIR}"
        S="${SHARED_DIR}"
        shopt -s nullglob
        echo '=== [1] Active release ==='
        if [ -L /var/www/warehouse/current ]; then echo "current -> $(readlink /var/www/warehouse/current)"; fi
        if [ -f /var/www/warehouse/current/RELEASE ]; then cat /var/www/warehouse/current/RELEASE; else echo 'No active release.'; fi
        echo
        echo '=== [2] Services ==='
        for s in warehouse-backend warehouse-gdrive-worker warehouse-export-worker warehouse-backup.timer nginx postgresql redis-server; do
            printf '%-28s %s\n' "$s" "$(systemctl is-active "$s" 2>/dev/null || true)"
        done
        res=$(systemctl show warehouse-backup.service -p Result --value 2>/dev/null || true)
        code=$(systemctl show warehouse-backup.service -p ExecMainStatus --value 2>/dev/null || true)
        when=$(systemctl show warehouse-backup.service -p ExecMainExitTimestamp --value 2>/dev/null || true)
        echo "Last warehouse-backup.service run: result=${res:-unknown} exit=${code:-?} at ${when:-never}"
        if [ -n "$res" ] && [ "$res" != "success" ]; then echo '[WARNING] The last nightly backup run did not succeed.'; fi
        echo
        echo '=== [3] Worker heartbeats ==='
        DB_NAME=$(sed -n 's/^DB_NAME=//p' "$S/.env" 2>/dev/null | tail -n 1 | tr -d '\r' || true)
        if [[ "$DB_NAME" =~ ^[a-z_][a-z0-9_]{0,62}$ ]]; then
            for pair in "export-worker:reports_exportworkerstatus:alive_at" "gdrive-worker:settings_system_gdrive_config:worker_heartbeat_at"; do
                IFS=: read -r label table column <<<"$pair"
                age=$(runuser -u postgres -- psql -d "$DB_NAME" -XAtq -c "SELECT COALESCE(EXTRACT(EPOCH FROM now() - MAX($column))::bigint::text, '') FROM $table" 2>/dev/null || true)
                if [ -z "$age" ]; then echo "[WARNING] $label: no heartbeat recorded"
                elif [ "$age" -gt 180 ]; then echo "[WARNING] $label: last heartbeat ${age}s ago (over 180s)"
                else echo "$label: last heartbeat ${age}s ago"; fi
            done
        else
            echo '[WARNING] DB_NAME not readable from shared/.env; heartbeats skipped.'
        fi
        echo
        echo '=== [4] Backups ==='
        dumps=( "$B"/*.dump )
        if [ ${#dumps[@]} -eq 0 ]; then echo 'No dumps on the server.'; else { ls -1t "${dumps[@]}" | head -n 5 | while read -r f; do printf '%8s  %s\n' "$(du -h "$f" | cut -f1)" "$(basename "$f")"; done; } || true; fi
        nightly=( "$B"/db_nightly_*.dump )
        if [ ${#nightly[@]} -gt 0 ]; then
            latest=$({ ls -1t "${nightly[@]}" | head -n 1; } || true)
            age_h=$(( ( $(date +%s) - $(stat -c %Y "$latest") ) / 3600 ))
            echo "Latest nightly: $(basename "$latest") (${age_h}h old)"
            if [ "$age_h" -gt 26 ]; then echo '[WARNING] The latest nightly backup is older than 26 hours.'; fi
        else
            echo '[WARNING] No nightly backup on the server.'
        fi
        echo
        echo '=== [5] Disk ==='
        for m in / "$B"; do
            if [ -e "$m" ]; then
                pct=$(df -P "$m" | awk 'NR==2 {gsub("%","",$5); print $5}')
                echo "$m: ${pct}% used"
                if [ "$pct" -ge 90 ]; then echo "[CRITICAL] $m is ${pct}% full"
                elif [ "$pct" -ge 80 ]; then echo "[WARNING] $m is ${pct}% full"; fi
            fi
        done
        echo
        echo '=== [6] Memory ==='
        free -h
        echo
        echo '=== [7] TLS certificate ==='
        cert="/etc/letsencrypt/live/$DOMAIN/cert.pem"
        if [ -f "$cert" ]; then
            end=$(openssl x509 -enddate -noout -in "$cert" | cut -d= -f2)
            days=$(( ( $(date -d "$end" +%s) - $(date +%s) ) / 86400 ))
            echo "Expires: $end ($days days left)"
            if [ "$days" -lt 21 ]; then echo '[WARNING] Certificate expires in less than 21 days.'; fi
        else
            echo "No Let's Encrypt certificate for $DOMAIN."
        fi
        echo
        echo '=== [8] Flags ==='
        if [ -e "$S/GO_LIVE" ]; then echo 'GO_LIVE: set'; else echo 'GO_LIVE: not set'; fi
        if [ -e "$S/MAINTENANCE" ]; then echo '[WARNING] MAINTENANCE: set'; else echo 'MAINTENANCE: not set'; fi
        exit 0
        ;;

    *)
        echo "[ERROR] warehouse-root-gateway: unrecognized subcommand: $SUBCMD" >&2
        exit 2
        ;;
esac
