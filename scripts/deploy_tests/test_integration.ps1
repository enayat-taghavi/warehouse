#Requires -Version 7.4
# Integration test for deploy.ps1 (plan 10.4 d-4). Never shipped.
# A throwaway ubuntu:24.04 container plays the soft server (sudo, python3, PostgreSQL, rsync, fake systemctl,
# fake warehouse-deploy, the real warehouse-nightly-backup.sh). A fake ssh (fake_ssh.cs) forwards every remote
# command to "docker exec -i -u deploy". Read-Host is mocked. Local backups go to scratch/deploy_tests/backups_soft,
# never to the real backups/soft.
param(
    [Parameter(Mandatory)][string]$Sha,   # commit with a completed build in scratch/deploy (from test_bundle.ps1)
    [switch]$KeepContainer
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\..\deploy.ps1')

$TestRoot = Join-Path $ScriptRoot 'scratch\deploy_tests'
$LocalBackupRoot = Join-Path $TestRoot 'backups_soft'
if (Test-Path -LiteralPath $LocalBackupRoot) { Remove-SafeDirectoryRecursively $LocalBackupRoot }
[void][System.IO.Directory]::CreateDirectory($TestRoot)

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
    Write-Host "[MOCK Read-Host] $Prompt -> $(if ($MaskInput) { '<masked>' } else { $answer })" -ForegroundColor Magenta
    return $answer
}
function Wait-Console { param([string]$PromptMessage) }
function Get-DeployCommit { return $Sha }   # the real git guard is tested separately below

# --- fake ssh --------------------------------------------------------------------------------------
$csc = Join-Path $env:SystemRoot 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$fakeExe = Join-Path $TestRoot 'fake_ssh.exe'
$c = Invoke-Process -FilePath $csc -ArgumentList @('/nologo', "/out:$fakeExe", (Join-Path $PSScriptRoot 'fake_ssh.cs')) -Capture -Quiet
if ($c.ExitCode -ne 0) { throw "csc failed: $($c.Output -join "`n")" }
$SshExe = $fakeExe
$SshKeygenExe = $fakeExe

$fingerprint = 'SHA256:' + ('A' * 43)
$container = "wh-int-test-$((Get-Date).ToString('yyyyMMddHHmmss'))"
$env:FAKE_SSH_FP = $fingerprint
$env:FAKE_SSH_DOCKER = $container
$env:FAKE_SSH_DOCKER_EXE = $DockerExe
$ConfigFile = Join-Path $TestRoot 'config.json'
Write-Utf8LfFile $ConfigFile (@{
        ServerHost = 'example.test'; SshUser = 'deploy'; SshPort = 22; Domain = 'soft.example.test'
        HostKeyFingerprint = $fingerprint; DbName = 'warehouse_db'; DbUser = 'warehouse_user'
        AllowedHosts = 'soft.example.test'; AdminEmail = 'ops@farsalish.ir'
    } | ConvertTo-Json)

function Invoke-Server([string]$Script) {
    # Runs a fixture/inspection script as root in the container; returns the output lines.
    $r = Invoke-Process -FilePath $DockerExe -ArgumentList @('exec', '-i', '-u', 'root', $container, 'bash', '-s') -StdinText ("set -euo pipefail`n" + $Script.Replace("`r", '')) -Capture -Quiet
    if ($r.ExitCode -ne 0) { throw "Server script failed (exit $($r.ExitCode)): $($r.Output -join ' | ') $($r.StdErr)" }
    return @($r.Output)
}
function Get-ItemCount { return [int](@(Invoke-Server "su - postgres -c `"psql -XAtq -d warehouse_db -c 'SELECT count(*) FROM items'`"")[0]) }
function Get-StageCount { return [int](@(Invoke-Server '{ ls -d /tmp/wh-deploy.* 2>/dev/null || true; } | wc -l')[0]) }
function Get-ServerDumpList {
    # Same listing and order as the Restore menu (newest first by the timestamp in the name).
    return @(Invoke-Server 'cd /var/www/warehouse/shared/backups; for f in *.dump; do if [ -f "$f.sha256" ]; then echo "$f"; fi; done' |
            Sort-Object -Property @{ Expression = { Get-BackupTimestamp $_ } } -Descending)
}
function Get-LocalNames([string]$Filter) {
    if (-not (Test-Path -LiteralPath $LocalBackupRoot)) { return @() }
    return @(Get-ChildItem -LiteralPath $LocalBackupRoot -Filter $Filter -File | ForEach-Object { $_.Name })
}
function Get-ServerMediaHashes {
    $map = @{}
    foreach ($line in (Invoke-Server 'cd "$(readlink -f /var/www/warehouse/shared/backups/latest_media)"; find . -type f -print0 | xargs -0 -r sha256sum')) {
        if ($line -match '^([0-9a-f]{64})  \./(.+)$') { $map[$Matches[2]] = $Matches[1] }
    }
    return $map
}
function Test-MediaMirror([string]$Label) {
    $server = Get-ServerMediaHashes
    $bad = @($server.Keys | Where-Object {
            $p = Get-LocalPathFor (Join-Path $LocalBackupRoot 'media') $_
            -not (Test-Path -LiteralPath $p) -or (Get-FileSha256 $p) -ne $server[$_]
        })
    Assert-True ($server.Count -gt 0 -and $bad.Count -eq 0) "$Label : local media mirror equals the server snapshot ($($server.Count) files)"
}
function Invoke-TestMode([string]$Name, [switch]$NonInteractiveRun) {
    $script:NonInteractive = [bool]$NonInteractiveRun
    Write-Host "`n########## mode $Name (NonInteractive=$([bool]$NonInteractiveRun)) ##########" -ForegroundColor Cyan
    $code = Invoke-Mode $Name
    $script:NonInteractive = $false
    if ($script:ReadHostQueue.Count -gt 0) { Write-Host "[FAIL] $($script:ReadHostQueue.Count) unused Read-Host answer(s)" -ForegroundColor Red; $script:failures++; $script:ReadHostQueue.Clear() }
    return $code
}

try {
    # --- server fixture ------------------------------------------------------------------------
    $run = Invoke-Process -FilePath $DockerExe -ArgumentList @('run', '-d', '--name', $container, 'ubuntu:24.04', 'sleep', 'infinity') -Capture -Quiet
    if ($run.ExitCode -ne 0) { throw 'docker run failed.' }
    [void](Invoke-Server 'mkdir -p /fixture')
    foreach ($f in @((Join-Path $PSScriptRoot 'server_fixture.sh'), (Join-Path $ScriptRoot 'scripts\deploy\warehouse-nightly-backup.sh'), (Join-Path $ScriptRoot 'scripts\deploy\warehouse-root-gateway.sh'))) {
        $cp = Invoke-Process -FilePath $DockerExe -ArgumentList @('cp', $f, "${container}:/fixture/") -Capture -Quiet
        if ($cp.ExitCode -ne 0) { throw "docker cp $f failed." }
    }
    $fx = Invoke-Server 'sed -i "s/\r$//" /fixture/*.sh; bash /fixture/server_fixture.sh'
    if (-not ($fx -contains '[FIXTURE_READY]')) { throw 'Server fixture did not finish.' }
    Write-Host '[INFO] server fixture ready' -ForegroundColor Cyan

    # --- git guard (real Get-DeployCommit, dirty tree) -----------------------------------------
    # The mock above replaced Get-DeployCommit; load the real one from deploy.ps1 under another name.
    $ast = [System.Management.Automation.Language.Parser]::ParseFile($DeployScriptPath, [ref]$null, [ref]$null)
    $realGuard = $ast.Find({ param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Get-DeployCommit' }, $true)
    . ([scriptblock]::Create(($realGuard.Extent.Text -replace '^function Get-DeployCommit', 'function Get-RealDeployCommit')))
    if ((Invoke-Git @('status', '--porcelain')).Output) {
        $guardOk = $false
        try { [void](Get-RealDeployCommit) } catch { $guardOk = $_.Exception.Message -like '*dirty*' }
        Assert-True $guardOk 'git guard refuses a dirty working tree without -AllowDirty'
    }

    # --- 1. Status -----------------------------------------------------------------------------
    Assert-True ((Invoke-TestMode 'Status') -eq 0) 'Status exit 0'

    # --- 2. Backup (manual) --------------------------------------------------------------------
    Assert-True ((Invoke-TestMode 'Backup') -eq 0) 'Backup exit 0'
    $manual = @(Get-LocalNames 'db_manual_*.dump')
    Assert-True ($manual.Count -eq 1 -and (Test-LocalDumpVerified (Get-Item -LiteralPath (Join-Path $LocalBackupRoot $manual[0])))) "manual dump pulled and verified locally ($manual)"
    Assert-True ((Get-StageCount) -eq 0) 'no remote staging directory left behind'
    Start-Sleep -Seconds 1

    # --- 3. PullBackups, first run (nightly with media) ----------------------------------------
    [void](Invoke-Server '/usr/local/bin/warehouse-nightly-backup.sh')
    Assert-True ((Invoke-TestMode 'PullBackups' -NonInteractiveRun) -eq 0) 'PullBackups #1 exit 0'
    Assert-True ((Get-LocalNames 'db_nightly_*.dump').Count -eq 1) 'nightly dump pulled'
    Assert-True ((Get-LocalNames '.env.soft-*').Count -ge 2) '.env backup and its .sha256 pulled'
    Assert-True ((Get-ChildItem -LiteralPath $LocalBackupRoot -Filter '*.part' -File).Count -eq 0) 'no .part file left'
    Test-MediaMirror 'PullBackups #1'
    Assert-True ((Get-StageCount) -eq 0) 'no remote staging directory left behind'

    # --- 4. PullBackups, second run (nothing new) ----------------------------------------------
    $before = @(Get-ChildItem -LiteralPath $LocalBackupRoot -Recurse -File | ForEach-Object { "$($_.FullName)|$($_.LastWriteTimeUtc.Ticks)" })
    Assert-True ((Invoke-TestMode 'PullBackups' -NonInteractiveRun) -eq 0) 'PullBackups #2 exit 0'
    $after = @(Get-ChildItem -LiteralPath $LocalBackupRoot -Recurse -File | ForEach-Object { "$($_.FullName)|$($_.LastWriteTimeUtc.Ticks)" })
    Assert-True (($before -join "`n") -ceq ($after -join "`n")) 'PullBackups #2 changed nothing locally'

    # --- 5. PullBackups, third run (media changed and added: incremental, old copy kept) -------
    $oldA = [System.IO.File]::ReadAllText((Join-Path $LocalBackupRoot 'media\a.txt'))
    Start-Sleep -Seconds 1
    [void](Invoke-Server @'
S=/var/www/warehouse/shared/media
printf 'first media file, edited on the server\n' > "$S/a.txt"
printf 'new file\n' > "$S/sub dir/new.txt"
printf 'c edited on the server\n' > "$S/c.txt"
chown -R warehouse:warehouse "$S"
/usr/local/bin/warehouse-nightly-backup.sh
'@)
    Assert-True ((Invoke-TestMode 'PullBackups' -NonInteractiveRun) -eq 0) 'PullBackups #3 exit 0'
    Test-MediaMirror 'PullBackups #3'
    Assert-True ([System.IO.File]::ReadAllText((Join-Path $LocalBackupRoot 'media\c.txt.part')) -ceq "c.part is user data`n") 'mirrored media file named c.txt.part survived the update of c.txt'
    Assert-True (@(Get-ChildItem -LiteralPath $LocalBackupRoot -Directory -Filter 'media_incoming_*').Count -eq 0) 'temporary media extraction directory removed'
    Assert-True (@(Invoke-Server 'cd /var/www/warehouse/shared/backups; ls -1 | grep -c "\.part$" || true')[0] -eq '0') 'nightly script left no .part dump on the server'
    $kept = @(Get-ChildItem -LiteralPath (Join-Path $LocalBackupRoot 'media') -Filter 'a.txt.~*~' -File)
    Assert-True ($kept.Count -eq 1 -and [System.IO.File]::ReadAllText($kept[0].FullName) -ceq $oldA) 'changed media file: previous local copy kept as a.txt.~<ts>~'
    Assert-True ((Get-LocalNames 'db_nightly_*.dump').Count -eq 2) 'second nightly dump pulled'

    # --- 6. PullBackups with a corrupted server dump (recorded hash differs) -------------------
    [void](Invoke-Server @'
B=/var/www/warehouse/shared/backups
head -c 4096 /dev/urandom > "$B/db_manual_20261001_000000.dump"
printf '%064d  %s\n' 0 "$B/db_manual_20261001_000000.dump" > "$B/db_manual_20261001_000000.dump.sha256"
'@)
    Assert-True ((Invoke-TestMode 'PullBackups' -NonInteractiveRun) -ne 0) 'PullBackups with a corrupted server dump exits non-zero'
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $LocalBackupRoot 'db_manual_20261001_000000.dump'))) 'corrupted dump was not stored locally'
    Assert-True ((Get-ChildItem -LiteralPath $LocalBackupRoot -Filter '*.part' -File).Count -eq 0) 'no .part file left after the mismatch'
    [void](Invoke-Server 'rm -f /var/www/warehouse/shared/backups/db_manual_20261001_000000.dump*')

    # --- 6b. PullBackups with an empty (incomplete) companion ----------------------------------
    [void](Invoke-Server @'
B=/var/www/warehouse/shared/backups
head -c 4096 /dev/urandom > "$B/db_manual_20261002_000000.dump"
: > "$B/db_manual_20261002_000000.dump.sha256"
'@)
    Assert-True ((Invoke-TestMode 'PullBackups' -NonInteractiveRun) -ne 0) 'PullBackups with an empty .sha256 exits non-zero'
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $LocalBackupRoot 'db_manual_20261002_000000.dump')) -and -not (Test-Path -LiteralPath (Join-Path $LocalBackupRoot 'db_manual_20261002_000000.dump.sha256'))) 'neither the dump nor the empty companion was stored'
    [void](Invoke-Server 'rm -f /var/www/warehouse/shared/backups/db_manual_20261002_000000.dump*')

    # --- 6c. unsafe local names --------------------------------------------------------------
    Assert-True (-not (Test-SafeRelativePath 'sub/NUL.txt') -and -not (Test-SafeRelativePath 'com1') -and (Test-SafeRelativePath 'sub/null.txt') -and (Test-SafeRelativePath 'console.log')) 'Windows device names are rejected, look-alikes accepted'

    # --- 7. PruneBackups ----------------------------------------------------------------------
    $nightlies = @(Get-LocalNames 'db_nightly_*.dump' | Sort-Object)
    $older = $nightlies[0]; $newest = $nightlies[-1]
    $olderPath = Join-Path $LocalBackupRoot $older
    $bytes = [System.IO.File]::ReadAllBytes($olderPath)
    $bytes[$bytes.Length - 1] = $bytes[$bytes.Length - 1] -bxor 0xFF          # same size, different content
    [System.IO.File]::WriteAllBytes($olderPath, $bytes)
    $script:ReadHostQueue.Enqueue('CONFIRM')
    Assert-True ((Invoke-TestMode 'PruneBackups') -eq 0) 'PruneBackups exit 0'
    $serverDumps = @(Invoke-Server 'cd /var/www/warehouse/shared/backups; ls -1 *.dump *.dump.sha256 2>/dev/null || true')
    Assert-True (-not ($serverDumps -contains $manual[0]) -and -not ($serverDumps -contains "$($manual[0]).sha256")) 'verified older dump and its .sha256 pruned on the server'
    Assert-True ($serverDumps -contains $older) 'dump whose local copy differs was NOT pruned'
    Assert-True ($serverDumps -contains $newest) 'newest dump kept on the server'
    Assert-True (Test-Path -LiteralPath (Join-Path $LocalBackupRoot $manual[0])) 'local copy of the pruned dump untouched'
    Assert-True ((Invoke-TestMode 'PruneBackups' -NonInteractiveRun) -ne 0) 'PruneBackups refused in -NonInteractive'

    # --- 8. Restore ---------------------------------------------------------------------------
    [void](Invoke-Server @'
su - postgres -c "psql -q -d warehouse_db -c \"INSERT INTO items (name) VALUES ('d'), ('e')\""
'@)
    Assert-True ((Get-ItemCount) -eq 5) 'database has 5 rows before restore'
    $serverList = Get-ServerDumpList
    # a: services refuse to stop -> restore must abort before touching the database
    [void](Invoke-Server 'touch /run/fake-systemd/STICKY')
    $script:ReadHostQueue.Enqueue([string]([array]::IndexOf($serverList, $newest) + 1))
    $script:ReadHostQueue.Enqueue('RESTORE')
    $code = Invoke-TestMode 'Restore'
    Assert-True ($code -ne 0) "Restore with services that do not stop exits non-zero ($code)"
    Assert-True ((Get-ItemCount) -eq 5) 'database untouched when services did not stop'
    Assert-True (@(Invoke-Server 'cat /run/fake-systemd/log') -contains 'start warehouse-backend') 'services started again after the failed stop'
    Assert-True ((Get-LocalNames 'db_pre_restore_*.dump').Count -eq 0) 'no pre_restore backup is taken while services are still running'
    [void](Invoke-Server 'rm -f /run/fake-systemd/STICKY; : > /run/fake-systemd/log')
    # a2: pre_restore backup fails -> services started again, database untouched
    [void](Invoke-Server 'chmod -x /usr/local/bin/warehouse-nightly-backup.sh')
    $script:ReadHostQueue.Enqueue([string]([array]::IndexOf($serverList, $newest) + 1))
    $script:ReadHostQueue.Enqueue('RESTORE')
    Assert-True ((Invoke-TestMode 'Restore') -ne 0) 'Restore whose pre_restore backup fails exits non-zero'
    $svcLog = @(Invoke-Server 'cat /run/fake-systemd/log; for s in warehouse-backend warehouse-gdrive-worker warehouse-export-worker; do systemctl is-active "$s"; done')
    Assert-True ((Get-ItemCount) -eq 5 -and ($svcLog -contains 'stop warehouse-backend') -and @($svcLog | Where-Object { $_ -eq 'active' }).Count -eq 3) 'database untouched and services running again'
    [void](Invoke-Server 'chmod +x /usr/local/bin/warehouse-nightly-backup.sh; : > /run/fake-systemd/log')
    # b: wrong confirmation -> nothing happens
    Start-Sleep -Seconds 1
    $serverList = Get-ServerDumpList
    $script:ReadHostQueue.Enqueue([string]([array]::IndexOf($serverList, $newest) + 1))
    $script:ReadHostQueue.Enqueue('restore')
    Assert-True ((Invoke-TestMode 'Restore') -eq 0) 'Restore cancelled on a wrong confirmation word'
    Assert-True ((Get-ItemCount) -eq 5 -and (Get-LocalNames 'db_pre_restore_*.dump').Count -eq 0 -and -not @(Invoke-Server 'cat /run/fake-systemd/log')) 'cancelled restore changed nothing and stopped nothing'
    # c: real restore of the newest nightly (3 rows)
    $script:ReadHostQueue.Enqueue([string]([array]::IndexOf($serverList, $newest) + 1))
    $script:ReadHostQueue.Enqueue('RESTORE')
    Assert-True ((Invoke-TestMode 'Restore') -eq 0) "Restore of $newest exit 0"
    Assert-True ((Get-ItemCount) -eq 3) 'database restored to the 3 rows of the nightly dump'
    $svcLog = @(Invoke-Server 'cat /run/fake-systemd/log')
    Assert-True ((($svcLog | Select-Object -First 3) -join ',') -eq 'stop warehouse-backend,stop warehouse-gdrive-worker,stop warehouse-export-worker' -and ($svcLog -contains 'start warehouse-backend')) 'services stopped before and started after the restore'
    $preRestore = @(Get-LocalNames 'db_pre_restore_*.dump')
    Assert-True ($preRestore.Count -eq 1) 'pre_restore backup pulled'
    $rows = @(Invoke-Server @"
su - postgres -c 'createdb pre_restore_check'
su - postgres -c 'pg_restore -d pre_restore_check' < /var/www/warehouse/shared/backups/$($preRestore[0])
su - postgres -c "psql -XAtq -d pre_restore_check -c 'SELECT count(*) FROM items'"
su - postgres -c 'dropdb pre_restore_check'
"@)
    Assert-True ($rows[0] -eq '5') "pre_restore backup holds every row written before the restore ($($rows[0]))"
    Assert-True ((Invoke-TestMode 'Restore' -NonInteractiveRun) -ne 0) 'Restore refused in -NonInteractive'

    # --- 9. SetSecret ---------------------------------------------------------------------------
    $SetSecret = 'OUTBOUND_HTTP_PROXY'
    $script:ReadHostQueue.Enqueue('http://proxy.test:3128')
    Assert-True ((Invoke-TestMode 'SetSecret') -eq 0) 'SetSecret exit 0'
    $env1 = Invoke-Server 'cat /var/www/warehouse/shared/.env; stat -c "%U:%G:%a" /var/www/warehouse/shared/.env /var/www/warehouse/shared/.env.bak.*'
    Assert-True (@($env1 | Where-Object { $_ -like 'OUTBOUND_HTTP_PROXY=*' }).Count -eq 1 -and ($env1 -contains 'OUTBOUND_HTTP_PROXY=http://proxy.test:3128')) 'value replaced exactly once'
    Assert-True (($env1 -contains 'DB_NAME=warehouse_db') -and ($env1 -contains 'DJANGO_SECRET_KEY=test-only')) 'other keys preserved'
    Assert-True (@($env1 | Where-Object { $_ -eq 'warehouse:warehouse:640' }).Count -eq 2) '.env and .env.bak keep owner and mode'
    $script:ReadHostQueue.Enqueue("bad'value")
    Assert-True ((Invoke-TestMode 'SetSecret') -ne 0) 'value with a quote rejected'
    $SetSecret = 'DJANGO_SECRET_KEY'
    Assert-True ((Invoke-TestMode 'SetSecret') -ne 0) 'key outside the allow-list rejected'
    $env2 = Invoke-Server 'cat /var/www/warehouse/shared/.env; ls /var/www/warehouse/shared/.env.bak.* | wc -l'
    Assert-True (($env2 -contains 'OUTBOUND_HTTP_PROXY=http://proxy.test:3128') -and $env2[-1] -eq '1') 'rejected calls changed nothing'
    $SetSecret = $null

    # --- 10. Update orchestration (fake warehouse-deploy) --------------------------------------
    $SkipBuild = $true
    $Maintenance = $true
    Assert-True ((Invoke-TestMode 'Update') -eq 0) 'Update exit 0'
    $deployLog = Invoke-Server 'cat /run/fake-deploy.log'
    $act = @($deployLog | Where-Object { $_ -like 'activate *' })
    Assert-True ($act.Count -eq 1 -and $act[0] -match "^activate \d{8}_\d{6}_$($Sha.Substring(0, 12)) --verified-backup db_pre_update_\d{8}_\d{6}\.dump --domain soft\.example\.test --maintenance$") "activate called once with release, verified backup and --maintenance ($($act[0]))"
    $pre = @(Get-LocalNames 'db_pre_update_*.dump')
    Assert-True ($pre.Count -eq 1 -and (Test-LocalDumpVerified (Get-Item -LiteralPath (Join-Path $LocalBackupRoot $pre[0])))) 'pre-update backup pulled and verified before activation'
    $rel = Invoke-Server 'cat /var/www/warehouse/current/RELEASE'
    Assert-True ($rel -contains "COMMIT=$Sha") 'activated release contains the bundled commit'
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $LocalDeployScratch "deploy_bundle_$Sha.tar.gz"))) 'local bundle removed after Update'
    Assert-True ((Get-StageCount) -eq 0) 'no remote staging directory left behind'
    $Maintenance = $false

    [void](Invoke-Server ': > /run/fake-deploy.log; touch /run/fake-deploy-omit-backup-marker')
    Assert-True ((Invoke-TestMode 'Update') -ne 0) 'Update without a [PRE_UPDATE_BACKUP] marker exits non-zero'
    Assert-True (@(Invoke-Server 'grep -c "^activate" /run/fake-deploy.log || true')[0] -eq '0') '... and never activates'

    [void](Invoke-Server ': > /run/fake-deploy.log; rm -f /run/fake-deploy-omit-backup-marker; touch /run/fake-deploy-wrong-hash')
    $preBefore = (Get-LocalNames 'db_pre_update_*.dump').Count
    Assert-True ((Invoke-TestMode 'Update') -ne 0) 'Update whose pre-update backup does not verify exits non-zero'
    Assert-True (@(Invoke-Server 'grep -c "^activate" /run/fake-deploy.log || true')[0] -eq '0') '... and never activates'
    Assert-True ((Get-LocalNames 'db_pre_update_*.dump').Count -eq $preBefore -and (Get-ChildItem -LiteralPath $LocalBackupRoot -Filter '*.part' -File).Count -eq 0) '... and stores nothing unverified locally'
    Assert-True ((Get-StageCount) -eq 0) 'no remote staging directory left behind'

    [void](Invoke-Server ': > /run/fake-deploy.log; rm -f /run/fake-deploy-wrong-hash; touch /run/fake-deploy-reuse-backup')
    Assert-True ((Invoke-TestMode 'Update') -ne 0) 'Update that reports an older (already pulled) pre-update backup exits non-zero'
    Assert-True (@(Invoke-Server 'grep -c "^activate" /run/fake-deploy.log || true')[0] -eq '0') '... and never activates'
} catch {
    Write-Host "[FAIL] test aborted: $($_.Exception.Message)`n$($_.ScriptStackTrace)" -ForegroundColor Red
    $script:failures++
} finally {
    if (-not $KeepContainer) { [void](Invoke-Process -FilePath $DockerExe -ArgumentList @('rm', '-f', $container) -Capture -Quiet) }
    foreach ($n in 'FAKE_SSH_FP', 'FAKE_SSH_DOCKER', 'FAKE_SSH_DOCKER_EXE') { Remove-Item "Env:$n" -ErrorAction SilentlyContinue }
}

Write-Host "[RESULT] failures=$($script:failures)"
exit $(if ($script:failures -eq 0) { 0 } else { 1 })
