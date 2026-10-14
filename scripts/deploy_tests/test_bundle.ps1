#Requires -Version 7.4
# Bundle test for deploy.ps1 (plan 10.4 d-3). Never shipped (scripts/deploy_tests is outside the bundle whitelist).
#  1. A temporary commit of the working tree is made without touching any ref or the real index
#     (temporary GIT_INDEX_FILE, write-tree, commit-tree).
#  2. The real isolated build and New-DeploymentBundle run into scratch/deploy.
#  3. The bundle is opened with "tar -xzf" inside ubuntu:24.04 and every gate is re-checked there.
# Prints the temporary commit as [TEMP_COMMIT] <sha> so the integration test can reuse the build (-SkipBuild).
param([switch]$KeepContainer)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\..\deploy.ps1')

$failures = 0
function Assert-True([bool]$Condition, [string]$Text) {
    if ($Condition) { Write-Host "[PASS] $Text" -ForegroundColor Green } else { Write-Host "[FAIL] $Text" -ForegroundColor Red; $script:failures++ }
}

# --- 1. temporary commit -----------------------------------------------------------------------
$refsBefore = (Invoke-Git @('for-each-ref', '--format=%(refname) %(objectname)')).Output
$headBefore = (Invoke-Git @('rev-parse', 'HEAD')).Output.Trim()
$statusBefore = (Invoke-Git @('status', '--porcelain=v1', '--untracked-files=all')).Output
[void][System.IO.Directory]::CreateDirectory($LocalDeployScratch)
$tmpIndex = Join-Path $LocalDeployScratch 'test_bundle.index'
if (Test-Path -LiteralPath $tmpIndex) { Remove-Item -LiteralPath $tmpIndex -Force }
$env:GIT_INDEX_FILE = $tmpIndex
try {
    foreach ($step in @(@('read-tree', 'HEAD'), @('add', '-A'))) {
        $r = Invoke-Git $step
        if ($r.ExitCode -ne 0) { throw "git $($step -join ' ') failed: $($r.StdErr)" }
    }
    $tree = (Invoke-Git @('write-tree')).Output.Trim()
    $commit = Invoke-Git @('commit-tree', $tree, '-p', 'HEAD', '-m', 'deploy.ps1 bundle test (temporary, unreferenced)')
    $sha = $commit.Output.Trim()
} finally {
    Remove-Item Env:GIT_INDEX_FILE -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $tmpIndex) { Remove-Item -LiteralPath $tmpIndex -Force }
}
Assert-True ($sha -cmatch '^[0-9a-f]{40}$') "temporary commit created: $sha"
Assert-True (((Invoke-Git @('for-each-ref', '--format=%(refname) %(objectname)')).Output) -ceq $refsBefore) 'no ref changed'
Assert-True (((Invoke-Git @('rev-parse', 'HEAD')).Output.Trim()) -ceq $headBefore) 'HEAD unchanged'
Assert-True (((Invoke-Git @('status', '--porcelain=v1', '--untracked-files=all')).Output) -ceq $statusBefore) 'real index and working tree status unchanged'
Write-Host "[TEMP_COMMIT] $sha"

# --- 2. real build and bundle --------------------------------------------------------------------
$front = Build-IsolatedFrontend $sha
$marker = Join-Path (Join-Path $LocalDeployScratch $sha) '.build-complete'
Assert-True ([System.IO.File]::ReadAllText($marker) -ceq "COMMIT=$sha MODULES=$AllModules`n") '.build-complete marker written with LF and MODULES'
$junction = Join-Path $front 'node_modules'
Assert-True (-not (Test-Path -LiteralPath $junction)) 'node_modules junction removed after the build'
$bundle = New-DeploymentBundle $sha $front $AllModules
Assert-True (Test-Path -LiteralPath $bundle.Path) "bundle created ($($bundle.Sha256))"
Assert-True ((Get-FileSha256 $bundle.Path) -eq $bundle.Sha256) 'returned sha256 matches the file'
Assert-True (-not (Test-Path -LiteralPath (Join-Path $LocalDeployScratch "bundle_stage_$sha"))) 'stage directory removed'
$whitelist = Get-BackendWhitelist $sha
Write-Host "[INFO] backend whitelist: $(($whitelist.Apps + $whitelist.Files) -join ', ')"

# --- 3. open the bundle in ubuntu:24.04 ----------------------------------------------------------
$container = "wh-bundle-test-$((Get-Date).ToString('yyyyMMddHHmmss'))"
$check = @'
set -uo pipefail
fail=0
pass() { echo "[PASS] $*"; }
bad() { echo "[FAIL] $*"; fail=1; }
mkdir /x
tar -xzf /bundle.tar.gz -C /x; rc=$?
[ "$rc" -eq 0 ] && pass "tar -xzf exit 0" || bad "tar -xzf exit $rc"
cd /x
owners=$(tar -tvzf /bundle.tar.gz | awk '{print $2}' | sort -u | tr '\n' ' ')
[ "$owners" = "root/root " ] && pass "every entry is owned by root/root" || bad "owners: $owners"
[ "$(tar -tzf /bundle.tar.gz | grep -c '\\')" -eq 0 ] && pass "no backslash in entry names" || bad "backslash in entry names"
cr=$( { grep -rl $'\r' scripts/deploy; grep -l $'\r' RELEASE; find . -name '*.sh' -exec grep -l $'\r' {} +; } 2>/dev/null | sort -u)
[ -z "$cr" ] && pass "no CR in RELEASE, scripts/deploy/** or *.sh" || bad "CR found in: $cr"
top=$(ls -A warehouse-backend | sort | tr '\n' ' ')
[ "$top" = "$EXPECTED_TOP " ] && pass "warehouse-backend top level equals the whitelist" || bad "warehouse-backend top level: $top"
forbidden=$(find . \( -name '__pycache__' -o -name 'test_phase*' -o -name '.env' -o -name '.env.*' -o -name 'db.sqlite3' \) -print)
[ -z "$forbidden" ] && pass "no __pycache__, test_phase, .env or db.sqlite3" || bad "forbidden: $forbidden"
for f in warehouse-front/dist/warehouse-app/browser/index.html warehouse-front/dist/warehouse-app/browser/ngsw.json \
         warehouse-front/dist/warehouse-app/browser/build-modules.txt RELEASE \
         scripts/deploy/warehouse-deploy.sh scripts/deploy/warehouse-nightly-backup.sh scripts/remote-setup.sh \
         warehouse-backend/backend_paths.py warehouse-backend/manage.py warehouse-backend/requirements.txt warehouse-backend/requirements.lock; do
    [ -f "$f" ] && pass "present: $f" || bad "missing: $f"
done
apps=$(find warehouse-backend -name "apps.py" -exec dirname {} + | xargs -n1 basename | sort -u | tr '\n' ' ')
[ "$apps" = "$EXPECTED_APPS " ] && pass "bundle apps equal full profile INSTALLED_APPS" || bad "bundle apps: $apps (expected: $EXPECTED_APPS)"
grep -qx "COMMIT=$EXPECTED_SHA" RELEASE && pass "RELEASE names the commit" || bad "RELEASE: $(cat RELEASE)"
grep -qx "$EXPECTED_MODULES" warehouse-front/dist/warehouse-app/browser/build-modules.txt && pass "build-modules.txt has expected modules" || bad "build-modules.txt: $(cat warehouse-front/dist/warehouse-app/browser/build-modules.txt 2>/dev/null)"
for s in scripts/deploy/*.sh scripts/remote-setup.sh; do
    bash -n "$s" && pass "bash -n $s" || bad "bash -n $s"
done
echo "[INFO] modes as stored by bsdtar: $(stat -c '%a' RELEASE scripts/deploy/warehouse-deploy.sh warehouse-backend | tr '\n' ' ')"
exit $fail
'@
$expectedTopDirs = @($whitelist.Apps | ForEach-Object { $_.Split('/')[0] } | Sort-Object -Unique)
$expectedTop = (@(@($expectedTopDirs) + @($whitelist.Files)) | Sort-Object -Culture ([cultureinfo]::InvariantCulture)) -join ' '
$expectedApps = 'accounts communications companies inventory notifications personnel platform_core reports settings_core warehouses'
try {
    $run = Invoke-Process -FilePath $DockerExe -ArgumentList @('run', '-d', '--name', $container, 'ubuntu:24.04', 'sleep', 'infinity') -Capture -Quiet
    if ($run.ExitCode -ne 0) { throw 'docker run failed.' }
    $cp = Invoke-Process -FilePath $DockerExe -ArgumentList @('cp', $bundle.Path, "${container}:/bundle.tar.gz") -Capture -Quiet
    Assert-True ($cp.ExitCode -eq 0) 'bundle copied into the container'
    $ex = Invoke-Process -FilePath $DockerExe -ArgumentList @('exec', '-i', '-e', "EXPECTED_TOP=$expectedTop", '-e', "EXPECTED_SHA=$sha", '-e', "EXPECTED_APPS=$expectedApps", '-e', "EXPECTED_MODULES=$AllModules", '-e', 'LC_ALL=C', $container, 'bash', '-s') -StdinText $check.Replace("`r", '') -Capture
    foreach ($line in $ex.Output) { if ($line -like '[[]FAIL[]]*') { $failures++ } }
    Assert-True ($ex.ExitCode -eq 0) "container gate script exit $($ex.ExitCode)"
} finally {
    if (-not $KeepContainer) { [void](Invoke-Process -FilePath $DockerExe -ArgumentList @('rm', '-f', $container) -Capture -Quiet) }
}

Write-Host "[RESULT] failures=$failures"
exit $(if ($failures -eq 0) { 0 } else { 1 })
