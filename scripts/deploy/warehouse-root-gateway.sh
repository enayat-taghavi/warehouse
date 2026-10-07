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
        for arg in "$@"; do
            case "$arg" in
                */*|..*|'') echo "[ERROR] sha256sum: invalid path argument: $arg" >&2; exit 2 ;;
            esac
            if ! [[ "$arg" =~ ^[a-zA-Z0-9_.-]+$ ]]; then
                echo "[ERROR] sha256sum: argument contains forbidden characters: $arg" >&2
                exit 2
            fi
        done
        exec sha256sum -- "$@"
        ;;

    read-backup)
        if [ $# -ne 1 ]; then
            echo "[ERROR] read-backup requires exactly one filename." >&2
            exit 2
        fi
        TARGET="$1"
        case "$TARGET" in
            */*|..*|'') echo "[ERROR] read-backup: invalid filename: $TARGET" >&2; exit 2 ;;
        esac
        if ! [[ "$TARGET" =~ ^[a-zA-Z0-9_.-]+$ ]]; then
            echo "[ERROR] read-backup: filename contains forbidden characters: $TARGET" >&2
            exit 2
        fi
        f="${BACKUPS_DIR}/${TARGET}"
        if [ ! -f "$f" ]; then
            echo "[ERROR] read-backup: file not found: $TARGET" >&2
            exit 1
        fi
        exec cat "$f"
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

    list-dumps)
        mkdir -p "$BACKUPS_DIR"
        cd "$BACKUPS_DIR"
        shopt -s nullglob
        for f in *.dump; do
            if [ -f "$f" ] && [ -f "$f.sha256" ]; then
                printf '%s\t%s\0' "$(stat -c %Y -- "$f")" "$f"
            fi
        done
        exit 0
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
        # Validate SNAPSHOT_DIR is within BACKUPS_DIR and exists
        CANONICAL_SNAP=$(readlink -f "$SNAPSHOT_DIR" 2>/dev/null || true)
        if [[ -z "$CANONICAL_SNAP" || ! -d "$CANONICAL_SNAP" || "$CANONICAL_SNAP" != "${BACKUPS_DIR}/media_daily_"* ]]; then
            echo "[ERROR] tar-media: snapshot_dir must be a media_daily directory inside ${BACKUPS_DIR}" >&2
            exit 2
        fi
        if [ ! -f "$LIST_FILE" ]; then
            echo "[ERROR] tar-media: invalid list_file." >&2
            exit 2
        fi
        # Validate LIST_FILE entries do not contain path traversal
        while IFS= read -r -d '' entry || [ -n "$entry" ]; do
            case "$entry" in
                /*|*../*|*/..|..)
                    echo "[ERROR] tar-media: list_file contains forbidden path: $entry" >&2
                    exit 2
                    ;;
            esac
        done < "$LIST_FILE"
        cd "$CANONICAL_SNAP"
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
        SCRIPT_PATH="$1"
        if [ -e "$GO_LIVE_FLAG" ]; then
            echo '[GO_LIVE_EXISTS]'
            exit 3
        fi
        # Validate script is in /tmp
        CANONICAL_SCRIPT=$(readlink -f "$SCRIPT_PATH" 2>/dev/null || true)
        if [[ -z "$CANONICAL_SCRIPT" || ! -f "$CANONICAL_SCRIPT" || "$CANONICAL_SCRIPT" != "/tmp/"* ]]; then
            echo "[ERROR] setup: script must be a valid file in /tmp: $SCRIPT_PATH" >&2
            exit 2
        fi
        shift
        exec bash "$CANONICAL_SCRIPT" "$@"
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
            if ! [[ "$f" =~ ^[a-zA-Z0-9_.-]+\.dump$ ]]; then
                echo "[PRUNE_REJECTED] $f"
                continue
            fi
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
        case "$TARGET" in
            */*|..*|'') echo "[ERROR] restore-check: invalid filename $TARGET" >&2; exit 2 ;;
        esac
        if ! [[ "$TARGET" =~ ^[a-zA-Z0-9_.-]+\.dump$ ]]; then
            echo "[ERROR] restore-check: invalid dump extension $TARGET" >&2
            exit 2
        fi
        f="${BACKUPS_DIR}/${TARGET}"
        [ -f "$f" ] && [ -f "$f.sha256" ] || { echo "[ERROR] $TARGET or its .sha256 is missing" >&2; exit 2; }
        expected=$(awk '{print $1; exit}' "$f.sha256")
        actual=$(sha256sum -- "$f" | awk '{print $1}')
        [ "$expected" = "$actual" ] || { echo "[ERROR] sha256 mismatch for $TARGET" >&2; exit 2; }
        runuser -u postgres -- pg_restore --list < "$f" > /dev/null
        echo '[RESTORE_SOURCE_OK]'
        exit 0
        ;;

    restore-stop)
        SERVICES="warehouse-backend warehouse-gdrive-worker warehouse-export-worker"
        systemctl stop $SERVICES || true
        for s in $SERVICES; do
            if systemctl is-active --quiet "$s"; then
                echo "[ERROR] $s did not stop; restore aborted before touching the database. Starting the services again." >&2
                systemctl start $SERVICES || true
                exit 3
            fi
        done
        echo '[SERVICES_STOPPED]'
        exit 0
        ;;

    restore-start)
        SERVICES="warehouse-backend warehouse-gdrive-worker warehouse-export-worker"
        systemctl start $SERVICES
        sleep 3
        for s in $SERVICES; do
            if ! systemctl is-active --quiet "$s"; then
                echo "[ERROR] $s did not start" >&2
                exit 5
            fi
        done
        echo '[STARTED_OK]'
        exit 0
        ;;

    restore-exec)
        if [ $# -lt 1 ]; then
            echo "[ERROR] restore-exec requires dump filename." >&2
            exit 2
        fi
        TARGET="$1"
        case "$TARGET" in
            */*|..*|'') echo "[ERROR] restore-exec: invalid filename $TARGET" >&2; exit 2 ;;
        esac
        if ! [[ "$TARGET" =~ ^[a-zA-Z0-9_.-]+\.dump$ ]]; then
            echo "[ERROR] restore-exec: invalid dump extension $TARGET" >&2
            exit 2
        fi
        f="${BACKUPS_DIR}/${TARGET}"
        [ -f "$f" ] && [ -f "$f.sha256" ] || { echo "[ERROR] $TARGET or its .sha256 is missing" >&2; exit 2; }

        # Resolve DB_NAME strictly from shared/.env (F-01, F-08)
        DB_NAME=$(sed -n 's/^DB_NAME=//p' "${SHARED_DIR}/.env" 2>/dev/null | tail -n 1 | tr -d '\r' || true)
        if ! [[ "$DB_NAME" =~ ^[a-z_][a-z0-9_]{0,62}$ ]]; then
            echo "[ERROR] DB_NAME in shared/.env is missing or invalid; restore aborted" >&2
            exit 2
        fi

        # Verify services are stopped
        SERVICES="warehouse-backend warehouse-gdrive-worker warehouse-export-worker"
        for s in $SERVICES; do
            if systemctl is-active --quiet "$s"; then
                echo "[ERROR] $s is running; restore aborted before touching the database" >&2
                exit 3
            fi
        done

        set +e
        cat -- "$f" | runuser -u postgres -- pg_restore --clean --if-exists --single-transaction --exit-on-error -d "$DB_NAME"
        rc=$?
        set -e
        if [ "$rc" -ne 0 ]; then
            echo "[RESTORE_FAILED] pg_restore exited with $rc; the transaction was rolled back." >&2
            echo "[RESTORE_FAILED] Services remain STOPPED. Inspect the error, then start them with: systemctl start $SERVICES" >&2
            exit 4
        fi

        systemctl start $SERVICES
        sleep 3
        for s in $SERVICES; do
            if ! systemctl is-active --quiet "$s"; then
                echo "[ERROR] $s is not active after restore" >&2
                exit 5
            fi
        done

        echo '[RESTORE_OK]'
        exit 0
        ;;

    set-secret)
        if [ $# -lt 1 ]; then
            echo "[ERROR] set-secret requires key name." >&2
            exit 2
        fi
        KEY_NAME="$1"
        case "$KEY_NAME" in
            GOOGLE_OAUTH_CLIENT_ID|GOOGLE_OAUTH_CLIENT_SECRET|OUTBOUND_HTTP_PROXY) ;;
            *) echo "[ERROR] set-secret: key $KEY_NAME is not in the allow-list" >&2; exit 2 ;;
        esac

        ENV_PATH="${SHARED_DIR}/.env"
        if [ ! -f "$ENV_PATH" ]; then
            echo "[ERROR] set-secret: $ENV_PATH does not exist" >&2
            exit 1
        fi

        PY_SCRIPT=$(mktemp /tmp/wh_secret_XXXXXX.py)
        cat <<'PYEOF' > "$PY_SCRIPT"
import os, sys, time

key = sys.argv[1]
path = sys.argv[2]
raw = sys.stdin.buffer.read()
try:
    val = raw.decode("utf-8")
except UnicodeDecodeError:
    print("[ERROR] value is not valid UTF-8", file=sys.stderr)
    sys.exit(2)

if val.endswith("\r\n"):
    val = val[:-2]
elif val.endswith("\n"):
    val = val[:-1]

if not val or len(val) > 4096 or val != val.strip():
    print("[ERROR] value is empty, too long, or has surrounding whitespace", file=sys.stderr)
    sys.exit(2)

if any(c in val for c in "'\"\\") or any(ord(c) < 32 or ord(c) == 127 for c in val):
    print("[ERROR] value contains quotes, backslash, or control characters", file=sys.stderr)
    sys.exit(2)

st = os.stat(path)
mode = st.st_mode & 0o7777
uid = st.st_uid
gid = st.st_gid

with open(path, "rb") as f:
    original = f.read()

directory = os.path.dirname(path)
bak_path = path + ".bak." + time.strftime("%Y%m%d_%H%M%S")
fd = os.open(bak_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
try:
    os.write(fd, original)
    os.fsync(fd)
    os.fchown(fd, uid, gid)
    os.fchmod(fd, mode)
finally:
    os.close(fd)

lines = original.decode("utf-8").splitlines(True)
out = []
found = False
for line in lines:
    if line.startswith(key + "="):
        if not found:
            out.append(key + "=" + val + "\n")
            found = True
        continue
    out.append(line)
if not found:
    if out and not out[-1].endswith("\n"):
        out[-1] += "\n"
    out.append(key + "=" + val + "\n")

tmp = os.path.join(directory, f".env.tmp.{os.getpid()}")
fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
try:
    os.write(fd, "".join(out).encode("utf-8"))
    os.fsync(fd)
    os.fchown(fd, uid, gid)
    os.fchmod(fd, mode)
finally:
    os.close(fd)

os.replace(tmp, path)
dfd = os.open(directory, os.O_RDONLY)
try:
    os.fsync(dfd)
finally:
    os.close(dfd)

print("[OK_UPDATED]")
PYEOF
        python3 "$PY_SCRIPT" "$KEY_NAME" "$ENV_PATH"
        rc=$?
        rm -f "$PY_SCRIPT"
        exit $rc
        ;;

    create-admin)
        if [[ ! -x /var/www/warehouse/current/venv/bin/python || ! -f /var/www/warehouse/current/warehouse-backend/manage.py ]]; then
            echo "[ERROR] Active release manage.py or venv not found" >&2
            exit 1
        fi
        exec runuser -u warehouse -- /var/www/warehouse/current/venv/bin/python /var/www/warehouse/current/warehouse-backend/manage.py createsuperuser "$@"
        ;;

    logs)
        LINES="${1:-100}"
        if ! [[ "$LINES" =~ ^[0-9]+$ ]]; then LINES=100; fi
        exec journalctl -u warehouse-backend -u warehouse-gdrive-worker -u warehouse-export-worker -n "$LINES" --no-pager
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
                echo "[ERROR] $s is not active" >&2
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
