#!/usr/bin/env bash
# Turns a throwaway ubuntu:24.04 container into a stand-in for the soft server (plan 10.4 d-4).
# Runs as root inside the container only; never shipped and never run on a real server.
# Expects /fixture/warehouse-nightly-backup.sh (the real script from scripts/deploy) next to this file.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq --no-install-recommends sudo python3 postgresql rsync procps openssl ca-certificates >/dev/null

useradd -m -s /bin/bash deploy
printf 'deploy ALL=(ALL) NOPASSWD: /usr/local/sbin/warehouse-root-gateway\n' > /etc/sudoers.d/deploy
chmod 440 /etc/sudoers.d/deploy
useradd -r -M -s /usr/sbin/nologin warehouse

PGV=$(ls /etc/postgresql | sort -n | tail -n 1)
pg_ctlcluster "$PGV" main start
su - postgres -c "createdb warehouse_db"
su - postgres -c "psql -q -d warehouse_db -c 'CREATE TABLE items (id serial PRIMARY KEY, name text NOT NULL)'"
su - postgres -c "psql -q -d warehouse_db -c \"INSERT INTO items (name) VALUES ('a'), ('b'), ('c')\""
# Tables read by the Status heartbeat section
su - postgres -c "psql -q -d warehouse_db -c 'CREATE TABLE reports_exportworkerstatus (alive_at timestamptz); INSERT INTO reports_exportworkerstatus VALUES (now())'"
su - postgres -c "psql -q -d warehouse_db -c 'CREATE TABLE settings_system_gdrive_config (worker_heartbeat_at timestamptz); INSERT INTO settings_system_gdrive_config VALUES (now() - interval '\''1 hour'\'')'"

S=/var/www/warehouse/shared
mkdir -p "$S/media/sub dir" /var/www/warehouse/releases
# Real layout (G-01): backups/ root:warehouse 0710, backups/db (in-app backups) warehouse:warehouse 0700
install -d -o root -g warehouse -m 0710 "$S/backups"
install -d -o warehouse -g warehouse -m 0700 "$S/backups/db"
# An in-app backup with its .meta.json companion, as accounts/backup_service.py writes it (G-03)
head -c 5000 /dev/urandom > "$S/backups/db/backup_20261001_120000.dump"
printf '{\n  "filename": "backup_20261001_120000.dump",\n  "checksum": "%s"\n}\n' \
    "$(sha256sum "$S/backups/db/backup_20261001_120000.dump" | cut -d' ' -f1)" > "$S/backups/db/backup_20261001_120000.dump.meta.json"
chown warehouse:warehouse "$S/backups/db/"*
printf 'DB_NAME=warehouse_db\nDJANGO_SECRET_KEY=test-only\nOUTBOUND_HTTP_PROXY=http://old.proxy.test:1\n' > "$S/.env"
chown warehouse:warehouse "$S/.env"
chmod 640 "$S/.env"
printf 'first media file\n' > "$S/media/a.txt"
# A real media file whose name ends in .part (must never be confused with a temporary download)
printf 'c original\n' > "$S/media/c.txt"
printf 'c.part is user data\n' > "$S/media/c.txt.part"
head -c 300000 /dev/urandom > "$S/media/sub dir/file one.bin"
printf 'persian name\n' > "$S/media/"$'\xd8\xb9\xda\xa9\xd8\xb3.jpg'
chown -R warehouse:warehouse "$S/media"

install -m 0755 /fixture/warehouse-nightly-backup.sh /usr/local/bin/warehouse-nightly-backup.sh
[ -f /fixture/warehouse-root-gateway.sh ] && install -m 0755 /fixture/warehouse-root-gateway.sh /usr/local/sbin/warehouse-root-gateway

# --- fake systemctl: unit state is a file in /run/fake-systemd; STICKY makes "stop" ineffective ---
cat > /usr/local/bin/systemctl <<'EOF'
#!/usr/bin/env bash
D=/run/fake-systemd
mkdir -p "$D"
cmd="${1:-}"; shift || true
case "$cmd" in
    stop)
        for u in "$@"; do echo "stop $u" >> "$D/log"; [ -e "$D/STICKY" ] || rm -f "$D/$u"; done ;;
    start|restart)
        for u in "$@"; do echo "$cmd $u" >> "$D/log"; touch "$D/$u"; done ;;
    reload)
        echo "reload $*" >> "$D/log" ;;
    is-active)
        quiet=0
        if [ "${1:-}" = "--quiet" ]; then quiet=1; shift; fi
        if [ -e "$D/$1" ]; then [ "$quiet" = 1 ] || echo active; exit 0; fi
        [ "$quiet" = 1 ] || echo inactive
        exit 3 ;;
    show)
        case "${3:-}" in
            Result) echo success ;;
            ExecMainStatus) echo 0 ;;
            ExecMainExitTimestamp) echo 'Wed 2026-10-07 02:30:00 UTC' ;;
        esac ;;
    *) echo "fake systemctl: unsupported $cmd" >&2; exit 1 ;;
esac
EOF
chmod 755 /usr/local/bin/systemctl
mkdir -p /run/fake-systemd
for u in warehouse-backend warehouse-gdrive-worker warehouse-export-worker warehouse-backup.timer nginx postgresql; do
    touch "/run/fake-systemd/$u"
done

# --- fake warehouse-deploy: the server half of the Update contract (plan 10.4 c) ---
cat > /usr/local/sbin/warehouse-deploy <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
B=/var/www/warehouse/shared/backups
R=/var/www/warehouse/releases
LOG=/run/fake-deploy.log
mode="$1"; shift
case "$mode" in
    --prepare)
        echo "prepare $*" >> "$LOG"
        bundle="$2"; expected="$4"
        actual=$(sha256sum -- "$bundle" | cut -d' ' -f1)
        [ "$actual" = "$expected" ] || { echo "[ERROR] bundle sha256 mismatch"; exit 2; }
        tmp=$(mktemp -d)
        tar -xzf "$bundle" -C "$tmp"
        commit=$(sed -n 's/^COMMIT=//p' "$tmp/RELEASE")
        ts=$(date +%Y%m%d_%H%M%S)
        rel="${ts}_${commit:0:12}"
        mv "$tmp" "$R/$rel"
        name="db_pre_update_${ts}.dump"
        su - postgres -c "pg_dump -Fc warehouse_db" > "$B/$name"
        h=$(sha256sum -- "$B/$name" | cut -d' ' -f1)
        printf '%s  %s\n' "$h" "$B/$name" > "$B/$name.sha256"
        echo "Planned operations: (fake) no migrations"
        echo "[RELEASE] $rel"
        if [ -e /run/fake-deploy-reuse-backup ]; then
            # Report an older pre-update dump (with its correct hash) instead of the fresh one
            name=$(cd "$B" && ls -1 db_pre_update_*.dump | head -n 1)
            h=$(sha256sum -- "$B/$name" | cut -d' ' -f1)
        fi
        if [ ! -e /run/fake-deploy-omit-backup-marker ]; then echo "[PRE_UPDATE_BACKUP] $name"; fi
        if [ -e /run/fake-deploy-wrong-hash ]; then h=$(printf '%064d' 0); fi
        echo "[PRE_UPDATE_BACKUP_SHA256] $h" ;;
    --activate)
        echo "activate $*" >> "$LOG"
        rel="$1"; backup="$3"
        [ -d "$R/$rel" ] || { echo "[ERROR] unknown release $rel"; exit 2; }
        [ -f "$B/$backup" ] || { echo "[ERROR] unknown backup $backup"; exit 2; }
        ln -sfn "$R/$rel" /var/www/warehouse/current
        echo "[ACTIVATED] $rel" ;;
    --rollback)
        echo "rollback" >> "$LOG" ;;
    --start-services)
        # /run/fake-deploy-hold plays a release that does not match the restored schema.
        echo "start-services" >> "$LOG"
        svc="warehouse-backend warehouse-gdrive-worker warehouse-export-worker"
        if [ -e /run/fake-deploy-hold ]; then
            touch /var/www/warehouse/shared/SERVICES_HELD /var/www/warehouse/shared/MAINTENANCE
            systemctl stop $svc
            echo "[CRITICAL] (fake) the active release does not match the database schema" >&2
            echo '[SERVICES_HELD]'
            exit 6
        fi
        rm -f /var/www/warehouse/shared/SERVICES_HELD
        systemctl start $svc
        rm -f /var/www/warehouse/shared/MAINTENANCE
        echo '[STARTED_OK]' ;;
    *) echo "[ERROR] unknown mode $mode"; exit 2 ;;
esac
EOF
chmod 755 /usr/local/sbin/warehouse-deploy
echo '[FIXTURE_READY]'
