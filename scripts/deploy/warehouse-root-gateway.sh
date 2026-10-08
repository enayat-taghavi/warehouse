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

# A file handed in by the SSH user must be a regular file (no symlink) directly inside a
# /tmp/wh-deploy.* stage directory, and both must belong to the calling user (G-06).
assert_stage_file() {
    local f="$1" dir owner="${SUDO_UID:-0}"
    if ! [[ "$f" =~ ^/tmp/wh-deploy\.[A-Za-z0-9]{10}/[A-Za-z0-9._-]+$ ]]; then
        echo "[ERROR] $SUBCMD: file must be directly inside a /tmp/wh-deploy.* stage directory." >&2
        exit 2
    fi
    dir="${f%/*}"
    if [[ ! -d "$dir" || -L "$dir" || ! -f "$f" || -L "$f" ]] \
        || [[ "$(stat -c %u -- "$dir")" != "$owner" || "$(stat -c %u -- "$f")" != "$owner" ]]; then
        echo "[ERROR] $SUBCMD: not a regular stage file owned by the calling user." >&2
        exit 2
    fi
}

# Opens a top-level dump ONCE on fd 9 and checks it against its .sha256. Everything after reads the
# same open file through /proc/self/fd/9, so the verified bytes are the restored bytes even if the
# name is replaced or pruned meanwhile. Symlinks are refused.
open_verified_dump() {
    local name="$1" f expected actual
    case "$name" in
        */*|..*|'') echo "[ERROR] $SUBCMD: invalid filename $name" >&2; exit 2 ;;
    esac
    if ! [[ "$name" =~ ^[a-zA-Z0-9_.-]+\.dump$ ]]; then
        echo "[ERROR] $SUBCMD: invalid dump extension $name" >&2
        exit 2
    fi
    f="${BACKUPS_DIR}/${name}"
    if [[ ! -f "$f" || -L "$f" || ! -f "$f.sha256" || -L "$f.sha256" ]]; then
        echo "[ERROR] $SUBCMD: $name or its .sha256 is missing or a symlink" >&2
        exit 2
    fi
    exec 9< "$f"
    expected=$(awk '{print $1; exit}' "$f.sha256")
    actual=$(sha256sum < /proc/self/fd/9 | awk '{print $1}')
    if ! [[ "$expected" =~ ^[0-9a-f]{64}$ ]] || [[ "$expected" != "$actual" ]]; then
        echo "[ERROR] $SUBCMD: sha256 mismatch for $name; nothing was changed" >&2
        exit 2
    fi
}

# Reads or hashes files below backups/ by a validated relative path (G-03). Every segment must match
# [A-Za-z0-9_.-]+ (no "." or ".."), and every directory and the file are opened with O_NOFOLLOW,
# so a symlink planted by the application user in backups/db is never followed (no TOCTOU either).
SAFE_READ_PY='
import hashlib, os, re, stat, sys
SEG = re.compile(r"^[A-Za-z0-9_.-]+$")
def open_safe(base, rel):
    parts = rel.split("/")
    if not rel or len(rel) > 400 or any(p in (".", "..") or not SEG.match(p) for p in parts):
        raise ValueError("invalid backup path")
    fd = os.open(base, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for p in parts[:-1]:
            nfd = os.open(p, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = nfd
        f = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=fd)
    finally:
        os.close(fd)
    if not stat.S_ISREG(os.fstat(f).st_mode):
        os.close(f)
        raise ValueError("not a regular file")
    return f
mode, base, rels = sys.argv[1], sys.argv[2], sys.argv[3:]
rc = 0
for rel in rels:
    try:
        fd = open_safe(base, rel)
    except (OSError, ValueError) as exc:
        print("[ERROR] %s: %s" % (rel, exc), file=sys.stderr)
        rc = 1
        continue
    with os.fdopen(fd, "rb") as fh:
        if mode == "sha256":
            h = hashlib.sha256()
            for chunk in iter(lambda: fh.read(1 << 20), b""):
                h.update(chunk)
            print("%s  %s" % (h.hexdigest(), rel), flush=True)
        else:
            out = sys.stdout.buffer
            for chunk in iter(lambda: fh.read(1 << 20), b""):
                out.write(chunk)
            out.flush()
sys.exit(rc)
'

CERT_VERIFY_PY='
import os, re, subprocess, sys

cert_path = sys.argv[1]
key_path = sys.argv[2]
domain = sys.argv[3].lower()
mode = sys.argv[4]
chain_path = sys.argv[5] if len(sys.argv) > 5 and sys.argv[5] else None

# 1. Private key validity
r = subprocess.run(["openssl", "pkey", "-in", key_path, "-noout"], capture_output=True)
if r.returncode != 0:
    print("[ERROR] install-cert: invalid private key format", file=sys.stderr)
    sys.exit(3)

# 2. Certificate validity
r = subprocess.run(["openssl", "x509", "-in", cert_path, "-noout"], capture_output=True)
if r.returncode != 0:
    print("[ERROR] install-cert: invalid certificate format", file=sys.stderr)
    sys.exit(3)

# 3. Not expired
r = subprocess.run(["openssl", "x509", "-in", cert_path, "-checkend", "0", "-noout"], capture_output=True)
if r.returncode != 0:
    print("[ERROR] install-cert: certificate is expired", file=sys.stderr)
    sys.exit(3)

# 4. Key matches certificate
c_pub = subprocess.run(["openssl", "x509", "-in", cert_path, "-pubkey", "-noout"], capture_output=True, text=True).stdout.strip().replace("\r\n", "\n")
k_pub = subprocess.run(["openssl", "pkey", "-in", key_path, "-pubout"], capture_output=True, text=True).stdout.strip().replace("\r\n", "\n")
if not c_pub or not k_pub or c_pub != k_pub:
    print("[ERROR] install-cert: private key does not match certificate", file=sys.stderr)
    sys.exit(3)

# 5. SAN covers domain
san_res = subprocess.run(["openssl", "x509", "-in", cert_path, "-ext", "subjectAltName", "-noout"], capture_output=True, text=True)
sans = []
if san_res.returncode == 0:
    for m in re.finditer(r"DNS:([^\s,]+)", san_res.stdout):
        sans.append(m.group(1).lower())
subj_res = subprocess.run(["openssl", "x509", "-in", cert_path, "-subject", "-noout"], capture_output=True, text=True)
cn_m = re.search(r"CN\s*=\s*([^\s,/]+)", subj_res.stdout)
if cn_m:
    sans.append(cn_m.group(1).lower())

def matches_pattern(pattern, target):
    if pattern == target:
        return True
    if pattern.startswith("*."):
        parent = pattern[2:]
        parts = target.split(".")
        if len(parts) > 1 and ".".join(parts[1:]) == parent:
            return True
    return False

if not any(matches_pattern(s, domain) for s in sans):
    print("[ERROR] install-cert: certificate SAN does not cover domain %s" % domain, file=sys.stderr)
    sys.exit(3)

# 6. For custom: chain completeness
if mode == "custom":
    with open(cert_path, "r", encoding="utf-8") as f:
        cert_data = f.read()
    if chain_path and os.path.isfile(chain_path):
        with open(chain_path, "r", encoding="utf-8") as f:
            cert_data += "\n" + f.read()
    blocks = [b for b in cert_data.split("-----END CERTIFICATE-----") if "-----BEGIN CERTIFICATE-----" in b]
    if not blocks:
        print("[ERROR] install-cert: no certificates found in data", file=sys.stderr)
        sys.exit(3)
    leaf_text = blocks[0].strip() + "\n-----END CERTIFICATE-----\n"
    import tempfile
    with tempfile.NamedTemporaryFile("w", delete=False) as tf_leaf, tempfile.NamedTemporaryFile("w", delete=False) as tf_full:
        tf_leaf.write(leaf_text)
        tf_leaf_path = tf_leaf.name
        tf_full.write(cert_data)
        tf_full_path = tf_full.name
    try:
        s_out = subprocess.run(["openssl", "x509", "-subject", "-noout", "-in", tf_leaf_path], capture_output=True, text=True).stdout.strip()
        i_out = subprocess.run(["openssl", "x509", "-issuer", "-noout", "-in", tf_leaf_path], capture_output=True, text=True).stdout.strip()
        s_val = s_out.replace("subject=", "").strip()
        i_val = i_out.replace("issuer=", "").strip()
        is_self_signed = (s_val == i_val and bool(s_val))
        if len(blocks) == 1:
            if not is_self_signed:
                print("[ERROR] install-cert: chain is incomplete: leaf certificate is not self-signed and no intermediate chain provided", file=sys.stderr)
                sys.exit(3)
        else:
            v1 = subprocess.run(["openssl", "verify", "-untrusted", tf_full_path, tf_leaf_path], capture_output=True)
            v2 = subprocess.run(["openssl", "verify", "-CAfile", tf_full_path, tf_leaf_path], capture_output=True)
            if v1.returncode != 0 and v2.returncode != 0:
                print("[ERROR] install-cert: certificate chain verification failed", file=sys.stderr)
                sys.exit(3)
    finally:
        if os.path.exists(tf_leaf_path): os.unlink(tf_leaf_path)
        if os.path.exists(tf_full_path): os.unlink(tf_full_path)

sys.exit(0)
'

case "$SUBCMD" in
    sha256sum)
        if [ $# -eq 0 ]; then
            echo "[ERROR] sha256sum requires at least one relative backup path." >&2
            exit 2
        fi
        exec python3 -c "$SAFE_READ_PY" sha256 "$BACKUPS_DIR" "$@"
        ;;

    read-backup)
        if [ $# -ne 1 ]; then
            echo "[ERROR] read-backup requires exactly one relative backup path." >&2
            exit 2
        fi
        exec python3 -c "$SAFE_READ_PY" read "$BACKUPS_DIR" "$1"
        ;;

    backup)
        # Invokes nightly or on-demand backup script
        exec /usr/local/bin/warehouse-nightly-backup.sh "$@"
        ;;

    list-backups)
        mkdir -p "$BACKUPS_DIR"
        cd "$BACKUPS_DIR"
        # Only names that sha256sum/read-backup accept are listed (G-03); symlinks are never listed.
        exec find . -mindepth 1 \( -name 'media_daily_*' -o -name 'latest_media' -o -name '.incoming*' \) -prune -o \
            -type f ! -name '*.part' ! -name '*.tmp' -regextype posix-extended -regex '\./[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)*' \
            -printf '%s\t%P\0'
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
        if [ $# -ne 2 ]; then
            echo "[ERROR] tar-media requires snapshot_dir and list_file." >&2
            exit 2
        fi
        SNAPSHOT_DIR="$1"
        LIST_FILE="$2"
        if ! [[ "$SNAPSHOT_DIR" =~ ^/var/www/warehouse/shared/backups/media_daily_[0-9]{8}_[0-9]{6}$ ]] \
            || [[ ! -d "$SNAPSHOT_DIR" || -L "$SNAPSHOT_DIR" ]]; then
            echo "[ERROR] tar-media: snapshot_dir must be a media_daily_<ts> directory inside ${BACKUPS_DIR}" >&2
            exit 2
        fi
        # The list must be the caller's own stage file, never an arbitrary root-readable file (G-06).
        assert_stage_file "$LIST_FILE"
        cd "$SNAPSHOT_DIR"
        # No absolute path, no "..", and no symlink anywhere along an entry's path.
        while IFS= read -r -d '' entry || [ -n "$entry" ]; do
            case "$entry" in
                /*|*../*|*/..|..|'')
                    echo "[ERROR] tar-media: list_file contains forbidden path: $entry" >&2
                    exit 2
                    ;;
            esac
            rest="$entry"
            acc=""
            while [ -n "$rest" ]; do
                seg="${rest%%/*}"
                if [[ "$rest" == */* ]]; then rest="${rest#*/}"; else rest=""; fi
                acc="${acc:+$acc/}$seg"
                if [ -L "$acc" ]; then
                    echo "[ERROR] tar-media: symlink in path: $entry" >&2
                    exit 2
                fi
            done
        done < "$LIST_FILE"
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
        assert_stage_file "$SCRIPT_PATH"
        shift
        exec bash "$SCRIPT_PATH" "$@"
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

    modules)
        # Installed modules of this server ([MODULES] <list>); read-only.
        if [ $# -ne 0 ]; then
            echo "[ERROR] modules takes no arguments." >&2
            exit 2
        fi
        /usr/local/sbin/warehouse-deploy --print-modules || exit 4
        exit 0
        ;;

    add-module)
        exec /usr/local/sbin/warehouse-deploy --add-module "$@"
        ;;

    reset-database)
        if [ -e "$GO_LIVE_FLAG" ]; then
            echo "[ERROR] The server is GO-LIVE; resetting the database is refused." >&2
            echo '[GO_LIVE_EXISTS]'
            exit 3
        fi
        exec /usr/local/sbin/warehouse-deploy --reset-database "$@"
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
        open_verified_dump "$1"
        runuser -u postgres -- pg_restore --list < /proc/self/fd/9 > /dev/null
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
        if [ $# -ne 0 ]; then
            echo "[ERROR] restore-start takes no arguments." >&2
            exit 2
        fi
        # Same rule as after a restore: the services start only on a release that matches the schema
        # (exit 6 and MAINTENANCE otherwise); a stale MAINTENANCE flag is cleared once it answers.
        exec /usr/local/sbin/warehouse-deploy --start-services
        ;;

    restore-exec)
        if [ $# -lt 1 ]; then
            echo "[ERROR] restore-exec requires dump filename." >&2
            exit 2
        fi
        TARGET="$1"
        # The deploy lock keeps a (detached) activation and its migrate away from the restore.
        exec 200>/run/warehouse-deploy.lock
        if ! flock -n 200; then
            echo "[ERROR] A deployment is in progress; restore aborted before touching the database." >&2
            exit 3
        fi
        open_verified_dump "$TARGET"

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

        # A redirect, not "cat |": pg_restore may stop reading before EOF, and the SIGPIPE of cat (141)
        # would report a committed restore as failed under pipefail.
        set +e
        runuser -u postgres -- pg_restore --clean --if-exists --single-transaction --exit-on-error -d "$DB_NAME" < /proc/self/fd/9
        rc=$?
        set -e
        if [ "$rc" -ne 0 ]; then
            echo "[RESTORE_FAILED] pg_restore exited with $rc; the transaction was rolled back." >&2
            echo "[RESTORE_FAILED] Services remain STOPPED. Inspect the error, then start them with: warehouse-root-gateway restore-start" >&2
            exit 4
        fi
        echo '[DB_RESTORED]'

        # The lock on fd 200 is handed over (no gap for an activation). Exit 6 means the database is
        # restored but the active release does not match it: the services stay held with MAINTENANCE set.
        exec 9<&-
        set +e
        WAREHOUSE_LOCK_INHERITED=1 /usr/local/sbin/warehouse-deploy --start-services
        rc=$?
        set -e
        if [ "$rc" -ne 0 ]; then
            echo "[ERROR] The database was restored from $TARGET, but the services were not started (exit $rc)." >&2
            exit "$rc"
        fi
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

        # The program is passed with -c (no temporary file to leak when python fails, G-10);
        # stdin still carries only the secret value.
        read -r -d '' SET_SECRET_PY <<'PYEOF' || true
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
        exec python3 -c "$SET_SECRET_PY" "$KEY_NAME" "$ENV_PATH"
        ;;

    set-dns-token)
        # Cloudflare API token for DNS-01 certificates, read from stdin only. It goes to a root-only file,
        # not shared/.env: the application never needs it.
        if [ $# -ne 0 ]; then
            echo "[ERROR] set-dns-token takes no arguments; the token is read from stdin." >&2
            exit 2
        fi
        TOKEN=""
        IFS= read -r TOKEN || true
        TOKEN="${TOKEN%$'\r'}"
        if ! [[ "$TOKEN" =~ ^[A-Za-z0-9_-]{30,100}$ ]]; then
            echo "[ERROR] set-dns-token: the value does not look like a Cloudflare API token." >&2
            exit 2
        fi
        CF_INI=/etc/letsencrypt/cloudflare.ini
        mkdir -p /etc/letsencrypt
        if [ -L "$CF_INI" ]; then
            echo "[ERROR] set-dns-token: $CF_INI is a symlink; nothing was changed." >&2
            exit 2
        fi
        # Verify with Cloudflare first; the header comes from a root-only file, never from the command line.
        hdr=$(mktemp /etc/letsencrypt/.cf-hdr.XXXXXX)
        printf 'Authorization: Bearer %s\n' "$TOKEN" > "$hdr"
        set +e
        verify=$(curl -sS -m 20 -H @"$hdr" https://api.cloudflare.com/client/v4/user/tokens/verify 2>&1)
        crc=$?
        set -e
        rm -f -- "$hdr"
        if [ "$crc" -ne 0 ]; then
            echo "[WARNING] Cloudflare could not be reached to verify the token (curl exit $crc); it is stored unverified." >&2
        elif ! grep -Eq '"status" *: *"active"' <<<"$verify"; then
            echo "[ERROR] Cloudflare does not accept this token as active; nothing was changed." >&2
            exit 3
        else
            echo '[TOKEN_ACTIVE]'
        fi
        tmp=$(mktemp /etc/letsencrypt/.cloudflare.ini.XXXXXX)
        printf 'dns_cloudflare_api_token = %s\n' "$TOKEN" > "$tmp"
        chown root:root "$tmp"
        chmod 600 "$tmp"
        mv -f -- "$tmp" "$CF_INI"
        echo '[OK_UPDATED]'
        exit 0
        ;;

    issue-cert)
        # issue-cert <admin email> [cert_mode]: Let's Encrypt certificate for shared/DOMAIN;
        # certbot.timer renews it with the same plugin and reloads nginx.
        if [ $# -lt 1 ] || [ $# -gt 2 ] || ! [[ "$1" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]]; then
            echo "[ERROR] issue-cert requires a valid admin email and optional cert mode." >&2
            exit 2
        fi
        EMAIL="$1"
        REQ_MODE="${2:-}"
        if [ -z "$REQ_MODE" ]; then
            if [[ -f "/etc/letsencrypt/cloudflare.ini" && ! -L "/etc/letsencrypt/cloudflare.ini" ]]; then
                REQ_MODE="dns01-cloudflare"
            elif [ -f "${SHARED_DIR}/CERT_MODE" ]; then
                REQ_MODE=$(cat "${SHARED_DIR}/CERT_MODE" 2>/dev/null | tr -d '\r\n')
            fi
            if [[ "$REQ_MODE" != "http01" && "$REQ_MODE" != "dns01-cloudflare" ]]; then
                REQ_MODE="http01"
            fi
        fi
        if [[ "$REQ_MODE" != "http01" && "$REQ_MODE" != "dns01-cloudflare" ]]; then
            echo "[ERROR] issue-cert: cert mode must be 'http01' or 'dns01-cloudflare' (got: $REQ_MODE)." >&2
            exit 2
        fi
        DOMAIN=$(head -n 1 "${SHARED_DIR}/DOMAIN" 2>/dev/null || true)
        if ! [[ "$DOMAIN" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}$ ]]; then
            echo "[ERROR] issue-cert: shared/DOMAIN is missing or invalid." >&2
            exit 2
        fi
        if [[ "$REQ_MODE" == "dns01-cloudflare" ]]; then
            CF_INI=/etc/letsencrypt/cloudflare.ini
            if [[ ! -f "$CF_INI" || -L "$CF_INI" ]]; then
                echo "[ERROR] issue-cert: no Cloudflare token on the server; run deploy.ps1 -SetSecret CLOUDFLARE_DNS_API_TOKEN first." >&2
                exit 2
            fi
            certbot certonly --dns-cloudflare --dns-cloudflare-credentials "$CF_INI" --dns-cloudflare-propagation-seconds 30 \
                -d "$DOMAIN" --email "$EMAIL" --agree-tos --non-interactive --keep-until-expiring \
                --deploy-hook "systemctl reload nginx"
        else
            certbot certonly --webroot -w /var/www/html \
                -d "$DOMAIN" --email "$EMAIL" --agree-tos --non-interactive --keep-until-expiring \
                --deploy-hook "systemctl reload nginx"
        fi
        if [ ! -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
            echo "[ERROR] issue-cert: certbot finished but no certificate exists for $DOMAIN." >&2
            exit 4
        fi
        TLS_DIR="/etc/warehouse/tls/${DOMAIN}"
        mkdir -p "$TLS_DIR"
        ln -sfn "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" "$TLS_DIR/fullchain.pem"
        ln -sfn "/etc/letsencrypt/live/${DOMAIN}/privkey.pem" "$TLS_DIR/privkey.pem"
        printf '%s\n' "$REQ_MODE" > "${SHARED_DIR}/CERT_MODE"
        /usr/local/sbin/warehouse-deploy --refresh-nginx --domain "$DOMAIN"
        echo '[CERT_OK]'
        exit 0
        ;;

    install-cert)
        # install-cert <mode> <cert_stage_file> <key_stage_file> [<chain_stage_file>]
        # Installs a Cloudflare Origin or Custom certificate after rigorous OpenSSL verification.
        # Mode must be 'cloudflare-origin' or 'custom'.
        # Private key is verified and installed with root:root 0600 permissions.
        # Nginx configuration is updated and tested with nginx -t before previous cert is removed.
        if [ $# -lt 3 ] || [ $# -gt 4 ]; then
            echo "[ERROR] install-cert requires: <mode> <cert_stage> <key_stage> [<chain_stage>]" >&2
            exit 2
        fi
        CERT_MODE_REQ="$1"
        CERT_STAGE="$2"
        KEY_STAGE="$3"
        CHAIN_STAGE="${4:-}"

        if [[ "$CERT_MODE_REQ" != "cloudflare-origin" && "$CERT_MODE_REQ" != "custom" ]]; then
            echo "[ERROR] install-cert: mode must be 'cloudflare-origin' or 'custom' (got: $CERT_MODE_REQ)." >&2
            exit 2
        fi

        assert_stage_file "$CERT_STAGE"
        assert_stage_file "$KEY_STAGE"
        if [[ -n "$CHAIN_STAGE" ]]; then
            assert_stage_file "$CHAIN_STAGE"
        fi

        DOMAIN=$(head -n 1 "${SHARED_DIR}/DOMAIN" 2>/dev/null || true)
        if ! [[ "$DOMAIN" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}$ ]]; then
            echo "[ERROR] install-cert: shared/DOMAIN is missing or invalid." >&2
            exit 2
        fi

        # Verification via OpenSSL and Python
        if ! python3 -c "$CERT_VERIFY_PY" "$CERT_STAGE" "$KEY_STAGE" "$DOMAIN" "$CERT_MODE_REQ" "$CHAIN_STAGE"; then
            exit 3
        fi

        # Pre-installation backup of previous certificate directory
        TLS_DIR="/etc/warehouse/tls/${DOMAIN}"
        mkdir -p /etc/warehouse/tls
        TLS_BACKUP=""
        if [[ -d "$TLS_DIR" ]]; then
            TLS_BACKUP=$(mktemp -d /etc/warehouse/tls/.backup_${DOMAIN}_XXXXXX)
            cp -a "$TLS_DIR/." "$TLS_BACKUP/"
        fi

        TMP_TLS=$(mktemp -d /etc/warehouse/tls/.stage_${DOMAIN}_XXXXXX)
        chmod 755 "$TMP_TLS"
        chown root:root "$TMP_TLS"
        cat "$CERT_STAGE" > "$TMP_TLS/fullchain.pem"
        if [[ -n "$CHAIN_STAGE" ]]; then
            printf '\n' >> "$TMP_TLS/fullchain.pem"
            cat "$CHAIN_STAGE" >> "$TMP_TLS/fullchain.pem"
        fi
        chmod 644 "$TMP_TLS/fullchain.pem"
        chown root:root "$TMP_TLS/fullchain.pem"

        cat "$KEY_STAGE" > "$TMP_TLS/privkey.pem"
        chmod 600 "$TMP_TLS/privkey.pem"
        chown root:root "$TMP_TLS/privkey.pem"

        mkdir -p "$TLS_DIR"
        rm -f "$TLS_DIR/fullchain.pem" "$TLS_DIR/privkey.pem"
        mv -f "$TMP_TLS/fullchain.pem" "$TLS_DIR/fullchain.pem"
        mv -f "$TMP_TLS/privkey.pem" "$TLS_DIR/privkey.pem"
        rmdir "$TMP_TLS"

        PREV_MODE=""
        if [[ -f "${SHARED_DIR}/CERT_MODE" ]]; then
            PREV_MODE=$(cat "${SHARED_DIR}/CERT_MODE" 2>/dev/null | tr -d '\r\n')
        fi
        printf '%s\n' "$CERT_MODE_REQ" > "${SHARED_DIR}/CERT_MODE"

        if ! /usr/local/sbin/warehouse-deploy --refresh-nginx --domain "$DOMAIN"; then
            echo "[ERROR] install-cert: nginx configuration test failed with the new certificate; restoring previous state." >&2
            if [[ -n "$TLS_BACKUP" && -d "$TLS_BACKUP" ]]; then
                cp -a "$TLS_BACKUP/." "$TLS_DIR/"
                rm -rf "$TLS_BACKUP"
            fi
            if [[ -n "$PREV_MODE" ]]; then
                printf '%s\n' "$PREV_MODE" > "${SHARED_DIR}/CERT_MODE"
            else
                rm -f "${SHARED_DIR}/CERT_MODE"
            fi
            /usr/local/sbin/warehouse-deploy --refresh-nginx --domain "$DOMAIN" || true
            exit 4
        fi

        if [[ -n "$TLS_BACKUP" && -d "$TLS_BACKUP" ]]; then
            rm -rf "$TLS_BACKUP"
        fi
        echo "[CERT_INSTALLED] $CERT_MODE_REQ"
        exit 0
        ;;

    create-admin)
        # No pass-through arguments (G-10): --settings/--pythonpath would let the caller choose the code.
        if [ $# -ne 0 ]; then
            echo "[ERROR] create-admin takes no arguments; the details are asked interactively." >&2
            exit 2
        fi
        if [[ ! -x /var/www/warehouse/current/venv/bin/python || ! -f /var/www/warehouse/current/warehouse-backend/manage.py ]]; then
            echo "[ERROR] Active release manage.py or venv not found" >&2
            exit 1
        fi
        cd /var/www/warehouse/current/warehouse-backend
        exec runuser -u warehouse -- env DJANGO_SETTINGS_MODULE=config.settings DJANGO_ENV=production \
            /var/www/warehouse/current/venv/bin/python manage.py createsuperuser
        ;;

    logs)
        # logs [LINES] [--follow] (G-09)
        LINES=100
        FOLLOW=()
        for a in "$@"; do
            case "$a" in
                --follow) FOLLOW=(-f) ;;
                *)
                    if ! [[ "$a" =~ ^[0-9]{1,5}$ ]]; then
                        echo "[ERROR] logs accepts only a line count and --follow." >&2
                        exit 2
                    fi
                    LINES="$a"
                    ;;
            esac
        done
        exec journalctl -u warehouse-backend -u warehouse-gdrive-worker -u warehouse-export-worker -n "$LINES" --no-pager "${FOLLOW[@]}"
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
        if [ -e "${SHARED_DIR}/SERVICES_HELD" ]; then
            echo "[ERROR] SERVICES_HELD is set: the active release does not match the restored database; nothing was restarted." >&2
            echo '[SERVICES_HELD]'
            exit 6
        fi
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
        mods=$(/usr/local/sbin/warehouse-deploy --print-modules 2>&1 || true)
        case "$mods" in
            '[MODULES] '*) echo "Installed modules: ${mods#\[MODULES\] }" ;;
            *) echo "[WARNING] Installed modules unknown: ${mods}" ;;
        esac
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
        cert="/etc/warehouse/tls/$DOMAIN/fullchain.pem"
        if [[ ! -f "$cert" && -f "/etc/letsencrypt/live/$DOMAIN/cert.pem" ]]; then
            cert="/etc/letsencrypt/live/$DOMAIN/cert.pem"
        fi
        mode="http01"
        if [[ -f "${SHARED_DIR}/CERT_MODE" ]]; then
            mode=$(cat "${SHARED_DIR}/CERT_MODE" | tr -d '\r\n')
        fi
        if [ -f "$cert" ]; then
            end=$(openssl x509 -enddate -noout -in "$cert" 2>/dev/null | cut -d= -f2 || true)
            days=$(( ( $(date -d "$end" +%s) - $(date +%s) ) / 86400 ))
            echo "Mode: $mode"
            echo "Expires: $end ($days days left)"
            if [[ "$mode" == "cloudflare-origin" || "$mode" == "custom" ]]; then
                if [ "$days" -lt 30 ]; then echo "[WARNING] Certificate expires in less than 30 days ($days days left)."; fi
            elif [ "$days" -lt 21 ]; then
                echo "[WARNING] Certificate expires in less than 21 days ($days days left).";
            fi
        else
            echo "No certificate installed for $DOMAIN (mode: $mode)."
        fi
        echo
        echo '=== [8] Flags ==='
        if [ -e "$S/GO_LIVE" ]; then echo 'GO_LIVE: set'; else echo 'GO_LIVE: not set'; fi
        if [ -e "$S/MAINTENANCE" ]; then echo '[WARNING] MAINTENANCE: set'; else echo 'MAINTENANCE: not set'; fi
        if [ -e "$S/SERVICES_HELD" ]; then echo '[CRITICAL] SERVICES_HELD: set (the services stay stopped until the release matches the database)'; else echo 'SERVICES_HELD: not set'; fi
        exit 0
        ;;

    *)
        echo "[ERROR] warehouse-root-gateway: unrecognized subcommand: $SUBCMD" >&2
        exit 2
        ;;
esac
