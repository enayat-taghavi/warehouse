#Requires -Version 7.4
# Onboarding test for deploy.ps1 (no Docker, no server). Never shipped.
# Covers the interactive configuration questions and host-key pinning against the console fingerprint.
# The real ssh-keygen edits a throwaway known_hosts in scratch/deploy_tests/onboarding; Read-Host and the
# network key scan (Get-ServerHostKey) are mocked.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\..\deploy.ps1')

$TestRoot = Join-Path $ScriptRoot 'scratch\deploy_tests\onboarding'
if (Test-Path -LiteralPath $TestRoot) { Remove-SafeDirectoryRecursively $TestRoot }
[void][System.IO.Directory]::CreateDirectory($TestRoot)
$KnownHostsFile = Join-Path $TestRoot 'known_hosts'
$ConfigFile = Join-Path $TestRoot 'config.json'

$script:failures = 0
function Assert-True([bool]$Condition, [string]$Text) {
    if ($Condition) { Write-Host "[PASS] $Text" -ForegroundColor Green } else { Write-Host "[FAIL] $Text" -ForegroundColor Red; $script:failures++ }
}

$script:ReadHostQueue = [System.Collections.Generic.Queue[string]]::new()
$script:ReadHostPrompts = [System.Collections.Generic.List[string]]::new()
function Read-Host {
    param([string]$Prompt, [switch]$MaskInput)
    $script:ReadHostPrompts.Add($Prompt)
    if ($script:ReadHostQueue.Count -eq 0) { throw "Unexpected Read-Host: $Prompt" }
    $answer = $script:ReadHostQueue.Dequeue()
    Write-Host "[MOCK Read-Host] $Prompt -> $answer" -ForegroundColor Magenta
    return $answer
}
function Wait-Console { param([string]$PromptMessage) }
$script:OfferedKey = $null
$script:ScanCount = 0
function Get-ServerHostKey([string]$ServerHost, [int]$Port) { $script:ScanCount++; return $script:OfferedKey }
function Reset-Mocks { $script:ReadHostQueue.Clear(); $script:ReadHostPrompts.Clear(); $script:ScanCount = 0 }
function Get-RawConfig { return (Get-Content -LiteralPath $ConfigFile -Raw -Encoding utf8 | ConvertFrom-Json) }
function Get-BakCount { return @(Get-ChildItem -LiteralPath $TestRoot -Filter 'config.json.bak-*' -File).Count }

# Two real ED25519 host keys ("old server" and "reinstalled server"), fingerprints from ssh-keygen itself.
function New-HostKey([string]$Name) {
    $path = Join-Path $TestRoot $Name
    $r = Invoke-Process -FilePath $SshKeygenExe -ArgumentList @('-q', '-t', 'ed25519', '-N', '', '-C', '', '-f', $path) -Capture -Quiet
    if ($r.ExitCode -ne 0) { throw 'ssh-keygen failed.' }
    $b64 = ([System.IO.File]::ReadAllText("$path.pub")).Trim().Split(' ')[1]
    $l = Invoke-Process -FilePath $SshKeygenExe -ArgumentList @('-l', '-f', "$path.pub") -Capture -Quiet
    $fp = if (($l.Output -join ' ') -match '(SHA256:[A-Za-z0-9+/]{43})') { $Matches[1] } else { throw 'ssh-keygen -l failed.' }
    return [pscustomobject]@{ Key = $b64; Fp = $fp; ConsoleLine = "256 $fp root@iran (ED25519)" }
}
$old = New-HostKey 'old_host'
$new = New-HostKey 'new_host'
$other = New-HostKey 'other_host'

try {
    # --- 1. fingerprint arithmetic --------------------------------------------------------------
    Assert-True ((Get-SshKeyFingerprint $new.Key) -ceq $new.Fp) "Get-SshKeyFingerprint equals ssh-keygen -l ($($new.Fp))"

    # --- 2. Update-PinnedHostKey: match replaces only this host's entries ------------------------
    $khStart = "203.0.113.7 ssh-ed25519 $($old.Key)`nother.test ssh-ed25519 $($other.Key)"   # no trailing newline
    [System.IO.File]::WriteAllText($KnownHostsFile, $khStart)
    Reset-Mocks
    $script:OfferedKey = $new.Key
    $script:ReadHostQueue.Enqueue($new.ConsoleLine)
    $fp = Update-PinnedHostKey -ServerHost '203.0.113.7' -Port 22 -PinnedFingerprint $old.Fp
    $lines = @([System.IO.File]::ReadAllLines($KnownHostsFile) | Where-Object { $_ })
    Assert-True ($fp -ceq $new.Fp) 'Update-PinnedHostKey returns the console fingerprint when the network key matches'
    Assert-True ($lines.Count -eq 2 -and $lines -contains "203.0.113.7 ssh-ed25519 $($new.Key)" -and $lines -contains "other.test ssh-ed25519 $($other.Key)") "... the old entry is replaced, other hosts are kept ($($lines.Count) lines)"
    Assert-True (Test-Path -LiteralPath "$KnownHostsFile.old") '... ssh-keygen kept known_hosts.old'
    Assert-True ($null -eq (Get-PinnedHostKeyProblem '203.0.113.7' $new.Fp)) '... and the host now verifies against the new fingerprint'

    # --- 3. mismatch and garbage change nothing --------------------------------------------------
    $before = [System.IO.File]::ReadAllText($KnownHostsFile)
    Reset-Mocks
    $script:OfferedKey = $other.Key            # someone in the middle offers another key
    $script:ReadHostQueue.Enqueue($old.ConsoleLine)
    $err = $null
    try { [void](Update-PinnedHostKey -ServerHost '203.0.113.7' -Port 22) } catch { $err = $_.Exception.Message }
    Assert-True ($err -like 'SECURITY:*' -and [System.IO.File]::ReadAllText($KnownHostsFile) -ceq $before) 'a network key that differs from the console fingerprint is refused and known_hosts is unchanged'
    Reset-Mocks
    $script:ReadHostQueue.Enqueue('I do not know')
    $err = $null
    try { [void](Update-PinnedHostKey -ServerHost '203.0.113.7' -Port 22) } catch { $err = $_.Exception.Message }
    Assert-True ($err -like 'No SHA256*' -and $script:ScanCount -eq 0 -and [System.IO.File]::ReadAllText($KnownHostsFile) -ceq $before) 'input without a fingerprint is refused before any scan'

    # --- 4. Assert-PinnedHostKey after a server reinstall: re-pins and records it ------------------
    [System.IO.File]::WriteAllText($KnownHostsFile, "203.0.113.7 ssh-ed25519 $($old.Key)`n")
    Write-Utf8LfFile $ConfigFile (([ordered]@{
                ServerHost = '203.0.113.7'; SshPort = 22; SshUser = 'cloud-admin'; Domain = 'soft.example.org'
                AdminEmail = 'ops@farsalish.ir'; DbName = 'warehouse_db'; DbUser = 'enayat'; HostKeyFingerprint = $old.Fp
            } | ConvertTo-Json) + "`n")
    $cfg = Get-DeployConfig
    Reset-Mocks
    $script:OfferedKey = $new.Key
    $script:ReadHostQueue.Enqueue($new.Fp)
    Assert-PinnedHostKey $cfg   # known_hosts and config agree on the OLD key: no prompt
    Assert-True ($script:ReadHostPrompts.Count -eq 0) 'a matching pin is accepted without any question'
    $script:ReadHostQueue.Clear()
    $raw = Get-RawConfig
    $raw.HostKeyFingerprint = $new.Fp           # config already updated, known_hosts still old
    Write-Utf8LfFile $ConfigFile (($raw | ConvertTo-Json) + "`n")
    $cfg = Get-DeployConfig
    Reset-Mocks
    $script:NonInteractive = $true
    $err = $null
    try { Assert-PinnedHostKey $cfg } catch { $err = $_.Exception.Message }
    $script:NonInteractive = $false
    Assert-True ($err -like 'SECURITY: known_hosts entry*' -and $script:ReadHostPrompts.Count -eq 0) '-NonInteractive still refuses a mismatching known_hosts without asking'
    $raw.HostKeyFingerprint = $old.Fp
    Write-Utf8LfFile $ConfigFile (($raw | ConvertTo-Json) + "`n")
    $cfg = Get-DeployConfig
    $bak = Get-BakCount
    [System.IO.File]::WriteAllText($KnownHostsFile, "203.0.113.7 ssh-ed25519 $($new.Key)`n")   # user accepted the new key in plain ssh
    Reset-Mocks
    $script:OfferedKey = $new.Key
    $script:ReadHostQueue.Enqueue($new.ConsoleLine)
    Assert-PinnedHostKey $cfg
    $raw = Get-RawConfig
    Assert-True ($cfg.HostKeyFingerprint -ceq $new.Fp -and $raw.HostKeyFingerprint -ceq $new.Fp) 'after a reinstall the console fingerprint is pinned in memory and in the configuration'
    Assert-True ($raw.DbUser -eq 'enayat' -and $raw.SshUser -eq 'cloud-admin' -and (Get-BakCount) -eq $bak + 1) '... other keys are untouched and a .bak copy was kept'

    # --- 5. non-default port uses the [host]:port form ----------------------------------------------
    Reset-Mocks
    $script:OfferedKey = $other.Key
    $script:ReadHostQueue.Enqueue($other.Fp)
    [void](Update-PinnedHostKey -ServerHost '203.0.113.7' -Port 2222)
    Assert-True ($null -eq (Get-PinnedHostKeyProblem '[203.0.113.7]:2222' $other.Fp) -and $null -eq (Get-PinnedHostKeyProblem '203.0.113.7' $new.Fp)) 'port 2222 is pinned as [host]:2222 next to the port-22 entry'

    # --- 6. no configuration file: every value is asked, the host key is pinned, the file is created --
    Remove-Item -LiteralPath $ConfigFile
    Get-ChildItem -LiteralPath $TestRoot -Filter 'config.json.bak-*' -File | Remove-Item
    [System.IO.File]::WriteAllText($KnownHostsFile, '')
    Reset-Mocks
    $script:OfferedKey = $new.Key
    # ServerHost, SshUser, Domain, AllowedHosts (Enter = the domain), then the console fingerprint; SshPort defaults to 22.
    foreach ($a in @('203.0.113.7', 'cloud-admin', 'Soft.Example.Org', '', $new.ConsoleLine)) { $script:ReadHostQueue.Enqueue($a) }
    $cfg = Get-DeployConfig
    $raw = Get-RawConfig
    Assert-True ($cfg.ServerHost -eq '203.0.113.7' -and $cfg.SshUser -eq 'cloud-admin' -and $cfg.SshPort -eq 22 -and $cfg.Domain -ceq 'soft.example.org' -and $cfg.AllowedHosts -eq 'soft.example.org') 'a missing configuration is built from the answers (defaults: port 22, AllowedHosts = domain; domain lower-cased)'
    Assert-True ($raw.HostKeyFingerprint -ceq $new.Fp -and $null -eq (Get-PinnedHostKeyProblem '203.0.113.7' $new.Fp)) '... the host key is pinned from the console reading and recorded'
    Assert-True ($null -eq $raw.PSObject.Properties['AdminEmail'] -and $script:ReadHostQueue.Count -eq 0) '... Setup-only keys are not asked outside Setup'

    # --- 7. Setup asks only for its missing keys --------------------------------------------------
    Reset-Mocks
    foreach ($a in @('ops@farsalish.ir', '', '')) { $script:ReadHostQueue.Enqueue($a) }
    $cfg = Get-DeployConfig -ForSetup
    $raw = Get-RawConfig
    Assert-True ($script:ReadHostPrompts.Count -eq 3 -and $raw.AdminEmail -eq 'ops@farsalish.ir' -and $raw.DbName -eq 'warehouse_db' -and $raw.DbUser -eq 'warehouse') "Setup asks only AdminEmail, DbName and DbUser (defaults taken) ($($script:ReadHostPrompts.Count) questions)"
    Reset-Mocks
    [void](Get-DeployConfig -ForSetup)
    Assert-True ($script:ReadHostPrompts.Count -eq 0) '... and nothing once the configuration is complete'

    # --- 8. invalid values are asked again; -NonInteractive refuses them ----------------------------
    $raw.SshUser = 'Bad User'
    Write-Utf8LfFile $ConfigFile (($raw | ConvertTo-Json) + "`n")
    Reset-Mocks
    $script:NonInteractive = $true
    $err = $null
    try { [void](Get-DeployConfig) } catch { $err = $_.Exception.Message }
    $script:NonInteractive = $false
    Assert-True ($err -like 'Invalid deployment configuration*SshUser must match*' -and $script:ReadHostPrompts.Count -eq 0) '-NonInteractive refuses an invalid value without asking'
    Reset-Mocks
    foreach ($a in @('Still Bad', 'cloud-admin')) { $script:ReadHostQueue.Enqueue($a) }
    $cfg = Get-DeployConfig
    Assert-True ($cfg.SshUser -eq 'cloud-admin' -and (Get-RawConfig).SshUser -eq 'cloud-admin') 'an invalid value is asked again until it is valid, then saved'

    # --- 9. NonInteractive without a configuration file ----------------------------------------------
    Remove-Item -LiteralPath $ConfigFile
    $script:NonInteractive = $true
    $err = $null
    try { [void](Get-DeployConfig) } catch { $err = $_.Exception.Message }
    $script:NonInteractive = $false
    Assert-True ($err -like 'Configuration file not found*' -and -not (Test-Path -LiteralPath $ConfigFile)) '-NonInteractive does not create a configuration'
} catch {
    Write-Host "[FAIL] test aborted: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host $_.ScriptStackTrace
    $script:failures++
} finally {
    Remove-SafeDirectoryRecursively $TestRoot
}

Write-Host "`nFailures: $script:failures"
exit $(if ($script:failures -eq 0) { 0 } else { 1 })
