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
PRE_MODULE_RE='^db_pre_module_[0-9]{8}_[0-9]{6}\.dump$'

# Discover known modules dynamically from warehouse-backend/modules/*/
# The list is sorted alphabetically by directory name.
KNOWN_MODULES=()
declare -A MODULE_SERVICES=()

discover_known_modules() {
    local base_rel="${1:-}"
    if [[ -z "$base_rel" ]]; then
        if [[ -d "${CURRENT_LINK}/warehouse-backend/modules" ]]; then
            base_rel="${CURRENT_LINK}"
        else
            local latest
            latest=$(ls -td "${RELEASES_DIR}"/* 2>/dev/null | head -n 1 || true)
            if [[ -n "$latest" && -d "${latest}/warehouse-backend/modules" ]]; then
                base_rel="$latest"
            elif [[ -d "$(dirname "$0")/../../warehouse-backend/modules" ]]; then
                base_rel="$(dirname "$0")/../.."
            fi
        fi
    fi
    KNOWN_MODULES=()
    if [[ -n "$base_rel" && -d "${base_rel}/warehouse-backend/modules" ]]; then
        local d mod_name
        for d in "${base_rel}/warehouse-backend/modules"/*/; do
            if [[ -d "$d" ]]; then
                mod_name=$(basename "$d")
                KNOWN_MODULES+=("$mod_name")
            fi
        done
    fi
    if [[ ${#KNOWN_MODULES[@]} -gt 0 ]]; then
        readarray -t KNOWN_MODULES < <(printf '%s\n' "${KNOWN_MODULES[@]}" | sort)
    fi
    for m in "${KNOWN_MODULES[@]}"; do
        if [[ -z "${MODULE_SERVICES[$m]+x}" ]]; then
            MODULE_SERVICES[$m]=""
        fi
    done
}
discover_known_modules

die() { echo "[ERROR] $*" >&2; exit 1; }

# Prints a module list in catalog order without duplicates; fails on an empty list or an unknown module.
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

# The modules installed on this server (fails if WH_MODULES holds something unknown).
effective_modules() {
    local v
    v=$(sed -n 's/^WH_MODULES=//p' "${SHARED_DIR}/.env" 2>/dev/null | tail -n 1 | tr -d '\r' || true)
    if [[ -z "$v" ]]; then (IFS=','; echo "${KNOWN_MODULES[*]}"); return 0; fi
    canonical_modules "$v"
}

# Read-only, without the deployment lock (gateway "modules" and "status").
if [[ "${1:-}" == "--print-modules" ]]; then
    [[ $# -eq 1 ]] || die "Usage: --print-modules"
    MODS=$(effective_modules) || die "WH_MODULES in ${SHARED_DIR}/.env is invalid."
    echo "[MODULES] ${MODS}"
    exit 0
fi

# A domain handed in by deploy.ps1 must not be one this server already moved away from: a stale Domain in
# deploy_config.json would otherwise re-render nginx and shared/DOMAIN for the old domain (step 5 review).
assert_not_legacy_domain() {
    local d="$1" legacy="${SHARED_DIR}/DOMAINS_LEGACY" primary
    [[ -n "$d" && -f "$legacy" ]] || return 0
    if awk -v d="$d" '{ sub(/\r$/, "") } $1 == d { found = 1 } END { exit !found }' "$legacy"; then
        primary=$(head -n 1 "${SHARED_DIR}/DOMAIN" 2>/dev/null | tr -d '\r' || true)
        die "Domain $d is a former domain of this server (primary: ${primary:-unknown}); set Domain in deploy_config.json to the primary domain."
    fi
}

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
    assert_not_legacy_domain "$DOMAIN"
    [[ "$VERIFIED_BACKUP" =~ $PRE_UPDATE_RE ]] || die "--verified-backup db_pre_update_<YYYYMMDD_HHMMSS>.dump is required"
}

# Parses "--add-module <code> --verified-backup <db_pre_module dump> [--domain <d>]".
parse_add_module_args() {
    ADD_CODE=""
    VERIFIED_BACKUP=""
    DOMAIN=""
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --verified-backup) [[ $# -ge 2 ]] || die "--verified-backup needs a value"; VERIFIED_BACKUP="$2"; shift 2 ;;
            --domain) [[ $# -ge 2 ]] || die "--domain needs a value"; DOMAIN="$2"; shift 2 ;;
            -*) die "Unknown add-module option: $1" ;;
            *) [[ -z "$ADD_CODE" ]] || die "Unexpected add-module argument: $1"; ADD_CODE="$1"; shift ;;
        esac
    done
    [[ -n "$ADD_CODE" && " ${KNOWN_MODULES[*]} " == *" ${ADD_CODE} "* ]] || die "Unknown module: '${ADD_CODE}' (known: ${KNOWN_MODULES[*]})"
    [[ -z "$DOMAIN" || "$DOMAIN" =~ $DOMAIN_RE ]] || die "Invalid domain format: $DOMAIN"
    assert_not_legacy_domain "$DOMAIN"
    [[ "$VERIFIED_BACKUP" =~ $PRE_MODULE_RE ]] || die "--verified-backup db_pre_module_<YYYYMMDD_HHMMSS>.dump is required"
}

# Parses "--reset-database <release> --modules <list> --verified-backup <dump> [--domain <d>]".
parse_reset_args() {
    REL_NAME=""
    RESET_MODULES=""
    VERIFIED_BACKUP=""
    DOMAIN=""
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --modules) [[ $# -ge 2 ]] || die "--modules needs a value"; RESET_MODULES="$2"; shift 2 ;;
            --verified-backup) [[ $# -ge 2 ]] || die "--verified-backup needs a value"; VERIFIED_BACKUP="$2"; shift 2 ;;
            --domain) [[ $# -ge 2 ]] || die "--domain needs a value"; DOMAIN="$2"; shift 2 ;;
            -*) die "Unknown reset-database option: $1" ;;
            *) [[ -z "$REL_NAME" ]] || die "Unexpected reset-database argument: $1"; REL_NAME="$1"; shift ;;
        esac
    done
    [[ "$REL_NAME" =~ $RELEASE_NAME_RE ]] || die "Missing or invalid release name: '${REL_NAME}'"
    RESET_MODULES=$(canonical_modules "$RESET_MODULES") || die "--modules must list known modules (${KNOWN_MODULES[*]})"
    [[ -z "$DOMAIN" || "$DOMAIN" =~ $DOMAIN_RE ]] || die "Invalid domain format: $DOMAIN"
    assert_not_legacy_domain "$DOMAIN"
    [[ "$VERIFIED_BACKUP" =~ $PRE_UPDATE_RE ]] || die "--verified-backup db_pre_update_<YYYYMMDD_HHMMSS>.dump is required"
}

# --activate, --add-module and --reset-database detach FIRST (before the lock), so a dropped SSH session
# cannot kill a migration (F-09).
if [[ "${1:-}" =~ ^--(activate|add-module|reset-database)$ && -z "${WAREHOUSE_DETACHED:-}" ]]; then
    case "$1" in
        --activate) parse_activate_args "${@:2}"; LOG_TAG="activate-${REL_NAME}" ;;
        --add-module) parse_add_module_args "${@:2}"; LOG_TAG="add-module-${ADD_CODE}-$(date +%Y%m%d_%H%M%S)" ;;
        --reset-database) parse_reset_args "${@:2}"; LOG_TAG="reset-database-${REL_NAME}" ;;
    esac
    export WAREHOUSE_DETACHED=1
    install -d -o root -g root -m 750 /var/log/warehouse
    ACTIVATE_LOG="/var/log/warehouse/${LOG_TAG}.log"
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

# Replaces the WH_MODULES line of shared/.env atomically (no such line for an empty argument); every
# other line, the owner and the mode stay as they are.
write_env_modules_line() {
    local line="$1" env="${SHARED_DIR}/.env" tmp="${SHARED_DIR}/.env.modules.$$"
    [[ -f "$env" && ! -L "$env" ]] || die "Production environment file $env does not exist."
    cp -p -- "$env" "$tmp"
    # grep exits 1 when every line is WH_MODULES (nothing kept); 2 is a read error and must stop here.
    grep -v '^WH_MODULES=' -- "$env" > "$tmp" || [[ $? -eq 1 ]] || { rm -f -- "$tmp"; die "Could not read $env."; }
    [[ "$(grep -c '' -- "$tmp" || true)" == "$(grep -cv '^WH_MODULES=' -- "$env" || true)" ]] \
        || { rm -f -- "$tmp"; die "Rewriting $env lost lines; it was left unchanged."; }
    if [[ -n "$line" ]]; then
        if [[ -s "$tmp" && -n "$(tail -c 1 "$tmp")" ]]; then printf '\n' >> "$tmp"; fi
        printf '%s\n' "$line" >> "$tmp"
    fi
    sync -- "$tmp"
    mv -f -- "$tmp" "$env"
}

# Sets the installed modules: WH_MODULES in shared/.env and the shared/MODULES record.
set_env_modules() {
    write_env_modules_line "WH_MODULES=$1"
    write_record MODULES "$1"
}

# Rewrites the domain-managed keys in shared/.env atomically:
# DJANGO_ALLOWED_HOSTS, DJANGO_CSRF_TRUSTED_ORIGINS, GOOGLE_OAUTH_REDIRECT_URI, and WH_CANONICAL_DOMAIN.
# Every other line (especially secrets and db config) stays byte-for-byte untouched, preserving owner and mode.
write_env_domains() {
    local canonical="$1" env="${SHARED_DIR}/.env" tmp="${SHARED_DIR}/.env.domains.$$"
    [[ -n "$canonical" ]] || die "write_env_domains requires a canonical domain."
    [[ -f "$env" && ! -L "$env" ]] || die "Production environment file $env does not exist."

    local legacy_file="${SHARED_DIR}/DOMAINS_LEGACY"
    local domains=("$canonical")
    local d m
    if [[ -f "$legacy_file" && ! -L "$legacy_file" ]]; then
        while read -r d m _rest; do
            [[ -n "$d" && ! "$d" =~ ^# ]] || continue
            if [[ "$d" != "$canonical" ]]; then
                domains+=("$d")
            fi
        done < "$legacy_file"
    fi

    local unique_domains=()
    local seen=" "
    for d in "${domains[@]}"; do
        if [[ "$seen" != *" $d "* ]]; then
            unique_domains+=("$d")
            seen="${seen}${d} "
        fi
    done

    local allowed_hosts="${unique_domains[*]}"
    allowed_hosts="${allowed_hosts// /,}"
    allowed_hosts="${allowed_hosts},127.0.0.1,localhost"

    local csrf_origins=""
    for d in "${unique_domains[@]}"; do
        if [[ -z "$csrf_origins" ]]; then
            csrf_origins="https://${d}"
        else
            csrf_origins="${csrf_origins},https://${d}"
        fi
    done

    local oauth_redirect="https://${canonical}/api/accounts/gdrive/callback/"

    cp -p -- "$env" "$tmp"
    local pattern='^(DJANGO_ALLOWED_HOSTS|DJANGO_CSRF_TRUSTED_ORIGINS|GOOGLE_OAUTH_REDIRECT_URI|WH_CANONICAL_DOMAIN)='

    grep -v -E "$pattern" -- "$env" > "$tmp" || [[ $? -eq 1 ]] || { rm -f -- "$tmp"; die "Could not read $env."; }
    [[ "$(grep -c '' -- "$tmp" || true)" == "$(grep -cv -E "$pattern" -- "$env" || true)" ]] \
        || { rm -f -- "$tmp"; die "Rewriting $env lost lines; it was left unchanged."; }

    if [[ -s "$tmp" && -n "$(tail -c 1 "$tmp")" ]]; then printf '\n' >> "$tmp"; fi
    printf 'DJANGO_ALLOWED_HOSTS=%s\n' "$allowed_hosts" >> "$tmp"
    printf 'DJANGO_CSRF_TRUSTED_ORIGINS=%s\n' "$csrf_origins" >> "$tmp"
    printf 'GOOGLE_OAUTH_REDIRECT_URI=%s\n' "$oauth_redirect" >> "$tmp"
    printf 'WH_CANONICAL_DOMAIN=%s\n' "$canonical" >> "$tmp"

    sync -- "$tmp"
    mv -f -- "$tmp" "$env"
}

# A backup handed to a mode must be a regular file that matches the sha256 recorded next to it.
assert_backup_matches_record() {
    local bk="${BACKUPS_DIR}/$1" recorded actual
    [[ -f "$bk" && ! -L "$bk" && -f "${bk}.sha256" && ! -L "${bk}.sha256" ]] || die "Backup $1 or its .sha256 is missing."
    recorded=$(head -n 1 -- "${bk}.sha256" | cut -d' ' -f1)
    actual=$(sha256sum -- "$bk" | cut -d' ' -f1)
    [[ "$recorded" =~ ^[0-9a-f]{64}$ && "$recorded" == "$actual" ]] || die "Backup $1 does not match its recorded sha256."
}

# The backup that --prepare bound to a release (.deploy_metadata) must be the one the operator machine
# pulled and verified (F-19).
assert_release_backup() {
    local rel_dir="$1" backup="$2" meta expected_backup expected_sha actual
    meta="${rel_dir}/.deploy_metadata"
    [[ -f "$meta" ]] || die "Release ${rel_dir##*/} was not completely prepared (no .deploy_metadata); refusing to continue."
    expected_backup=$(sed -n 's/^PRE_UPDATE_BACKUP=//p' "$meta" | head -n 1)
    expected_sha=$(sed -n 's/^PRE_UPDATE_BACKUP_SHA256=//p' "$meta" | head -n 1)
    [[ "$expected_backup" =~ $PRE_UPDATE_RE && "$expected_sha" =~ ^[0-9a-f]{64}$ ]] || die "Release metadata of ${rel_dir##*/} is invalid."
    [[ "$backup" == "$expected_backup" ]] || die "Verified backup ${backup} is not the backup prepared with this release (${expected_backup})."
    [[ -f "${BACKUPS_DIR}/${backup}" && ! -L "${BACKUPS_DIR}/${backup}" && -f "${BACKUPS_DIR}/${backup}.sha256" ]] || die "Pre-update backup ${backup} or its .sha256 is missing."
    actual=$(sha256sum -- "${BACKUPS_DIR}/${backup}" | cut -d' ' -f1)
    [[ "$actual" == "$expected_sha" ]] || die "Prepared backup checksum mismatch (${actual} != ${expected_sha})."
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
GOOGLE_OAUTH_REDIRECT_URI=https://${domain}/api/accounts/gdrive/callback/
WH_CANONICAL_DOMAIN=${domain}
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

# Extra environment for manage.py (e.g. WH_MODULES before shared/.env is switched); settings.py only
# fills in from .env what the environment does not set.
MANAGE_ENV=()

# Runs manage.py of a release as the application user (no shell string, no interpolation).
run_manage() {
    local rel="$1"
    shift
    (cd "${rel}/warehouse-backend" && runuser -u warehouse -- env DJANGO_SETTINGS_MODULE=config.settings \
        DJANGO_ENV=production "${MANAGE_ENV[@]}" "${rel}/venv/bin/python" manage.py "$@")
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
    from django.apps import apps
    # Rows of a catalog module that is not installed in this profile (e.g. left by a failed --add-module)
    # are not part of the schema of this release: its code never touches those tables. Rows of any other
    # app the release does not know (a newer core app) still count as forward migrations.
    ignored = set()
    try:
        from platform_core.module_catalog import MODULE_CATALOG
    except ImportError:
        MODULE_CATALOG = {}
    installed = {a.label for a in apps.get_app_configs()}
    for spec in MODULE_CATALOG.values():
        labels = {path.split(".")[0] for path in spec.django_apps}
        if not labels & installed:
            ignored |= labels
    applied = {m for m in loader.applied_migrations.keys() if m[0] not in ignored}
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
            DJANGO_ENV=production "${MANAGE_ENV[@]}" "${target}/venv/bin/python" -c "$MIGRATION_CHECK_PY" ${mode:+"$mode"} 2>&1); then
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
    local new prev had_prev=0 had_link=0 had_default=0 out reject cf_ip
    local tls_dir="/etc/warehouse/tls/${domain}" cert_mode="http01"
    mkdir -p /var/www/html /etc/nginx/sites-available /etc/nginx/sites-enabled
    if [[ ! -f "${tls_dir}/fullchain.pem" && -f "/etc/letsencrypt/live/${domain}/fullchain.pem" ]]; then
        mkdir -p "$tls_dir"
        ln -sfn "/etc/letsencrypt/live/${domain}/fullchain.pem" "${tls_dir}/fullchain.pem"
        ln -sfn "/etc/letsencrypt/live/${domain}/privkey.pem" "${tls_dir}/privkey.pem"
    fi
    if [[ -f "${SHARED_DIR}/CERT_MODE" ]]; then
        cert_mode=$(head -n 1 "${SHARED_DIR}/CERT_MODE" 2>/dev/null | tr -d '\r\n' || echo "http01")
    fi
    new=$(mktemp /etc/nginx/sites-available/.warehouse.new.XXXXXX)
    if [[ -f "${tls_dir}/fullchain.pem" && -f "${tdir}/nginx-https.conf" ]]; then
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
        if [[ "$cert_mode" == "cloudflare-origin" ]]; then
            cf_ip=$(mktemp /etc/nginx/sites-available/.warehouse.cfip.XXXXXX)
            cat > "$cf_ip" <<'EOF'
    # Cloudflare official IP ranges for real_ip (CF-Connecting-IP)
    set_real_ip_from 173.245.48.0/20;
    set_real_ip_from 103.21.244.0/22;
    set_real_ip_from 103.22.200.0/22;
    set_real_ip_from 103.31.4.0/22;
    set_real_ip_from 141.101.64.0/18;
    set_real_ip_from 108.162.192.0/18;
    set_real_ip_from 190.93.240.0/20;
    set_real_ip_from 188.114.96.0/20;
    set_real_ip_from 197.234.240.0/22;
    set_real_ip_from 198.41.128.0/17;
    set_real_ip_from 162.158.0.0/15;
    set_real_ip_from 104.16.0.0/13;
    set_real_ip_from 104.24.0.0/14;
    set_real_ip_from 172.64.0.0/13;
    set_real_ip_from 131.0.72.0/22;
    set_real_ip_from 2400:cb00::/32;
    set_real_ip_from 2606:4700::/32;
    set_real_ip_from 2803:f800::/32;
    set_real_ip_from 2405:b500::/32;
    set_real_ip_from 2405:8100::/32;
    set_real_ip_from 2a06:98c0::/29;
    set_real_ip_from 2c0f:f248::/32;
    real_ip_header CF-Connecting-IP;
EOF
            sed -i -e "/__CLOUDFLARE_REAL_IP__/{r ${cf_ip}" -e 'd}' "$new"
            rm -f "$cf_ip"
        else
            sed -i '/__CLOUDFLARE_REAL_IP__/d' "$new"
        fi
    elif [[ -f "${tdir}/nginx-http.conf" ]]; then
        sed "s/__DOMAIN__/${domain}/g" "${tdir}/nginx-http.conf" > "$new"
    else
        rm -f "$new"
        echo "[WARNING] ${rel##*/} has no nginx template; nginx configuration left unchanged." >&2
        return 0
    fi

    # Render legacy domains from shared/DOMAINS_LEGACY if present in HTTPS mode
    local legacy_file="${SHARED_DIR}/DOMAINS_LEGACY"
    if [[ -f "$legacy_file" && ! -L "$legacy_file" && -f "${tls_dir}/fullchain.pem" && -f "${tdir}/nginx-https.conf" ]]; then
        local leg_d leg_m leg_tls leg_block leg_label port80_target
        # Extract main 443 server block for transition domains
        local trans_base
        trans_base=$(python3 -c '
import sys
with open(sys.argv[1], "r", encoding="utf-8") as f:
    text = f.read()
target = sys.argv[2]
needle = "listen 443 ssl http2;"
p = text.find(needle)
if p != -1:
    idx = text.rfind("server {", 0, p)
    if idx != -1:
        print(text[idx:])
' "$new" "$domain")

        while read -r leg_d leg_m _rest; do
            [[ -n "$leg_d" && ! "$leg_d" =~ ^# ]] || continue
            [[ "$leg_d" != "$domain" ]] || continue
            [[ "$leg_m" =~ ^(transition|redirect)$ ]] || continue
            leg_tls="/etc/warehouse/tls/${leg_d}"
            if [[ ! -f "${leg_tls}/fullchain.pem" && -f "/etc/letsencrypt/live/${leg_d}/fullchain.pem" ]]; then
                mkdir -p "$leg_tls"
                ln -sfn "/etc/letsencrypt/live/${leg_d}/fullchain.pem" "${leg_tls}/fullchain.pem"
                ln -sfn "/etc/letsencrypt/live/${leg_d}/privkey.pem" "${leg_tls}/privkey.pem"
            fi
            if [[ ! -f "${leg_tls}/fullchain.pem" || ! -f "${leg_tls}/privkey.pem" ]]; then
                echo "[WARNING] Legacy domain $leg_d has no TLS certificate in $leg_tls; skipping." >&2
                continue
            fi

            if [[ -z "$trans_base" ]]; then
                echo "[ERROR] Could not extract the main HTTPS server block for legacy domain $leg_d." >&2
                rm -f "$new"
                return 1
            fi
            leg_block="${trans_base// default_server/}"
            leg_block="${leg_block// ssl http2/ ssl}"
            leg_block="${leg_block//${domain}/${leg_d}}"
            if [[ "$leg_m" == "redirect" ]]; then
                # Safe redirect: the old origin keeps serving /api/, /ws/, ngsw.json and the app files, so an
                # installed app that still holds an offline queue (IndexedDB is per origin) can send it and then
                # move itself. Only page navigation (the SPA fallback) gets the permanent redirect.
                if ! leg_block=$(printf '%s' "$leg_block" | python3 -c '
import sys
text = sys.stdin.read()
target = sys.argv[1]
marker = "    location / {"
p = text.rfind(marker)
end = text.find("\n    }", p) if p != -1 else -1
if p == -1 or end == -1:
    sys.exit(3)
end += len("\n    }")
text = text[:p] + "    location / {\n        return 301 https://" + target + "$request_uri;\n    }" + text[end:]
sys.stdout.write(text)
' "$domain"); then
                    echo "[ERROR] Could not render the redirect server block for legacy domain $leg_d." >&2
                    rm -f "$new"
                    return 1
                fi
                port80_target="https://${domain}\$request_uri"
                leg_label="redirect: page navigation 301 to https://${domain}; API, websocket and app files still served"
            else
                port80_target="https://\$host\$request_uri"
                leg_label="transition: full app served"
            fi
            cat >> "$new" <<EOF

# Legacy Domain: ${leg_d} (${leg_label})
server {
    listen 80;
    listen [::]:80;
    server_name ${leg_d};
    server_tokens off;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/html;
        default_type "text/plain";
        allow all;
    }

    location / {
        return 301 ${port80_target};
    }
}
EOF
            printf '%s\n\n' "$leg_block" >> "$new"
        done < "$legacy_file"
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
# Mode: --rollback [--domain <d>] [--release <rel>] [--list]
# ==============================================================================
if [[ "${1:-}" == "--rollback" ]]; then
    shift
    DOMAIN=""
    TARGET_NAME=""
    LIST_ONLY=0
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --domain) [[ $# -ge 2 ]] || die "--domain needs a value"; DOMAIN="$2"; shift 2 ;;
            --release) [[ $# -ge 2 ]] || die "--release needs a value"; TARGET_NAME="$2"; shift 2 ;;
            --list) LIST_ONLY=1; shift ;;
            *) die "Unknown rollback option: $1" ;;
        esac
    done
    if [[ -z "$DOMAIN" && -f "${SHARED_DIR}/DOMAIN" ]]; then DOMAIN=$(head -n 1 "${SHARED_DIR}/DOMAIN"); fi
    [[ -z "$DOMAIN" || "$DOMAIN" =~ $DOMAIN_RE ]] || die "Invalid domain format: $DOMAIN"
    assert_not_legacy_domain "$DOMAIN"

    if [[ "$LIST_ONLY" -eq 1 ]]; then
        ACTIVE_RELEASE=$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)
        ACTIVE_NAME="${ACTIVE_RELEASE##*/}"
        PREV_NAME=$(head -n 1 "${SHARED_DIR}/PREVIOUS_RELEASE" 2>/dev/null || true)
        cd "$RELEASES_DIR"
        # shellcheck disable=SC2012
        for rdir in $(ls -1dt -- */ 2>/dev/null | sed 's/\/$//'); do
            if [[ "$rdir" =~ $RELEASE_NAME_RE && -d "$rdir" && ! -L "$rdir" ]]; then
                tag=""
                if [[ "$rdir" == "$ACTIVE_NAME" ]]; then
                    tag="active"
                elif [[ "$rdir" == "$PREV_NAME" ]]; then
                    tag="previous"
                fi
                compat="ok"
                if ! check_migration_compatibility "${RELEASES_DIR}/${rdir}" strict >/dev/null 2>&1; then
                    compat="incompatible"
                fi
                commit=""
                date=""
                if [[ -f "${rdir}/RELEASE" ]]; then
                    commit=$(sed -n 's/^COMMIT=//p' "${rdir}/RELEASE" 2>/dev/null | head -n 1 || true)
                    date=$(sed -n 's/^DATE=//p' "${rdir}/RELEASE" 2>/dev/null | head -n 1 || true)
                fi
                echo "[RELEASE_ITEM] name=${rdir} tag=${tag} compat=${compat} commit=${commit} date=${date}"
            fi
        done
        exit 0
    fi

    echo "=== Initiating Release Rollback ==="
    ACTIVE_RELEASE=$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)
    if [[ -n "$TARGET_NAME" ]]; then
        [[ "$TARGET_NAME" =~ $RELEASE_NAME_RE ]] || die "Invalid release name format: $TARGET_NAME"
        TARGET_RELEASE="${RELEASES_DIR}/${TARGET_NAME}"
        [[ -d "$TARGET_RELEASE" && ! -L "$TARGET_RELEASE" ]] || die "Selected release ${TARGET_NAME} does not exist."
    else
        PREV_NAME=$(head -n 1 "${SHARED_DIR}/PREVIOUS_RELEASE" 2>/dev/null || true)
        [[ "$PREV_NAME" =~ $RELEASE_NAME_RE ]] || die "No valid previous release is recorded in ${SHARED_DIR}/PREVIOUS_RELEASE; nothing to roll back to."
        TARGET_NAME="$PREV_NAME"
        TARGET_RELEASE="${RELEASES_DIR}/${TARGET_NAME}"
        [[ -d "$TARGET_RELEASE" && ! -L "$TARGET_RELEASE" ]] || die "Recorded previous release ${TARGET_NAME} no longer exists."
    fi

    [[ "$TARGET_RELEASE" != "$ACTIVE_RELEASE" ]] || die "Selected release ${TARGET_NAME} is already active."

    # Strict: after a restored older dump the target release may have unapplied migrations too.
    echo "[INFO] Checking that ${TARGET_NAME} matches the database schema exactly..."
    if ! check_migration_compatibility "$TARGET_RELEASE" strict; then
        die "Rollback refused to prevent a database schema mismatch. Restore a backup that matches ${TARGET_NAME} (deploy.ps1 -Restore), or Update."
    fi
    # The target matches the schema exactly, so a hold left by a restore no longer applies.
    rm -f "$HELD_FLAG"

    if [[ -n "$DOMAIN" ]]; then
        if ! install_runtime_infra "$TARGET_RELEASE" "$DOMAIN"; then
            echo "[WARNING] The current nginx configuration was kept for the rollback." >&2
            install_units "$TARGET_RELEASE"
            systemctl daemon-reload
        fi
    else
        echo "[WARNING] No domain is known (no --domain and no shared/DOMAIN); nginx configuration not re-rendered." >&2
        install_units "$TARGET_RELEASE"
        systemctl daemon-reload
    fi

    switch_current "$TARGET_RELEASE"
    write_record ACTIVE_RELEASE "$TARGET_NAME"
    if [[ -n "$ACTIVE_RELEASE" ]]; then write_record PREVIOUS_RELEASE "$(basename "$ACTIVE_RELEASE")"; fi

    systemctl restart "${SERVICES[@]}"
    systemctl reload nginx

    if ! wait_backend_live "$DOMAIN"; then
        die "${TARGET_NAME} is active but the backend did not answer within 60s. Check: journalctl -u warehouse-backend"
    fi
    # The target passed the migration check and answers, so a flag left by a failed activation is stale.
    if [[ -e "${SHARED_DIR}/MAINTENANCE" ]]; then
        rm -f "${SHARED_DIR}/MAINTENANCE"
        echo "[INFO] A MAINTENANCE flag left by an earlier failure was cleared; ${TARGET_NAME} is compatible and answers."
    fi
    echo "[SUCCESS] Rolled back to: ${TARGET_NAME}"
    exit 0
fi

# ==============================================================================
# Mode: --refresh-nginx --domain <d>  (re-render the active release's site, e.g. after certbot)
# ==============================================================================
if [[ "${1:-}" == "--refresh-nginx" ]]; then
    [[ "${2:-}" == "--domain" && $# -eq 3 && "$3" =~ $DOMAIN_RE ]] || die "Usage: --refresh-nginx --domain <domain>"
    assert_not_legacy_domain "$3"
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
# Mode: --add-module <code> --verified-backup <db_pre_module dump> [--domain <d>]  (deploy.ps1 -AddModule)
# Adds one module to the active release: WH_MODULES, migrate, permissions and roles, the module's units,
# restart and a check of installed_modules. Any failure puts WH_MODULES back and restarts the services
# with the previous modules; tables that were already migrated stay (nothing is deleted).
# Removing a module is not supported.
# ==============================================================================
if [[ "${1:-}" == "--add-module" ]]; then
    parse_add_module_args "${@:2}"
    if [[ -z "$DOMAIN" && -f "${SHARED_DIR}/DOMAIN" ]]; then DOMAIN=$(head -n 1 "${SHARED_DIR}/DOMAIN"); fi
    [[ -z "$DOMAIN" || "$DOMAIN" =~ $DOMAIN_RE ]] || DOMAIN=""
    [[ ! -e "$HELD_FLAG" ]] || die "SERVICES_HELD is set: the active release does not match the database; resolve that first."
    [[ ! -e "${SHARED_DIR}/MAINTENANCE" ]] || die "MAINTENANCE is set; resolve the earlier failure first (deploy.ps1 -Status)."
    ACTIVE_RELEASE=$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)
    [[ -n "$ACTIVE_RELEASE" && "${ACTIVE_RELEASE%/*}" == "$RELEASES_DIR" && -d "$ACTIVE_RELEASE" ]] || die "No active release in ${RELEASES_DIR}."
    OLD_MODULES=$(effective_modules) || die "WH_MODULES in ${SHARED_DIR}/.env is invalid."
    [[ ",${OLD_MODULES}," != *",${ADD_CODE},"* ]] || die "Module ${ADD_CODE} is already installed (${OLD_MODULES})."
    NEW_MODULES=$(canonical_modules "${OLD_MODULES},${ADD_CODE}") || die "Cannot build the new module list."

    # The backup taken for this change must be fresh and intact (deploy.ps1 pulled and verified it).
    assert_backup_matches_record "$VERIFIED_BACKUP"
    BK_AGE=$(( $(date +%s) - $(stat -c %Y -- "${BACKUPS_DIR}/${VERIFIED_BACKUP}") ))
    [[ "$BK_AGE" -le 21600 ]] || die "Backup ${VERIFIED_BACKUP} is older than 6 hours; take a new one (deploy.ps1 -AddModule does)."
    echo "[INFO] Verified backup before the change: ${VERIFIED_BACKUP}"

    REL_NAME="${ACTIVE_RELEASE##*/}"
    echo "[INFO] Checking that ${REL_NAME} matches the applied migrations..."
    check_migration_compatibility "$ACTIVE_RELEASE" || die "Refused before any change: ${REL_NAME} does not match the database."

    OLD_LINE=$(grep '^WH_MODULES=' -- "${SHARED_DIR}/.env" | tail -n 1 || true)
    OLD_RECORD=$(head -n 1 "${SHARED_DIR}/MODULES" 2>/dev/null || true)
    ENV_SWITCHED=0
    ADD_DONE=0
    REVERTING=0
    revert_modules() {
        [[ "$REVERTING" -eq 0 ]] || return 0
        REVERTING=1
        echo "[CRITICAL] $1" >&2
        MANAGE_ENV=()
        if [[ "$ENV_SWITCHED" -eq 1 ]]; then
            write_env_modules_line "$OLD_LINE"
            if [[ -n "$OLD_RECORD" ]]; then write_record MODULES "$OLD_RECORD"; else rm -f "${SHARED_DIR}/MODULES"; fi
            for u in ${MODULE_SERVICES[$ADD_CODE]:-}; do systemctl disable --now "$u" || true; done
            echo "[INFO] WH_MODULES put back to ${OLD_MODULES}; restarting the services..." >&2
            systemctl restart "${SERVICES[@]}" || true
            if wait_backend_live "$DOMAIN"; then
                echo "[INFO] The services run again with ${OLD_MODULES}." >&2
            else
                echo "[CRITICAL] The backend did not answer after the revert. Check: journalctl -u warehouse-backend" >&2
            fi
        else
            echo "[INFO] shared/.env was not changed; the services kept running with ${OLD_MODULES}." >&2
        fi
        echo "[INFO] Tables already migrated for ${ADD_CODE} stay; nothing was deleted." >&2
        echo '[MODULE_ROLLED_BACK]'
        exit 1
    }
    # Any other exit (set -e, a signal) also puts the modules back.
    trap 'if [[ "$ADD_DONE" -ne 1 ]]; then revert_modules "--add-module stopped before it finished."; fi' EXIT
    trap 'exit 143' TERM HUP
    trap 'exit 130' INT

    # migrate, permissions and roles run with the new modules through the environment while shared/.env
    # (and so every running service and a reboot) still has the old ones.
    MANAGE_ENV=("WH_MODULES=${NEW_MODULES}")
    echo "=== [1/4] Migrating the database, permissions and roles for ${NEW_MODULES} ==="
    run_manage "$ACTIVE_RELEASE" migrate --noinput || revert_modules "Database migration for ${ADD_CODE} failed."
    run_manage "$ACTIVE_RELEASE" seed_permissions || revert_modules "seed_permissions failed."
    run_manage "$ACTIVE_RELEASE" init_roles || revert_modules "init_roles failed."
    check_migration_compatibility "$ACTIVE_RELEASE" strict || revert_modules "${REL_NAME} does not match the migrated schema with ${NEW_MODULES}."
    MANAGE_ENV=()

    echo "=== [2/4] Modules: ${OLD_MODULES} -> ${NEW_MODULES} ==="
    ENV_SWITCHED=1
    set_env_modules "$NEW_MODULES"

    echo "=== [3/4] Restarting the services ==="
    for u in ${MODULE_SERVICES[$ADD_CODE]:-}; do systemctl enable "$u"; done
    # shellcheck disable=SC2086
    systemctl restart "${SERVICES[@]}" ${MODULE_SERVICES[$ADD_CODE]:-} || echo "[WARNING] systemctl restart reported an error; the health check decides." >&2

    echo "=== [4/4] Health check ==="
    wait_backend_live "$DOMAIN" || revert_modules "The backend did not answer within 60s with ${NEW_MODULES}."
    for s in "${SERVICES[@]}" ${MODULE_SERVICES[$ADD_CODE]:-}; do
        systemctl is-active --quiet "$s" || revert_modules "$s is not active."
    done
    CONFIG_JSON=$(curl -fsS -H "Host: ${DOMAIN:-localhost}" -H "X-Forwarded-Proto: https" http://127.0.0.1:8000/api/public/config/ || true)
    if ! python3 -c 'import json, sys; sys.exit(0 if sys.argv[1] in (json.loads(sys.stdin.read() or "{}").get("installed_modules") or []) else 1)' "$ADD_CODE" <<<"$CONFIG_JSON"; then
        revert_modules "/api/public/config/ does not list ${ADD_CODE} in installed_modules."
    fi
    ADD_DONE=1
    trap - EXIT TERM HUP INT
    echo "[MODULE_ADDED] ${ADD_CODE}"
    echo "[MODULES] ${NEW_MODULES}"
    exit 0
fi

# ==============================================================================
# Mode: --reset-database <release> --modules <list> --verified-backup <dump> [--domain <d>]
# Before GO_LIVE only (deploy.ps1 -ResetServer): stops the services, drops and recreates the application
# database, sets WH_MODULES and migrates it with the prepared release (which --activate then switches to).
# Bound to the pre-update backup of that release, which the operator machine pulled and verified first.
# Media, in-app backups and shared/.env (apart from WH_MODULES) are not touched.
# ==============================================================================
if [[ "${1:-}" == "--reset-database" ]]; then
    parse_reset_args "${@:2}"
    [[ ! -e "${SHARED_DIR}/GO_LIVE" ]] || die "The server is GO-LIVE; resetting the database is refused."
    RELEASE_DIR="${RELEASES_DIR}/${REL_NAME}"
    [[ -d "$RELEASE_DIR" && ! -L "$RELEASE_DIR" ]] || die "Release directory not found: $RELEASE_DIR"
    assert_release_backup "$RELEASE_DIR" "$VERIFIED_BACKUP"
    BK_AGE=$(( $(date +%s) - $(stat -c %Y -- "${BACKUPS_DIR}/${VERIFIED_BACKUP}") ))
    [[ "$BK_AGE" -le 7200 ]] || die "Backup ${VERIFIED_BACKUP} is older than 2 hours; run deploy.ps1 -ResetServer again (it prepares a new one)."
    echo "[INFO] Verified pre-update backup bound to release: ${VERIFIED_BACKUP}"
    DB_NAME=$(sed -n 's/^DB_NAME=//p' "${SHARED_DIR}/.env" 2>/dev/null | tail -n 1 | tr -d '\r' || true)
    DB_USER=$(sed -n 's/^DB_USER=//p' "${SHARED_DIR}/.env" 2>/dev/null | tail -n 1 | tr -d '\r' || true)
    [[ "$DB_NAME" =~ $DB_NAME_RE && "$DB_USER" =~ $DB_NAME_RE ]] || die "DB_NAME or DB_USER in shared/.env is missing or invalid."
    pg_exec() { runuser -u postgres -- psql -XAtq -v ON_ERROR_STOP=1 "$@"; }

    echo "=== [1/4] Stopping the services (MAINTENANCE set) ==="
    touch "${SHARED_DIR}/MAINTENANCE"
    systemctl stop "${SERVICES[@]}" || echo "[WARNING] systemctl stop reported an error; checking the units..." >&2
    resume_services() {
        systemctl start "${SERVICES[@]}" || true
        rm -f "${SHARED_DIR}/MAINTENANCE"
        die "$1 The database was not touched."
    }
    for s in "${SERVICES[@]}"; do
        if systemctl is-active --quiet "$s"; then resume_services "$s did not stop."; fi
    done

    # Final dump with the services stopped: holds everything written since the pre-update backup.
    TS=$(date +"%Y%m%d_%H%M%S")
    FINAL_DUMP="${BACKUPS_DIR}/db_pre_reset_${TS}.dump"
    [[ ! -e "$FINAL_DUMP" ]] || resume_services "${FINAL_DUMP} already exists."
    if ! ( set -C; umask 077; runuser -u postgres -- pg_dump -Fc "$DB_NAME" > "${FINAL_DUMP}.part" ) \
        || ! runuser -u postgres -- pg_restore --list < "${FINAL_DUMP}.part" > /dev/null; then
        rm -f -- "${FINAL_DUMP}.part"
        resume_services "The final dump before the reset failed."
    fi
    mv -n -- "${FINAL_DUMP}.part" "$FINAL_DUMP"
    ( set -C; umask 077; printf '%s  %s\n' "$(sha256sum -- "$FINAL_DUMP" | cut -d' ' -f1)" "$FINAL_DUMP" > "${FINAL_DUMP}.sha256" )
    echo "[PRE_RESET_BACKUP] $(basename "$FINAL_DUMP")"

    # GO_LIVE may have been set while the services stopped (set-go-live does not take this lock).
    [[ ! -e "${SHARED_DIR}/GO_LIVE" ]] || resume_services "The server became GO-LIVE."

    echo "=== [2/4] Recreating database ${DB_NAME} (owner ${DB_USER}) ==="
    # From here the services stay stopped across restarts and reboots until --activate clears the hold.
    touch "$HELD_FLAG"
    pg_exec -c "DROP DATABASE IF EXISTS \"${DB_NAME}\" WITH (FORCE);"
    # Same database as Setup: UTF-8 with the ICU fa-IR collation (D-30).
    pg_exec -c "CREATE DATABASE \"${DB_NAME}\" OWNER \"${DB_USER}\" ENCODING 'UTF8' TEMPLATE template0 LOCALE_PROVIDER icu ICU_LOCALE 'fa-IR' LOCALE 'C.UTF-8';"
    PERSIAN_ORDER=$(pg_exec -d "$DB_NAME" -c "SELECT string_agg(ascii(x)::text, ',' ORDER BY x) FROM unnest(ARRAY[chr(1740), chr(1711), chr(1705), chr(1688), chr(1586), chr(1670), chr(1662), chr(1576)]) AS t(x)")
    [[ "$PERSIAN_ORDER" == "1576,1662,1670,1586,1688,1705,1711,1740" ]] || die "The new database does not sort Persian correctly (${PERSIAN_ORDER})."
    pg_exec -d "$DB_NAME" -c "ALTER SCHEMA public OWNER TO \"${DB_USER}\"; GRANT ALL ON SCHEMA public TO \"${DB_USER}\"; CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE EXTENSION IF NOT EXISTS btree_gin;"

    echo "=== [3/4] Modules: ${RESET_MODULES} ==="
    set_env_modules "$RESET_MODULES"

    echo "=== [4/4] Migrating with ${REL_NAME}, permissions and roles ==="
    run_manage "$RELEASE_DIR" migrate --noinput || die "Migration of the new database failed; services stay stopped (SERVICES_HELD, MAINTENANCE)."
    run_manage "$RELEASE_DIR" seed_permissions || die "seed_permissions failed; services stay stopped (SERVICES_HELD, MAINTENANCE)."
    run_manage "$RELEASE_DIR" init_roles || die "init_roles failed; services stay stopped (SERVICES_HELD, MAINTENANCE)."
    echo "[DATABASE_RESET] ${DB_NAME}"
    echo "[MODULES] ${RESET_MODULES}"
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
    EXPECTED_MODULES=""
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --bundle) [[ $# -ge 2 ]] || die "--bundle needs a value"; BUNDLE_PATH="$2"; shift 2 ;;
            --bundle-sha256) [[ $# -ge 2 ]] || die "--bundle-sha256 needs a value"; BUNDLE_SHA256="$2"; shift 2 ;;
            --domain) [[ $# -ge 2 ]] || die "--domain needs a value"; DOMAIN="$2"; shift 2 ;;
            --modules) [[ $# -ge 2 ]] || die "--modules needs a value"; EXPECTED_MODULES="$2"; shift 2 ;;
            *) die "Unknown prepare option: $1" ;;
        esac
    done
    [[ "$DOMAIN" =~ $DOMAIN_RE ]] || die "Invalid domain format: $DOMAIN"
    assert_not_legacy_domain "$DOMAIN"
    # An update never changes the installed modules (deploy.ps1 -AddModule adds one; none is ever removed).
    if [[ -n "$EXPECTED_MODULES" ]]; then
        WANT_MODULES=$(canonical_modules "$EXPECTED_MODULES") || die "--modules must list known modules (${KNOWN_MODULES[*]})."
        HAVE_MODULES=$(effective_modules) || die "WH_MODULES in ${SHARED_DIR}/.env is invalid."
        [[ "$WANT_MODULES" == "$HAVE_MODULES" ]] || die "Modules mismatch: the server has '${HAVE_MODULES}', the configuration asks for '${WANT_MODULES}'. Update never changes the installed modules: add one with deploy.ps1 -AddModule <code>; removing a module is not supported."
    fi
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
    discover_known_modules "$TEMP_EXTRACT"
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
    assert_release_backup "$RELEASE_DIR" "$VERIFIED_BACKUP"
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

        if [[ -f "/etc/warehouse/tls/${DOMAIN}/fullchain.pem" || -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]]; then
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

# ==============================================================================
# Domain modes (plan Modular_Deploy_Options step 5): shared helpers
# ==============================================================================
# The TLS pair of a domain in /etc/warehouse/tls is usable: both files, valid now, covering the name,
# and the key matching the certificate. nginx -t checks none of these except the key.
check_tls_pair() {
    local d="$1" dir="/etc/warehouse/tls/$1" cpub kpub
    if [[ ! -f "$dir/fullchain.pem" || ! -f "$dir/privkey.pem" ]]; then
        echo "[ERROR] TLS certificate for $d is missing in $dir. Issue or install it first." >&2
        return 1
    fi
    if ! openssl x509 -in "$dir/fullchain.pem" -noout -checkend 0 >/dev/null 2>&1; then
        echo "[ERROR] TLS certificate for $d in $dir is unreadable or expired." >&2
        return 1
    fi
    if ! openssl x509 -in "$dir/fullchain.pem" -noout -checkhost "$d" 2>/dev/null | grep -q 'does match'; then
        echo "[ERROR] TLS certificate in $dir does not cover $d." >&2
        return 1
    fi
    cpub=$(openssl x509 -in "$dir/fullchain.pem" -noout -pubkey 2>/dev/null || true)
    kpub=$(openssl pkey -in "$dir/privkey.pem" -pubout -passin pass: </dev/null 2>/dev/null || true)
    if [[ -z "$cpub" || "$cpub" != "$kpub" ]]; then
        echo "[ERROR] TLS private key in $dir does not match its certificate." >&2
        return 1
    fi
    return 0
}

# Lines of a DOMAINS_LEGACY file without the given domains (exact first-field match, never a regex).
legacy_lines_without() {
    awk -v a="$2" -v b="${3:-}" '{ sub(/\r$/, "") } NF == 0 || $1 ~ /^#/ { next } $1 != a && $1 != b { print $1, $2 }' "$1"
}

# Replaces a shared state file atomically with the content of another file, keeping owner and mode.
replace_shared_file() {
    local dest="$1" src="$2" tmp
    tmp="${1%/*}/.${1##*/}.new.$$"
    if [[ -f "$dest" ]]; then cp -p -- "$dest" "$tmp"; fi
    cat -- "$src" > "$tmp"
    sync -- "$tmp"
    mv -f -- "$tmp" "$dest"
}

# ==============================================================================
# Mode: --change-domain <new_domain>
# The new domain becomes primary and the current one goes to transition (still serving the app).
# Every exit before the end puts DOMAIN, DOMAINS_LEGACY, .env and nginx back (trap).
# ==============================================================================
if [[ "${1:-}" == "--change-domain" ]]; then
    [[ $# -eq 2 && "$2" =~ $DOMAIN_RE ]] || die "Usage: --change-domain <new_domain>"
    NEW_DOMAIN="$2"
    OLD_DOMAIN=$(head -n 1 "${SHARED_DIR}/DOMAIN" 2>/dev/null | tr -d '\r' || true)
    [[ -n "$OLD_DOMAIN" ]] || die "Primary domain in shared/DOMAIN is missing."
    [[ "$NEW_DOMAIN" != "$OLD_DOMAIN" ]] || die "Domain $NEW_DOMAIN is already the active primary domain."
    [[ -f "${SHARED_DIR}/.env" && ! -L "${SHARED_DIR}/.env" ]] || die "Production environment file ${SHARED_DIR}/.env does not exist."
    check_tls_pair "$NEW_DOMAIN" || exit 1
    # The current domain keeps serving the app during the transition, so it must keep a working certificate.
    check_tls_pair "$OLD_DOMAIN" || die "The current domain $OLD_DOMAIN has no usable certificate in /etc/warehouse/tls; it could not stay on HTTPS during the transition."

    ACTIVE_RELEASE=$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)
    [[ -n "$ACTIVE_RELEASE" && -d "$ACTIVE_RELEASE" ]] || die "No active release."

    CD_BAK=$(mktemp -d "${SHARED_DIR}/.change-domain.XXXXXX")
    cp -p "${SHARED_DIR}/DOMAIN" "$CD_BAK/DOMAIN"
    if [[ -f "${SHARED_DIR}/DOMAINS_LEGACY" ]]; then cp -p "${SHARED_DIR}/DOMAINS_LEGACY" "$CD_BAK/DOMAINS_LEGACY"; fi
    cp -p "${SHARED_DIR}/.env" "$CD_BAK/.env"
    CD_DONE=0
    CD_RESTARTED=0
    restore_domain_state() {
        echo "[ERROR] $1 Restoring the previous domain state." >&2
        replace_shared_file "${SHARED_DIR}/DOMAIN" "$CD_BAK/DOMAIN" || true
        if [[ -f "$CD_BAK/DOMAINS_LEGACY" ]]; then
            replace_shared_file "${SHARED_DIR}/DOMAINS_LEGACY" "$CD_BAK/DOMAINS_LEGACY" || true
        else
            rm -f "${SHARED_DIR}/DOMAINS_LEGACY"
        fi
        replace_shared_file "${SHARED_DIR}/.env" "$CD_BAK/.env" || true
        if apply_nginx_config "$ACTIVE_RELEASE" "$OLD_DOMAIN"; then systemctl reload nginx || true; fi
        if [[ "$CD_RESTARTED" -eq 1 ]]; then systemctl restart "${SERVICES[@]}" || true; fi
        rm -rf "$CD_BAK"
        echo "[DOMAIN_CHANGE_ROLLED_BACK] ${OLD_DOMAIN}" >&2
    }
    trap 'if [[ "$CD_DONE" -ne 1 ]]; then restore_domain_state "--change-domain stopped before it finished."; fi' EXIT
    trap 'exit 143' TERM HUP
    trap 'exit 130' INT

    # 1. shared/DOMAIN and shared/DOMAINS_LEGACY (the old primary goes to transition)
    printf '%s\n' "$NEW_DOMAIN" > "$CD_BAK/DOMAIN.new"
    replace_shared_file "${SHARED_DIR}/DOMAIN" "$CD_BAK/DOMAIN.new"
    : > "$CD_BAK/DOMAINS_LEGACY.new"
    if [[ -f "$CD_BAK/DOMAINS_LEGACY" ]]; then
        legacy_lines_without "$CD_BAK/DOMAINS_LEGACY" "$NEW_DOMAIN" "$OLD_DOMAIN" > "$CD_BAK/DOMAINS_LEGACY.new"
    fi
    printf '%s transition\n' "$OLD_DOMAIN" >> "$CD_BAK/DOMAINS_LEGACY.new"
    replace_shared_file "${SHARED_DIR}/DOMAINS_LEGACY" "$CD_BAK/DOMAINS_LEGACY.new"

    # 2. Managed .env keys (atomic; every other line kept)
    write_env_domains "$NEW_DOMAIN"

    # 3. nginx (nginx -t inside; the previous site file is put back on failure), then reload
    apply_nginx_config "$ACTIVE_RELEASE" "$NEW_DOMAIN" || exit 1
    systemctl reload nginx || exit 1

    # 4. Backend services read the new .env
    CD_RESTARTED=1
    systemctl restart "${SERVICES[@]}" || echo "[WARNING] systemctl restart reported an error; the health check decides." >&2

    # 5. Both domains answer through nginx with the right Host (also proves ALLOWED_HOSTS)
    hc_ok=0
    for _ in {1..30}; do
        if curl -kfsS --resolve "${NEW_DOMAIN}:443:127.0.0.1" "https://${NEW_DOMAIN}/api/public/config/" > /dev/null 2>&1 \
            && curl -kfsS --resolve "${OLD_DOMAIN}:443:127.0.0.1" "https://${OLD_DOMAIN}/api/public/config/" > /dev/null 2>&1; then
            hc_ok=1
            break
        fi
        sleep 1
    done
    [[ "$hc_ok" -eq 1 ]] || { echo "[ERROR] Health check through nginx failed for ${NEW_DOMAIN} or ${OLD_DOMAIN}." >&2; exit 1; }

    CD_DONE=1
    trap - EXIT TERM HUP INT
    rm -rf "$CD_BAK"
    echo "[DOMAIN_CHANGED] ${NEW_DOMAIN}"
    echo "[SUCCESS] Primary domain changed to ${NEW_DOMAIN}; ${OLD_DOMAIN} is in transition mode."
    exit 0
fi

# ==============================================================================
# Mode: --finish-domain-change
# transition -> redirect. The old domain keeps serving /api/, /ws/ and the app files, so an installed app
# that still holds an offline queue can send it; only page navigation gets the 301.
# ==============================================================================
if [[ "${1:-}" == "--finish-domain-change" ]]; then
    [[ $# -eq 1 ]] || die "Usage: --finish-domain-change"
    LEGACY_FILE="${SHARED_DIR}/DOMAINS_LEGACY"
    if [[ ! -f "$LEGACY_FILE" ]] || ! awk '{ sub(/\r$/, "") } $2 == "transition" { found = 1 } END { exit !found }' "$LEGACY_FILE"; then
        echo "[INFO] No legacy domains in transition state."
        echo "[FINISH_DOMAIN_CHANGE_OK]"
        exit 0
    fi

    ACTIVE_RELEASE=$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)
    [[ -n "$ACTIVE_RELEASE" && -d "$ACTIVE_RELEASE" ]] || die "No active release."
    PRIMARY_DOMAIN=$(head -n 1 "${SHARED_DIR}/DOMAIN" 2>/dev/null | tr -d '\r' || true)
    [[ -n "$PRIMARY_DOMAIN" ]] || die "Primary domain in shared/DOMAIN is missing."

    FD_BAK=$(mktemp -d "${SHARED_DIR}/.finish-domain.XXXXXX")
    cp -p "$LEGACY_FILE" "$FD_BAK/DOMAINS_LEGACY"
    FD_DONE=0
    trap 'if [[ "$FD_DONE" -ne 1 ]]; then
        echo "[ERROR] --finish-domain-change stopped before it finished; restoring the transition state." >&2
        replace_shared_file "$LEGACY_FILE" "$FD_BAK/DOMAINS_LEGACY" || true
        if apply_nginx_config "$ACTIVE_RELEASE" "$PRIMARY_DOMAIN"; then systemctl reload nginx || true; fi
        rm -rf "$FD_BAK"
    fi' EXIT
    trap 'exit 143' TERM HUP
    trap 'exit 130' INT

    awk '{ sub(/\r$/, "") } NF == 0 || $1 ~ /^#/ { next } { m = $2; if (m == "transition") m = "redirect"; print $1, m }' \
        "$FD_BAK/DOMAINS_LEGACY" > "$FD_BAK/DOMAINS_LEGACY.new"
    replace_shared_file "$LEGACY_FILE" "$FD_BAK/DOMAINS_LEGACY.new"
    apply_nginx_config "$ACTIVE_RELEASE" "$PRIMARY_DOMAIN" || exit 1
    systemctl reload nginx || exit 1

    FD_DONE=1
    trap - EXIT TERM HUP INT
    rm -rf "$FD_BAK"
    echo "[FINISH_DOMAIN_CHANGE_OK]"
    echo "[SUCCESS] Transition domains now redirect page navigation to https://${PRIMARY_DOMAIN}; their API stays served so installed apps can still send offline data."
    exit 0
fi

# ==============================================================================
# Mode: --remove-legacy-domain <domain>
# Only a domain already in redirect mode. nginx stops referencing it first; only then its certificate
# directory is archived (never deleted) to shared/retired/tls/.
# ==============================================================================
if [[ "${1:-}" == "--remove-legacy-domain" ]]; then
    [[ $# -eq 2 && "$2" =~ $DOMAIN_RE ]] || die "Usage: --remove-legacy-domain <domain>"
    REMOVE_DOMAIN="$2"
    PRIMARY_DOMAIN=$(head -n 1 "${SHARED_DIR}/DOMAIN" 2>/dev/null | tr -d '\r' || true)
    [[ -n "$PRIMARY_DOMAIN" ]] || die "Primary domain in shared/DOMAIN is missing."
    [[ "$REMOVE_DOMAIN" != "$PRIMARY_DOMAIN" ]] || die "Cannot remove primary domain $REMOVE_DOMAIN."

    LEGACY_FILE="${SHARED_DIR}/DOMAINS_LEGACY"
    LEG_MODE=""
    if [[ -f "$LEGACY_FILE" ]]; then
        LEG_MODE=$(awk -v d="$REMOVE_DOMAIN" '{ sub(/\r$/, "") } $1 == d { print $2; exit }' "$LEGACY_FILE")
    fi
    [[ -n "$LEG_MODE" ]] || die "Domain $REMOVE_DOMAIN is not listed in shared/DOMAINS_LEGACY."
    [[ "$LEG_MODE" == "redirect" ]] \
        || die "Domain $REMOVE_DOMAIN is still in $LEG_MODE mode: apps installed on it may hold unsent offline data. Run deploy.ps1 -FinishDomainChange first and keep the redirect long enough."

    ACTIVE_RELEASE=$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)
    [[ -n "$ACTIVE_RELEASE" && -d "$ACTIVE_RELEASE" ]] || die "No active release."

    RL_BAK=$(mktemp -d "${SHARED_DIR}/.remove-legacy.XXXXXX")
    cp -p "$LEGACY_FILE" "$RL_BAK/DOMAINS_LEGACY"
    cp -p "${SHARED_DIR}/.env" "$RL_BAK/.env"
    RL_DONE=0
    trap 'if [[ "$RL_DONE" -ne 1 ]]; then
        echo "[ERROR] --remove-legacy-domain stopped before it finished; restoring the previous state." >&2
        replace_shared_file "$LEGACY_FILE" "$RL_BAK/DOMAINS_LEGACY" || true
        replace_shared_file "${SHARED_DIR}/.env" "$RL_BAK/.env" || true
        if apply_nginx_config "$ACTIVE_RELEASE" "$PRIMARY_DOMAIN"; then systemctl reload nginx || true; fi
        rm -rf "$RL_BAK"
    fi' EXIT
    trap 'exit 143' TERM HUP
    trap 'exit 130' INT

    legacy_lines_without "$RL_BAK/DOMAINS_LEGACY" "$REMOVE_DOMAIN" > "$RL_BAK/DOMAINS_LEGACY.new"
    replace_shared_file "$LEGACY_FILE" "$RL_BAK/DOMAINS_LEGACY.new"
    write_env_domains "$PRIMARY_DOMAIN"
    apply_nginx_config "$ACTIVE_RELEASE" "$PRIMARY_DOMAIN" || exit 1
    systemctl reload nginx || exit 1

    # nginx no longer references the domain: archive its certificate directory (never deleted).
    RETIRED_TS=$(date +%Y%m%d_%H%M%S)
    mkdir -p "${SHARED_DIR}/retired/tls"
    chmod 700 "${SHARED_DIR}/retired/tls"
    if [[ -d "/etc/warehouse/tls/${REMOVE_DOMAIN}" ]]; then
        mv "/etc/warehouse/tls/${REMOVE_DOMAIN}" "${SHARED_DIR}/retired/tls/${REMOVE_DOMAIN}_${RETIRED_TS}"
    fi

    RL_DONE=1
    trap - EXIT TERM HUP INT
    rm -rf "$RL_BAK"
    echo "[LEGACY_DOMAIN_REMOVED] ${REMOVE_DOMAIN}"
    echo "[SUCCESS] Legacy domain ${REMOVE_DOMAIN} removed and archived to shared/retired/tls/${REMOVE_DOMAIN}_${RETIRED_TS}."
    exit 0
fi

die "warehouse-deploy requires one of: --prepare, --activate, --rollback, --refresh-nginx, --start-services, --add-module, --reset-database, --change-domain, --finish-domain-change, --remove-legacy-domain or --print-modules"
