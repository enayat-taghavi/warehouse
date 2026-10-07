#Requires -Version 7.4
# End-to-end server test for deploy.ps1 and the REAL server scripts (plan 12.2, step R6). Never shipped.
# A throwaway ubuntu:24.04 container (with --init) plays a fresh soft server. remote-setup.sh, warehouse-deploy,
# the root gateway and the nightly backup are the real scripts from the bundle; apt and pip fetch real packages.
# Only two things are faked: systemctl (real processes for postgresql, redis-server, nginx and warehouse-backend,
# which is started from its installed unit; state files for every other unit) and certbot (self-signed certificate).
# The deploy user starts with full sudo, like a real first Setup; after it only /etc/sudoers.d/warehouse remains.
# The tested commits are made from the working tree without touching any ref or the real index; they reuse the
# frontend build of -BuildSha (from test_bundle.ps1), so only the backend and the scripts come from the working tree.
param(
    [Parameter(Mandatory)][string]$BuildSha,   # commit with a completed build in scratch/deploy
    [string]$AptMirror,                        # e.g. http://ir.archive.ubuntu.com/ubuntu
    [switch]$KeepContainer
)
$ErrorActionPreference = 'Stop'
# Optional apt mirror for the test container only (when archive/security.ubuntu.com are unreachable).
if ($AptMirror -and $AptMirror -cnotmatch '^http://[A-Za-z0-9.-]+(/[A-Za-z0-9._-]+)*/?$') { throw "Invalid -AptMirror: $AptMirror" }
$AptMirrorScript = if ($AptMirror) { "sed -i -E 's#https?://(archive|security)\.ubuntu\.com/ubuntu/?#$AptMirror#' /etc/apt/sources.list.d/ubuntu.sources`n" } else { '' }
. (Join-Path $PSScriptRoot '..\..\deploy.ps1')

$TestRoot = Join-Path $ScriptRoot 'scratch\deploy_tests'
$LocalBackupRoot = Join-Path $TestRoot 'backups_soft_e2e'
if (Test-Path -LiteralPath $LocalBackupRoot) { Remove-SafeDirectoryRecursively $LocalBackupRoot }
[void][System.IO.Directory]::CreateDirectory($TestRoot)
$Domain = 'soft.example.test'
$Gateway = '/usr/local/sbin/warehouse-root-gateway'

$script:failures = 0
function Assert-True([bool]$Condition, [string]$Text) {
    if ($Condition) { Write-Host "[PASS] $Text" -ForegroundColor Green } else { Write-Host "[FAIL] $Text" -ForegroundColor Red; $script:failures++ }
}

# --- mocks ---------------------------------------------------------------------------------------
$script:ReadHostQueue = [System.Collections.Generic.Queue[string]]::new()
function Read-Host {
    param([string]$Prompt, [switch]$MaskInput)
    if ($script:ReadHostQueue.Count -eq 0) { throw "Unexpected Read-Host: $Prompt" }
    $answer = $script:ReadHostQueue.Dequeue()
    Write-Host "[MOCK Read-Host] $Prompt -> $answer" -ForegroundColor Magenta
    return $answer
}
function Wait-Console { param([string]$PromptMessage) }
$script:DeploySha = $null
function Get-DeployCommit { return $script:DeploySha }
function Register-PullTask { Write-Host '[MOCK] Register-PullTask skipped' -ForegroundColor Magenta; return 0 }

# --- test commits (no ref, HEAD, index or working tree change) -------------------------------------
function New-TestCommit([string]$Parent, [string]$Message, [hashtable]$ExtraFiles = @{}, [switch]$FromWorkingTree) {
    $tmpIndex = Join-Path $TestRoot 'e2e.index'
    if (Test-Path -LiteralPath $tmpIndex) { Remove-Item -LiteralPath $tmpIndex -Force }
    $env:GIT_INDEX_FILE = $tmpIndex
    try {
        $steps = @(, @('read-tree', $Parent))
        if ($FromWorkingTree) { $steps += , @('add', '-A') }
        foreach ($step in $steps) {
            $r = Invoke-Git $step
            if ($r.ExitCode -ne 0) { throw "git $($step -join ' ') failed: $($r.StdErr)" }
        }
        foreach ($path in $ExtraFiles.Keys) {
            $blobFile = Join-Path $TestRoot 'e2e_blob.tmp'
            Write-Utf8LfFile $blobFile $ExtraFiles[$path]
            $blob = (Invoke-Git @('hash-object', '-w', '--', $blobFile)).Output.Trim()
            Remove-Item -LiteralPath $blobFile -Force
            $r = Invoke-Git @('update-index', '--add', '--cacheinfo', "100644,$blob,$path")
            if ($r.ExitCode -ne 0) { throw "git update-index failed for $path" }
        }
        $tree = (Invoke-Git @('write-tree')).Output.Trim()
        $sha = (Invoke-Git @('commit-tree', $tree, '-p', $Parent, '-m', $Message)).Output.Trim()
    } finally {
        Remove-Item Env:GIT_INDEX_FILE -ErrorAction SilentlyContinue
        if (Test-Path -LiteralPath $tmpIndex) { Remove-Item -LiteralPath $tmpIndex -Force }
    }
    if ($sha -cnotmatch '^[0-9a-f]{40}$') { throw "commit-tree failed: $sha" }
    # Reuse the frontend build of -BuildSha for this commit (what -SkipBuild expects in scratch/deploy/<sha>).
    $dst = Join-Path $LocalDeployScratch $sha
    Remove-SafeDirectoryRecursively $dst
    [void][System.IO.Directory]::CreateDirectory((Join-Path $dst 'warehouse-front'))
    Copy-Item -LiteralPath (Join-Path $LocalDeployScratch "$BuildSha\warehouse-front\dist") -Destination (Join-Path $dst 'warehouse-front\dist') -Recurse
    Write-Utf8LfFile (Join-Path $dst '.build-complete') "COMMIT=$sha`n"
    Write-Host "[INFO] test commit $sha ($Message)" -ForegroundColor Cyan
    return $sha
}

# --- fake ssh --------------------------------------------------------------------------------------
$csc = Join-Path $env:SystemRoot 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$fakeExe = Join-Path $TestRoot 'fake_ssh_e2e.exe'
$c = Invoke-Process -FilePath $csc -ArgumentList @('/nologo', "/out:$fakeExe", (Join-Path $PSScriptRoot 'fake_ssh.cs')) -Capture -Quiet
if ($c.ExitCode -ne 0) { throw "csc failed: $($c.Output -join "`n")" }
$SshExe = $fakeExe
$SshKeygenExe = $fakeExe

$fingerprint = 'SHA256:' + ('B' * 43)
$container = "wh-e2e-test-$((Get-Date).ToString('yyyyMMddHHmmss'))"
$env:FAKE_SSH_FP = $fingerprint
$env:FAKE_SSH_DOCKER = $container
$env:FAKE_SSH_DOCKER_EXE = $DockerExe
$ConfigFile = Join-Path $TestRoot 'config_e2e.json'
Write-Utf8LfFile $ConfigFile (@{
        ServerHost = 'example.test'; SshUser = 'deploy'; SshPort = 22; Domain = $Domain
        HostKeyFingerprint = $fingerprint; DbName = 'warehouse_db'; DbUser = 'warehouse_user'
        AllowedHosts = $Domain; AdminEmail = 'ops@farsalish.ir'
    } | ConvertTo-Json)

function Invoke-Container([string]$User, [string]$Script) {
    $wd = if ($User -eq 'deploy') { '/home/deploy' } else { '/' }
    return (Invoke-Process -FilePath $DockerExe -ArgumentList @('exec', '-i', '-u', $User, '-w', $wd, $container, 'bash', '-s') -StdinText $Script.Replace("`r", '') -Capture -Quiet)
}
function Invoke-Server([string]$Script) {
    # Root script in the container; throws on failure, returns the output lines.
    $r = Invoke-Container 'root' ("set -euo pipefail`n" + $Script)
    if ($r.ExitCode -ne 0) { throw "Server script failed (exit $($r.ExitCode)): $($r.Output -join ' | ') $($r.StdErr)" }
    return @($r.Output)
}
function Invoke-TestMode([string]$Name, [switch]$NonInteractiveRun) {
    $script:NonInteractive = [bool]$NonInteractiveRun
    Write-Host "`n########## mode $Name (NonInteractive=$([bool]$NonInteractiveRun)) ##########" -ForegroundColor Cyan
    $code = Invoke-Mode $Name
    $script:NonInteractive = $false
    if ($script:ReadHostQueue.Count -gt 0) { Write-Host "[FAIL] $($script:ReadHostQueue.Count) unused Read-Host answer(s)" -ForegroundColor Red; $script:failures++; $script:ReadHostQueue.Clear() }
    Write-Host "[INFO] mode $Name exit $code" -ForegroundColor Cyan
    return $code
}
function Get-ServerState {
    $o = Invoke-Server @'
cur=$(readlink -f /var/www/warehouse/current || true)
echo "CURRENT=${cur##*/}"
echo "COMMIT=$(sed -n 's/^COMMIT=//p' "$cur/RELEASE" 2>/dev/null || true)"
echo "PREVIOUS=$(cat /var/www/warehouse/shared/PREVIOUS_RELEASE 2>/dev/null || true)"
echo "ACTIVE=$(cat /var/www/warehouse/shared/ACTIVE_RELEASE 2>/dev/null || true)"
# Only the warehouse-owned process is daphne itself (the fake systemctl's runuser parent matches too and sits in /).
# Root in Docker lacks CAP_SYS_PTRACE, so the cwd link is read as the same user.
p=$(pgrep -u warehouse -f 'daphne -b 127.0.0.1' | head -n 1 || true)
echo "DAPHNE_CWD=$(if [ -n "$p" ]; then runuser -u warehouse -- readlink "/proc/$p/cwd"; fi)"
echo "MAINTENANCE=$(if [ -e /var/www/warehouse/shared/MAINTENANCE ]; then echo yes; else echo no; fi)"
echo "HTTPS_API=$(curl -ks -o /dev/null -w '%{http_code}' --resolve soft.example.test:443:127.0.0.1 https://soft.example.test/api/public/config/ || true)"
echo "HTTPS_ROOT=$(curl -ks -o /dev/null -w '%{http_code}' --resolve soft.example.test:443:127.0.0.1 https://soft.example.test/ || true)"
'@
    $h = @{}
    foreach ($l in $o) { if ($l -match '^([A-Z_]+)=(.*)$') { $h[$Matches[1]] = $Matches[2] } }
    Write-Host "[INFO] server state: $(($h.GetEnumerator() | Sort-Object Name | ForEach-Object { "$($_.Name)=$($_.Value)" }) -join '; ')" -ForegroundColor Cyan
    return $h
}
function Assert-Serving($State, [string]$Sha, [string]$Label) {
    $rel = $State.CURRENT
    Assert-True ($rel -match "^\d{8}_\d{6}_$($Sha.Substring(0, 12))$" -and $State.COMMIT -eq $Sha -and $State.ACTIVE -eq $rel) "$Label : current, RELEASE and ACTIVE_RELEASE name commit $($Sha.Substring(0, 12)) ($rel)"
    Assert-True ($State.DAPHNE_CWD -eq "/var/www/warehouse/releases/$rel/warehouse-backend") "$Label : the running daphne serves that release ($($State.DAPHNE_CWD))"
    Assert-True ($State.HTTPS_API -eq '200' -and $State.HTTPS_ROOT -eq '200' -and $State.MAINTENANCE -eq 'no') "$Label : HTTPS through nginx answers 200 for / and the API, no MAINTENANCE"
}
function Invoke-GatewayAsDeploy([string]$Arguments) {
    # Calls the gateway like deploy.ps1 does (sudo -n as deploy); stdout is counted, never shown.
    $r = Invoke-Container 'deploy' "out=`$(mktemp); sudo -n $Gateway $Arguments > `"`$out`" 2>/tmp/gw_err; rc=`$?; echo `"RC=`$rc BYTES=`$(stat -c %s `"`$out`")`"; tr '\0' '\n' < `"`$out`" | grep -a -v -x -e '' | head -n 50 | sed 's/^/OUT:/'; sed 's/^/ERR:/' /tmp/gw_err; rm -f `"`$out`" /tmp/gw_err"
    $line = @($r.Output | Where-Object { $_ -match '^RC=\d+ BYTES=\d+$' })
    if ($line.Count -ne 1) { throw "gateway call gave no result line: $($r.Output -join ' | ')" }
    $null = $line[0] -match '^RC=(\d+) BYTES=(\d+)$'
    return [pscustomobject]@{
        ExitCode = [int]$Matches[1]; Bytes = [long]$Matches[2]
        Out = @($r.Output | Where-Object { $_.StartsWith('OUT:') } | ForEach-Object { $_.Substring(4) })
        Err = @($r.Output | Where-Object { $_.StartsWith('ERR:') } | ForEach-Object { $_.Substring(4) })
    }
}
function Get-RestoreMenuIndex([string]$Name) {
    # Position of a dump in the Restore menu (same listing and order: newest first by the timestamp in the name).
    $list = @(Invoke-Server 'cd /var/www/warehouse/shared/backups; for f in *.dump; do if [ -f "$f.sha256" ]; then echo "$f"; fi; done' |
            Where-Object { Get-BackupTimestamp $_ } | Sort-Object -Property @{ Expression = { Get-BackupTimestamp $_ } } -Descending)
    $i = [array]::IndexOf($list, $Name)
    if ($i -lt 0) { throw "$Name is not in the Restore menu." }
    return [string]($i + 1)
}
function Get-Applied0036 {
    return [int](@(Invoke-Server "runuser -u postgres -- psql -XAtq -d warehouse_db -c `"SELECT count(*) FROM django_migrations WHERE app = 'accounts' AND name = '0036_e2e_forward_only'`"")[0])
}
function Get-InactiveServiceCount {
    return @(Invoke-Server 'for s in warehouse-backend warehouse-gdrive-worker warehouse-export-worker; do systemctl is-active "$s" || true; done' | Where-Object { $_ -eq 'inactive' }).Count
}

# --- container bootstrap (root): a fresh Ubuntu server plus the two fakes ----------------------------
$bootstrap = @'
export DEBIAN_FRONTEND=noninteractive
# As in Debian/Ubuntu images: package scripts never start daemons; the fake systemctl owns them.
printf '#!/bin/sh\nexit 101\n' > /usr/sbin/policy-rc.d
chmod 755 /usr/sbin/policy-rc.d
apt-get update -qq
apt-get install -y -qq --no-install-recommends sudo openssl ca-certificates procps nginx >/dev/null
useradd -m -s /bin/bash deploy
# First Setup: the SSH user still has full sudo; the test removes it after Setup, like the operator does.
printf 'deploy ALL=(ALL) NOPASSWD: ALL\n' > /etc/sudoers.d/deploy-bootstrap
chmod 440 /etc/sudoers.d/deploy-bootstrap

cat > /usr/local/sbin/systemctl <<'EOF'
#!/usr/bin/env bash
# Fake systemctl (e2e container only). postgresql, redis-server, nginx and warehouse-backend are REAL processes;
# warehouse-backend is started from its installed unit (User, WorkingDirectory, EnvironmentFile, ExecStart).
# Every other unit is a state file. fd 200 (the warehouse-deploy lock) is never handed to a service.
exec 200>&-
D=/run/fake-systemd
mkdir -p "$D"
echo "$*" >> "$D/log"
pg_ver() { ls /etc/postgresql 2>/dev/null | sort -n | tail -n 1; }
pid_alive() { [[ -f "$1" ]] && kill -0 "$(cat "$1")" 2>/dev/null; }
active() {
    case "$1" in
        postgresql) pg_lsclusters -h 2>/dev/null | awk '{print $4}' | grep -qx online ;;
        redis-server) [[ "$(redis-cli -h 127.0.0.1 ping 2>/dev/null)" == PONG ]] ;;
        nginx) pid_alive /run/nginx.pid ;;
        warehouse-backend) pid_alive "$D/$1.pid" ;;
        *) [[ -e "$D/state.$1" ]] ;;
    esac
}
start_from_unit() {
    local u="$1" f="/etc/systemd/system/$1.service" user wd envfile execstart home line
    local -a envs=() cmd=()
    [[ -f "$f" ]] || { echo "fake systemctl: $f not found" >&2; return 1; }
    user=$(sed -n 's/^User=//p' "$f" | head -n 1)
    wd=$(sed -n 's/^WorkingDirectory=//p' "$f" | head -n 1)
    envfile=$(sed -n 's/^EnvironmentFile=//p' "$f" | head -n 1)
    execstart=$(sed -n 's/^ExecStart=//p' "$f" | head -n 1)
    home=$(getent passwd "$user" | cut -d: -f6)
    if [[ -n "$envfile" ]]; then
        while IFS= read -r line || [[ -n "$line" ]]; do
            if [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; then envs+=("$line"); fi
        done < "${envfile#-}"
    fi
    read -ra cmd <<<"$execstart"
    cd "$wd" || return 1
    setsid runuser -u "$user" -- env -i PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
        LANG=C.UTF-8 HOME="$home" USER="$user" "${envs[@]}" "${cmd[@]}" </dev/null >>"$D/$u.out" 2>&1 &
    echo $! > "$D/$u.pid"
    cd / || true
}
# ConditionPathExists[=!]PATH of an installed unit, as systemd checks it: a failed condition skips the start.
condition_ok() {
    local f="/etc/systemd/system/$1.service" p
    [[ -f "$f" ]] || return 0
    while IFS= read -r p; do
        if [[ "$p" == '!'* ]]; then [[ ! -e "${p#!}" ]] || return 1; else [[ -e "$p" ]] || return 1; fi
    done < <(sed -n 's/^ConditionPathExists=//p' "$f")
    return 0
}
start_one() {
    active "$1" && return 0
    condition_ok "$1" || return 0
    case "$1" in
        postgresql) pg_ctlcluster "$(pg_ver)" main start ;;
        redis-server) redis-server --daemonize yes --bind 127.0.0.1 --port 6379 >/dev/null ;;
        nginx) nginx ;;
        warehouse-backend) start_from_unit "$1" ;;
        *) touch "$D/state.$1" ;;
    esac
}
stop_one() {
    local pid
    case "$1" in
        postgresql) pg_ctlcluster "$(pg_ver)" main stop ;;
        redis-server) redis-cli -h 127.0.0.1 shutdown nosave >/dev/null 2>&1 || true ;;
        nginx) if active nginx; then nginx -s quit; for _ in $(seq 100); do active nginx || break; sleep 0.1; done; fi ;;
        warehouse-backend)
            if active "$1"; then
                pid=$(cat "$D/$1.pid")
                kill -TERM -- "-$pid" 2>/dev/null || true
                for _ in $(seq 150); do kill -0 "$pid" 2>/dev/null || break; sleep 0.1; done
                kill -KILL -- "-$pid" 2>/dev/null || true
            fi
            rm -f "$D/$1.pid" ;;
        *) rm -f "$D/state.$1" ;;
    esac
}
cmd="${1:-}"
shift || true
case "$cmd" in
    daemon-reload|disable|mask|unmask) exit 0 ;;
    show)
        case "${3:-}" in
            Result) echo success ;;
            ExecMainStatus) echo 0 ;;
            ExecMainExitTimestamp) echo 'Wed 2026-10-07 02:30:00 UTC' ;;
        esac
        exit 0 ;;
esac
now=0
quiet=0
units=()
for a in "$@"; do
    case "$a" in
        --now) now=1 ;;
        --quiet) quiet=1 ;;
        -*) ;;
        *) units+=("${a%.service}") ;;
    esac
done
rc=0
case "$cmd" in
    enable) if [[ "$now" -eq 1 ]]; then for u in "${units[@]}"; do start_one "$u" || rc=1; done; fi ;;
    start) for u in "${units[@]}"; do start_one "$u" || rc=1; done ;;
    stop) for u in "${units[@]}"; do stop_one "$u" || rc=1; done ;;
    restart) for u in "${units[@]}"; do stop_one "$u"; start_one "$u" || rc=1; done ;;
    reload)
        for u in "${units[@]}"; do
            if ! active "$u"; then echo "Failed to reload $u.service: unit is not active." >&2; rc=1
            elif [[ "$u" == nginx ]]; then nginx -s reload || rc=1; fi
        done ;;
    is-active|status)
        for u in "${units[@]}"; do
            if active "$u"; then [[ "$quiet" -eq 1 ]] || echo active; else [[ "$quiet" -eq 1 ]] || echo inactive; rc=3; fi
        done ;;
    *) echo "fake systemctl: unsupported command $cmd" >&2; rc=1 ;;
esac
exit "$rc"
EOF
chmod 755 /usr/local/sbin/systemctl

cat > /usr/local/sbin/certbot <<'EOF'
#!/usr/bin/env bash
# Fake certbot (e2e container only): a self-signed certificate where Let's Encrypt would put it.
# /run/fake-certbot-http01-fail makes webroot (HTTP-01) fail like the unreachable soft server; DNS-01
# (Cloudflare) needs a root-only credentials file holding the test token of /run/fake-cf-token.
echo "certbot $*" >> /run/fake-certbot.log
domain=""
webroot=0
creds=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        -d) domain="$2"; shift 2 ;;
        --webroot) webroot=1; shift ;;
        --dns-cloudflare-credentials) creds="$2"; shift 2 ;;
        *) shift ;;
    esac
done
[[ -n "$domain" ]] || { echo "fake certbot: no -d" >&2; exit 1; }
if [[ "$webroot" -eq 1 && -e /run/fake-certbot-http01-fail ]]; then
    echo "  Detail: Timeout during connect (likely firewall problem)" >&2
    exit 1
fi
if [[ -n "$creds" ]]; then
    [[ "$(stat -c '%U:%G:%a' "$creds" 2>/dev/null)" == root:root:600 ]] || { echo "fake certbot: $creds is not root-only" >&2; exit 1; }
    grep -qx "dns_cloudflare_api_token = $(cat /run/fake-cf-token)" "$creds" || { echo "fake certbot: wrong token" >&2; exit 1; }
fi
d="/etc/letsencrypt/live/$domain"
mkdir -p "$d"
openssl req -x509 -newkey rsa:2048 -nodes -days 90 -subj "/CN=$domain" -addext "subjectAltName=DNS:$domain" \
    -keyout "$d/privkey.pem" -out "$d/cert.pem" 2>/dev/null
cp "$d/cert.pem" "$d/fullchain.pem"
EOF
chmod 755 /usr/local/sbin/certbot

cat > /usr/local/bin/curl <<'EOF'
#!/usr/bin/env bash
# Fake curl (e2e container only): answers Cloudflare's token check from the -H @file header;
# every other call goes to the real curl. argv is logged so the test can prove the token is never in it.
for a in "$@"; do
    if [[ "$a" == https://api.cloudflare.com/client/v4/user/tokens/verify ]]; then
        printf '%s\n' "$*" >> /run/fake-curl-argv.log
        hdr=""
        prev=""
        for b in "$@"; do
            if [[ "$prev" == -H && "$b" == @* ]]; then hdr="${b#@}"; fi
            prev="$b"
        done
        if [[ -n "$hdr" && -f "$hdr" ]] && grep -qx "Authorization: Bearer $(cat /run/fake-cf-token)" "$hdr"; then
            echo '{"result":{"id":"e2e","status": "active"},"success":true,"errors":[],"messages":[]}'
        else
            echo '{"success":false,"errors":[{"code":1000,"message":"Invalid API Token"}]}'
        fi
        exit 0
    fi
done
exec /usr/bin/curl "$@"
EOF
chmod 755 /usr/local/bin/curl
# Ubuntu starts nginx right after installing it.
systemctl start nginx
echo '[BOOTSTRAP_READY]'
'@

$migration = @'
from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [('accounts', '0035_perm_delete_vehicle_nomovement')]
    operations = [migrations.RunPython(migrations.RunPython.noop, migrations.RunPython.noop)]
'@

try {
    # --- commits -------------------------------------------------------------------------------
    if ($BuildSha -cnotmatch '^[0-9a-f]{40}$' -or -not (Test-Path -LiteralPath (Join-Path $LocalDeployScratch "$BuildSha\warehouse-front\dist\warehouse-app\browser\ngsw.json"))) {
        throw "No completed build for $BuildSha in scratch/deploy (run test_bundle.ps1 first)."
    }
    $head = (Invoke-Git @('rev-parse', 'HEAD')).Output.Trim()
    $sha1 = New-TestCommit $head 'e2e: working tree' -FromWorkingTree
    $sha2 = New-TestCommit $sha1 'e2e: second release'
    $sha3 = New-TestCommit $sha1 'e2e: third release'
    $shaMig = New-TestCommit $sha1 'e2e: release with a forward-only migration' @{ 'warehouse-backend/accounts/migrations/0036_e2e_forward_only.py' = $migration }
    $SkipBuild = $true

    # --- container -----------------------------------------------------------------------------
    $run = Invoke-Process -FilePath $DockerExe -ArgumentList @('run', '-d', '--init', '--name', $container, 'ubuntu:24.04', 'sleep', 'infinity') -Capture -Quiet
    if ($run.ExitCode -ne 0) { throw 'docker run failed.' }
    $bs = Invoke-Server ($AptMirrorScript + $bootstrap)
    if (-not ($bs -contains '[BOOTSTRAP_READY]')) { throw 'Container bootstrap did not finish.' }
    Write-Host '[INFO] fresh server ready' -ForegroundColor Cyan

    # === A. first Setup (full sudo) ================================================================
    $script:DeploySha = $sha1
    # Like soft: Let's Encrypt cannot reach the server, so HTTP-01 fails; the setup must still finish.
    $cfToken = 'e2eTestToken_0123456789abcdefghijklmnopqrstu'
    [void](Invoke-Server "touch /run/fake-certbot-http01-fail; printf '%s' '$cfToken' > /run/fake-cf-token")
    Assert-True ((Invoke-TestMode 'Setup') -eq 0) 'Setup #1 exit 0 although HTTP-01 fails'
    $tls = @(Invoke-Server 'if [ -e /etc/letsencrypt/live/soft.example.test/fullchain.pem ]; then echo CERT; else echo NOCERT; fi; grep -c -- "--webroot" /run/fake-certbot.log || true; systemctl is-active fail2ban || true; curl -s -o /dev/null -w "%{http_code}" -H "Host: soft.example.test" http://127.0.0.1/ || true; echo; curl -s -o /dev/null -w "%{http_code}" -H "Host: soft.example.test" -H "X-Forwarded-Proto: https" http://127.0.0.1:8000/api/public/config/ || true')
    Assert-True ($tls[0] -eq 'NOCERT' -and $tls[1] -eq '1' -and $tls[2] -eq 'active' -and $tls[3] -eq '301' -and $tls[4] -eq '200') "... no certificate, nginx only redirects to HTTPS, the application answers, and the firewall step (fail2ban) still ran ($($tls -join ', '))"
    # DNS-01: the token goes to a root-only file through the gateway, then -IssueCert
    $SetSecret = 'CLOUDFLARE_DNS_API_TOKEN'
    $script:ReadHostQueue.Enqueue('short-token')
    Assert-True ((Invoke-TestMode 'SetSecret') -ne 0) 'a malformed Cloudflare token is refused'
    $script:ReadHostQueue.Enqueue('e2eWrongToken_0123456789abcdefghijklmnopqrs')
    Assert-True ((Invoke-TestMode 'SetSecret') -ne 0) '... and a token Cloudflare does not accept'
    Assert-True (@(Invoke-Server 'test -e /etc/letsencrypt/cloudflare.ini && echo PRESENT || echo ABSENT')[0] -eq 'ABSENT') '... neither was stored'
    $script:ReadHostQueue.Enqueue($cfToken)
    Assert-True ((Invoke-TestMode 'SetSecret') -eq 0) 'SetSecret CLOUDFLARE_DNS_API_TOKEN exit 0'
    $SetSecret = $null
    $cf = @(Invoke-Server "stat -c '%U:%G:%a' /etc/letsencrypt/cloudflare.ini; grep -c -- '$cfToken' /var/www/warehouse/shared/.env || true; { ls /etc/letsencrypt/.cf-hdr.* /etc/letsencrypt/.cloudflare.ini.* 2>/dev/null || true; } | wc -l; grep -c -- '$cfToken' /run/fake-curl-argv.log || true; wc -l < /run/fake-curl-argv.log")
    Assert-True ($cf[0] -eq 'root:root:600' -and $cf[1] -eq '0' -and $cf[2] -eq '0') "token stored root-only (0600), not in shared/.env, no temporary file left ($($cf[0..2] -join ', '))"
    Assert-True ($cf[3] -eq '0' -and $cf[4] -eq '2') "the token was verified with Cloudflare and never appeared on a command line ($($cf[3]) of $($cf[4]) calls)"
    Assert-True ((Invoke-TestMode 'IssueCert') -eq 0) 'IssueCert exit 0'
    Assert-True (@(Invoke-Server 'grep -c -- "--dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini" /run/fake-certbot.log || true')[0] -eq '1') '... certbot used DNS-01 with the root-only credentials'
    $sA = Get-ServerState
    Assert-Serving $sA $sha1 'Setup #1'
    $r1 = $sA.CURRENT
    $sudoers = @(Invoke-Server 'cat /etc/sudoers.d/warehouse; stat -c "%U:%G:%a" /etc/sudoers.d/warehouse')
    Assert-True ($sudoers.Count -eq 2 -and $sudoers[0] -eq "deploy ALL=(ALL) NOPASSWD: $Gateway" -and $sudoers[1] -eq 'root:root:440') "/etc/sudoers.d/warehouse allows only the gateway ($($sudoers -join ' | '))"
    $perm = @(Invoke-Server 'cd /var/www/warehouse/shared; stat -c "%n=%U:%G:%a" . .env backups backups/db media')
    Assert-True (($perm -join ' ') -eq '.=root:root:755 .env=root:warehouse:640 backups=root:warehouse:710 backups/db=warehouse:warehouse:700 media=warehouse:warehouse:755') "shared layout after Setup ($($perm -join ' '))"
    $icu = @(Invoke-Server @'
runuser -u postgres -- psql -XAtq -d warehouse_db -c "SELECT datlocprovider::text || ':' || daticulocale FROM pg_database WHERE datname = 'warehouse_db'"
runuser -u postgres -- psql -XAtq -d warehouse_db -c "SELECT string_agg(ascii(x)::text, ',' ORDER BY x) FROM unnest(ARRAY[chr(1740), chr(1711), chr(1705), chr(1688), chr(1586), chr(1670), chr(1662), chr(1576)]) AS t(x)"
'@)
    Assert-True ($icu[0] -eq 'i:fa-IR') "database uses the ICU fa-IR collation ($($icu[0]))"
    Assert-True ($icu[1] -eq '1576,1662,1670,1586,1688,1705,1711,1740') "Persian letters sort in Persian order in PostgreSQL 16 ($($icu[1]))"
    Assert-True (@(Invoke-Server 'test -f /etc/letsencrypt/live/soft.example.test/fullchain.pem && grep -c "ssl_certificate " /etc/nginx/sites-available/warehouse')[0] -eq '1') 'certificate issued and the HTTPS site rendered by --refresh-nginx'
    # The operator removes the bootstrap sudo rule after the first Setup.
    [void](Invoke-Server 'rm -f /etc/sudoers.d/deploy-bootstrap')
    $sudoCheck = Invoke-Container 'deploy' 'sudo -n true; echo "RC=$?"'
    Assert-True ($sudoCheck.Output -contains 'RC=1') 'deploy has no sudo beyond the gateway any more'

    # === B. second Setup (through the gateway; database, .env and data untouched) ===================
    $before = @(Invoke-Server @'
# Owned by the application role like every migrated table, so the in-app pg_dump (section G) can read it.
owner=$(runuser -u postgres -- psql -XAtq -c "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = 'warehouse_db'")
runuser -u postgres -- psql -XAtq -d warehouse_db -c "CREATE TABLE e2e_marker (v text); INSERT INTO e2e_marker VALUES ('kept'); ALTER TABLE e2e_marker OWNER TO \"$owner\""
runuser -u warehouse -- mkdir -p /var/www/warehouse/shared/media/uploads
runuser -u warehouse -- sh -c 'printf "user upload\n" > /var/www/warehouse/shared/media/uploads/u.txt; printf "x\n" > /var/www/warehouse/shared/backups/db/probe.txt'
sha256sum /var/www/warehouse/shared/.env | cut -d' ' -f1
runuser -u postgres -- psql -XAtq -c "SELECT oid FROM pg_database WHERE datname = 'warehouse_db'"
'@ | Where-Object { $_ -and $_ -notmatch '^(CREATE|INSERT|ALTER)' })
    Assert-True ((Invoke-TestMode 'Setup') -eq 0) 'Setup #2 (gateway only) exit 0'
    $sB = Get-ServerState
    Assert-Serving $sB $sha1 'Setup #2'
    Assert-True ($sB.CURRENT -ne $r1 -and $sB.PREVIOUS -eq $r1) "Setup #2 activated a new release and recorded the old one as previous ($($sB.PREVIOUS))"
    $after = @(Invoke-Server @'
sha256sum /var/www/warehouse/shared/.env | cut -d' ' -f1
runuser -u postgres -- psql -XAtq -c "SELECT oid FROM pg_database WHERE datname = 'warehouse_db'"
runuser -u postgres -- psql -XAtq -d warehouse_db -c "SELECT v FROM e2e_marker"
stat -c '%U:%G' /var/www/warehouse/shared/media/uploads /var/www/warehouse/shared/media/uploads/u.txt /var/www/warehouse/shared/backups/db/probe.txt | sort -u
'@)
    Assert-True ($after[0] -eq $before[0]) 'Setup #2 left shared/.env byte-identical'
    Assert-True ($after[1] -eq $before[1] -and $after[2] -eq 'kept') 'Setup #2 kept the same database and its rows'
    Assert-True ($after.Count -eq 4 -and $after[3] -eq 'warehouse:warehouse') "Setup #2 kept the owner of media and in-app backups ($($after[3..($after.Count - 1)] -join ', '))"

    # === C. two consecutive Updates (the second with -Maintenance) ==================================
    $script:DeploySha = $sha2
    # A MAINTENANCE flag left by an earlier failed activation; a healthy Update clears it (Assert-Serving checks).
    [void](Invoke-Server 'touch /var/www/warehouse/shared/MAINTENANCE')
    Assert-True ((Invoke-TestMode 'Update') -eq 0) 'Update #1 exit 0'
    $sC1 = Get-ServerState
    Assert-Serving $sC1 $sha2 'Update #1'
    Assert-True ($sC1.PREVIOUS -eq $sB.CURRENT) 'Update #1 recorded the Setup #2 release as previous'
    $rU1 = $sC1.CURRENT

    $script:DeploySha = $sha3
    $Maintenance = $true
    [void](Invoke-Server ': > /run/fake-systemd/log')
    Assert-True ((Invoke-TestMode 'Update') -eq 0) 'Update #2 (-Maintenance) exit 0'
    $Maintenance = $false
    $sC2 = Get-ServerState
    Assert-Serving $sC2 $sha3 'Update #2'
    Assert-True ($sC2.PREVIOUS -eq $rU1) 'Update #2 recorded Update #1 as previous'
    $rU2 = $sC2.CURRENT
    $svcLog = @(Invoke-Server 'cat /run/fake-systemd/log')
    Assert-True ($svcLog -contains 'stop warehouse-backend warehouse-gdrive-worker warehouse-export-worker') 'maintenance Update stopped the services before migrating'
    $pre = @(Get-ChildItem -LiteralPath $LocalBackupRoot -Filter 'db_pre_update_*.dump' -File)
    Assert-True ($pre.Count -eq 2 -and @($pre | Where-Object { -not (Test-LocalDumpVerified $_) }).Count -eq 0) 'both pre-update backups pulled and verified locally'

    # === D. Rollback to a compatible release ========================================================
    [void](Invoke-Server 'touch /var/www/warehouse/shared/MAINTENANCE')   # stale flag; the rollback clears it
    $script:ReadHostQueue.Enqueue('YES')
    Assert-True ((Invoke-TestMode 'Rollback') -eq 0) 'Rollback (compatible) exit 0'
    $sD = Get-ServerState
    Assert-Serving $sD $sha2 'Rollback'
    Assert-True ($sD.CURRENT -eq $rU1 -and $sD.PREVIOUS -eq $rU2) 'Rollback switched to Update #1 and recorded Update #2 as previous'

    # === E. fail-closed: django.setup of the target fails ===========================================
    [void](Invoke-Server "f=/var/www/warehouse/releases/$rU2/warehouse-backend/config/settings.py; cp -p `"`$f`" /root/settings.py.orig; printf '\nraise RuntimeError(\`"e2e: broken settings\`")\n' >> `"`$f`"")
    $script:ReadHostQueue.Enqueue('YES')
    Assert-True ((Invoke-TestMode 'Rollback') -ne 0) 'Rollback to a release whose django.setup fails exits non-zero'
    $gw = Invoke-GatewayAsDeploy "deploy-rollback --domain $Domain"
    Assert-True ($gw.ExitCode -ne 0 -and @($gw.Out + $gw.Err | Where-Object { $_ -like '*MIGRATION_CHECK_ERROR*RuntimeError*e2e: broken settings*' }).Count -ge 1) "... refused because the check itself failed (exit $($gw.ExitCode))"
    $sE = Get-ServerState
    Assert-Serving $sE $sha2 'after the refused rollback'
    Assert-True ($sE.CURRENT -eq $rU1 -and $sE.PREVIOUS -eq $rU2) '... current and the recorded releases unchanged'
    [void](Invoke-Server "cp -p /root/settings.py.orig /var/www/warehouse/releases/$rU2/warehouse-backend/config/settings.py")

    # === F. incompatible release: Update with a forward-only migration, then Rollback ===============
    $script:DeploySha = $shaMig
    Assert-True ((Invoke-TestMode 'Update') -eq 0) 'Update with a new migration exit 0'
    $sF = Get-ServerState
    Assert-Serving $sF $shaMig 'Update with a migration'
    Assert-True (@(Invoke-Server "runuser -u postgres -- psql -XAtq -d warehouse_db -c `"SELECT count(*) FROM django_migrations WHERE app = 'accounts' AND name = '0036_e2e_forward_only'`"")[0] -eq '1') 'the new migration was applied'
    $script:ReadHostQueue.Enqueue('YES')
    Assert-True ((Invoke-TestMode 'Rollback') -ne 0) 'Rollback across an applied migration exits non-zero'
    $gw = Invoke-GatewayAsDeploy "deploy-rollback --domain $Domain"
    Assert-True ($gw.ExitCode -ne 0 -and @($gw.Out + $gw.Err | Where-Object { $_ -like '*FORWARD_MIGRATIONS*accounts.0036_e2e_forward_only*' }).Count -ge 1) "... refused because of the forward migration (exit $($gw.ExitCode))"
    $sF2 = Get-ServerState
    Assert-Serving $sF2 $shaMig 'after the refused rollback'
    Assert-True ($sF2.CURRENT -eq $sF.CURRENT -and $sF2.PREVIOUS -eq $rU1) '... current and the recorded releases unchanged'

    # === F2. Update to an older commit that lacks the applied migration is refused before any change ==
    $script:DeploySha = $sha3
    Assert-True ((Invoke-TestMode 'Update') -ne 0) 'Update to a commit without an applied migration exits non-zero'
    $sF3 = Get-ServerState
    Assert-Serving $sF3 $shaMig 'after the refused older Update'
    Assert-True ($sF3.CURRENT -eq $sF.CURRENT -and $sF3.PREVIOUS -eq $rU1) '... current and the recorded releases unchanged'

    # === G. PullBackups with a real in-app backup in backups/db ======================================
    $made = Invoke-Container 'root' @'
cd /var/www/warehouse/current/warehouse-backend
runuser -u warehouse -- env DJANGO_SETTINGS_MODULE=config.settings DJANGO_ENV=production /var/www/warehouse/current/venv/bin/python -c "import django; django.setup(); from accounts.backup_service import create_database_backup; print('[APP_BACKUP]', create_database_backup())"
'@
    Write-Host "[INFO] create_database_backup: $(($made.Output | Select-Object -Last 3) -join ' | ') $($made.StdErr)"
    $appFiles = @(Invoke-Server 'cd /var/www/warehouse/shared/backups/db; ls -1 backup_*.dump backup_*.dump.meta.json 2>/dev/null || true; stat -c "%U" backup_*.dump 2>/dev/null | sort -u')
    Assert-True ($made.ExitCode -eq 0 -and @($appFiles | Where-Object { $_ -like '*.dump' }).Count -eq 1 -and @($appFiles | Where-Object { $_ -like '*.meta.json' }).Count -eq 1 -and $appFiles[-1] -eq 'warehouse') "the application wrote a backup with .meta.json into backups/db ($($appFiles -join ', '))"
    [void](Invoke-Server '/usr/local/bin/warehouse-nightly-backup.sh')
    Assert-True ((Invoke-TestMode 'PullBackups' -NonInteractiveRun) -eq 0) 'PullBackups exit 0'
    $appName = @($appFiles | Where-Object { $_ -like '*.dump' })[0]
    $appLocal = Join-Path $LocalBackupRoot "db\$appName"
    Assert-True ((Test-Path -LiteralPath $appLocal) -and (Get-FileSha256 $appLocal) -eq (Read-RecordedHash "$appLocal.meta.json")) "in-app backup db/$appName pulled and verified against its .meta.json"
    $nightly = @(Get-ChildItem -LiteralPath $LocalBackupRoot -Filter 'db_nightly_*.dump' -File)
    Assert-True ($nightly.Count -eq 1 -and (Test-LocalDumpVerified $nightly[0])) 'nightly dump pulled and verified'
    $upload = Join-Path $LocalBackupRoot 'media\uploads\u.txt'
    Assert-True ((Test-Path -LiteralPath $upload) -and [System.IO.File]::ReadAllText($upload) -ceq "user upload`n") 'media mirrored'

    # === H. symlink and path attacks by the application user ==========================================
    $own = @(Invoke-Server @'
cd /var/www/warehouse/shared/backups
for t in "touch x" "ln -s /etc/shadow y" "mkdir z"; do
    if runuser -u warehouse -- sh -c "cd /var/www/warehouse/shared/backups && $t" 2>/dev/null; then echo "ALLOWED:$t"; else echo "DENIED:$t"; fi
done
runuser -u warehouse -- ln -s /etc/shadow db/evil.dump
runuser -u warehouse -- ln -s /etc db/etcdir
if runuser -u warehouse -- ln /etc/shadow db/hard.dump 2>/dev/null; then echo 'HARDLINK:ALLOWED'; else echo 'HARDLINK:DENIED'; fi
runuser -u warehouse -- ln -s /etc/shadow /var/www/warehouse/shared/media/shadow_link
runuser -u warehouse -- ln -s /etc /var/www/warehouse/shared/media/etc_link
'@)
    Assert-True (@($own | Where-Object { $_ -like 'DENIED:*' }).Count -eq 3) "the application user cannot create entries in backups/ ($($own -join ', '))"
    Assert-True ($own -contains 'HARDLINK:DENIED') 'the application user cannot hard-link /etc/shadow into backups/db (fs.protected_hardlinks)'
    foreach ($rel in 'db/evil.dump', 'db/etcdir/shadow', '../.env', 'db/../../.env', '/etc/shadow') {
        $g = Invoke-GatewayAsDeploy "read-backup '$rel'"
        Assert-True ($g.ExitCode -ne 0 -and $g.Bytes -eq 0) "read-backup $rel refused with no output (exit $($g.ExitCode))"
    }
    $g = Invoke-GatewayAsDeploy 'sha256sum db/evil.dump db/etcdir/shadow'
    Assert-True ($g.ExitCode -ne 0 -and $g.Bytes -eq 0) "sha256sum of planted symlinks refused (exit $($g.ExitCode))"
    $g = Invoke-GatewayAsDeploy "read-backup 'db/$appName'"
    Assert-True ($g.ExitCode -eq 0 -and $g.Bytes -gt 0) 'positive control: read-backup of the real in-app backup works'
    $g = Invoke-GatewayAsDeploy 'list-backups'
    Assert-True ($g.ExitCode -eq 0 -and @($g.Out | Where-Object { $_ -match 'evil|etcdir' }).Count -eq 0 -and @($g.Out | Where-Object { $_ -like "*db/$appName" }).Count -eq 1) 'list-backups lists the real backup and none of the planted links'
    [void](Invoke-Server '/usr/local/bin/warehouse-nightly-backup.sh')
    $g = Invoke-GatewayAsDeploy 'list-media'
    $snap = $g.Out | Select-Object -First 1
    Assert-True ($snap -match '^/var/www/warehouse/shared/backups/media_daily_\d{8}_\d{6}$' -and @($g.Out | Where-Object { $_ -match 'shadow_link|etc_link' }).Count -eq 0) "list-media lists no symlink ($snap)"
    $tm = Invoke-Container 'deploy' @"
s=`$(mktemp -d /tmp/wh-deploy.XXXXXXXXXX)
printf 'shadow_link\0' > "`$s/l1"; printf 'etc_link/shadow\0' > "`$s/l2"; printf 'uploads/u.txt\0' > "`$s/ok"
for l in l1 l2 ok; do sudo -n $Gateway tar-media '$snap' "`$s/`$l" > "`$s/`$l.tar" 2>/dev/null; echo "`$l:RC=`$?:BYTES=`$(stat -c %s "`$s/`$l.tar"):LIST=`$(tar -tf "`$s/`$l.tar" 2>/dev/null | tr '\n' ' ')"; done
sudo -n $Gateway tar-media '$snap' /etc/shadow > /dev/null 2>&1; echo "outside:RC=`$?"
rm -rf -- "`$s"
"@
    Write-Host "[INFO] tar-media: $($tm.Output -join ' | ')"
    Assert-True (@($tm.Output | Where-Object { $_ -match '^l1:RC=2:BYTES=0:' }).Count -eq 1) 'tar-media refuses a symlinked file'
    Assert-True (@($tm.Output | Where-Object { $_ -match '^l2:RC=2:BYTES=0:' }).Count -eq 1) 'tar-media refuses a path through a symlinked directory'
    Assert-True (@($tm.Output | Where-Object { $_ -match '^ok:RC=0:BYTES=[1-9]\d*:LIST=uploads/u\.txt $' }).Count -eq 1) 'positive control: tar-media of a real file works'
    Assert-True ($tm.Output -contains 'outside:RC=2') 'tar-media refuses a list file outside the stage'
    $foreign = @(Invoke-Server "d=`$(runuser -u warehouse -- mktemp -d /tmp/wh-deploy.XXXXXXXXXX); runuser -u warehouse -- sh -c `"printf 'uploads/u.txt\0' > `$d/l; chmod 755 `$d; chmod 644 `$d/l`"; echo `$d/l")[0]
    $g = Invoke-GatewayAsDeploy "tar-media '$snap' '$foreign'"
    Assert-True ($g.ExitCode -eq 2 -and $g.Bytes -eq 0) "tar-media refuses a stage owned by another user (exit $($g.ExitCode))"
    $g = Invoke-GatewayAsDeploy "deploy-prepare --bundle /etc/shadow --bundle-sha256 $('0' * 64)"
    Assert-True ($g.ExitCode -ne 0) "deploy-prepare refuses a bundle outside the stage (exit $($g.ExitCode))"
    $g = Invoke-GatewayAsDeploy "setup /etc/passwd $Domain ops@farsalish.ir warehouse_db warehouse_user $Domain 22 /etc/passwd $('0' * 64)"
    Assert-True ($g.ExitCode -ne 0) "setup refuses a script outside the stage (exit $($g.ExitCode))"
    $layout = @(Invoke-Server 'cd /var/www/warehouse/shared/backups; stat -c "%U:%G:%a" . db; find . -mindepth 1 -maxdepth 1 ! -name db ! -user root | wc -l; test ! -e /var/www/warehouse/shared/backups/x && echo NO_X')
    Assert-True ($layout[0] -eq 'root:warehouse:710' -and $layout[1] -eq 'warehouse:warehouse:700' -and $layout[2] -eq '0' -and $layout[3] -eq 'NO_X') "backups layout intact after the attacks ($($layout -join ' | '))"
    Assert-True ((Invoke-TestMode 'PullBackups' -NonInteractiveRun) -eq 0) 'PullBackups still exit 0 with the planted links present'
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $LocalBackupRoot 'db\evil.dump')) -and -not (Test-Path -LiteralPath (Join-Path $LocalBackupRoot 'media\shadow_link'))) '... and pulled none of them'
    Assert-Serving (Get-ServerState) $shaMig 'after the attacks'

    # === I. Restore: the services start only on a release that matches the restored schema ===========
    $rMig = (Get-ServerState).CURRENT
    $dumpInfo = @(Invoke-Server @'
cd /var/www/warehouse/shared/backups
for f in db_*.dump; do
    [ -f "$f.sha256" ] || continue
    rows=$(pg_restore -a -t django_migrations -f - "$f" 2>/dev/null || true)
    if grep -q 0036_e2e_forward_only <<<"$rows"; then echo "WITH $f"; else echo "WITHOUT $f"; fi
done
'@)
    $older = @($dumpInfo | Where-Object { $_ -like 'WITHOUT db_pre_update_*' } | ForEach-Object { $_.Substring(8) } | Sort-Object) | Select-Object -Last 1
    $newer = @($dumpInfo | Where-Object { $_ -like 'WITH db_nightly_*' } | ForEach-Object { $_.Substring(5) } | Sort-Object) | Select-Object -Last 1
    Assert-True ($older -and $newer) "a pre-update dump without 0036 ($older) and a nightly with it ($newer) are on the server"

    # I1. an older dump onto the release with 0036: the database is restored, the services stay stopped
    $script:ReadHostQueue.Enqueue((Get-RestoreMenuIndex $older))
    $script:ReadHostQueue.Enqueue('RESTORE')
    $code = Invoke-TestMode 'Restore'
    Assert-True ($code -eq 6) "Restore of an older dump onto $rMig exits 6 ($code)"
    $sI1 = Get-ServerState
    Assert-True ((Get-Applied0036) -eq 0 -and (Get-InactiveServiceCount) -eq 3 -and $sI1.MAINTENANCE -eq 'yes' -and -not $sI1.DAPHNE_CWD) '... database restored without 0036, services held stopped, MAINTENANCE set'
    $preRestore = @(Get-ChildItem -LiteralPath $LocalBackupRoot -Filter 'db_pre_restore_*.dump' -File)
    Assert-True ($preRestore.Count -eq 1 -and (Test-LocalDumpVerified $preRestore[0])) '... its pre_restore backup was pulled and verified'
    $kept = @(Invoke-Server "pg_restore -a -t django_migrations -f - /var/www/warehouse/shared/backups/$($preRestore[0].Name) | grep -c 0036_e2e_forward_only || true")[0]
    Assert-True ($kept -eq '1') '... and keeps the state before the restore (0036 applied)'
    $g = Invoke-GatewayAsDeploy 'restore-start'
    Assert-True ($g.ExitCode -eq 6 -and ($g.Out -contains '[SERVICES_HELD]') -and @($g.Err | Where-Object { $_ -like '*PENDING_MIGRATIONS*accounts.0036_e2e_forward_only*' }).Count -ge 1) "restore-start refuses too: 0036 is unapplied (exit $($g.ExitCode))"
    Assert-True ((Get-InactiveServiceCount) -eq 3) '... and the services stay stopped'
    # The hold survives an operator restart and a reboot (systemd starts enabled units; ConditionPathExists skips them).
    $g = Invoke-GatewayAsDeploy 'restart'
    Assert-True ($g.ExitCode -eq 6 -and ($g.Out -contains '[SERVICES_HELD]')) "gateway restart refused while held (exit $($g.ExitCode))"
    $boot = @(Invoke-Server 'systemctl start warehouse-backend warehouse-gdrive-worker warehouse-export-worker; test -e /var/www/warehouse/shared/SERVICES_HELD && echo HELD')
    Assert-True (($boot -contains 'HELD') -and (Get-InactiveServiceCount) -eq 3) '... and a start at boot leaves the held units stopped'

    # I2. an Update brings the release in line: migrate applies 0036 to the restored data, MAINTENANCE cleared
    $script:DeploySha = $shaMig
    Assert-True ((Invoke-TestMode 'Update') -eq 0) 'Update after the held restore exit 0'
    $sI2 = Get-ServerState
    Assert-Serving $sI2 $shaMig 'Update after the held restore'
    Assert-True ((Get-Applied0036) -eq 1 -and $sI2.CURRENT -ne $rMig) "... 0036 applied to the restored data by a new release ($($sI2.CURRENT))"

    # I3. Rollback to a release with an unapplied migration is refused (strict), before any change
    $g = Invoke-GatewayAsDeploy 'restore-stop'
    Assert-True ($g.ExitCode -eq 0 -and ($g.Out -contains '[SERVICES_STOPPED]')) "restore-stop exit 0 ($($g.ExitCode))"
    [void](Invoke-Server "runuser -u postgres -- psql -XAtq -d warehouse_db -c `"DELETE FROM django_migrations WHERE app = 'accounts' AND name = '0036_e2e_forward_only'`"")
    $g = Invoke-GatewayAsDeploy "deploy-rollback --domain $Domain"
    $sI3 = Get-ServerState
    Assert-True ($g.ExitCode -ne 0 -and @($g.Out + $g.Err | Where-Object { $_ -like '*PENDING_MIGRATIONS*accounts.0036_e2e_forward_only*' }).Count -ge 1) "Rollback to $rMig with 0036 unapplied refused (exit $($g.ExitCode))"
    Assert-True ($sI3.CURRENT -eq $sI2.CURRENT -and $sI3.PREVIOUS -eq $rMig -and (Get-InactiveServiceCount) -eq 3) '... current, the records and the stopped services unchanged'
    [void](Invoke-Server "runuser -u postgres -- psql -XAtq -d warehouse_db -c `"INSERT INTO django_migrations (app, name, applied) VALUES ('accounts', '0036_e2e_forward_only', now())`"")

    # I3b. an applied migration the release does not know: held; started once it is gone
    [void](Invoke-Server "runuser -u postgres -- psql -XAtq -d warehouse_db -c `"INSERT INTO django_migrations (app, name, applied) VALUES ('accounts', '0099_e2e_unknown', now())`"")
    $g = Invoke-GatewayAsDeploy 'restore-start'
    Assert-True ($g.ExitCode -eq 6 -and ($g.Out -contains '[SERVICES_HELD]') -and @($g.Err | Where-Object { $_ -like '*FORWARD_MIGRATIONS*accounts.0099_e2e_unknown*' }).Count -ge 1) "restore-start refuses an applied migration the release lacks (exit $($g.ExitCode))"
    Assert-True ((Get-ServerState).MAINTENANCE -eq 'yes' -and (Get-InactiveServiceCount) -eq 3) '... services stopped, MAINTENANCE set'
    [void](Invoke-Server "runuser -u postgres -- psql -XAtq -d warehouse_db -c `"DELETE FROM django_migrations WHERE name = '0099_e2e_unknown'`"")
    $g = Invoke-GatewayAsDeploy 'restore-start'
    Assert-True ($g.ExitCode -eq 0 -and ($g.Out -contains '[STARTED_OK]')) "restore-start starts a matching release (exit $($g.ExitCode))"
    Assert-Serving (Get-ServerState) $shaMig 'after restore-start'

    # I4. restore-exec refuses an altered dump, a symlinked dump and a running deployment, before any change
    [void](Invoke-Server @"
B=/var/www/warehouse/shared/backups
cp -p "`$B/$newer" "`$B/db_manual_20260101_000000.dump"
cp -p "`$B/$newer.sha256" "`$B/db_manual_20260101_000000.dump.sha256"
printf 'X' >> "`$B/db_manual_20260101_000000.dump"
ln -s "`$B/$newer" "`$B/db_manual_20260101_000001.dump"
cp -p "`$B/$newer.sha256" "`$B/db_manual_20260101_000001.dump.sha256"
runuser -u postgres -- psql -XAtq -d warehouse_db -c "INSERT INTO e2e_marker VALUES ('after-nightly')"
"@)
    $g = Invoke-GatewayAsDeploy 'restore-stop'
    Assert-True ($g.ExitCode -eq 0) "restore-stop exit 0 ($($g.ExitCode))"
    $g = Invoke-GatewayAsDeploy 'restore-check db_manual_20260101_000000.dump'
    Assert-True ($g.ExitCode -eq 2 -and @($g.Err | Where-Object { $_ -like '*sha256 mismatch*' }).Count -eq 1) "restore-check refuses the altered dump (exit $($g.ExitCode))"
    $g = Invoke-GatewayAsDeploy 'restore-exec db_manual_20260101_000000.dump'
    Assert-True ($g.ExitCode -eq 2 -and @($g.Err | Where-Object { $_ -like '*sha256 mismatch*' }).Count -eq 1 -and -not ($g.Out -contains '[DB_RESTORED]')) "restore-exec refuses the altered dump (exit $($g.ExitCode))"
    $g = Invoke-GatewayAsDeploy 'restore-exec db_manual_20260101_000001.dump'
    Assert-True ($g.ExitCode -eq 2 -and @($g.Err | Where-Object { $_ -like '*symlink*' }).Count -eq 1 -and -not ($g.Out -contains '[DB_RESTORED]')) "restore-exec refuses a symlinked dump (exit $($g.ExitCode))"
    [void](Invoke-Server 'setsid flock -F /run/warehouse-deploy.lock sleep 120 </dev/null >/dev/null 2>&1 & echo $! > /root/lock.pid; sleep 1')
    $g = Invoke-GatewayAsDeploy "restore-exec $newer"
    [void](Invoke-Server 'kill "$(cat /root/lock.pid)" 2>/dev/null || true; rm -f /root/lock.pid')
    Assert-True ($g.ExitCode -eq 3 -and @($g.Err | Where-Object { $_ -like '*deployment is in progress*' }).Count -eq 1 -and -not ($g.Out -contains '[DB_RESTORED]')) "restore-exec refuses while the deploy lock is held (exit $($g.ExitCode))"
    $markerRows = @(Invoke-Server "runuser -u postgres -- psql -XAtq -d warehouse_db -c `"SELECT string_agg(v, ',' ORDER BY v) FROM e2e_marker`"")[0]
    Assert-True ($markerRows -eq 'after-nightly,kept' -and (Get-Applied0036) -eq 1) "... the database was not touched ($markerRows)"
    [void](Invoke-Server 'rm -f /var/www/warehouse/shared/backups/db_manual_20260101_00000[01].dump*')
    $g = Invoke-GatewayAsDeploy 'restore-start'
    Assert-True ($g.ExitCode -eq 0 -and ($g.Out -contains '[STARTED_OK]')) "restore-start exit 0 ($($g.ExitCode))"

    # I5. a dump that matches the release: restored, services started, a stale MAINTENANCE flag cleared
    [void](Invoke-Server 'touch /var/www/warehouse/shared/MAINTENANCE')
    $script:ReadHostQueue.Enqueue((Get-RestoreMenuIndex $newer))
    $script:ReadHostQueue.Enqueue('RESTORE')
    Assert-True ((Invoke-TestMode 'Restore') -eq 0) "Restore of $newer (matches the release) exit 0"
    Assert-Serving (Get-ServerState) $shaMig 'after the matching restore (end of test)'
    $markerRows = @(Invoke-Server "runuser -u postgres -- psql -XAtq -d warehouse_db -c `"SELECT string_agg(v, ',' ORDER BY v) FROM e2e_marker`"")[0]
    Assert-True ($markerRows -eq 'kept' -and (Get-Applied0036) -eq 1) "... the database holds the nightly's rows only ($markerRows)"
} catch {
    Write-Host "[FAIL] test aborted: $($_.Exception.Message)`n$($_.ScriptStackTrace)" -ForegroundColor Red
    $script:failures++
} finally {
    if (-not $KeepContainer) { [void](Invoke-Process -FilePath $DockerExe -ArgumentList @('rm', '-f', $container) -Capture -Quiet) }
    foreach ($n in 'FAKE_SSH_FP', 'FAKE_SSH_DOCKER', 'FAKE_SSH_DOCKER_EXE') { Remove-Item "Env:$n" -ErrorAction SilentlyContinue }
}

Write-Host "[RESULT] failures=$($script:failures)"
exit $(if ($script:failures -eq 0) { 0 } else { 1 })
