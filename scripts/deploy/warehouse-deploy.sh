#!/usr/bin/env bash
# ==============================================================================
# Warehouse Management System - Production Atomic Deployment Script
# Target: /usr/local/sbin/warehouse-deploy
# Note: Strictly ASCII / English to prevent encoding corruption.
# ==============================================================================
set -euo pipefail

# Base filesystem layout (must be defined before rollback block for Guardian 53)
BASE_DIR="/var/www/warehouse"
RELEASES_DIR="${BASE_DIR}/releases"
VENVS_DIR="${BASE_DIR}/venvs"
SHARED_DIR="${BASE_DIR}/shared"
CURRENT_LINK="${BASE_DIR}/current"
BACKUPS_DIR="${SHARED_DIR}/backups"
SERVICES=(warehouse-backend warehouse-gdrive-worker warehouse-export-worker)

RELEASE_NAME_RE='^[0-9]{8}_[0-9]{6}_[A-Za-z0-9]+$'
DOMAIN_RE='^[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}$'
DB_NAME_RE='^[a-z_][a-z0-9_]{0,62}$'
PRE_UPDATE_RE='^db_pre_update_[0-9]{8}_[0-9]{6}\.dump$'
STAGE_FILE_RE='^/tmp/wh-deploy\.[A-Za-z0-9]{10}/[A-Za-z0-9._-]+$'

die() { echo "[ERROR] $*" >&2; exit 1; }

# Parses "--activate <release> [--verified-backup <dump>] [--domain <d>] [--maintenance]" (G-06).
parse_activate_args() {
    REL_NAME=""
    VERIFIED_BACKUP=""
    DOMAIN="soft.farsalish.ir"
    MAINTENANCE=0
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --verified-backup) [[ $# -ge 2 ]] || die "--verified-backup needs a value"; VERIFIED_BACKUP="$2"; shift 2 ;;
            --domain) [[ $# -ge 2 ]] || die "--domain needs a value"; DOMAIN="$2"; shift 2 ;;
            --maintenance) MAINTENANCE=1; shift ;;
            -*) die "Unknown activate option: $1" ;;
            *) [[ -z "$REL_NAME" ]] || die "Unexpected activate argument: $1"; REL_NAME="$1"; shift ;;
        esac
    done
    [[ "$REL_NAME" =~ $RELEASE_NAME_RE ]] || die "Missing or invalid release name: '${REL_NAME}'"
    [[ "$DOMAIN" =~ $DOMAIN_RE ]] || die "Invalid domain format: $DOMAIN"
    [[ "$VERIFIED_BACKUP" =~ $PRE_UPDATE_RE ]] || die "--verified-backup db_pre_update_<YYYYMMDD_HHMMSS>.dump is required"
}

# --activate detaches FIRST (before the lock), so a dropped SSH session cannot kill a migration (F-09).
if [[ "${1:-}" == "--activate" && -z "${WAREHOUSE_DETACHED:-}" ]]; then
    parse_activate_args "${@:2}"
    export WAREHOUSE_DETACHED=1
    install -d -o root -g root -m 750 /var/log/warehouse
    ACTIVATE_LOG="/var/log/warehouse/activate-${REL_NAME}.log"
    ( umask 077; : > "$ACTIVATE_LOG" )
    trap '' HUP PIPE
    setsid -w "$0" "$@" > "$ACTIVATE_LOG" 2>&1 &
    CHILD_PID=$!
    tail -f --pid="$CHILD_PID" "$ACTIVATE_LOG" || true
    if wait "$CHILD_PID"; then exit 0; else exit $?; fi
fi

# The lock lives in root-only /run (not the world-writable /var/lock) so no other user can pre-create it.
LOCK_FILE="/run/warehouse-deploy.lock"
# The gateway's restore-exec hands over the lock it holds on fd 200, so no activation fits in between.
if [[ "${WAREHOUSE_LOCK_INHERITED:-}" == 1 && "$(readlink /proc/self/fd/200 2>/dev/null || true)" == "$LOCK_FILE" ]]; then
    flock -n 200 || die "Another deployment is already in progress. Aborting."
else
    exec 200>"$LOCK_FILE"
    flock -n 200 || die "Another deployment is already in progress. Aborting."
fi
unset WAREHOUSE_LOCK_INHERITED
# Set while the services are held after a restore (the units carry ConditionPathExists=! on it).
HELD_FLAG="${SHARED_DIR}/SERVICES_HELD"

# ------------------------------------------------------------------------------
# Backup directory layout (G-01): the application user may only traverse backups/
# and owns backups/db (its in-app backups); everything else there is root's.
# ------------------------------------------------------------------------------
secure_backup_layout() {
    local b="$BACKUPS_DIR"
    [[ ! -L "$b" ]] || die "$b is a symlink; refusing to continue."
    mkdir -p "$b"
    chown root:warehouse "$b"
    chmod 0710 "$b"
    # From here the application user can no longer create, rename or replace entries in backups/.
    [[ ! -L "$b/db" ]] || die "$b/db is a symlink; remove it by hand after checking where it points."
    if [[ -e "$b/db" && ! -d "$b/db" ]]; then die "$b/db exists but is not a directory."; fi
    # One-time migration of older layouts: top-level entries become root's, never following a link.
    find "$b" -mindepth 1 -maxdepth 1 ! -name db ! -user root -exec chown -h root:root {} +
    find "$b" -mindepth 1 -maxdepth 1 -type d ! -name db ! -perm 0700 -exec chmod 0700 {} +
    find "$b" -mindepth 1 -maxdepth 1 -type f ! -perm 0600 -exec chmod 0600 {} +
    mkdir -p "$b/db"
    chown warehouse:warehouse "$b/db"
    chmod 0700 "$b/db"
}

# Writes a small root-owned record in shared/ atomically.
write_record() {
    printf '%s\n' "$2" > "${SHARED_DIR}/.$1.tmp"
    mv -f "${SHARED_DIR}/.$1.tmp" "${SHARED_DIR}/$1"
}

# A file handed in by the SSH user must be a regular file (no symlink) directly inside a
# /tmp/wh-deploy.* stage directory, and both must belong to the calling user (G-05, G-06).
assert_stage_file() {
    local f="$1" dir owner="${SUDO_UID:-0}"
    [[ "$f" =~ $STAGE_FILE_RE ]] || die "File must be directly inside a /tmp/wh-deploy.* stage directory: $f"
    dir="${f%/*}"
    [[ -d "$dir" && ! -L "$dir" && -f "$f" && ! -L "$f" ]] || die "Not a regular file in a stage directory: $f"
    [[ "$(stat -c %u -- "$dir")" == "$owner" && "$(stat -c %u -- "$f")" == "$owner" ]] \
        || die "Stage file or directory is not owned by the calling user: $f"
}

# Appends every missing non-secret key of the production template to shared/.env (G-08, D-16).
merge_env_defaults() {
    local domain="$1" env="${SHARED_DIR}/.env" tmp line key added=0
    [[ -f "$env" && ! -L "$env" ]] || die "Production environment file $env does not exist."
    tmp="${SHARED_DIR}/.env.merge.$$"
    cp -p -- "$env" "$tmp"
    while IFS= read -r line; do
        key="${line%%=*}"
        if ! grep -q "^${key}=" "$env"; then
            [[ -z "$(tail -c 1 "$tmp")" ]] || printf '\n' >> "$tmp"
            printf '%s\n' "$line" >> "$tmp"
            echo "[INFO] .env: added missing key ${key}"
            added=1
        fi
    done <<EOF
DJANGO_ENV=production
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=${domain}
DJANGO_SECURE_PROXY_SSL=1
DJANGO_CSRF_TRUSTED_ORIGINS=https://${domain}
DJANGO_MEDIA_ACCEL_REDIRECT=1
DJANGO_LOG_DIR=${SHARED_DIR}/logs
DJANGO_MEDIA_ROOT=${SHARED_DIR}/media
WAREHOUSE_REPORT_EXPORT_DIR=${SHARED_DIR}/report_exports
WAREHOUSE_BACKUP_DIR=${SHARED_DIR}/backups
WAREHOUSE_BACKUP_KEEP=0
GOOGLE_OAUTH_REDIRECT_URI=https://${domain}/api/auth/google/callback
DB_HOST=127.0.0.1
DB_PORT=5432
REDIS_URL=redis://127.0.0.1:6379/1
EOF
    if [[ "$added" -eq 1 ]]; then
        chown root:warehouse "$tmp"
        chmod 640 "$tmp"
        mv -f -- "$tmp" "$env"
    else
        rm -f -- "$tmp"
    fi
}

# Runs manage.py of a release as the application user (no shell string, no interpolation).
run_manage() {
    local rel="$1"
    shift
    (cd "${rel}/warehouse-backend" && runuser -u warehouse -- env DJANGO_SETTINGS_MODULE=config.settings \
        DJANGO_ENV=production "${rel}/venv/bin/python" manage.py "$@")
}

# Fail-closed migration compatibility check (E-05, F-05, G-02): only exit 0 together with the
# explicit [MIGRATIONS_OK] marker counts as compatible; any import, settings or database error is a refusal.
# "strict" also refuses unapplied migrations of the release (a database restored from an older dump).
MIGRATION_CHECK_PY='
import sys
strict = sys.argv[1:] == ["strict"]
try:
    import django
    django.setup()
    from django.db import connection
    from django.db.migrations.loader import MigrationLoader
    loader = MigrationLoader(connection, ignore_no_migrations=True)
    applied = set(loader.applied_migrations.keys())
    disk = set(loader.disk_migrations.keys())
    replaced = set()
    for migration in loader.disk_migrations.values():
        replaced.update(tuple(r) for r in (getattr(migration, "replaces", None) or []))
    forward = sorted(applied - disk - replaced)
    # The graph holds either a squashed migration or the ones it replaces, as migrate would apply them.
    pending = sorted(set(loader.graph.nodes) - applied) if strict else []
except BaseException as exc:
    print("[MIGRATION_CHECK_ERROR] %s: %s" % (type(exc).__name__, exc))
    sys.exit(3)
if forward:
    print("[FORWARD_MIGRATIONS] " + ", ".join("%s.%s" % m for m in forward))
if pending:
    print("[PENDING_MIGRATIONS] " + ", ".join("%s.%s" % m for m in pending))
if forward or pending:
    sys.exit(2)
print("[MIGRATIONS_OK]")
'
# check_migration_compatibility <release dir> [strict]
check_migration_compatibility() {
    local target="$1" mode="${2:-}" out rc
    if [[ ! -x "${target}/venv/bin/python" || ! -f "${target}/warehouse-backend/manage.py" ]]; then
        echo "[CRITICAL] Cannot verify migrations: ${target} has no venv or manage.py." >&2
        return 1
    fi
    if out=$(cd "${target}/warehouse-backend" && runuser -u warehouse -- env DJANGO_SETTINGS_MODULE=config.settings \
            DJANGO_ENV=production "${target}/venv/bin/python" -c "$MIGRATION_CHECK_PY" ${mode:+"$mode"} 2>&1); then
        rc=0
    else
        rc=$?
    fi
    if [[ "$rc" -eq 0 ]] && grep -qx '\[MIGRATIONS_OK\]' <<<"$out"; then
        return 0
    fi
    printf '%s\n' "$out" | tail -n 20 >&2
    echo "[CRITICAL] Migration compatibility of ${target##*/} is NOT confirmed (exit ${rc})." >&2
    return 1
}

# Liveness proof: daphne must answer within 60s (200 from the public API when the domain is known,
# any HTTP answer otherwise).
wait_backend_live() {
    local domain="$1" code
    for _ in $(seq 1 30); do
        sleep 2
        if [[ -n "$domain" ]]; then
            code=$(curl -s -o /dev/null -w '%{http_code}' -H "Host: ${domain}" -H "X-Forwarded-Proto: https" http://127.0.0.1:8000/api/public/config/ || true)
            if [[ "$code" == "200" ]]; then return 0; fi
        else
            code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8000/api/public/config/ || true)
            if [[ -n "$code" && "$code" != "000" ]]; then return 0; fi
        fi
    done
    return 1
}

nginx_supports_reject_handshake() {
    local v major minor
    v=$(nginx -v 2>&1 | grep -oE 'nginx/[0-9]+\.[0-9]+' | head -n 1 | cut -d/ -f2) || return 1
    major="${v%%.*}"
    minor="${v#*.}"
    [[ "$major" =~ ^[0-9]+$ && "$minor" =~ ^[0-9]+$ ]] || return 1
    (( major > 1 || (major == 1 && minor >= 19) ))
}

# Renders the release's nginx template and makes it the active site. If "nginx -t" fails, its output
# is shown and the previous state is put back exactly (no config at all on a first install) (G-07, G-12).
apply_nginx_config() {
    local rel="$1" domain="$2" tdir="$1/scripts/deploy/templates"
    local avail=/etc/nginx/sites-available/warehouse enabled=/etc/nginx/sites-enabled/warehouse
    local default_link=/etc/nginx/sites-enabled/default
    local new prev had_prev=0 had_link=0 had_default=0 out reject
    mkdir -p /var/www/html /etc/nginx/sites-available /etc/nginx/sites-enabled
    new=$(mktemp /etc/nginx/sites-available/.warehouse.new.XXXXXX)
    if [[ -f "/etc/letsencrypt/live/${domain}/fullchain.pem" && -f "${tdir}/nginx-https.conf" ]]; then
        if nginx_supports_reject_handshake; then
            reject=$(mktemp /etc/nginx/sites-available/.warehouse.reject.XXXXXX)
            cat > "$reject" <<'EOF'
server {
    listen 443 ssl default_server;
    listen [::]:443 ssl default_server;
    server_name _;
    server_tokens off;
    ssl_reject_handshake on;
    return 444;
}
EOF
            sed -e "s/__DOMAIN__/${domain}/g" -e "/__SSL_REJECT_HANDSHAKE_SERVER__/{r ${reject}" -e 'd}' \
                "${tdir}/nginx-https.conf" > "$new"
            rm -f "$reject"
        else
            sed -e "s/__DOMAIN__/${domain}/g" -e '/__SSL_REJECT_HANDSHAKE_SERVER__/d' "${tdir}/nginx-https.conf" > "$new"
        fi
    elif [[ -f "${tdir}/nginx-http.conf" ]]; then
        sed "s/__DOMAIN__/${domain}/g" "${tdir}/nginx-http.conf" > "$new"
    else
        rm -f "$new"
        echo "[WARNING] ${rel##*/} has no nginx template; nginx configuration left unchanged." >&2
        return 0
    fi
    chmod 644 "$new"

    prev="${avail}.prev"
    if [[ -f "$avail" ]]; then cp -f "$avail" "$prev"; had_prev=1; fi
    if [[ -L "$enabled" ]]; then had_link=1; fi
    if [[ -L "$default_link" ]]; then had_default=1; rm -f "$default_link"; fi
    mv -f "$new" "$avail"
    ln -sfn "$avail" "$enabled"
    if ! out=$(nginx -t 2>&1); then
        printf '%s\n' "$out" >&2
        if [[ "$had_prev" -eq 1 ]]; then mv -f "$prev" "$avail"; else rm -f "$avail"; fi
        if [[ "$had_link" -eq 0 ]]; then rm -f "$enabled"; fi
        if [[ "$had_default" -eq 1 ]]; then ln -sfn /etc/nginx/sites-available/default "$default_link"; fi
        echo "[ERROR] nginx -t failed for the configuration rendered from ${rel##*/}; the previous configuration was put back." >&2
        return 1
    fi
    rm -f "$prev"
    return 0
}

install_units() {
    local tdir="$1/scripts/deploy/templates" unit dest
    [[ -d "$tdir" ]] || return 0
    for unit in "$tdir"/warehouse-*.service "$tdir"/warehouse-*.timer; do
        [[ -f "$unit" ]] || continue
        dest="/etc/systemd/system/$(basename "$unit")"
        if [[ ! -f "$dest" ]] || ! cmp -s "$unit" "$dest"; then
            install -m 644 "$unit" "${dest}.tmp"
            mv -f "${dest}.tmp" "$dest"
        fi
    done
}

# nginx site and systemd units of a release (used for activation, rollback and failed activations).
install_runtime_infra() {
    apply_nginx_config "$1" "$2" || return 1
    install_units "$1"
    systemctl daemon-reload
}

switch_current() {
    ln -sfn "$1" "${BASE_DIR}/current_tmp"
    mv -Tf "${BASE_DIR}/current_tmp" "$CURRENT_LINK"
}

# ==============================================================================
# Mode: --rollback [--domain <d>]   (only to the recorded PREVIOUS_RELEASE)
# ==============================================================================
if [[ "${1:-}" == "--rollback" ]]; then
    shift
    DOMAIN=""
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --domain) [[ $# -ge 2 ]] || die "--domain needs a value"; DOMAIN="$2"; shift 2 ;;
            *) die "Unknown rollback option: $1" ;;
        esac
    done
    if [[ -z "$DOMAIN" && -f "${SHARED_DIR}/DOMAIN" ]]; then DOMAIN=$(head -n 1 "${SHARED_DIR}/DOMAIN"); fi
    [[ -z "$DOMAIN" || "$DOMAIN" =~ $DOMAIN_RE ]] || die "Invalid domain format: $DOMAIN"

    echo "=== Initiating Release Rollback ==="
    ACTIVE_RELEASE=$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)
    PREV_NAME=$(head -n 1 "${SHARED_DIR}/PREVIOUS_RELEASE" 2>/dev/null || true)
    [[ "$PREV_NAME" =~ $RELEASE_NAME_RE ]] || die "No valid previous release is recorded in ${SHARED_DIR}/PREVIOUS_RELEASE; nothing to roll back to."
    PREV_RELEASE="${RELEASES_DIR}/${PREV_NAME}"
    [[ -d "$PREV_RELEASE" && ! -L "$PREV_RELEASE" ]] || die "Recorded previous release ${PREV_NAME} no longer exists."
    [[ "$PREV_RELEASE" != "$ACTIVE_RELEASE" ]] || die "Recorded previous release ${PREV_NAME} is already active."

    # Strict: after a restored older dump the previous release may have unapplied migrations too.
    echo "[INFO] Checking that ${PREV_NAME} matches the database schema exactly..."
    if ! check_migration_compatibility "$PREV_RELEASE" strict; then
        die "Rollback refused to prevent a database schema mismatch. Restore a backup that matches ${PREV_NAME} (deploy.ps1 -Restore), or Update."
    fi
    # The target matches the schema exactly, so a hold left by a restore no longer applies.
    rm -f "$HELD_FLAG"

    if [[ -n "$DOMAIN" ]]; then
        if ! install_runtime_infra "$PREV_RELEASE" "$DOMAIN"; then
            echo "[WARNING] The current nginx configuration was kept for the rollback." >&2
            install_units "$PREV_RELEASE"
            systemctl daemon-reload
        fi
    else
        echo "[WARNING] No domain is known (no --domain and no shared/DOMAIN); nginx configuration not re-rendered." >&2
        install_units "$PREV_RELEASE"
        systemctl daemon-reload
    fi

    switch_current "$PREV_RELEASE"
    write_record ACTIVE_RELEASE "$PREV_NAME"
    if [[ -n "$ACTIVE_RELEASE" ]]; then write_record PREVIOUS_RELEASE "$(basename "$ACTIVE_RELEASE")"; fi

    systemctl restart "${SERVICES[@]}"
    systemctl reload nginx

    if ! wait_backend_live "$DOMAIN"; then
        die "${PREV_NAME} is active but the backend did not answer within 60s. Check: journalctl -u warehouse-backend"
    fi
    # The target passed the migration check and answers, so a flag left by a failed activation is stale.
    if [[ -e "${SHARED_DIR}/MAINTENANCE" ]]; then
        rm -f "${SHARED_DIR}/MAINTENANCE"
        echo "[INFO] A MAINTENANCE flag left by an earlier failure was cleared; ${PREV_NAME} is compatible and answers."
    fi
    echo "[SUCCESS] Rolled back to: ${PREV_NAME}"
    exit 0
fi

# ==============================================================================
# Mode: --refresh-nginx --domain <d>  (re-render the active release's site, e.g. after certbot)
# ==============================================================================
if [[ "${1:-}" == "--refresh-nginx" ]]; then
    [[ "${2:-}" == "--domain" && $# -eq 3 && "$3" =~ $DOMAIN_RE ]] || die "Usage: --refresh-nginx --domain <domain>"
    ACTIVE_RELEASE=$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)
    [[ -n "$ACTIVE_RELEASE" && -d "$ACTIVE_RELEASE" ]] || die "No active release."
    apply_nginx_config "$ACTIVE_RELEASE" "$3" || exit 1
    systemctl reload nginx
    echo "[SUCCESS] nginx configuration re-rendered for $3"
    exit 0
fi

# ==============================================================================
# Mode: --start-services  (gateway restore-start and restore-exec)
# The services start only on a current release that matches the database schema exactly: none of its
# migrations unapplied (a restored older dump) and no applied migration it does not know. Otherwise
# they stay stopped and MAINTENANCE is set (exit 6), so no code runs on a schema it was not built for.
# ==============================================================================
if [[ "${1:-}" == "--start-services" ]]; then
    [[ $# -eq 1 ]] || die "Usage: --start-services"
    hold_services() {
        touch "$HELD_FLAG" "${SHARED_DIR}/MAINTENANCE"
        systemctl stop "${SERVICES[@]}" || true
        echo "[CRITICAL] $1" >&2
        echo "[CRITICAL] Services stay STOPPED (also across restarts and reboots) and MAINTENANCE is set (503)." >&2
        echo '[SERVICES_HELD]'
        exit 6
    }
    ACTIVE_RELEASE=$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)
    if [[ -z "$ACTIVE_RELEASE" || "${ACTIVE_RELEASE%/*}" != "$RELEASES_DIR" || ! -d "$ACTIVE_RELEASE" ]]; then
        hold_services "current does not point to a release in ${RELEASES_DIR}."
    fi
    REL_NAME="${ACTIVE_RELEASE##*/}"
    echo "[INFO] Checking that ${REL_NAME} matches the database schema exactly..."
    if ! check_migration_compatibility "$ACTIVE_RELEASE" strict; then
        hold_services "${REL_NAME} does not match the database schema. deploy.ps1 -Update with a commit that has every applied migration brings it in line (unapplied ones are migrated); or -Restore a backup that matches ${REL_NAME}."
    fi

    rm -f "$HELD_FLAG"
    systemctl start "${SERVICES[@]}" || echo "[WARNING] systemctl start reported an error; checking the units..." >&2
    DOMAIN=""
    if [[ -f "${SHARED_DIR}/DOMAIN" ]]; then DOMAIN=$(head -n 1 "${SHARED_DIR}/DOMAIN"); fi
    [[ "$DOMAIN" =~ $DOMAIN_RE ]] || DOMAIN=""
    if ! wait_backend_live "$DOMAIN"; then
        echo "[ERROR] ${REL_NAME}: the backend did not answer within 60s. Check: journalctl -u warehouse-backend" >&2
        exit 5
    fi
    for s in "${SERVICES[@]}"; do
        if ! systemctl is-active --quiet "$s"; then
            echo "[ERROR] $s is not active" >&2
            exit 5
        fi
    done
    # The release matches the schema and answers, so a flag left by a failed activation or hold is stale.
    if [[ -e "${SHARED_DIR}/MAINTENANCE" ]]; then
        rm -f "${SHARED_DIR}/MAINTENANCE"
        echo "[INFO] A MAINTENANCE flag was cleared; ${REL_NAME} matches the database and answers."
    fi
    echo '[STARTED_OK]'
    exit 0
fi

# ==============================================================================
# Mode: --prepare --bundle <stage file> --bundle-sha256 <64 hex> [--domain <d>]
# ==============================================================================
if [[ "${1:-}" == "--prepare" ]]; then
    shift
    BUNDLE_PATH=""
    BUNDLE_SHA256=""
    DOMAIN="soft.farsalish.ir"
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --bundle) [[ $# -ge 2 ]] || die "--bundle needs a value"; BUNDLE_PATH="$2"; shift 2 ;;
            --bundle-sha256) [[ $# -ge 2 ]] || die "--bundle-sha256 needs a value"; BUNDLE_SHA256="$2"; shift 2 ;;
            --domain) [[ $# -ge 2 ]] || die "--domain needs a value"; DOMAIN="$2"; shift 2 ;;
            *) die "Unknown prepare option: $1" ;;
        esac
    done
    [[ "$DOMAIN" =~ $DOMAIN_RE ]] || die "Invalid domain format: $DOMAIN"
    [[ "$BUNDLE_SHA256" =~ ^[0-9a-f]{64}$ ]] || die "--bundle-sha256 with 64 lowercase hex digits is required (G-05)."
    assert_stage_file "$BUNDLE_PATH"
    ACTUAL_SHA=$(sha256sum -- "$BUNDLE_PATH" | cut -d' ' -f1)
    [[ "$ACTUAL_SHA" == "$BUNDLE_SHA256" ]] || die "Bundle SHA256 mismatch (expected ${BUNDLE_SHA256}, actual ${ACTUAL_SHA})."
    echo "[INFO] Bundle SHA256 verified: ${ACTUAL_SHA}"

    TEMP_EXTRACT=""
    RELEASE_DIR=""
    PRE_DUMP_PART=""
    PRE_DUMP_SHA_TMP=""
    PREP_DONE=0
    cleanup_prepare() {
        rm -f -- "${PRE_DUMP_PART}" "${PRE_DUMP_SHA_TMP}" 2>/dev/null || true
        if [[ -n "$TEMP_EXTRACT" && -d "$TEMP_EXTRACT" ]]; then rm -rf -- "$TEMP_EXTRACT"; fi
        # A release directory created by THIS run that never got its metadata is half-made: remove it.
        if [[ "$PREP_DONE" -ne 1 && -n "$RELEASE_DIR" && -d "$RELEASE_DIR" && ! -f "${RELEASE_DIR}/.deploy_metadata" ]]; then
            rm -rf -- "$RELEASE_DIR"
            echo "[INFO] Removed the incomplete release directory ${RELEASE_DIR##*/}." >&2
        fi
    }
    trap cleanup_prepare EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM HUP

    install -d -o root -g root -m 755 "$RELEASES_DIR" "$VENVS_DIR"
    [[ -d "$SHARED_DIR" && ! -L "$SHARED_DIR" ]] || die "${SHARED_DIR} is missing; run Setup first."
    secure_backup_layout
    for d in media logs report_exports; do
        [[ ! -L "${SHARED_DIR}/${d}" ]] || die "${SHARED_DIR}/${d} is a symlink."
        mkdir -p "${SHARED_DIR}/${d}"
        chown warehouse:warehouse "${SHARED_DIR}/${d}"
    done
    merge_env_defaults "$DOMAIN"

    # Extract and validate the bundle before taking the snapshot (same filesystem, atomic rename later).
    TEMP_EXTRACT=$(mktemp -d "${RELEASES_DIR}/.incoming_XXXXXX")
    tar -xzf "$BUNDLE_PATH" -C "$TEMP_EXTRACT"
    chown -R root:root "$TEMP_EXTRACT"
    find "$TEMP_EXTRACT" -type d -exec chmod 755 {} +
    find "$TEMP_EXTRACT" -type f -exec chmod 644 {} +
    find "$TEMP_EXTRACT" -type f -name "*.sh" -exec chmod 755 {} +
    if [[ -f "${TEMP_EXTRACT}/warehouse-backend/manage.py" ]]; then chmod 755 "${TEMP_EXTRACT}/warehouse-backend/manage.py"; fi
    [[ -f "${TEMP_EXTRACT}/RELEASE" ]] || die "Bundle has no RELEASE file."
    SHA=$(sed -n 's/^COMMIT=//p' "${TEMP_EXTRACT}/RELEASE" | head -n 1 | tr -d '\r' | cut -c1-12)
    [[ "$SHA" =~ ^[0-9a-f]{12}$ ]] || die "RELEASE does not name a valid commit (G-06)."

    # Pre-Update Database Snapshot (E-04, E-30, D-12, F-08, F-18)
    AVAIL_KB=$(df -P "$BACKUPS_DIR" | awk 'NR==2 {print $4}')
    TOTAL_KB=$(df -P "$BACKUPS_DIR" | awk 'NR==2 {print $2}')
    AVAIL_PCT=$(( AVAIL_KB * 100 / TOTAL_KB ))
    if [ "$AVAIL_PCT" -lt 10 ] || [ "$AVAIL_KB" -lt 2097152 ]; then
        die "Disk space low on ${BACKUPS_DIR} (<10% or <2GB free). Aborting pre-update snapshot!"
    fi

    DB_NAME=$(sed -n 's/^DB_NAME=//p' "${SHARED_DIR}/.env" 2>/dev/null | tail -n 1 | tr -d '\r' || true)
    [[ "$DB_NAME" =~ $DB_NAME_RE ]] || die "DB_NAME in shared/.env is missing or invalid."

    DB_SIZE_BYTES=$(runuser -u postgres -- psql -d "$DB_NAME" -XAtq -c "SELECT pg_database_size('$DB_NAME')" 2>/dev/null || echo 0)
    if [[ "$DB_SIZE_BYTES" =~ ^[0-9]+$ ]] && [ "$DB_SIZE_BYTES" -gt 0 ]; then
        EST_DUMP_KB=$(( (DB_SIZE_BYTES / 1024) / 2 ))
        if [ "$AVAIL_KB" -lt $(( EST_DUMP_KB * 2 )) ]; then
            die "Disk free space (${AVAIL_KB} KB) is below 2x estimated database size (${EST_DUMP_KB} KB). Aborting snapshot!"
        fi
    fi

    TS=$(date +"%Y%m%d_%H%M%S")
    PRE_DUMP="${BACKUPS_DIR}/db_pre_update_${TS}.dump"
    [[ ! -e "$PRE_DUMP" ]] || die "${PRE_DUMP} already exists."
    PRE_DUMP_PART="${PRE_DUMP}.part"
    PRE_DUMP_SHA_TMP="${PRE_DUMP}.sha256.tmp"
    # noclobber: never write through an existing name; the dump is verified before it gets its final name.
    ( set -C; umask 077; runuser -u postgres -- pg_dump -Fc "$DB_NAME" > "$PRE_DUMP_PART" )
    runuser -u postgres -- pg_restore --list < "$PRE_DUMP_PART" > /dev/null
    PRE_DUMP_SHA256=$(sha256sum -- "$PRE_DUMP_PART" | cut -d' ' -f1)
    mv -n -- "$PRE_DUMP_PART" "$PRE_DUMP"
    [[ -f "$PRE_DUMP" && ! -e "$PRE_DUMP_PART" ]] || die "Failed to finalize pre-update dump."
    ( set -C; umask 077; printf '%s  %s\n' "$PRE_DUMP_SHA256" "$PRE_DUMP" > "$PRE_DUMP_SHA_TMP" )
    mv -f -- "$PRE_DUMP_SHA_TMP" "${PRE_DUMP}.sha256"
    echo "[INFO] Pre-update snapshot: $(basename "$PRE_DUMP")"

    RELEASE_NAME="${TS}_${SHA}"
    [[ "$RELEASE_NAME" =~ $RELEASE_NAME_RE ]] || die "Invalid release name: ${RELEASE_NAME}"
    [[ ! -e "${RELEASES_DIR}/${RELEASE_NAME}" ]] || die "Release ${RELEASE_NAME} already exists."
    mv -T -- "$TEMP_EXTRACT" "${RELEASES_DIR}/${RELEASE_NAME}"
    TEMP_EXTRACT=""
    RELEASE_DIR="${RELEASES_DIR}/${RELEASE_NAME}"
    ln -sfn "${SHARED_DIR}/.env" "${RELEASE_DIR}/warehouse-backend/.env"

    # Resolve Python Virtual Environment (F-06: direct creation at target path)
    LOCK_FILE_PATH="${RELEASE_DIR}/warehouse-backend/requirements.lock"
    REQ_FILE_PATH="${RELEASE_DIR}/warehouse-backend/requirements.txt"
    PIP_FLAGS=()
    if [[ -f "$LOCK_FILE_PATH" ]]; then
        TARGET_REQ="$LOCK_FILE_PATH"
        PIP_FLAGS=(--require-hashes)
    else
        TARGET_REQ="$REQ_FILE_PATH"
    fi
    PY_VER=$(python3 --version 2>&1 | awk '{print $2}')
    REQ_HASH=$(sha256sum "$TARGET_REQ" | cut -d' ' -f1)
    FULL_VENV_HASH=$(printf "%s_%s" "$REQ_HASH" "$PY_VER" | sha256sum | awk '{print $1}' | head -c 16)
    VENV_DIR="${VENVS_DIR}/${FULL_VENV_HASH}"
    if [[ ! -d "$VENV_DIR" || ! -f "$VENV_DIR/.complete" ]]; then
        rm -rf -- "$VENV_DIR"
        python3 -m venv "$VENV_DIR"
        "$VENV_DIR/bin/pip" install --upgrade "pip==24.0" "setuptools==69.5.1" "wheel==0.43.0"
        "$VENV_DIR/bin/pip" install --no-cache-dir "${PIP_FLAGS[@]}" -r "$TARGET_REQ"
        find "$VENV_DIR" -type d -exec chmod 755 {} +
        find "$VENV_DIR" -type f -exec chmod 644 {} +
        find "$VENV_DIR/bin" -type f -exec chmod 755 {} +
        touch "$VENV_DIR/.complete"
    fi
    ln -sfn "$VENV_DIR" "${RELEASE_DIR}/venv"

    # Preserve the active release's hashed frontend chunks for clients still on the old build (E-23, E-30, F-18)
    PREV_BROWSER="${CURRENT_LINK}/warehouse-front/dist/warehouse-app/browser"
    NEW_BROWSER="${RELEASE_DIR}/warehouse-front/dist/warehouse-app/browser"
    if [[ -d "$PREV_BROWSER" && -d "$NEW_BROWSER" ]]; then
        if [[ -f "${PREV_BROWSER}/ngsw.json" ]]; then
            { grep -oE '"/[A-Za-z0-9_.-]+-[A-Za-z0-9]{8}\.(js|css)"' "${PREV_BROWSER}/ngsw.json" || true; } | tr -d '"/' | while read -r chunk; do
                if [[ -f "${PREV_BROWSER}/${chunk}" && ! -L "${PREV_BROWSER}/${chunk}" && ! -e "${NEW_BROWSER}/${chunk}" ]]; then
                    cp -p -- "${PREV_BROWSER}/${chunk}" "${NEW_BROWSER}/"
                fi
            done
        else
            # G-14: a real regular expression (the former -name pattern was a glob and never matched)
            find "${PREV_BROWSER}" -maxdepth 1 -type f -regextype posix-extended -regex '.*/[A-Za-z0-9_.-]+-[A-Za-z0-9]{8}\.(js|css)' \
                -exec cp -n -p -- {} "${NEW_BROWSER}/" \;
        fi
    fi

    # Pre-deployment Django checks
    run_manage "$RELEASE_DIR" check --deploy

    echo "=== Planned Database Migrations ==="
    if ! run_manage "$RELEASE_DIR" migrate --plan 2>&1; then
        echo "[WARNING] migrate --plan failed; activation will run the real migration check." >&2
    fi

    # Clean unreferenced venvs (E-30)
    for v in "${VENVS_DIR}"/*; do
        [[ -d "$v" && ! -L "$v" ]] || continue
        in_use=0
        for r in "${RELEASES_DIR}"/*; do
            if [[ -L "${r}/venv" ]] && [[ "$(readlink -f "${r}/venv" 2>/dev/null || true)" == "$(readlink -f "$v")" ]]; then
                in_use=1
                break
            fi
        done
        if [[ "$in_use" -eq 0 && "$(readlink -f "$v")" != "$(readlink -f "$VENV_DIR")" ]]; then
            rm -rf -- "$v"
        fi
    done

    # Metadata is written LAST: --activate refuses a release without it, so a half-made release can never go live.
    cat > "${RELEASE_DIR}/.deploy_metadata.tmp" <<EOF
RELEASE_NAME=${RELEASE_NAME}
PRE_UPDATE_BACKUP=$(basename "$PRE_DUMP")
PRE_UPDATE_BACKUP_SHA256=${PRE_DUMP_SHA256}
EOF
    mv -f "${RELEASE_DIR}/.deploy_metadata.tmp" "${RELEASE_DIR}/.deploy_metadata"
    PREP_DONE=1

    # Print markers EXACTLY ONCE
    echo "[RELEASE] ${RELEASE_NAME}"
    echo "[PRE_UPDATE_BACKUP] $(basename "$PRE_DUMP")"
    echo "[PRE_UPDATE_BACKUP_SHA256] ${PRE_DUMP_SHA256}"
    exit 0
fi

# ==============================================================================
# Mode: --activate <release> --verified-backup <dump> [--domain <d>] [--maintenance]
# ==============================================================================
if [[ "${1:-}" == "--activate" ]]; then
    parse_activate_args "${@:2}"
    RELEASE_DIR="${RELEASES_DIR}/${REL_NAME}"
    [[ -d "$RELEASE_DIR" && ! -L "$RELEASE_DIR" ]] || die "Release directory not found: $RELEASE_DIR"

    # Binding to the prepared, verified backup is mandatory (F-19)
    META="${RELEASE_DIR}/.deploy_metadata"
    [[ -f "$META" ]] || die "Release ${REL_NAME} was not completely prepared (no .deploy_metadata); refusing to activate."
    EXPECTED_BACKUP=$(sed -n 's/^PRE_UPDATE_BACKUP=//p' "$META" | head -n 1)
    EXPECTED_SHA=$(sed -n 's/^PRE_UPDATE_BACKUP_SHA256=//p' "$META" | head -n 1)
    [[ "$EXPECTED_BACKUP" =~ $PRE_UPDATE_RE && "$EXPECTED_SHA" =~ ^[0-9a-f]{64}$ ]] || die "Release metadata of ${REL_NAME} is invalid."
    [[ "$VERIFIED_BACKUP" == "$EXPECTED_BACKUP" ]] || die "Verified backup ${VERIFIED_BACKUP} is not the backup prepared with this release (${EXPECTED_BACKUP})."
    BK="${BACKUPS_DIR}/${VERIFIED_BACKUP}"
    [[ -f "$BK" && ! -L "$BK" && -f "${BK}.sha256" ]] || die "Pre-update backup ${VERIFIED_BACKUP} or its .sha256 is missing."
    ACTUAL_BACKUP_SHA=$(sha256sum -- "$BK" | cut -d' ' -f1)
    [[ "$ACTUAL_BACKUP_SHA" == "$EXPECTED_SHA" ]] || die "Prepared backup checksum mismatch (${ACTUAL_BACKUP_SHA} != ${EXPECTED_SHA})."
    echo "[INFO] Verified pre-update backup bound to release: ${VERIFIED_BACKUP}"

    ACTIVE_RELEASE_PREV=$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)
    if [[ -n "$ACTIVE_RELEASE_PREV" && ( "${ACTIVE_RELEASE_PREV%/*}" != "$RELEASES_DIR" || ! -d "$ACTIVE_RELEASE_PREV" ) ]]; then
        echo "[WARNING] current points outside ${RELEASES_DIR} (${ACTIVE_RELEASE_PREV}); it will not be used for rollback." >&2
        ACTIVE_RELEASE_PREV=""
    fi
    [[ "$ACTIVE_RELEASE_PREV" != "$RELEASE_DIR" ]] || die "Release ${REL_NAME} is already active."
    # Restored by the automatic rollback, since the records are rewritten at the switch.
    PREVIOUS_RECORD_BEFORE=$(head -n 1 "${SHARED_DIR}/PREVIOUS_RELEASE" 2>/dev/null || true)
    [[ "$PREVIOUS_RECORD_BEFORE" =~ $RELEASE_NAME_RE ]] || PREVIOUS_RECORD_BEFORE=""

    MIGRATE_STARTED=0
    activate_exit_report() {
        local rc=$?
        if [[ "$rc" -ne 0 ]]; then
            echo "[CRITICAL] Activation of ${REL_NAME} stopped with exit ${rc}." >&2
            if [[ -e "${SHARED_DIR}/MAINTENANCE" ]]; then echo "[CRITICAL] MAINTENANCE is set: the site answers 503 until it is cleared." >&2; fi
            echo "[INFO] current -> $(readlink "$CURRENT_LINK" 2>/dev/null || echo none). Run deploy.ps1 -Status for the full state." >&2
        fi
    }
    trap activate_exit_report EXIT

    # Failure before the symlink switch: the new release never went live (G-11).
    abort_before_switch() {
        echo "[CRITICAL] $1" >&2
        if [[ -z "$ACTIVE_RELEASE_PREV" ]]; then
            echo "[CRITICAL] No release was active before (first activation); nothing to fall back to." >&2
            exit 1
        fi
        install_runtime_infra "$ACTIVE_RELEASE_PREV" "$DOMAIN" \
            || echo "[ERROR] Could not restore nginx/units of ${ACTIVE_RELEASE_PREV##*/}." >&2
        if [[ -e "$HELD_FLAG" ]]; then
            # The running release was held after a restore: it did not match the schema before either.
            echo "[CRITICAL] SERVICES_HELD is set: the services of ${ACTIVE_RELEASE_PREV##*/} stay stopped and MAINTENANCE stays set." >&2
            exit 1
        fi
        # Before migrate the database is untouched, so the running release can always resume.
        if [[ "$MIGRATE_STARTED" -eq 0 ]] || check_migration_compatibility "$ACTIVE_RELEASE_PREV"; then
            if [[ "$MAINTENANCE" -eq 1 ]]; then
                systemctl start "${SERVICES[@]}" || true
                rm -f "${SHARED_DIR}/MAINTENANCE"
                echo "[INFO] Services of the running release ${ACTIVE_RELEASE_PREV##*/} were started again; MAINTENANCE cleared." >&2
            fi
        elif [[ "$MAINTENANCE" -eq 1 ]]; then
            echo "[CRITICAL] Services stay STOPPED and MAINTENANCE stays set: the running release cannot be confirmed compatible with the database." >&2
            echo "[CRITICAL] Forward-fix, or restore the pre-update backup ${VERIFIED_BACKUP} (deploy.ps1 -Restore)." >&2
        else
            echo "[CRITICAL] The running release ${ACTIVE_RELEASE_PREV##*/} may not match the database schema any more. Consider restoring ${VERIFIED_BACKUP} (deploy.ps1 -Restore)." >&2
        fi
        exit 1
    }

    # The new release must contain every migration already applied: migrate silently skips applied
    # migrations it does not know, so an older commit would otherwise go live on a newer schema.
    echo "[INFO] Checking that ${REL_NAME} knows every applied migration..."
    if ! check_migration_compatibility "$RELEASE_DIR"; then
        die "Activation refused before any change: ${REL_NAME} lacks migrations already applied to the database."
    fi

    echo "=== [1/5] Validating Web Server Configuration (Nginx) & Infrastructure ==="
    # Check Nginx and Infrastructure BEFORE database migrations (F-03)
    if ! apply_nginx_config "$RELEASE_DIR" "$DOMAIN"; then
        die "Aborting before any database change; nothing was switched."
    fi
    install_units "$RELEASE_DIR"
    systemctl daemon-reload

    # Root tooling always follows the newest activated release (E-08); a rollback never downgrades it.
    for pair in "warehouse-deploy.sh:/usr/local/sbin/warehouse-deploy" \
                "warehouse-root-gateway.sh:/usr/local/sbin/warehouse-root-gateway" \
                "warehouse-nightly-backup.sh:/usr/local/bin/warehouse-nightly-backup.sh"; do
        src="${RELEASE_DIR}/scripts/deploy/${pair%%:*}"
        dst="${pair#*:}"
        if [[ -f "$src" ]]; then
            install -o root -g root -m 755 "$src" "${dst}.tmp"
            mv -f "${dst}.tmp" "$dst"
        fi
    done

    # Enter Maintenance Mode if requested (F-14, G-11: a failed stop is reported and undone)
    if [[ "$MAINTENANCE" -eq 1 ]]; then
        echo "[INFO] Entering maintenance mode (503 with Retry-After)..."
        touch "${SHARED_DIR}/MAINTENANCE"
        systemctl stop "${SERVICES[@]}" || echo "[WARNING] systemctl stop reported an error; checking the units..." >&2
        for s in "${SERVICES[@]}"; do
            if systemctl is-active --quiet "$s"; then
                abort_before_switch "Failed to stop $s for maintenance mode; migration not started."
            fi
        done
    fi

    echo "=== [2/5] Applying Database Migrations & Collecting Static Files ==="
    MIGRATE_STARTED=1
    if ! run_manage "$RELEASE_DIR" migrate --noinput; then
        abort_before_switch "Database migration of ${REL_NAME} failed."
    fi

    # Only staticfiles/ is writable for the application user during collectstatic (E-07, G-15)
    STATIC_DIR="${RELEASE_DIR}/warehouse-backend/staticfiles"
    if [[ -L "$STATIC_DIR" || ( -e "$STATIC_DIR" && ! -d "$STATIC_DIR" ) ]]; then
        abort_before_switch "${STATIC_DIR} is not a plain directory."
    fi
    mkdir -p "$STATIC_DIR"
    chown warehouse:warehouse "$STATIC_DIR"
    if ! run_manage "$RELEASE_DIR" collectstatic --noinput; then
        chown -R root:root "$STATIC_DIR"
        abort_before_switch "collectstatic of ${REL_NAME} failed."
    fi
    chown -R root:root "$STATIC_DIR"
    chmod -R u=rwX,go=rX "$STATIC_DIR"

    echo "=== [3/5] Atomic Symlink Switch & Service Restart ==="
    switch_current "$RELEASE_DIR"
    # The records follow current at once, so a manual --rollback after a failed health check
    # targets the release that ran before this one (F-05).
    write_record ACTIVE_RELEASE "$REL_NAME"
    if [[ -n "$ACTIVE_RELEASE_PREV" ]]; then write_record PREVIOUS_RELEASE "$(basename "$ACTIVE_RELEASE_PREV")"; fi
    # The new release knows every applied migration and has just migrated the rest, so it matches the
    # schema: a hold left by a restore no longer applies.
    if [[ -e "$HELD_FLAG" ]]; then
        rm -f "$HELD_FLAG"
        echo "[INFO] SERVICES_HELD cleared; ${REL_NAME} matches the migrated database."
    fi
    # A failed restart must not skip the health check and its automatic rollback.
    systemctl restart "${SERVICES[@]}" || echo "[WARNING] systemctl restart reported an error; the health check decides." >&2
    systemctl reload nginx || echo "[WARNING] nginx reload reported an error; the health check decides." >&2

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
        for s in "${SERVICES[@]}"; do
            if systemctl is-active --quiet "$s"; then active_count=$((active_count + 1)); fi
        done
        if [ "$active_count" -eq "${#SERVICES[@]}" ]; then services_ok=1; fi

        # Heartbeat check for background workers (F-13)
        workers_ok=1
        DB_NAME=$(sed -n 's/^DB_NAME=//p' "${SHARED_DIR}/.env" 2>/dev/null | tail -n 1 | tr -d '\r' || true)
        if [[ "$DB_NAME" =~ $DB_NAME_RE ]]; then
            for hb in "export-worker:reports_exportworkerstatus:alive_at" "gdrive-worker:settings_system_gdrive_config:worker_heartbeat_at"; do
                IFS=: read -r _label table column <<<"$hb"
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

    if [[ "$HEALTH_FAIL" -ne 0 ]]; then
        echo "[CRITICAL] Healthcheck verification failed after 60s!" >&2
        if [[ "$MAINTENANCE" -eq 1 ]]; then
            echo "[CRITICAL] System remains in MAINTENANCE mode. Schema changes may require forward-fix or manual restore." >&2
            exit 1
        fi
        if [[ -z "$ACTIVE_RELEASE_PREV" ]]; then
            echo "[CRITICAL] There is no previous release to roll back to; ${REL_NAME} stays active." >&2
        elif check_migration_compatibility "$ACTIVE_RELEASE_PREV"; then
            echo "[CRITICAL] Rolling back automatically to ${ACTIVE_RELEASE_PREV##*/} (nginx, units and code)..." >&2
            install_runtime_infra "$ACTIVE_RELEASE_PREV" "$DOMAIN" \
                || echo "[ERROR] nginx configuration of ${ACTIVE_RELEASE_PREV##*/} failed its test; the new one was kept." >&2
            switch_current "$ACTIVE_RELEASE_PREV"
            write_record ACTIVE_RELEASE "${ACTIVE_RELEASE_PREV##*/}"
            if [[ -n "$PREVIOUS_RECORD_BEFORE" ]]; then write_record PREVIOUS_RELEASE "$PREVIOUS_RECORD_BEFORE"; fi
            systemctl restart "${SERVICES[@]}"
            systemctl reload nginx || true
            echo "[INFO] Automatic rollback completed after the failed deployment." >&2
        else
            echo "[CRITICAL] Automatic rollback aborted: applied migrations are incompatible with the previous release!" >&2
            touch "${SHARED_DIR}/MAINTENANCE"
            echo "[CRITICAL] System placed in MAINTENANCE mode to prevent corrupted state." >&2
        fi
        exit 1
    fi

    # Exit maintenance mode upon confirmed healthcheck. A flag left by an earlier failed activation is
    # cleared too: this release is migrated, knows every applied migration and is healthy.
    if [[ -e "${SHARED_DIR}/MAINTENANCE" ]]; then
        rm -f "${SHARED_DIR}/MAINTENANCE"
        if [[ "$MAINTENANCE" -eq 1 ]]; then
            echo "[INFO] Maintenance mode ended successfully."
        else
            echo "[INFO] A MAINTENANCE flag left by an earlier failure was cleared; ${REL_NAME} is healthy."
        fi
    fi

    echo "=== [5/5] Deployment Finalized ==="
    # ACTIVE_RELEASE and PREVIOUS_RELEASE were recorded at the switch (F-05)
    write_record DOMAIN "$DOMAIN"

    # Prune old releases safely (keep newest 5, never prune current or previous) (F-16)
    PREV_BASENAME=$(head -n 1 "${SHARED_DIR}/PREVIOUS_RELEASE" 2>/dev/null || true)
    cd "$RELEASES_DIR"
    # shellcheck disable=SC2012
    for rdir in $(ls -1dt -- */ 2>/dev/null | sed 's/\/$//' | tail -n +6); do
        if [[ "$rdir" =~ $RELEASE_NAME_RE && "$rdir" != "$REL_NAME" && "$rdir" != "$PREV_BASENAME" ]]; then
            echo "[INFO] Pruning obsolete release: $rdir"
            rm -rf -- "${RELEASES_DIR:?}/${rdir}"
        fi
    done

    echo "[SUCCESS] Release activated successfully: $REL_NAME"
    exit 0
fi

die "warehouse-deploy requires one of: --prepare, --activate, --rollback, --refresh-nginx or --start-services"
