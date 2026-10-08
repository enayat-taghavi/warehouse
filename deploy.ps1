#Requires -Version 7.4
<#
.SYNOPSIS
    Hardened deployment and operations script for the Warehouse project.
    Target server: Ubuntu 22.04 / 24.04 LTS (systemd + Daphne + Nginx + PostgreSQL).
    Language: strictly ASCII / English to prevent encoding corruption.

.DESCRIPTION
    Isolated frontend build from a git commit, whitelisted release bundle, host key pinning,
    two-phase update with a verified off-server pre-update backup, verified backup pull,
    restore drill, and server operations. All remote privileged work goes through one seam
    (Invoke-RemoteRootScript); all process I/O goes through one primitive (Invoke-Process).

.EXAMPLE
    .\deploy.ps1                      # Interactive menu
    .\deploy.ps1 -Update              # Build, bundle, prepare, pull pre-update backup, activate
    .\deploy.ps1 -AddModule warehouse # Add the warehouse module (verified backup first)
    .\deploy.ps1 -PullBackups -NonInteractive
    .\deploy.ps1 -Help
#>
[Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSAvoidUsingWriteHost', '', Justification = 'Interactive operator console script; all user-facing output is written to the host on purpose.')]
[Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSUseShouldProcessForStateChangingFunctions', '', Justification = 'Destructive operations are guarded by explicit typed confirmations instead of ShouldProcess.')]
[Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSReviewUnusedParameter', '', Justification = 'Script parameters are read inside the mode functions through script scope.')]
[CmdletBinding()]
param(
    [switch]$Setup,
    [switch]$Update,
    [switch]$Backup,
    [switch]$PullBackups,
    [switch]$PruneBackups,
    [switch]$Restore,
    [switch]$RestoreDrill,
    [switch]$Rollback,
    [switch]$GoLive,
    [switch]$CreateAdmin,
    [string]$SetSecret,
    [switch]$InstallKey,
    [switch]$RegisterPullTask,
    [switch]$Logs,
    [switch]$Restart,
    [switch]$IssueCert,
    [switch]$InstallCert,
    [string]$CertFile,
    [string]$KeyFile,
    [string]$ChainFile,
    [switch]$Status,
    [string]$AddModule,
    [switch]$ResetServer,
    [string]$ChangeDomain,
    [switch]$FinishDomainChange,
    [string]$RemoveLegacyDomain,
    [Alias('Help')]
    [switch]$ShowHelp,
    [switch]$NonInteractive,
    [switch]$SkipBuild,
    [switch]$AllowDirty,
    [switch]$Maintenance,
    [switch]$Force,
    [string]$ConfigFile = 'deploy_config.json'
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false

# ==============================================================================
# Constants and deterministic tool paths
# ==============================================================================
$ScriptRoot = $PSScriptRoot
$DeployScriptPath = $PSCommandPath
$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)

$LocalBackupRoot = Join-Path $ScriptRoot 'backups\soft'
$LocalDeployScratch = Join-Path $ScriptRoot 'scratch\deploy'
$FrontDistRelative = 'dist\warehouse-app\browser'

$RemoteBackupDir = '/var/www/warehouse/shared/backups'
$RemoteGoLiveFlag = '/var/www/warehouse/shared/GO_LIVE'

$PullTaskPath = '\Warehouse\'
$PullTaskName = 'WarehouseSoftPullBackups'
$SecretKeyAllowList = @('GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'OUTBOUND_HTTP_PROXY', 'CLOUDFLARE_DNS_API_TOKEN')
# Installable modules in catalog order (platform_core/module_catalog.py); WH_MODULES on the server.
$KnownModules = @('warehouse', 'accounting')
$AllModules = $KnownModules -join ','
# Certificate modes: http01 (webroot), dns01-cloudflare, cloudflare-origin, custom.
$KnownCertModes = @('http01', 'dns01-cloudflare', 'cloudflare-origin', 'custom')
$DefaultCertMode = 'http01'

function Find-Application([string]$Name) {
    $cmd = Get-Command $Name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($cmd) { return $cmd.Source }
    return $null
}

# pwsh launched from Git Bash resolves tar/ssh from Git\usr\bin (GNU tar treats "C:" as a remote host),
# so every tool path is fixed here. Script-scope variables let tests substitute fakes after dot-sourcing.
$TarExe = Join-Path $env:SystemRoot 'System32\tar.exe'
$WindowsOpenSsh = Join-Path $env:SystemRoot 'System32\OpenSSH'
if (Test-Path -LiteralPath (Join-Path $WindowsOpenSsh 'ssh.exe')) {
    $SshExe = Join-Path $WindowsOpenSsh 'ssh.exe'
    $SshKeygenExe = Join-Path $WindowsOpenSsh 'ssh-keygen.exe'
} else {
    $SshExe = Find-Application 'ssh.exe'
    $SshKeygenExe = Find-Application 'ssh-keygen.exe'
}
$GitExe = Find-Application 'git.exe'
$NpmCmd = Find-Application 'npm.cmd'
$DockerExe = Find-Application 'docker.exe'

# ==============================================================================
# Console helpers
# ==============================================================================
function Write-Step([string]$Message) { Write-Host "`n[STEP] $Message" -ForegroundColor Cyan }
function Write-Success([string]$Message) { Write-Host "[SUCCESS] $Message" -ForegroundColor Green }
function Write-Info([string]$Message) { Write-Host "[INFO] $Message" -ForegroundColor White }
function Write-Warn([string]$Message) { Write-Host "[WARNING] $Message" -ForegroundColor Yellow }
function Write-Err([string]$Message) { Write-Host "[ERROR] $Message" -ForegroundColor Red }

function Wait-Console([string]$PromptMessage = 'Press Enter to continue...') {
    if ($NonInteractive) { return }
    Write-Host "`n$PromptMessage" -ForegroundColor DarkGray
    try { [void][System.Console]::ReadLine() } catch { Write-Verbose "Console read skipped: $_" }
}

function Confirm-TypedWord([string]$Word, [string]$Prompt) {
    if ($NonInteractive) {
        throw "This operation requires the typed confirmation '$Word' and is refused in -NonInteractive mode."
    }
    $answer = Read-Host -Prompt $Prompt
    return (([string]$answer).Trim() -ceq $Word)
}

function Assert-Interactive([string]$ModeName) {
    if ($NonInteractive) { throw "$ModeName is refused in -NonInteractive mode (it needs an operator at the console)." }
}

function ConvertTo-ShellLiteral([string]$Value) {
    return "'" + $Value.Replace("'", "'\''") + "'"
}

function ConvertTo-ExitCode {
    param([AllowNull()][object]$Value)
    if ($Value -is [int] -and $Value -ge 0 -and $Value -le 255) { return $Value }
    $kind = if ($null -eq $Value) { 'nothing' } else { $Value.GetType().Name }
    Write-Err "Internal error: the mode returned '$kind' instead of a single exit code; treating as failure."
    return 1
}

function Get-FileSha256([string]$Path) {
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Write-Utf8LfFile([string]$Path, [string]$Content) {
    [System.IO.File]::WriteAllText($Path, $Content.Replace("`r", ''), $Utf8NoBom)
}

function Get-BackupTimestamp([string]$Name) {
    if ($Name -match '_(\d{8})_(\d{6})') {
        $parsed = [datetime]::MinValue
        if ([datetime]::TryParseExact($Matches[1] + $Matches[2], 'yyyyMMddHHmmss', [cultureinfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::None, [ref]$parsed)) {
            return $parsed
        }
    }
    return $null
}

# ==============================================================================
# Process primitive (the only place that starts external processes, apart from junction helpers)
# ==============================================================================
function Invoke-Process {
    <#
      -Inherit    : no redirection; the console is inherited (prompts, TTY sessions, builds).
      -StdinText  : UTF-8 bytes (CR removed by callers) written to stdin; -StdinFile streams a file.
      -StdoutFile : binary stdout written to a NEW file (FileMode.CreateNew).
      -Capture    : stdout decoded as UTF-8, shown line by line and returned; -Quiet hides it.
      -Raw        : the whole stdout returned as one string (for NUL-separated listings).
      Returns exactly one object: { ExitCode, Output, StdErr }.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$FilePath,
        [string[]]$ArgumentList = @(),
        [string]$WorkingDirectory,
        [switch]$Inherit,
        [string]$StdinText,
        [string]$StdinFile,
        [string]$StdoutFile,
        [switch]$Capture,
        [switch]$Raw,
        [switch]$Quiet
    )
    $psi = [System.Diagnostics.ProcessStartInfo]::new($FilePath)
    foreach ($a in $ArgumentList) { $psi.ArgumentList.Add($a) }
    $psi.UseShellExecute = $false
    if ($WorkingDirectory) { $psi.WorkingDirectory = $WorkingDirectory }

    if ($Inherit) {
        $proc = [System.Diagnostics.Process]::Start($psi)
        try {
            $proc.WaitForExit()
            return [pscustomobject]@{ ExitCode = $proc.ExitCode; Output = @(); StdErr = '' }
        } finally {
            $proc.Dispose()
        }
    }

    $psi.RedirectStandardInput = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.StandardInputEncoding = $Utf8NoBom
    $psi.StandardOutputEncoding = $Utf8NoBom
    $psi.StandardErrorEncoding = $Utf8NoBom

    $inStream = $null
    $outFile = $null
    $proc = $null
    $lines = [System.Collections.Generic.List[string]]::new()
    try {
        if ($StdinFile) {
            $inStream = [System.IO.File]::OpenRead($StdinFile)
        } elseif ($StdinText) {
            $inStream = [System.IO.MemoryStream]::new($Utf8NoBom.GetBytes($StdinText))
        }
        if ($StdoutFile) {
            $outFile = [System.IO.FileStream]::new($StdoutFile, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
        }

        $proc = [System.Diagnostics.Process]::Start($psi)
        $errTask = $proc.StandardError.ReadToEndAsync()
        $writeTask = $null
        if ($inStream) {
            $writeTask = $inStream.CopyToAsync($proc.StandardInput.BaseStream)
        } else {
            $proc.StandardInput.Close()
        }

        $readTask = $null
        $outTask = $null
        if ($outFile) {
            $outTask = $proc.StandardOutput.BaseStream.CopyToAsync($outFile)
        } elseif ($Raw) {
            $outTask = $proc.StandardOutput.ReadToEndAsync()
        } else {
            $readTask = $proc.StandardOutput.ReadLineAsync()
        }

        # Single-threaded pump: stdin is written and closed while stdout is drained, so neither pipe can deadlock.
        while ($true) {
            $waitList = [System.Collections.Generic.List[System.Threading.Tasks.Task]]::new()
            if ($writeTask) { $waitList.Add($writeTask) }
            if ($readTask) { $waitList.Add($readTask) }
            elseif ($outTask -and -not $outTask.IsCompleted) { $waitList.Add($outTask) }
            if ($waitList.Count -eq 0) { break }
            [void][System.Threading.Tasks.Task]::WaitAny($waitList.ToArray())

            if ($writeTask -and $writeTask.IsCompleted) {
                if ($writeTask.IsFaulted) {
                    Write-Verbose "stdin write ended early: $($writeTask.Exception.GetBaseException().Message)"
                }
                try { $proc.StandardInput.Close() } catch { Write-Verbose "stdin close: $($_.Exception.Message)" }
                $writeTask = $null
            }
            if ($readTask -and $readTask.IsCompleted) {
                $line = $readTask.GetAwaiter().GetResult()
                if ($null -eq $line) {
                    $readTask = $null
                } else {
                    if ($Capture) { $lines.Add($line) }
                    if (-not $Quiet) { Write-Host $line }
                    $readTask = $proc.StandardOutput.ReadLineAsync()
                }
            }
        }

        $proc.WaitForExit()
        $rawText = $null
        if ($outTask) {
            if ($Raw) { $rawText = $outTask.GetAwaiter().GetResult() } else { $outTask.GetAwaiter().GetResult() }
        }
        if ($outFile) {
            $outFile.Flush($true)
            $outFile.Dispose()
            $outFile = $null
        }
        $errText = $errTask.GetAwaiter().GetResult()
        if ($errText -and $errText.Trim()) {
            Write-Host ($errText.TrimEnd()) -ForegroundColor DarkYellow
        }
        $output = if ($Raw) { [string]$rawText } else { $lines.ToArray() }
        return [pscustomobject]@{ ExitCode = $proc.ExitCode; Output = $output; StdErr = [string]$errText }
    } finally {
        if ($outFile) { $outFile.Dispose() }
        if ($inStream) { $inStream.Dispose() }
        if ($proc) { $proc.Dispose() }
    }
}

function Invoke-Native {
    # Local command with the console inherited; output never enters the pipeline. Returns [int].
    param([Parameter(Mandatory)][string]$FilePath, [string[]]$ArgumentList = @(), [string]$WorkingDirectory)
    $p = @{ FilePath = $FilePath; ArgumentList = $ArgumentList; Inherit = $true }
    if ($WorkingDirectory) { $p.WorkingDirectory = $WorkingDirectory }
    return (Invoke-Process @p).ExitCode
}

function Invoke-Git {
    param([Parameter(Mandatory)][string[]]$ArgumentList)
    return (Invoke-Process -FilePath $GitExe -ArgumentList (@('-C', $ScriptRoot) + $ArgumentList) -Raw -Quiet)
}

function Test-LocalTool([string[]]$Name) {
    $map = @{ ssh = $SshExe; 'ssh-keygen' = $SshKeygenExe; git = $GitExe; tar = $TarExe; npm = $NpmCmd; docker = $DockerExe }
    foreach ($n in $Name) {
        $path = $map[$n]
        if (-not $path -or -not (Test-Path -LiteralPath $path -PathType Leaf)) {
            throw "Required local tool not found: $n"
        }
    }
}

# ==============================================================================
# Safe junction and directory helpers (protect node_modules from recursive deletion)
# ==============================================================================
function New-SafeJunction([string]$LinkPath, [string]$TargetPath) {
    if (Test-Path -LiteralPath $LinkPath) { Remove-SafeJunction $LinkPath }
    Write-Info "Creating NTFS junction: $LinkPath -> $TargetPath"
    $cmdOutput = & cmd.exe /d /c mklink /J $LinkPath $TargetPath 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Failed to create junction ($LinkPath -> $TargetPath): $cmdOutput" }
}

function Remove-SafeJunction([string]$LinkPath) {
    if (-not (Test-Path -LiteralPath $LinkPath)) { return }
    $item = Get-Item -LiteralPath $LinkPath -Force
    if (-not $item.Attributes.HasFlag([System.IO.FileAttributes]::ReparsePoint)) {
        throw "Safety violation: $LinkPath is not a junction (reparse point). Refusing to delete."
    }
    Write-Info "Removing NTFS junction safely via rmdir: $LinkPath"
    $cmdOutput = & cmd.exe /d /c rmdir $LinkPath 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Failed to remove junction safely ($LinkPath): $cmdOutput" }
}

function Assert-NoReparsePoint([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return }
    $reparseItems = @(Get-ChildItem -LiteralPath $Path -Recurse -Force |
        Where-Object { $_.Attributes.HasFlag([System.IO.FileAttributes]::ReparsePoint) })
    if ($reparseItems.Count -gt 0) {
        throw "Safety violation: reparse point(s) inside $Path; refusing to delete: $(($reparseItems.FullName) -join '; ')"
    }
}

function Remove-SafeDirectoryRecursively([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return }
    Assert-NoReparsePoint $Path
    Remove-Item -LiteralPath $Path -Recurse -Force
}

# ==============================================================================
# Configuration, host key pinning and SSH
# ==============================================================================
function ConvertTo-CanonicalModuleList([string]$Value) {
    # Catalog order, no duplicates; $null for an empty list or an unknown module (same rules as the server).
    $text = ([string]$Value).Trim() -replace '\s*,\s*', ','
    if ($text -cnotmatch '^[a-z]+(,[a-z]+)*$') { return $null }
    $parts = @($text.Split(','))
    if (@($parts | Where-Object { $_ -notin $KnownModules }).Count -gt 0) { return $null }
    return (@($KnownModules | Where-Object { $_ -in $parts }) -join ',')
}

function Assert-DeployConfig {
    param([Parameter(Mandatory)]$RawConfig, [string]$SourcePath, [switch]$ForSetup)
    $hostRegex = '^(?=.{1,253}$)[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$'
    $domainRegex = '^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
    $problems = [System.Collections.Generic.List[string]]::new()

    $serverHost = ([string]$RawConfig.ServerHost).Trim()
    $ip = $null
    if (-not ($serverHost -match $hostRegex -or [System.Net.IPAddress]::TryParse($serverHost, [ref]$ip))) { $problems.Add('ServerHost must be a hostname or an IP address') }

    $sshUser = ([string]$RawConfig.SshUser).Trim()
    if ($sshUser -notmatch '^[a-z_][a-z0-9_-]{0,31}$') { $problems.Add('SshUser must match ^[a-z_][a-z0-9_-]{0,31}$') }

    $portText = [string]$RawConfig.SshPort
    if (-not $portText) { $portText = '22' }
    $port = 0
    if (-not [int]::TryParse($portText, [ref]$port) -or $port -lt 1 -or $port -gt 65535) { $problems.Add('SshPort must be between 1 and 65535') }

    $domain = ([string]$RawConfig.Domain).Trim()
    if ($domain -cnotmatch $domainRegex) { $problems.Add('Domain must be a lower-case hostname') }

    $fingerprint = ([string]$RawConfig.HostKeyFingerprint).Trim()
    if ($fingerprint -cnotmatch '^SHA256:[A-Za-z0-9+/]{43}$') { $problems.Add('HostKeyFingerprint is required and must match ^SHA256:[A-Za-z0-9+/]{43}$') }

    $dbName = ([string]$RawConfig.DbName).Trim()
    $dbUser = ([string]$RawConfig.DbUser).Trim()
    foreach ($pair in @(@('DbName', $dbName), @('DbUser', $dbUser))) {
        if ($pair[1] -and $pair[1] -cnotmatch '^[a-z_][a-z0-9_]{0,62}$') { $problems.Add("$($pair[0]) must match ^[a-z_][a-z0-9_]{0,62}$") }
    }

    $allowedHosts = ([string]$RawConfig.AllowedHosts).Trim() -replace '\s*,\s*', ','
    if (-not $allowedHosts) { $allowedHosts = $domain }
    if ($allowedHosts -notmatch '^[A-Za-z0-9.,*-]+$') { $problems.Add('AllowedHosts must match ^[A-Za-z0-9.,*-]+$') }

    $modulesSet = $null -ne $RawConfig.PSObject.Properties['Modules']
    $modules = if ($modulesSet) { ConvertTo-CanonicalModuleList ([string]$RawConfig.Modules) } else { $AllModules }
    if (-not $modules) { $problems.Add("Modules must list known modules separated by commas ($($KnownModules -join ', '))") }

    $certModeSet = $null -ne $RawConfig.PSObject.Properties['CertMode']
    $certMode = if ($certModeSet) { ([string]$RawConfig.CertMode).Trim().ToLowerInvariant() } else { $DefaultCertMode }
    if ($certMode -notin $KnownCertModes) { $problems.Add("CertMode must be one of: $($KnownCertModes -join ', ')") }

    $adminEmail = ([string]$RawConfig.AdminEmail).Trim()
    if ($ForSetup) {
        if ($adminEmail -notmatch '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$') { $problems.Add('AdminEmail must be a valid e-mail address (required for Setup)') }
        elseif ($adminEmail -match '@example\.com$') { $problems.Add('AdminEmail must not be an @example.com address (Let''s Encrypt rejects it)') }
        if (-not $dbName) { $problems.Add('DbName is required for Setup') }
        if (-not $dbUser) { $problems.Add('DbUser is required for Setup') }
    }

    if ($problems.Count -gt 0) {
        throw "Invalid deployment configuration ($SourcePath): $($problems -join '; ')."
    }
    return [pscustomobject]@{
        ServerHost = $serverHost; SshUser = $sshUser; SshPort = $port; Domain = $domain
        HostKeyFingerprint = $fingerprint; DbName = $dbName; DbUser = $dbUser
        AllowedHosts = $allowedHosts; AdminEmail = $adminEmail; SourcePath = $SourcePath
        Modules = $modules; ModulesSet = $modulesSet
        CertMode = $certMode; CertModeSet = $certModeSet
    }
}

function Get-ServerModuleList($Config) {
    # Installed modules of the server; $null when its root tooling predates modules (unknown subcommand),
    # which only happens on servers set up before WH_MODULES existed, where every module is installed.
    $r = Invoke-RemoteRootScript -Config $Config -Gateway 'modules' -Capture -Quiet
    $found = @($r.Output | ForEach-Object { if ($_ -match '^\[MODULES\] ([a-z,]+)$') { $Matches[1] } })
    if ($r.ExitCode -eq 0 -and $found.Count -eq 1 -and (ConvertTo-CanonicalModuleList $found[0]) -ceq $found[0]) { return $found[0] }
    if ($r.ExitCode -eq 2 -and $found.Count -eq 0 -and $r.StdErr -like '*unrecognized subcommand*') { return $null }
    throw "Could not read the installed modules of the server (exit $($r.ExitCode))."
}

function Save-ConfigModuleList([string]$Modules) {
    # Records the server's new module list in the configuration file (a .bak copy is kept), so that
    # Update keeps matching the server. Every other key is left as it is.
    $path = Get-ConfigPath
    $raw = Get-Content -LiteralPath $path -Raw -Encoding utf8 | ConvertFrom-Json
    $raw | Add-Member -NotePropertyName 'Modules' -NotePropertyValue $Modules -Force
    Copy-Item -LiteralPath $path -Destination "$path.bak-$((Get-Date).ToString('yyyyMMdd_HHmmss'))"
    Write-Utf8LfFile $path (($raw | ConvertTo-Json -Depth 10) + "`n")
}

function Save-ConfigDomain([string]$Domain) {
    # Records the server's new primary domain in the configuration file (a .bak copy is kept).
    # Every other key is left as it is.
    $path = Get-ConfigPath
    $raw = Get-Content -LiteralPath $path -Raw -Encoding utf8 | ConvertFrom-Json
    $raw | Add-Member -NotePropertyName 'Domain' -NotePropertyValue $Domain -Force
    Copy-Item -LiteralPath $path -Destination "$path.bak-$((Get-Date).ToString('yyyyMMdd_HHmmss'))"
    Write-Utf8LfFile $path (($raw | ConvertTo-Json -Depth 10) + "`n")
}

function Get-ConfigPath {
    if ([System.IO.Path]::IsPathRooted($ConfigFile)) { return $ConfigFile }
    return (Join-Path $ScriptRoot $ConfigFile)
}

function Get-DeployConfig {
    param([switch]$ForSetup)
    $path = Get-ConfigPath
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Configuration file not found: $path" }
    try {
        $raw = Get-Content -LiteralPath $path -Raw -Encoding utf8 | ConvertFrom-Json
    } catch {
        throw "Configuration file is not valid JSON: $path"
    }
    return (Assert-DeployConfig -RawConfig $raw -SourcePath $path -ForSetup:$ForSetup)
}

function Get-SudoPrefix($Config) {
    if ($Config.SshUser -eq 'root') { return '' }
    return 'sudo -n '
}

function Assert-PinnedHostKey($Config) {
    $lookup = if ($Config.SshPort -eq 22) { $Config.ServerHost } else { "[$($Config.ServerHost)]:$($Config.SshPort)" }
    $r = Invoke-Process -FilePath $SshKeygenExe -ArgumentList @('-l', '-F', $lookup) -Capture -Quiet
    $found = @($r.Output | Where-Object { $_ -and -not $_.StartsWith('#') } | ForEach-Object {
            if ($_ -match '(SHA256:[A-Za-z0-9+/]{43})') { $Matches[1] } else { '<unparsed>' }
        })
    if ($found.Count -eq 0) {
        throw "Host $lookup is not in known_hosts. Add and verify its key out-of-band first; refusing to connect."
    }
    $mismatch = @($found | Where-Object { $_ -cne $Config.HostKeyFingerprint })
    if ($mismatch.Count -gt 0) {
        throw "SECURITY: known_hosts entry for $lookup does not match the pinned fingerprint $($Config.HostKeyFingerprint) (found: $($found -join ', '))."
    }
}

function Invoke-Ssh {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]$Config,
        [Parameter(Mandatory)][string]$RemoteCommand,
        [switch]$Tty,
        [string]$StdinText,
        [string]$StdinFile,
        [string]$StdoutFile,
        [switch]$Capture,
        [switch]$Raw,
        [switch]$Quiet
    )
    $sshArgs = [System.Collections.Generic.List[string]]::new()
    $sshArgs.AddRange([string[]]@('-p', [string]$Config.SshPort,
            # UpdateHostKeys=no: OpenSSH would otherwise add the server's other host keys after login,
            # and Assert-PinnedHostKey then (rightly) refuses every unpinned entry.
            '-o', 'StrictHostKeyChecking=yes', '-o', 'UpdateHostKeys=no', '-o', 'ConnectTimeout=15',
            '-o', 'ServerAliveInterval=30', '-o', 'ServerAliveCountMax=4'))
    if ($NonInteractive) { $sshArgs.AddRange([string[]]@('-o', 'BatchMode=yes')) }
    $sshArgs.Add($(if ($Tty) { '-t' } else { '-T' }))
    $sshArgs.Add("$($Config.SshUser)@$($Config.ServerHost)")
    $sshArgs.Add($RemoteCommand)

    $p = @{ FilePath = $SshExe; ArgumentList = $sshArgs.ToArray() }
    if ($Tty) {
        $p.Inherit = $true
    } else {
        foreach ($k in 'StdinText', 'StdinFile', 'StdoutFile') { if ($PSBoundParameters.ContainsKey($k)) { $p[$k] = $PSBoundParameters[$k] } }
        foreach ($k in 'Capture', 'Raw', 'Quiet') { if ($PSBoundParameters[$k]) { $p[$k] = $true } }
    }
    return (Invoke-Process @p)
}

function Invoke-RemoteRootScript {
    # The single seam for privileged remote work: dispatches to /usr/local/sbin/warehouse-root-gateway
    # when -Gateway is specified (with restricted sudoers approval), or falls back to
    # "sudo -n bash -s -- <quoted args>" with the body on stdin for bootstrap cases (e.g. initial setup).
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]$Config,
        [string]$Gateway = '',
        [string]$Body = '',
        [string[]]$ArgumentList = @(),
        [string]$StdoutFile,
        [string]$StdinText,
        [switch]$Tty,
        [switch]$Capture,
        [switch]$Raw,
        [switch]$Quiet
    )
    $sudoPrefix = Get-SudoPrefix $Config
    $quotedArgs = @($ArgumentList | ForEach-Object { ConvertTo-ShellLiteral $_ }) -join ' '

    if ($Gateway) {
        $command = "${sudoPrefix}/usr/local/sbin/warehouse-root-gateway $Gateway"
        if ($quotedArgs) { $command += " $quotedArgs" }
        $p = @{ Config = $Config; RemoteCommand = $command }
        if ($StdinText) { $p.StdinText = $StdinText }
    } else {
        $command = "${sudoPrefix}bash -s --"
        if ($quotedArgs) { $command += " $quotedArgs" }
        $script = "set -euo pipefail`n__wh_main() {`n" + $Body.Replace("`r", '').TrimEnd() + "`n}`n__wh_main `"`$@`" </dev/null`n"
        $p = @{ Config = $Config; RemoteCommand = $command; StdinText = $script }
    }

    if ($StdoutFile) { $p.StdoutFile = $StdoutFile }
    if ($Tty) { $p.Tty = $true }
    foreach ($k in 'Capture', 'Raw', 'Quiet') { if ($PSBoundParameters[$k]) { $p[$k] = $true } }
    return (Invoke-Ssh @p)
}

function Test-SshConnection($Config) {
    Write-Step "Testing SSH connection to $($Config.SshUser)@$($Config.ServerHost):$($Config.SshPort)..."
    Assert-PinnedHostKey $Config
    $r = Invoke-Ssh -Config $Config -RemoteCommand 'echo [SSH_CONNECTED_OK]' -Capture -Quiet
    if ($r.ExitCode -ne 0 -or -not ($r.Output -contains '[SSH_CONNECTED_OK]')) {
        throw "SSH connection to $($Config.ServerHost):$($Config.SshPort) failed (exit $($r.ExitCode))."
    }
    Write-Success 'SSH connection established (pinned host key verified).'
}

function Connect-Server {
    param([switch]$ForSetup)
    Test-LocalTool 'ssh', 'ssh-keygen'
    $config = Get-DeployConfig -ForSetup:$ForSetup
    Test-SshConnection $config
    return $config
}

function Enter-DeployLock {
    [void][System.IO.Directory]::CreateDirectory($LocalDeployScratch)
    $lockPath = Join-Path $LocalDeployScratch 'deploy.lock'
    try {
        return [System.IO.FileStream]::new($lockPath, [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
    } catch [System.IO.IOException] {
        throw "Another deploy.ps1 operation is running (lock held: $lockPath)."
    }
}

# ==============================================================================
# Remote staging and verified transfers (no scp)
# ==============================================================================
function New-RemoteStage($Config) {
    $r = Invoke-Ssh -Config $Config -RemoteCommand 'mktemp -d /tmp/wh-deploy.XXXXXXXXXX' -Capture -Quiet
    $dir = @($r.Output | Where-Object { $_ })
    if ($r.ExitCode -ne 0 -or $dir.Count -ne 1 -or $dir[0] -cnotmatch '^/tmp/wh-deploy\.[A-Za-z0-9]{10}$') {
        throw 'Could not create a remote staging directory.'
    }
    return $dir[0]
}

function Remove-RemoteStage($Config, [string]$StageDir) {
    if (-not $StageDir) { return }
    if ($StageDir -cnotmatch '^/tmp/wh-deploy\.[A-Za-z0-9]{10}$') { throw "Refusing to remove unexpected remote path: $StageDir" }
    $r = Invoke-Ssh -Config $Config -RemoteCommand "rm -rf -- $(ConvertTo-ShellLiteral $StageDir)" -Capture -Quiet
    if ($r.ExitCode -ne 0) { Write-Warn "Could not remove remote staging directory $StageDir (exit $($r.ExitCode))." }
}

function Send-RemoteFile($Config, [string]$LocalPath, [string]$StageDir, [string]$Name) {
    if ($Name -cnotmatch '^[A-Za-z0-9._-]+$') { throw "Invalid remote file name: $Name" }
    $target = "$StageDir/$Name"
    $localHash = Get-FileSha256 $LocalPath
    $sizeMb = [math]::Round((Get-Item -LiteralPath $LocalPath).Length / 1MB, 2)
    Write-Info "Uploading $Name ($sizeMb MB) to $target ..."
    $lit = ConvertTo-ShellLiteral $target
    $r = Invoke-Ssh -Config $Config -RemoteCommand "cat > $lit && sha256sum -- $lit" -StdinFile $LocalPath -Capture -Quiet
    $remoteHash = $null
    foreach ($line in $r.Output) { if ($line -match '^([0-9a-f]{64})\s') { $remoteHash = $Matches[1] } }
    if ($r.ExitCode -ne 0 -or $remoteHash -ne $localHash) {
        throw "Upload of $Name failed or was corrupted (exit $($r.ExitCode); local $localHash; remote $remoteHash)."
    }
    Write-Success "Uploaded and verified $Name (sha256 $localHash)."
    return $localHash
}

function Receive-RemoteFile($Config, [string]$RelativePath, [string]$LocalPartPath) {
    # $RelativePath is relative to shared/backups (e.g. db/backup_x.dump); the gateway validates every segment (G-03).
    if (Test-Path -LiteralPath $LocalPartPath) {
        Write-Warn "Removing stale partial download: $LocalPartPath"
        Remove-Item -LiteralPath $LocalPartPath -Force
    }
    $r = Invoke-RemoteRootScript -Config $Config -Gateway 'read-backup' -ArgumentList @($RelativePath) -StdoutFile $LocalPartPath
    if ($r.ExitCode -ne 0) {
        if (Test-Path -LiteralPath $LocalPartPath) { Remove-Item -LiteralPath $LocalPartPath -Force }
        throw "Download of $RemoteBackupDir/$RelativePath failed (exit $($r.ExitCode))."
    }
}

function Get-RemoteSha256($Config, [string[]]$RelativePaths) {
    $result = @{}
    for ($i = 0; $i -lt $RelativePaths.Count; $i += 100) {
        $batch = @($RelativePaths[$i..([math]::Min($i + 99, $RelativePaths.Count - 1))])
        $r = Invoke-RemoteRootScript -Config $Config -Gateway 'sha256sum' -ArgumentList $batch -Capture -Quiet
        if ($r.ExitCode -ne 0) { throw "Remote sha256sum failed (exit $($r.ExitCode))." }
        foreach ($line in $r.Output) {
            if ($line -match '^([0-9a-f]{64})  (.+)$') { $result[$Matches[2]] = $Matches[1] }
        }
    }
    foreach ($p in $RelativePaths) { if (-not $result.ContainsKey($p)) { throw "Remote sha256sum returned no hash for $p." } }
    return $result
}

function Test-SafeRelativePath([string]$Path) {
    if (-not $Path -or $Path.StartsWith('/') -or $Path.Length -gt 400) { return $false }
    if ($Path -match '[\x00-\x1f\x7f\\:*?"<>|]') { return $false }
    foreach ($segment in $Path.Split('/')) {
        if ($segment -eq '' -or $segment -eq '.' -or $segment -eq '..' -or $segment.EndsWith('.') -or $segment.EndsWith(' ')) { return $false }
        # Windows device names (nul, con, com1.txt, ...) resolve outside the local root.
        if ($segment -match '^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$') { return $false }
    }
    return $true
}

function Get-LocalPathFor([string]$Root, [string]$RelativePath) {
    $full = [System.IO.Path]::GetFullPath((Join-Path $Root ($RelativePath.Replace('/', '\'))))
    $rootFull = [System.IO.Path]::GetFullPath($Root).TrimEnd('\') + '\'
    if (-not $full.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) { throw "Path escapes local root: $RelativePath" }
    return $full
}

function Read-RecordedHash([string]$CompanionPath, [string]$CompanionName = $CompanionPath) {
    # The format follows the companion's real name; the file read may be its .part download.
    $text = [System.IO.File]::ReadAllText($CompanionPath)
    if ($CompanionName.EndsWith('.meta.json')) {
        try { $meta = $text | ConvertFrom-Json } catch { return $null }
        $value = ([string]$meta.checksum).ToLowerInvariant()
        if ($value -match '^[0-9a-f]{64}$') { return $value }
        return $null
    }
    $first = ($text.Trim() -split '\s+')[0].ToLowerInvariant()
    if ($first -match '^[0-9a-f]{64}$') { return $first }
    return $null
}

function Receive-VerifiedBackup {
    # Downloads one backup data file (and its companion) from shared/backups into backups/soft.
    # Data is written to <file>.part, verified against a fresh server-side sha256, then renamed without overwrite.
    param([Parameter(Mandatory)]$Config, [Parameter(Mandatory)][string]$RelativePath,
        [Parameter(Mandatory)][string]$ExpectedSha256, [string]$CompanionRelativePath)
    $local = Get-LocalPathFor $LocalBackupRoot $RelativePath
    [void][System.IO.Directory]::CreateDirectory((Split-Path -Parent $local))

    $companionLocal = $null
    $companionPart = $null
    if ($CompanionRelativePath) {
        $companionLocal = Get-LocalPathFor $LocalBackupRoot $CompanionRelativePath
        $companionPart = "$companionLocal.part"
        Receive-RemoteFile $Config $CompanionRelativePath $companionPart
        $recorded = Read-RecordedHash $companionPart $CompanionRelativePath
        if (-not $recorded) {
            Remove-Item -LiteralPath $companionPart -Force
            throw "Companion $CompanionRelativePath records no readable sha256 (empty or incomplete); $RelativePath was not pulled."
        }
        if ($recorded -ne $ExpectedSha256) {
            Remove-Item -LiteralPath $companionPart -Force
            throw "SERVER-SIDE MISMATCH: $RelativePath is expected to hash to $ExpectedSha256 (fresh server hash or server marker) but its companion records $recorded."
        }
    }

    if (Test-Path -LiteralPath $local) {
        $existing = Get-FileSha256 $local
        if ($existing -ne $ExpectedSha256) {
            if ($companionPart) { Remove-Item -LiteralPath $companionPart -Force }
            throw "Local file $local already exists with a different sha256 ($existing); not overwriting."
        }
        Write-Info "Already present and verified: $RelativePath"
    } else {
        $part = "$local.part"
        Write-Info "Downloading $RelativePath ..."
        Receive-RemoteFile $Config $RelativePath $part
        $actual = Get-FileSha256 $part
        if ($actual -ne $ExpectedSha256) {
            Remove-Item -LiteralPath $part -Force
            if ($companionPart) { Remove-Item -LiteralPath $companionPart -Force }
            throw "Transfer mismatch for ${RelativePath}: expected $ExpectedSha256, got $actual."
        }
        [System.IO.File]::Move($part, $local, $false)
        Write-Success "Saved and verified: $RelativePath"
    }

    if ($companionPart) {
        if (Test-Path -LiteralPath $companionLocal) {
            if ((Get-FileSha256 $companionLocal) -ne (Get-FileSha256 $companionPart)) {
                Write-Warn "Local companion $CompanionRelativePath differs from the server copy; keeping the local one."
            }
            Remove-Item -LiteralPath $companionPart -Force
        } else {
            [System.IO.File]::Move($companionPart, $companionLocal, $false)
        }
    }
}

# ==============================================================================
# Git guard, isolated build and release bundle
# ==============================================================================
function Get-DeployCommit {
    Write-Step 'Checking Git working tree and commit...'
    $r = Invoke-Git @('status', '--porcelain=v1', '-z', '--untracked-files=all')
    if ($r.ExitCode -ne 0) { throw 'git status failed.' }
    $tokens = $r.Output.Split([char]0)
    $entries = [System.Collections.Generic.List[object]]::new()
    for ($i = 0; $i -lt $tokens.Count; $i++) {
        $t = $tokens[$i]
        if ($t.Length -lt 4) { continue }
        $xy = $t.Substring(0, 2)
        $entries.Add([pscustomobject]@{ Status = $xy; Path = $t.Substring(3) })
        if ($xy[0] -eq 'R' -or $xy[0] -eq 'C') { $i++ }
    }

    $untrackedMigrations = @($entries | Where-Object { $_.Status -eq '??' -and $_.Path -match '(^|/)migrations/[^/]+\.py$' })
    if ($untrackedMigrations.Count -gt 0) {
        $untrackedMigrations | ForEach-Object { Write-Err "  untracked migration: $($_.Path)" }
        throw 'Untracked migration files must be committed or removed before deployment.'
    }
    if ($entries.Count -gt 0) {
        $entries | Select-Object -First 30 | ForEach-Object { Write-Warn "  $($_.Status) $($_.Path)" }
        if ($entries.Count -gt 30) { Write-Warn "  ... and $($entries.Count - 30) more" }
        if (-not $AllowDirty) { throw 'Working tree is dirty. Commit the changes, or use -AllowDirty to deploy HEAD as committed.' }
        Write-Warn 'Uncommitted changes above will NOT be deployed; the bundle is built from HEAD only.'
        if (-not (Confirm-TypedWord 'DIRTY' 'Type DIRTY to deploy HEAD while ignoring the uncommitted changes')) {
            throw 'Dirty-tree deployment was not confirmed.'
        }
    }
    $sha = (Invoke-Git @('rev-parse', '--verify', 'HEAD^{commit}')).Output.Trim()
    if ($sha -cnotmatch '^[0-9a-f]{40}$') { throw 'Could not resolve the HEAD commit.' }
    Write-Success "Deploying commit $sha"
    return $sha
}

function Build-IsolatedFrontend([string]$Sha) {
    # Builds warehouse-front from the commit inside scratch/deploy/<sha>; the project's own dist is never touched.
    if ($Sha -cnotmatch '^[0-9a-f]{40}$') { throw "Invalid commit: $Sha" }
    $scratchDir = Join-Path $LocalDeployScratch $Sha
    $snapshotFront = Join-Path $scratchDir 'warehouse-front'
    $distDir = Join-Path $snapshotFront $FrontDistRelative
    $marker = Join-Path $scratchDir '.build-complete'
    $expectedMarker = "COMMIT=$Sha"

    if ($SkipBuild) {
        $markerOk = (Test-Path -LiteralPath $marker) -and ([System.IO.File]::ReadAllText($marker).Trim() -ceq $expectedMarker)
        $distOk = (Test-Path -LiteralPath (Join-Path $distDir 'index.html')) -and (Test-Path -LiteralPath (Join-Path $distDir 'ngsw.json'))
        if (-not ($markerOk -and $distOk)) { throw "-SkipBuild: no completed build for commit $Sha in $scratchDir." }
        Write-Info "Reusing completed build for $Sha (-SkipBuild)."
        return $snapshotFront
    }

    Write-Step "Building the frontend in an isolated snapshot (scratch/deploy/$Sha)..."
    if (Test-Path -LiteralPath $scratchDir) {
        $oldJunction = Join-Path $snapshotFront 'node_modules'
        if (Test-Path -LiteralPath $oldJunction) {
            $oldItem = Get-Item -LiteralPath $oldJunction -Force
            if ($oldItem.Attributes.HasFlag([System.IO.FileAttributes]::ReparsePoint)) { Remove-SafeJunction $oldJunction }
        }
        Remove-SafeDirectoryRecursively $scratchDir
    }
    [void][System.IO.Directory]::CreateDirectory($scratchDir)

    $frontTar = Join-Path $LocalDeployScratch "front_$Sha.tar"
    if (Test-Path -LiteralPath $frontTar) { Remove-Item -LiteralPath $frontTar -Force }
    try {
        if ((Invoke-Native $GitExe @('-C', $ScriptRoot, 'archive', '--format=tar', '-o', $frontTar, $Sha, '--', 'warehouse-front')) -ne 0) {
            throw "git archive of warehouse-front failed for $Sha."
        }
        if ((Invoke-Native $TarExe @('-xf', $frontTar, '-C', $scratchDir)) -ne 0) { throw 'Extracting the frontend snapshot failed.' }
    } finally {
        if (Test-Path -LiteralPath $frontTar) { Remove-Item -LiteralPath $frontTar -Force }
    }

    $sourceNodeModules = Join-Path $ScriptRoot 'warehouse-front\node_modules'
    if (-not (Test-Path -LiteralPath $sourceNodeModules)) { throw "node_modules not found at $sourceNodeModules" }
    $junction = Join-Path $snapshotFront 'node_modules'
    New-SafeJunction $junction $sourceNodeModules
    try {
        Write-Info 'Running npm run build (includes the ngsw patch)...'
        $code = Invoke-Native $NpmCmd @('run', 'build') -WorkingDirectory $snapshotFront
        if ($code -ne 0) { throw "npm run build failed with exit code $code." }
    } finally {
        Remove-SafeJunction $junction
    }

    foreach ($required in 'index.html', 'ngsw.json') {
        if (-not (Test-Path -LiteralPath (Join-Path $distDir $required))) { throw "Build output is missing $required in $distDir." }
    }
    Write-Utf8LfFile $marker "$expectedMarker`n"
    Write-Success 'Isolated frontend build completed.'
    return $snapshotFront
}

function Get-BackendWhitelist([string]$Sha) {
    $r = Invoke-Git @('ls-tree', '-r', '-z', '--name-only', $Sha, '--', 'warehouse-backend')
    if ($r.ExitCode -ne 0) { throw "git ls-tree failed for $Sha." }
    $names = $r.Output.Split([char]0)
    $apps = @($names | ForEach-Object { if ($_ -match '^warehouse-backend/([^/]+)/__init__\.py$') { $Matches[1] } } | Sort-Object -Unique)
    $files = @('manage.py', 'requirements.txt', 'requirements.lock')
    foreach ($f in $files) {
        if ($names -notcontains "warehouse-backend/$f") { throw "Commit $Sha has no warehouse-backend/$f; it is mandatory in the bundle." }
    }
    if ($apps.Count -eq 0) { throw "No backend app packages found in $Sha." }
    return [pscustomobject]@{ Apps = $apps; Files = $files }
}

function Test-BundleStage([string]$StageDir, $Whitelist) {
    $problems = [System.Collections.Generic.List[string]]::new()
    Assert-NoReparsePoint $StageDir
    $rootFull = [System.IO.Path]::GetFullPath($StageDir).TrimEnd('\') + '\'
    $all = @(Get-ChildItem -LiteralPath $StageDir -Recurse -Force)
    foreach ($item in $all) {
        $rel = $item.FullName.Substring($rootFull.Length).Replace('\', '/')
        if ($rel -match '(^|/)__pycache__(/|$)') { $problems.Add("__pycache__ in bundle: $rel") }
        if ($rel -match 'test_phase') { $problems.Add("test_phase file in bundle: $rel") }
        if ($item.Name -eq '.env' -or $item.Name.StartsWith('.env.')) { $problems.Add(".env file in bundle: $rel") }
        if ($item.Name -eq 'db.sqlite3') { $problems.Add("db.sqlite3 in bundle: $rel") }
        if (-not $item.PSIsContainer) {
            $needsLf = $rel -eq 'RELEASE' -or $rel.StartsWith('scripts/deploy/') -or $rel.EndsWith('.sh')
            if ($needsLf -and ([System.IO.File]::ReadAllBytes($item.FullName) -contains 13)) {
                $problems.Add("CR (carriage return) found in $rel; LF only is required")
            }
        }
    }
    $backendTop = @(Get-ChildItem -LiteralPath (Join-Path $StageDir 'warehouse-backend') -Force | ForEach-Object { $_.Name } | Sort-Object)
    $expectedTop = @(@($Whitelist.Apps) + @($Whitelist.Files) | Sort-Object)
    if (($backendTop -join '|') -cne ($expectedTop -join '|')) {
        $problems.Add("warehouse-backend top level differs from the whitelist (got: $($backendTop -join ', '))")
    }
    $dist = Join-Path $StageDir "warehouse-front\$FrontDistRelative"
    foreach ($required in 'index.html', 'ngsw.json') {
        if (-not (Test-Path -LiteralPath (Join-Path $dist $required))) { $problems.Add("frontend $required missing from bundle") }
    }
    foreach ($required in 'scripts/deploy/warehouse-deploy.sh', 'scripts/deploy/warehouse-nightly-backup.sh', 'scripts/remote-setup.sh', 'RELEASE') {
        if (-not (Test-Path -LiteralPath (Join-Path $StageDir $required.Replace('/', '\')))) { $problems.Add("$required missing from bundle") }
    }
    if ($problems.Count -gt 0) { throw "Bundle gate failed:`n  $($problems -join "`n  ")" }
}

function New-DeploymentBundle([string]$Sha, [string]$SnapshotFront) {
    Write-Step "Creating the release bundle from commit $Sha..."
    if ($Sha -cnotmatch '^[0-9a-f]{40}$') { throw "Invalid commit: $Sha" }
    [void][System.IO.Directory]::CreateDirectory($LocalDeployScratch)
    $stageDir = Join-Path $LocalDeployScratch "bundle_stage_$Sha"
    $sourceTar = Join-Path $LocalDeployScratch "source_$Sha.tar"
    $bundle = Join-Path $LocalDeployScratch "deploy_bundle_$Sha.tar.gz"
    $setupScript = Join-Path $LocalDeployScratch "remote-setup_$Sha.sh"
    foreach ($old in $sourceTar, $bundle, $setupScript) { if (Test-Path -LiteralPath $old) { Remove-Item -LiteralPath $old -Force } }
    Remove-SafeDirectoryRecursively $stageDir
    [void][System.IO.Directory]::CreateDirectory($stageDir)

    try {
        $whitelist = Get-BackendWhitelist $Sha
        $pathspecs = [System.Collections.Generic.List[string]]::new()
        foreach ($f in $whitelist.Files) { $pathspecs.Add("warehouse-backend/$f") }
        foreach ($a in $whitelist.Apps) { $pathspecs.Add("warehouse-backend/$a") }
        $pathspecs.AddRange([string[]]@('scripts/deploy', 'scripts/remote-setup.sh', ':(exclude,glob)warehouse-backend/**/test_phase*.py'))
        $archiveArgs = @('-C', $ScriptRoot, 'archive', '--format=tar', '-o', $sourceTar, $Sha, '--') + $pathspecs.ToArray()
        if ((Invoke-Native $GitExe $archiveArgs) -ne 0) { throw "git archive failed for $Sha." }
        if ((Invoke-Native $TarExe @('-xf', $sourceTar, '-C', $stageDir)) -ne 0) { throw 'Extracting the source snapshot failed.' }

        $frontTarget = Join-Path $stageDir 'warehouse-front'
        [void][System.IO.Directory]::CreateDirectory($frontTarget)
        Copy-Item -LiteralPath (Join-Path $SnapshotFront 'dist') -Destination (Join-Path $frontTarget 'dist') -Recurse -Force

        $machine = if ($env:COMPUTERNAME -match '^[A-Za-z0-9-]{1,63}$') { $env:COMPUTERNAME } else { 'unknown' }
        $release = "COMMIT=$Sha`nDATE=$((Get-Date).ToString('yyyy-MM-ddTHH:mm:sszzz'))`nBUILD_MACHINE=$machine`n"
        Write-Utf8LfFile (Join-Path $stageDir 'RELEASE') $release

        Write-Info 'Checking bundle gates (whitelist, CR, forbidden files, frontend artifacts)...'
        Test-BundleStage $stageDir $whitelist
        Copy-Item -LiteralPath (Join-Path $stageDir 'scripts\remote-setup.sh') -Destination $setupScript

        Write-Info 'Creating ustar tar.gz (owner root:root)...'
        $tarArgs = @('--format', 'ustar', '--uid', '0', '--gid', '0', '--uname', 'root', '--gname', 'root', '-czf', $bundle, '-C', $stageDir, '.')
        if ((Invoke-Native $TarExe $tarArgs) -ne 0) { throw 'tar.exe failed to create the bundle.' }

        $listing = Invoke-Process -FilePath $TarExe -ArgumentList @('-tzf', $bundle) -Raw -Quiet
        if ($listing.ExitCode -ne 0) { throw 'The new bundle could not be listed.' }
        $entries = @($listing.Output -split "`r?`n" | Where-Object { $_ })
        $backslashes = @($entries | Where-Object { $_.Contains('\') })
        if ($backslashes.Count -gt 0) { throw "Bundle contains backslash paths: $($backslashes -join '; ')" }
        if ($entries.Count -lt 10) { throw 'Bundle listing is unexpectedly small.' }
    } catch {
        if (Test-Path -LiteralPath $bundle) { Remove-Item -LiteralPath $bundle -Force }
        throw
    } finally {
        if (Test-Path -LiteralPath $sourceTar) { Remove-Item -LiteralPath $sourceTar -Force }
        Remove-SafeDirectoryRecursively $stageDir
    }

    $hash = Get-FileSha256 $bundle
    $sizeMb = [math]::Round((Get-Item -LiteralPath $bundle).Length / 1MB, 2)
    Write-Success "Bundle ready: $bundle ($sizeMb MB, sha256 $hash)."
    return [pscustomobject]@{ Path = $bundle; Sha256 = $hash; SetupScript = $setupScript; Sha = $Sha }
}

function Remove-LocalBundle($Bundle) {
    if (-not $Bundle) { return }
    foreach ($p in $Bundle.Path, $Bundle.SetupScript) { if ($p -and (Test-Path -LiteralPath $p)) { Remove-Item -LiteralPath $p -Force } }
}

# ==============================================================================
# Remote backups
# ==============================================================================
function Invoke-RemoteBackup($Config, [ValidateSet('manual', 'pre_restore', 'pre_module')][string]$Prefix) {
    # Runs the server backup script (no fallback), then pulls and verifies the very file it reported.
    Write-Step "Creating a '$Prefix' backup on the server..."
    $r = Invoke-RemoteRootScript -Config $Config -Gateway 'backup' -ArgumentList @('--prefix', $Prefix) -Capture
    if ($r.ExitCode -ne 0) { throw "Server backup script failed with exit code $($r.ExitCode)." }
    $names = @($r.Output | ForEach-Object { if ($_ -match '^\[BACKUP_DB\] (db_[a-z_]+_\d{8}_\d{6}\.dump)$') { $Matches[1] } })
    $hashes = @($r.Output | ForEach-Object { if ($_ -match '^\[BACKUP_DB_SHA256\] ([0-9a-f]{64})$') { $Matches[1] } })
    if ($names.Count -ne 1 -or $hashes.Count -ne 1) { throw 'Server backup did not report exactly one [BACKUP_DB] and [BACKUP_DB_SHA256] marker.' }
    if (-not $names[0].StartsWith("db_${Prefix}_")) { throw "Server reported an unexpected backup name: $($names[0])" }
    Receive-VerifiedBackup -Config $Config -RelativePath $names[0] -ExpectedSha256 $hashes[0] -CompanionRelativePath "$($names[0]).sha256"
    Write-Success "Backup $($names[0]) is stored off-server and verified."
    return [pscustomobject]@{ Name = $names[0]; Sha256 = $hashes[0] }
}

function Get-LocalDumpList {
    # Top-level local dumps that have a companion (files are only moved into place after verification), newest first.
    if (-not (Test-Path -LiteralPath $LocalBackupRoot)) { return @() }
    return @(Get-ChildItem -LiteralPath $LocalBackupRoot -Filter '*.dump' -File |
            Where-Object { (Test-Path -LiteralPath "$($_.FullName).sha256") -and (Get-BackupTimestamp $_.Name) } |
            Sort-Object -Property @{ Expression = { Get-BackupTimestamp $_.Name } } -Descending)
}

function Test-LocalDumpVerified($File) {
    $recorded = Read-RecordedHash "$($File.FullName).sha256"
    return ($recorded -and $recorded -eq (Get-FileSha256 $File.FullName))
}

function Get-NewestVerifiedLocalDump([string]$NamePattern = '*') {
    foreach ($f in (Get-LocalDumpList)) {
        if ($f.Name -notlike $NamePattern) { continue }
        if (Test-LocalDumpVerified $f) { return $f }
        Write-Warn "Local dump $($f.Name) does not match its recorded sha256; skipping it."
    }
    return $null
}

function Invoke-PullBackupsCore($Config) {
    Write-Step "Pulling verified backups from $RemoteBackupDir into backups/soft..."
    [void][System.IO.Directory]::CreateDirectory($LocalBackupRoot)
    $failures = 0

    $r = Invoke-RemoteRootScript -Config $Config -Gateway 'list-backups' -Raw -Quiet
    if ($r.ExitCode -ne 0) { throw "Listing remote backups failed (exit $($r.ExitCode))." }
    $remote = @{}
    foreach ($token in $r.Output.Split([char]0)) {
        if (-not $token) { continue }
        $parts = $token.Split("`t", 2)
        if ($parts.Count -ne 2 -or -not (Test-SafeRelativePath $parts[1])) {
            Write-Err "Skipping unsafe remote name: $token"
            $failures++
            continue
        }
        $remote[$parts[1]] = [int64]$parts[0]
    }

    $companionSuffixes = @('.sha256', '.meta.json')
    $todo = [System.Collections.Generic.List[object]]::new()
    foreach ($path in ($remote.Keys | Sort-Object)) {
        if ($companionSuffixes | Where-Object { $path.EndsWith($_) }) { continue }
        $companion = $null
        foreach ($s in $companionSuffixes) { if ($remote.ContainsKey("$path$s")) { $companion = "$path$s"; break } }
        if (-not $companion) {
            Write-Info "Skipping $path (no .sha256/.meta.json companion yet; possibly incomplete)."
            continue
        }
        $local = Get-LocalPathFor $LocalBackupRoot $path
        if ((Test-Path -LiteralPath $local) -and (Test-Path -LiteralPath (Get-LocalPathFor $LocalBackupRoot $companion))) {
            if ((Get-Item -LiteralPath $local).Length -ne $remote[$path]) {
                Write-Err "Local $path exists with a different size than the server copy; not overwriting."
                $failures++
            }
            continue
        }
        $todo.Add([pscustomobject]@{ Path = $path; Companion = $companion })
    }

    if ($todo.Count -gt 0) {
        $fresh = Get-RemoteSha256 $Config @($todo | ForEach-Object { $_.Path })
        foreach ($item in $todo) {
            try {
                Receive-VerifiedBackup -Config $Config -RelativePath $item.Path -ExpectedSha256 $fresh[$item.Path] -CompanionRelativePath $item.Companion
            } catch {
                Write-Err $_.Exception.Message
                $failures++
            }
        }
    } else {
        Write-Info 'No new backup files on the server.'
    }

    try {
        $failures += Sync-MediaMirror $Config
    } catch {
        Write-Err "Media mirror failed: $($_.Exception.Message)"
        $failures++
    }

    $newest = @(Get-LocalDumpList | Select-Object -First 1)
    if ($newest.Count -gt 0) {
        $hours = [math]::Round(((Get-Date) - (Get-BackupTimestamp $newest[0].Name)).TotalHours, 1)
        Write-Info "Newest off-server dump: $($newest[0].Name) ($hours hours old)."
        if ($hours -gt 48) { Write-Warn 'The newest off-server dump is older than 48 hours.' }
    } else {
        Write-Warn 'No off-server dump exists in backups/soft yet.'
    }

    if ($failures -gt 0) {
        Write-Err "PullBackups finished with $failures failure(s)."
        return 1
    }
    Write-Success 'PullBackups completed; every pulled file was verified.'
    return 0
}

function Sync-MediaMirror($Config) {
    # Incremental, additive media mirror of shared/backups/latest_media into backups/soft/media. Never deletes.
    $mirror = Join-Path $LocalBackupRoot 'media'
    $r = Invoke-RemoteRootScript -Config $Config -Gateway 'list-media' -Raw -Quiet
    if ($r.ExitCode -ne 0) { throw "Listing the media snapshot failed (exit $($r.ExitCode))." }
    $tokens = @($r.Output.Split([char]0) | Where-Object { $_ })
    if ($tokens.Count -eq 0) {
        Write-Info 'No media snapshot (latest_media) on the server yet.'
        return 0
    }
    $snapshot = $tokens[0]
    if ($snapshot -cnotmatch '^/var/www/warehouse/shared/backups/media_daily_\d{8}_\d{6}$') { throw "Unexpected media snapshot path: $snapshot" }

    $failures = 0
    $wanted = [ordered]@{}
    foreach ($token in ($tokens | Select-Object -Skip 1)) {
        $parts = $token.Split("`t", 2)
        if ($parts.Count -ne 2 -or -not (Test-SafeRelativePath $parts[1])) {
            Write-Err "Skipping unsafe media name: $token"
            $failures++
            continue
        }
        $local = Get-LocalPathFor $mirror $parts[1]
        $size = [int64]$parts[0]
        if ((Test-Path -LiteralPath $local -PathType Leaf) -and (Get-Item -LiteralPath $local).Length -eq $size) { continue }
        $wanted[$parts[1]] = $size
    }
    if ($wanted.Count -eq 0) {
        Write-Info "Media mirror is up to date with $(Split-Path -Leaf $snapshot)."
        return $failures
    }

    Write-Info "Fetching $($wanted.Count) new or changed media file(s) from $(Split-Path -Leaf $snapshot)..."
    [void][System.IO.Directory]::CreateDirectory($mirror)
    $stamp = (Get-Date).ToString('yyyyMMdd_HHmmss')
    $listFile = Join-Path $LocalDeployScratch "media_list_$stamp.bin"
    $tarPart = Join-Path $LocalBackupRoot "media_transfer_$stamp.tar.part"
    [void][System.IO.Directory]::CreateDirectory($LocalDeployScratch)
    $stage = $null
    try {
        $listBytes = $Utf8NoBom.GetBytes((@($wanted.Keys) -join "`0") + "`0")
        [System.IO.File]::WriteAllBytes($listFile, $listBytes)
        $stage = New-RemoteStage $Config
        [void](Send-RemoteFile $Config $listFile $stage 'media.list')
        $t = Invoke-RemoteRootScript -Config $Config -Gateway 'tar-media' -ArgumentList @($snapshot, "$stage/media.list") -StdoutFile $tarPart
        if ($t.ExitCode -ne 0) { throw "Remote media tar failed (exit $($t.ExitCode))." }
        $failures += Expand-MediaTransfer $tarPart $mirror $wanted $stamp
    } finally {
        if ($stage) { Remove-RemoteStage $Config $stage }
        foreach ($p in $listFile, $tarPart) { if (Test-Path -LiteralPath $p) { Remove-Item -LiteralPath $p -Force } }
    }
    return $failures
}

function Expand-MediaTransfer([string]$TarPath, [string]$Mirror, $Wanted, [string]$Stamp) {
    $failures = 0
    $seen = @{}
    # Entries are extracted outside the mirror tree, so a temporary name can never collide with a mirrored file.
    $incoming = Join-Path $LocalBackupRoot "media_incoming_$Stamp"
    [void][System.IO.Directory]::CreateDirectory($incoming)
    $index = 0
    $stream = [System.IO.File]::OpenRead($TarPath)
    try {
        $reader = [System.Formats.Tar.TarReader]::new($stream, $false)
        while ($null -ne ($entry = $reader.GetNextEntry())) {
            $name = $entry.Name
            if ($entry.EntryType -ne [System.Formats.Tar.TarEntryType]::RegularFile -and $entry.EntryType -ne [System.Formats.Tar.TarEntryType]::V7RegularFile) {
                Write-Err "Unexpected tar entry type $($entry.EntryType) for $name; skipped."
                $failures++
                continue
            }
            if (-not (Test-SafeRelativePath $name) -or -not $Wanted.Contains($name)) {
                Write-Err "Unexpected or unsafe tar entry: $name; skipped."
                $failures++
                continue
            }
            if ($entry.Length -ne $Wanted[$name]) {
                Write-Err "Size mismatch for media/$name (listed $($Wanted[$name]), received $($entry.Length)); skipped."
                $failures++
                continue
            }
            $target = Get-LocalPathFor $Mirror $name
            [void][System.IO.Directory]::CreateDirectory((Split-Path -Parent $target))
            $index++
            $part = Join-Path $incoming "$index.part"
            $entry.ExtractToFile($part, $false)
            if (Test-Path -LiteralPath $target) {
                $kept = "$target.~$Stamp~"
                $n = 1
                while (Test-Path -LiteralPath $kept) { $kept = "$target.~${Stamp}_$n~"; $n++ }
                [System.IO.File]::Move($target, $kept, $false)
                Write-Info "Changed on server; previous local copy kept as $(Split-Path -Leaf $kept)"
            }
            [System.IO.File]::Move($part, $target, $false)
            $seen[$name] = $true
        }
    } finally {
        $stream.Dispose()
        # Only this run's own temporary extracts live here; the server still holds every file.
        Remove-SafeDirectoryRecursively $incoming
    }
    $missing = @($Wanted.Keys | Where-Object { -not $seen.ContainsKey($_) })
    if ($missing.Count -gt 0) {
        Write-Err "$($missing.Count) media file(s) were not received (first: $($missing[0]))."
        $failures += $missing.Count
    } else {
        Write-Success "Media mirror updated with $($seen.Count) file(s)."
    }
    return $failures
}

# ==============================================================================
# Scheduled pull task (E-29)
# ==============================================================================
function New-PullTaskDefinition {
    $pwsh = Join-Path $PSHOME 'pwsh.exe'
    $arguments = "-NoProfile -NonInteractive -WindowStyle Hidden -File `"$DeployScriptPath`" -PullBackups -NonInteractive"
    $configPath = [System.IO.Path]::GetFullPath((Get-ConfigPath))
    $defaultPath = [System.IO.Path]::GetFullPath((Join-Path $ScriptRoot 'deploy_config.json'))
    if ($configPath -ne $defaultPath) { $arguments += " -ConfigFile `"$configPath`"" }
    $user = "$env:USERDOMAIN\$env:USERNAME"
    $action = New-ScheduledTaskAction -Execute $pwsh -Argument $arguments -WorkingDirectory $ScriptRoot
    $daily = New-ScheduledTaskTrigger -Daily -At '04:00'
    $logon = New-ScheduledTaskTrigger -AtLogOn -User $user
    $logon.Delay = 'PT5M'
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 6)
    $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
    return (New-ScheduledTask -Action $action -Trigger @($daily, $logon) -Settings $settings -Principal $principal -Description 'Pull and verify soft.farsalish.ir backups into backups/soft (deploy.ps1 -PullBackups).')
}

function Register-PullTask {
    $existing = Get-ScheduledTask -TaskPath $PullTaskPath -TaskName $PullTaskName -ErrorAction SilentlyContinue
    if ($existing -and -not $Force) {
        Write-Info "Scheduled task $PullTaskPath$PullTaskName already exists (use -Force to re-register)."
        return 0
    }
    $task = New-PullTaskDefinition
    Register-ScheduledTask -TaskPath $PullTaskPath -TaskName $PullTaskName -InputObject $task -Force | Out-Null
    Write-Success "Scheduled task $PullTaskPath$PullTaskName registered (daily 04:00 and at logon + 5 min)."
    return 0
}

# ==============================================================================
# Modes
# ==============================================================================
function Invoke-InstallKeyMode {
    Assert-Interactive 'InstallKey'
    Test-LocalTool 'ssh', 'ssh-keygen'
    $config = Get-DeployConfig
    Assert-PinnedHostKey $config
    $sshDir = Join-Path $env:USERPROFILE '.ssh'
    [void][System.IO.Directory]::CreateDirectory($sshDir)
    $key = Join-Path $sshDir 'id_ed25519'
    if (-not (Test-Path -LiteralPath "$key.pub")) {
        Write-Info 'Generating a new ED25519 key pair...'
        if ((Invoke-Native $SshKeygenExe @('-t', 'ed25519', '-N', '', '-f', $key)) -ne 0) { throw 'ssh-keygen failed.' }
    }
    $pub = ([System.IO.File]::ReadAllText("$key.pub")).Trim()
    if ($pub -notmatch '^ssh-ed25519 [A-Za-z0-9+/=]+( [^\r\n]*)?$') { throw "Unexpected public key format in $key.pub" }
    $lit = ConvertTo-ShellLiteral $pub
    $remote = "umask 077; mkdir -p ~/.ssh && touch ~/.ssh/authorized_keys && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys && (grep -qxF $lit ~/.ssh/authorized_keys || printf '%s\n' $lit >> ~/.ssh/authorized_keys)"
    Write-Info 'Connecting to install the key (enter the SSH password when prompted)...'
    $r = Invoke-Ssh -Config $config -RemoteCommand $remote -Tty
    if ($r.ExitCode -ne 0) { throw "Installing the public key failed (exit $($r.ExitCode))." }
    Test-SshConnection $config
    Write-Warn 'Change the SSH password on the server and disable PasswordAuthentication.'
    return 0
}

function Invoke-SetupMode {
    Test-LocalTool 'git', 'tar', 'npm'
    $config = Connect-Server -ForSetup
    # G-04: once the first Setup has installed the root gateway, sudoers allows nothing else,
    # so every later Setup must go through its check-go-live and setup subcommands.
    $probe = Invoke-Ssh -Config $config -RemoteCommand 'if [ -x /usr/local/sbin/warehouse-root-gateway ]; then echo [GATEWAY_PRESENT]; else echo [NO_GATEWAY]; fi' -Capture -Quiet
    if ($probe.ExitCode -ne 0 -or -not (($probe.Output -contains '[GATEWAY_PRESENT]') -xor ($probe.Output -contains '[NO_GATEWAY]'))) {
        throw "Could not detect the root gateway (exit $($probe.ExitCode))."
    }
    $viaGateway = $probe.Output -contains '[GATEWAY_PRESENT]'
    Write-Info $(if ($viaGateway) { 'Root gateway found: Setup runs through it (re-provisioning; database, .env and media are not touched).' } else { 'No root gateway yet: first Setup runs with full sudo.' })
    if ($viaGateway) {
        $check = Invoke-RemoteRootScript -Config $config -Gateway 'check-go-live' -Capture -Quiet
    } else {
        $check = Invoke-RemoteRootScript -Config $config -Body "if [ -e $RemoteGoLiveFlag ]; then echo '[GO_LIVE_EXISTS]'; else echo '[NO_GO_LIVE]'; fi" -Capture -Quiet
    }
    if ($check.ExitCode -ne 0 -or -not (($check.Output -contains '[GO_LIVE_EXISTS]') -xor ($check.Output -contains '[NO_GO_LIVE]'))) {
        throw "Could not check the GO_LIVE flag (exit $($check.ExitCode))."
    }
    if ($check.Output -contains '[GO_LIVE_EXISTS]') { throw 'Server is GO-LIVE; Setup is blocked to protect live data.' }

    $modules = $config.Modules
    if (-not $config.ModulesSet -and -not $NonInteractive) {
        $answer = ([string](Read-Host -Prompt 'Modules to install: 1) warehouse  2) accounting  3) both [3]')).Trim()
        $modules = switch ($answer) { '1' { 'warehouse' } '2' { 'accounting' } { $_ -in @('', '3') } { $AllModules } default { $null } }
        if (-not $modules) { throw "Invalid selection '$answer'." }
    }
    Write-Info "Modules: $modules (remote-setup refuses to change the modules of an existing installation)."

    $sha = Get-DeployCommit
    $front = Build-IsolatedFrontend $sha
    $bundle = New-DeploymentBundle $sha $front
    $stage = $null
    try {
        $stage = New-RemoteStage $config
        [void](Send-RemoteFile $config $bundle.Path $stage 'bundle.tar.gz')
        [void](Send-RemoteFile $config $bundle.SetupScript $stage 'remote-setup.sh')
        Write-Step "Provisioning $($config.ServerHost)..."
        $body = @'
if [ -e /var/www/warehouse/shared/GO_LIVE ]; then echo '[GO_LIVE_EXISTS]'; exit 3; fi
bash "$@"
'@
        $setupArgs = @("$stage/remote-setup.sh", $config.Domain, $config.AdminEmail, $config.DbName, $config.DbUser,
            $config.AllowedHosts, [string]$config.SshPort, "$stage/bundle.tar.gz", $bundle.Sha256, $modules, $config.CertMode)
        if ($viaGateway) {
            $r = Invoke-RemoteRootScript -Config $config -Gateway 'setup' -ArgumentList $setupArgs -Capture
        } else {
            $r = Invoke-RemoteRootScript -Config $config -Body $body -ArgumentList $setupArgs -Capture
        }
        if ($r.ExitCode -ne 0) {
            Write-Err "Remote setup failed with exit code $($r.ExitCode)."
            return $r.ExitCode
        }
    } finally {
        if ($stage) { Remove-RemoteStage $config $stage }
        Remove-LocalBundle $bundle
    }
    if (@($r.Output | Where-Object { $_ -like '[[]TLS_PENDING[]]*' }).Count -gt 0) {
        Write-Warn "Setup completed WITHOUT a certificate: the application runs, but $($config.Domain) is not reachable until one is issued (HTTP only redirects to HTTPS)."
        Write-Warn 'Next: deploy.ps1 -SetSecret CLOUDFLARE_DNS_API_TOKEN, then deploy.ps1 -IssueCert.'
    } else {
        Write-Success "Setup completed: https://$($config.Domain)/"
    }
    if (-not $config.ModulesSet) {
        try { Save-ConfigModuleList $modules } catch { Write-Warn "Could not record Modules=$modules in the configuration: $($_.Exception.Message)" }
    }
    try {
        [void](Register-PullTask)
    } catch {
        Write-Warn "Could not register the backup pull task: $($_.Exception.Message). Run deploy.ps1 -RegisterPullTask."
    }
    return 0
}

function Invoke-PrepareAndPullBackup($Config, [string]$Sha, $Bundle, [string]$Stage, [string[]]$ExtraPrepareArgs = @()) {
    # Phases 1 and 2 of Update (also used by ResetServer): prepare the release on the server, then pull and
    # verify its pre-update backup. Returns { Release, Backup }, or { ExitCode } when prepare failed.
    Write-Step 'Phase 1/3: preparing the release on the server (venv, checks, pre-update backup, migrate --plan)...'
    $prepArgs = @('--bundle', "$Stage/bundle.tar.gz", '--bundle-sha256', $Bundle.Sha256, '--domain', $Config.Domain) + $ExtraPrepareArgs
    $prep = Invoke-RemoteRootScript -Config $Config -Gateway 'deploy-prepare' -ArgumentList $prepArgs -Capture
    if ($prep.ExitCode -ne 0) {
        Write-Err "Prepare failed with exit code $($prep.ExitCode); nothing was activated."
        return [pscustomobject]@{ ExitCode = $prep.ExitCode }
    }
    $releases = @($prep.Output | ForEach-Object { if ($_ -match '^\[RELEASE\] (\d{8}_\d{6}_[0-9a-f]{12})$') { $Matches[1] } })
    $backups = @($prep.Output | ForEach-Object { if ($_ -match '^\[PRE_UPDATE_BACKUP\] ([A-Za-z0-9][A-Za-z0-9_.-]*\.dump)$') { $Matches[1] } })
    $hashes = @($prep.Output | ForEach-Object { if ($_ -match '^\[PRE_UPDATE_BACKUP_SHA256\] ([0-9a-f]{64})$') { $Matches[1] } })
    if ($releases.Count -ne 1 -or $backups.Count -ne 1 -or $hashes.Count -ne 1) {
        throw 'Prepare did not print exactly one [RELEASE], [PRE_UPDATE_BACKUP] and [PRE_UPDATE_BACKUP_SHA256] marker; not activating.'
    }
    if (-not $releases[0].EndsWith('_' + $Sha.Substring(0, 12))) { throw "Prepared release $($releases[0]) does not belong to commit $Sha." }

    Write-Step "Phase 2/3: pulling and verifying the pre-update backup $($backups[0])..."
    # A backup made by this prepare cannot already be here; an existing copy means a stale or reused dump.
    if ($backups[0] -cnotmatch '^db_pre_update_\d{8}_\d{6}\.dump$' -or (Test-Path -LiteralPath (Get-LocalPathFor $LocalBackupRoot $backups[0]))) {
        throw "Pre-update backup $($backups[0]) is not a fresh db_pre_update_* dump; not activating."
    }
    Receive-VerifiedBackup -Config $Config -RelativePath $backups[0] -ExpectedSha256 $hashes[0] -CompanionRelativePath "$($backups[0]).sha256"
    return [pscustomobject]@{ ExitCode = 0; Release = $releases[0]; Backup = $backups[0] }
}

function Invoke-UpdateMode {
    Test-LocalTool 'git', 'tar', 'npm'
    $config = Connect-Server
    # Update never changes the installed modules: -AddModule adds one, and none is ever removed.
    $serverModules = Get-ServerModuleList $config
    $prepareExtra = @()
    if ($null -eq $serverModules) {
        Write-Warn "The server tooling predates module selection; it runs every module ($AllModules). This Update installs the new tooling."
        if ($config.Modules -cne $AllModules) {
            Write-Err "The configuration asks for Modules=$($config.Modules), but the server runs $AllModules. Update never changes the modules."
            return 1
        }
    } else {
        if ($serverModules -cne $config.Modules) {
            Write-Err "Modules mismatch: the server has '$serverModules', the configuration asks for '$($config.Modules)'."
            Write-Err 'Update never changes the installed modules. Add a module with deploy.ps1 -AddModule <code>; removing a module is not supported.'
            return 1
        }
        $prepareExtra = @('--modules', $serverModules)
    }
    $sha = Get-DeployCommit
    $front = Build-IsolatedFrontend $sha
    $bundle = New-DeploymentBundle $sha $front
    $stage = $null
    try {
        $stage = New-RemoteStage $config
        [void](Send-RemoteFile $config $bundle.Path $stage 'bundle.tar.gz')
        $prepared = Invoke-PrepareAndPullBackup $config $sha $bundle $stage $prepareExtra
        if ($prepared.ExitCode -ne 0) { return $prepared.ExitCode }

        Write-Step "Phase 3/3: activating release $($prepared.Release)..."
        $activateArgs = @($prepared.Release, '--verified-backup', $prepared.Backup, '--domain', $config.Domain)
        if ($Maintenance) { $activateArgs += '--maintenance' }
        $act = Invoke-RemoteRootScript -Config $config -Gateway 'deploy-activate' -ArgumentList $activateArgs
        if ($act.ExitCode -ne 0) {
            Write-Err "Activation failed with exit code $($act.ExitCode). Run deploy.ps1 -Status to see the server state."
            return $act.ExitCode
        }
    } finally {
        if ($stage) { Remove-RemoteStage $config $stage }
        Remove-LocalBundle $bundle
    }
    Write-Success "Update deployed: https://$($config.Domain)/"
    return 0
}

function Invoke-AddModuleMode([string]$Code) {
    if (-not $Code) {
        Assert-Interactive 'AddModule without a module name'
        $Code = ([string](Read-Host -Prompt "Module to add ($($KnownModules -join ' or '))")).Trim()
    }
    if ($Code -cnotin $KnownModules) { throw "Unknown module '$Code' (known: $($KnownModules -join ', '))." }
    $config = Connect-Server
    $serverModules = Get-ServerModuleList $config
    if ($null -eq $serverModules) { throw 'The server tooling predates module selection and already runs every module; run deploy.ps1 -Update first.' }
    if ($Code -in $serverModules.Split(',')) {
        Write-Err "Module $Code is already installed ($serverModules). Removing a module is not supported."
        if ($config.Modules -cne $serverModules) { Write-Warn "The configuration says Modules=$($config.Modules); set it to $serverModules so that Update matches the server." }
        return 1
    }
    $newModules = ConvertTo-CanonicalModuleList "$serverModules,$Code"
    Write-Info "Modules: $serverModules -> $newModules"

    # The backup is stored off-server and verified before anything changes.
    $backup = Invoke-RemoteBackup $config 'pre_module'
    Write-Step "Adding module $Code on the server (migrate, permissions, restart, health check)..."
    $r = Invoke-RemoteRootScript -Config $config -Gateway 'add-module' -ArgumentList @($Code, '--verified-backup', $backup.Name, '--domain', $config.Domain) -Capture
    if ($r.ExitCode -ne 0 -or -not ($r.Output -contains "[MODULE_ADDED] $Code")) {
        if ($r.Output -contains '[MODULE_ROLLED_BACK]') {
            Write-Err "Adding $Code failed; the server runs $serverModules again. Tables already migrated stay; nothing was deleted."
        } else {
            Write-Err "Adding $Code failed (exit $($r.ExitCode)). Run deploy.ps1 -Status to see the server state."
        }
        return $(if ($r.ExitCode -ne 0) { $r.ExitCode } else { 1 })
    }
    try {
        Save-ConfigModuleList $newModules
    } catch {
        Write-Warn "Module added, but Modules=$newModules could not be written to the configuration: $($_.Exception.Message). Set it by hand before the next Update."
    }
    Write-Success "Module $Code added; the server runs $newModules (configuration updated, previous copy in .bak-<timestamp>)."
    return 0
}

function Invoke-ResetServerMode {
    # Before GO_LIVE only: recreates the application database empty with the configured modules and deploys
    # HEAD on it. The pre-update backup of the new release is pulled and verified before the database is dropped.
    Assert-Interactive 'ResetServer'
    Test-LocalTool 'git', 'tar', 'npm'
    $config = Connect-Server
    $check = Invoke-RemoteRootScript -Config $config -Gateway 'check-go-live' -Capture -Quiet
    if ($check.ExitCode -ne 0 -or -not (($check.Output -contains '[GO_LIVE_EXISTS]') -xor ($check.Output -contains '[NO_GO_LIVE]'))) {
        throw "Could not check the GO_LIVE flag (exit $($check.ExitCode))."
    }
    if ($check.Output -contains '[GO_LIVE_EXISTS]') { throw 'Server is GO-LIVE; ResetServer is refused to protect live data.' }
    Write-Warn "ResetServer DROPS the application database on $($config.ServerHost) and creates it empty with Modules=$($config.Modules)."
    Write-Warn 'A verified pre-update backup is pulled to this machine first; media and in-app backup files are kept.'
    if (-not (Confirm-TypedWord 'RESET' "Type RESET to recreate the database of $($config.ServerHost)")) {
        Write-Warn 'ResetServer cancelled; nothing was changed.'
        return 0
    }
    $sha = Get-DeployCommit
    $front = Build-IsolatedFrontend $sha
    $bundle = New-DeploymentBundle $sha $front
    $stage = $null
    try {
        $stage = New-RemoteStage $config
        [void](Send-RemoteFile $config $bundle.Path $stage 'bundle.tar.gz')
        $prepared = Invoke-PrepareAndPullBackup $config $sha $bundle $stage
        if ($prepared.ExitCode -ne 0) { return $prepared.ExitCode }

        Write-Step "Recreating the database with Modules=$($config.Modules)..."
        $resetArgs = @($prepared.Release, '--modules', $config.Modules, '--verified-backup', $prepared.Backup, '--domain', $config.Domain)
        $reset = Invoke-RemoteRootScript -Config $config -Gateway 'reset-database' -ArgumentList $resetArgs -Capture
        if ($reset.ExitCode -ne 0 -or -not (@($reset.Output | Where-Object { $_ -like '[[]DATABASE_RESET[]] *' }).Count -eq 1)) {
            Write-Err "Resetting the database failed (exit $($reset.ExitCode)). The pre-update backup $($prepared.Backup) is stored here and verified."
            return $(if ($reset.ExitCode -ne 0) { $reset.ExitCode } else { 1 })
        }

        Write-Step "Activating release $($prepared.Release) on the new database..."
        $act = Invoke-RemoteRootScript -Config $config -Gateway 'deploy-activate' -ArgumentList @($prepared.Release, '--verified-backup', $prepared.Backup, '--domain', $config.Domain)
        if ($act.ExitCode -ne 0) {
            Write-Err "Activation failed with exit code $($act.ExitCode). Run deploy.ps1 -Status to see the server state."
            return $act.ExitCode
        }
    } finally {
        if ($stage) { Remove-RemoteStage $config $stage }
        Remove-LocalBundle $bundle
    }
    Write-Success "Server reset: empty database with Modules=$($config.Modules) on https://$($config.Domain)/"
    Write-Info 'Next: deploy.ps1 -CreateAdmin to create the first administrator.'
    return 0
}

function Invoke-BackupMode {
    $config = Connect-Server
    [void](Invoke-RemoteBackup $config 'manual')
    return 0
}

function Invoke-PullBackupsMode {
    $transcript = $false
    if ($NonInteractive) {
        $logDir = Join-Path $ScriptRoot 'scratch\logs\pull-backups'
        [void][System.IO.Directory]::CreateDirectory($logDir)
        Start-Transcript -LiteralPath (Join-Path $logDir "pull_$((Get-Date).ToString('yyyyMMdd_HHmmss')).log") | Out-Null
        $transcript = $true
    }
    try {
        $config = Connect-Server
        return (Invoke-PullBackupsCore $config)
    } catch {
        Write-Err "PullBackups stopped: $($_.Exception.Message)"
        return 1
    } finally {
        if ($transcript) { Stop-Transcript | Out-Null }
    }
}

function Invoke-PruneBackupsMode {
    Assert-Interactive 'PruneBackups'
    $config = Connect-Server
    if ((Invoke-PullBackupsCore $config) -ne 0) { throw 'PullBackups must finish without failures before pruning.' }

    # Only complete dumps (with .sha256) count, so a partial or failed dump can never become the "newest" that is kept.
    $r = Invoke-RemoteRootScript -Config $config -Gateway 'list-dumps' -Raw -Quiet
    if ($r.ExitCode -ne 0) { throw "Listing remote dumps failed (exit $($r.ExitCode))." }
    $remote = @($r.Output.Split([char]0) | Where-Object { $_ } | ForEach-Object {
            $p = $_.Split("`t", 2)
            [pscustomobject]@{ Name = $p[1]; MTime = [double]::Parse($p[0], [cultureinfo]::InvariantCulture) }
        } | Sort-Object MTime -Descending)
    if ($remote.Count -le 1) {
        Write-Info 'At most one dump exists on the server; nothing to prune.'
        return 0
    }
    $keep = @{ $remote[0].Name = 'newest on server' }
    $newestVerified = Get-NewestVerifiedLocalDump
    if ($newestVerified) { $keep[$newestVerified.Name] = 'newest verified off-server copy' }

    $candidates = @($remote | Select-Object -Skip 1 | Where-Object {
            -not $keep.ContainsKey($_.Name) -and (Test-SafeRelativePath $_.Name) -and -not $_.Name.Contains('/') -and
            (Test-Path -LiteralPath (Join-Path $LocalBackupRoot $_.Name))
        } | ForEach-Object { $_.Name })
    if ($candidates.Count -eq 0) {
        Write-Info 'No remote dump has a local copy eligible for pruning.'
        return 0
    }
    Write-Warn 'These server dumps have local copies and may be pruned (hashes are re-checked before deletion):'
    $candidates | ForEach-Object { Write-Host "  $_" }
    $keep.GetEnumerator() | ForEach-Object { Write-Info "Always kept: $($_.Key) ($($_.Value))" }
    if (-not (Confirm-TypedWord 'CONFIRM' 'Type CONFIRM to prune these server dumps')) {
        Write-Warn 'Pruning cancelled.'
        return 0
    }

    $fresh = Get-RemoteSha256 $config $candidates
    $matched = [System.Collections.Generic.List[string]]::new()
    foreach ($name in $candidates) {
        $localHash = Get-FileSha256 (Join-Path $LocalBackupRoot $name)
        if ($localHash -eq $fresh[$name]) { $matched.Add($name) } else { Write-Warn "Not pruning ${name}: local sha256 differs from the server copy." }
    }
    if ($matched.Count -eq 0) {
        Write-Info 'Nothing matched; no server file was deleted.'
        return 0
    }
    $d = Invoke-RemoteRootScript -Config $config -Gateway 'prune-delete' -ArgumentList $matched.ToArray() -Capture
    $pruned = @($d.Output | Where-Object { $_ -like '[[]PRUNED[]] *' }).Count
    if ($d.ExitCode -ne 0 -or $pruned -ne $matched.Count) {
        Write-Err "Pruning finished with problems (exit $($d.ExitCode); pruned $pruned of $($matched.Count))."
        return 1
    }
    Write-Success "Pruned $pruned verified server dump(s)."
    return 0
}

function Start-ServicesAfterRestoreAbort($Config) {
    # The database was not changed; restore-start brings the services back (only on a matching release).
    Write-Step 'Starting the services again...'
    $st = Invoke-RemoteRootScript -Config $Config -Gateway 'restore-start' -Capture
    if ($st.Output -contains '[SERVICES_HELD]') {
        Write-Err 'The services stay stopped with MAINTENANCE set: the active release does not match the database schema (see above).'
    } elseif ($st.ExitCode -ne 0 -or -not ($st.Output -contains '[STARTED_OK]')) {
        Write-Err "Starting the services again failed (exit $($st.ExitCode)); see -Status."
    }
}

function Invoke-RestoreMode {
    Assert-Interactive 'Restore'
    $config = Connect-Server
    $r = Invoke-RemoteRootScript -Config $config -Gateway 'restore-list' -Raw -Quiet
    if ($r.ExitCode -ne 0) { throw "Listing remote dumps failed (exit $($r.ExitCode))." }
    $dumps = @($r.Output.Split([char]0) | Where-Object { $_ -and (Get-BackupTimestamp $_) -and $_ -match '^[A-Za-z0-9_.-]+$' } |
            Sort-Object -Property @{ Expression = { Get-BackupTimestamp $_ } } -Descending)
    if ($dumps.Count -eq 0) { throw 'No verified (.dump + .sha256) backups found on the server.' }

    Write-Warn 'Database restore REPLACES the current production database.'
    for ($i = 0; $i -lt $dumps.Count; $i++) { Write-Host (' [{0}] {1}' -f ($i + 1), $dumps[$i]) -ForegroundColor Cyan }
    $selection = ([string](Read-Host -Prompt "Select the backup to restore [1-$($dumps.Count)]")).Trim()
    $index = 0
    if (-not [int]::TryParse($selection, [ref]$index) -or $index -lt 1 -or $index -gt $dumps.Count) { throw 'Invalid selection.' }
    $target = $dumps[$index - 1]
    if (-not (Confirm-TypedWord 'RESTORE' "Type RESTORE to replace the production database with $target")) {
        Write-Warn 'Restore cancelled.'
        return 0
    }

    Write-Step "Verifying $target on the server (sha256 and pg_restore --list)..."
    $c = Invoke-RemoteRootScript -Config $config -Gateway 'restore-check' -ArgumentList @($target) -Capture
    if ($c.ExitCode -ne 0 -or -not ($c.Output -contains '[RESTORE_SOURCE_OK]')) { throw "Backup $target failed verification; nothing was changed." }

    # Services stop BEFORE the pre_restore backup, so no write can land between that backup and the restore.
    Write-Step 'Stopping services (no writes from here until the restore finishes)...'
    $stop = Invoke-RemoteRootScript -Config $config -Gateway 'restore-stop' -Capture
    if ($stop.ExitCode -ne 0 -or -not ($stop.Output -contains '[SERVICES_STOPPED]')) {
        Write-Err "Services could not be stopped (exit $($stop.ExitCode)); nothing was restored."
        return $(if ($stop.ExitCode -ne 0) { $stop.ExitCode } else { 1 })
    }
    try {
        [void](Invoke-RemoteBackup $config 'pre_restore')
    } catch {
        Write-Err "pre_restore backup failed: $($_.Exception.Message)"
        Start-ServicesAfterRestoreAbort $config
        throw 'Restore aborted before touching the database (no verified pre_restore backup).'
    }

    Write-Step "Restoring $target..."
    $res = Invoke-RemoteRootScript -Config $config -Gateway 'restore-exec' -ArgumentList @($target) -Capture
    if ($res.ExitCode -eq 0 -and ($res.Output -contains '[RESTORE_OK]')) {
        Write-Success "Database restored from $target; services are running."
        return 0
    }
    $code = if ($res.ExitCode -ne 0) { $res.ExitCode } else { 1 }
    if (-not ($res.Output -contains '[DB_RESTORED]')) {
        # Refused before pg_restore, or pg_restore rolled back: the database is unchanged.
        Write-Err "Restore failed (exit $code); the database was not changed. See the messages above."
        Start-ServicesAfterRestoreAbort $config
        return $code
    }
    # The database is restored (the pre_restore backup holds the state before it); only the start failed.
    Write-Err "The database WAS restored from $target, but the services were not started (exit $code)."
    if ($res.Output -contains '[SERVICES_HELD]') {
        Write-Err 'The active release does not match the restored schema: services stay stopped and MAINTENANCE is set (503).'
        Write-Err 'Next: -Update with a commit that has every applied migration (unapplied ones are migrated), or -Restore a backup that matches the active release.'
    }
    return $code
}

function Get-DumpPgMajor([string]$Path) {
    $buffer = [byte[]]::new(4096)
    $stream = [System.IO.File]::OpenRead($Path)
    try { $read = $stream.Read($buffer, 0, $buffer.Length) } finally { $stream.Dispose() }
    $text = [System.Text.Encoding]::Latin1.GetString($buffer, 0, $read)
    if (-not $text.StartsWith('PGDMP')) { throw "$Path is not a PostgreSQL custom-format dump." }
    $majors = @([regex]::Matches($text, '(?<![0-9A-Za-z_.])(1[0-9]|[2-9][0-9])\.\d+') | ForEach-Object { [int]$_.Groups[1].Value })
    if ($majors.Count -eq 0) { return 16 }
    return ($majors | Measure-Object -Maximum).Maximum
}

function Invoke-RestoreDrillMode {
    Test-LocalTool 'docker'
    $config = Get-DeployConfig
    if (-not $config.DbUser) { throw 'DbUser is required in the configuration for the restore drill.' }
    $dump = Get-NewestVerifiedLocalDump
    if (-not $dump) { throw 'No verified local dump in backups/soft.' }
    $major = Get-DumpPgMajor $dump.FullName
    $image = "postgres:$major"
    $container = "wh-restore-drill-$((Get-Date).ToString('yyyyMMddHHmmss'))"
    Write-Step "Restore drill: $($dump.Name) into $image (network none)..."

    $docker = { param([string[]]$DockerArgs, [switch]$Show) Invoke-Process -FilePath $DockerExe -ArgumentList $DockerArgs -Capture -Quiet:(-not $Show) }
    $started = $false
    try {
        $run = & $docker @('run', '-d', '--rm', '--name', $container, '--network', 'none', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust',
            '-v', "$([System.IO.Path]::GetFullPath($LocalBackupRoot)):/backup:ro", $image)
        if ($run.ExitCode -ne 0) { throw "docker run failed (exit $($run.ExitCode))." }
        $started = $true
        $ready = $false
        for ($i = 0; $i -lt 90; $i++) {
            if ((& $docker @('exec', $container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-q')).ExitCode -eq 0) { $ready = $true; break }
            Start-Sleep -Seconds 1
        }
        if (-not $ready) { throw 'The drill database did not become ready within 90 seconds.' }

        $psql = @('exec', $container, 'psql', '-U', 'postgres', '-X', '-v', 'ON_ERROR_STOP=1', '-q')
        if ($config.DbUser -ne 'postgres') {
            if ((& $docker ($psql + @('-c', "CREATE ROLE $($config.DbUser) LOGIN"))).ExitCode -ne 0) { throw 'Creating the drill role failed.' }
        }
        if ((& $docker ($psql + @('-c', "CREATE DATABASE restore_drill OWNER $($config.DbUser)"))).ExitCode -ne 0) { throw 'Creating the drill database failed.' }

        $inContainer = "/backup/$($dump.Name)"
        $restore = & $docker @('exec', $container, 'pg_restore', '-U', 'postgres', '-d', 'restore_drill', '--single-transaction', '--exit-on-error', $inContainer) -Show
        if ($restore.ExitCode -ne 0) { throw "pg_restore failed in the drill (exit $($restore.ExitCode))." }

        $countSql = "SELECT table_schema || '.' || table_name, (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', table_schema, table_name), false, true, '')))[1]::text FROM information_schema.tables WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ('pg_catalog', 'information_schema') ORDER BY 1"
        $counts = & $docker ($psql + @('-d', 'restore_drill', '-At', '-F', "`t", '-c', $countSql))
        if ($counts.ExitCode -ne 0) { throw 'Counting rows in the drill database failed.' }
        $tableRows = [ordered]@{}
        foreach ($line in $counts.Output) {
            $p = $line.Split("`t")
            if ($p.Count -eq 2) { $tableRows[$p[0]] = [int64]$p[1] }
        }

        $toc = & $docker @('exec', $container, 'pg_restore', '-l', $inContainer)
        if ($toc.ExitCode -ne 0) { throw 'pg_restore -l failed.' }
        $missing = [System.Collections.Generic.List[string]]::new()
        $dataEntries = 0
        foreach ($line in $toc.Output) {
            if ($line -match '^\d+; \d+ \d+ TABLE DATA (\S+) (\S+) ') {
                $dataEntries++
                if (-not $tableRows.Contains("$($Matches[1]).$($Matches[2])")) { $missing.Add("$($Matches[1]).$($Matches[2])") }
            }
        }
        if ($missing.Count -gt 0) { throw "TABLE DATA entries without a restored table: $($missing -join ', ')" }
        if ($tableRows.Count -eq 0) { throw 'The drill restored no tables.' }

        $total = [int64]0
        foreach ($v in $tableRows.Values) { $total += $v }
        $record = [ordered]@{
            ok = $true; dump = $dump.Name; sha256 = (Read-RecordedHash "$($dump.FullName).sha256"); pg_major = $major; image = $image
            tables = $tableRows.Count; table_data_entries = $dataEntries; rows_total = $total
            checked_at = (Get-Date).ToString('o'); table_rows = $tableRows
        }
        $drillDir = Join-Path $LocalBackupRoot 'restore_drill'
        [void][System.IO.Directory]::CreateDirectory($drillDir)
        $out = Join-Path $drillDir "$($dump.Name).ok.json"
        $tmp = "$out.tmp"
        Write-Utf8LfFile $tmp ($record | ConvertTo-Json -Depth 4)
        [System.IO.File]::Move($tmp, $out, $true)
        Write-Success "Restore drill passed: $($tableRows.Count) tables, $total rows. Record: $out"
        return 0
    } finally {
        if ($started) { [void](& $docker @('rm', '-f', $container)) }
    }
}

function Invoke-RollbackMode {
    Assert-Interactive 'Rollback'
    $config = Connect-Server
    if (-not (Confirm-TypedWord 'YES' 'Type YES to switch the server back to the previous release')) {
        Write-Warn 'Rollback cancelled.'
        return 0
    }
    $r = Invoke-RemoteRootScript -Config $config -Gateway 'deploy-rollback' -ArgumentList @('--domain', $config.Domain)
    if ($r.ExitCode -ne 0) { Write-Err "Rollback failed with exit code $($r.ExitCode)." } else { Write-Success 'Rollback completed.' }
    return $r.ExitCode
}

function Invoke-GoLiveMode {
    Assert-Interactive 'GoLive'
    $config = Connect-Server
    $flag = Invoke-RemoteRootScript -Config $config -Gateway 'check-go-live' -Capture -Quiet
    if ($flag.ExitCode -ne 0) { throw 'Could not read the GO_LIVE flag.' }
    if ($flag.Output -contains '[GO_LIVE_EXISTS]') {
        Write-Success 'Server is already GO-LIVE.'
        return 0
    }

    Write-Step 'Go-live checklist (section 6.7)...'
    $results = [System.Collections.Generic.List[object]]::new()
    $remote = Invoke-RemoteRootScript -Config $config -Gateway 'check-go-live-checklist' -Capture
    if ($remote.ExitCode -ne 0) { $results.Add([pscustomobject]@{ Pass = $false; Text = "server checklist script failed (exit $($remote.ExitCode))" }) }
    foreach ($line in $remote.Output) {
        if ($line -match '^\[CHECK\] (PASS|FAIL) (.+)$') { $results.Add([pscustomobject]@{ Pass = ($Matches[1] -eq 'PASS'); Text = $Matches[2] }) }
    }

    if ($config.SshUser -eq 'root') {
        $results.Add([pscustomobject]@{ Pass = $false; Text = 'SSH login as root is not acceptable for go-live' })
    } else {
        $sudo = Invoke-Ssh -Config $config -RemoteCommand 'sudo -n -l' -Capture -Quiet
        $unrestricted = @($sudo.Output | Where-Object { $_ -match '\)\s*((NOPASSWD|PASSWD|SETENV|NOSETENV):\s*)*ALL\s*$' })
        $pass = $sudo.ExitCode -eq 0 -and $unrestricted.Count -eq 0
        $results.Add([pscustomobject]@{ Pass = $pass; Text = $(if ($pass) { 'sudo of the SSH user is restricted' } else { 'sudo of the SSH user is unrestricted or unreadable (sudo -n -l)' }) })
    }

    $nightly = Get-NewestVerifiedLocalDump 'db_nightly_*'
    $results.Add([pscustomobject]@{ Pass = [bool]$nightly; Text = $(if ($nightly) { "verified off-server nightly copy: $($nightly.Name)" } else { 'no verified off-server nightly copy in backups/soft' }) })

    $taskInfo = Get-ScheduledTask -TaskPath $PullTaskPath -TaskName $PullTaskName -ErrorAction SilentlyContinue | Get-ScheduledTaskInfo -ErrorAction SilentlyContinue
    $taskPass = $taskInfo -and $taskInfo.LastTaskResult -eq 0 -and $taskInfo.LastRunTime -gt [datetime]'2000-01-01'
    $results.Add([pscustomobject]@{ Pass = [bool]$taskPass; Text = $(if ($taskPass) { "pull task last ran $($taskInfo.LastRunTime) with result 0" } else { 'pull task is missing, has not run, or its last result is not 0' }) })

    $drill = Get-RecentRestoreDrill
    $results.Add([pscustomobject]@{ Pass = [bool]$drill; Text = $(if ($drill) { "restore drill passed for $($drill.dump)" } else { 'no successful restore drill for a dump at most 7 days old (run -RestoreDrill)' }) })

    try {
        $fresh = Invoke-RemoteBackup $config 'manual'
        $results.Add([pscustomobject]@{ Pass = $true; Text = "fresh backup $($fresh.Name) pulled and verified" })
    } catch {
        $results.Add([pscustomobject]@{ Pass = $false; Text = "fresh backup failed: $($_.Exception.Message)" })
    }

    foreach ($res in $results) {
        if ($res.Pass) { Write-Success $res.Text } else { Write-Err $res.Text }
    }
    if (@($results | Where-Object { -not $_.Pass }).Count -gt 0) {
        Write-Err 'Go-live checklist failed; the GO_LIVE flag was not created.'
        return 1
    }
    if (-not (Confirm-TypedWord 'GO_LIVE' 'All checks passed. Type GO_LIVE to mark the server as production')) {
        Write-Warn 'Go-live cancelled.'
        return 0
    }
    $s = Invoke-RemoteRootScript -Config $config -Gateway 'set-go-live' -Capture
    if ($s.ExitCode -ne 0 -or -not ($s.Output -contains '[GO_LIVE_ACTIVE]')) { throw 'Creating the GO_LIVE flag failed.' }
    Write-Success 'Server is now marked GO-LIVE.'
    return 0
}

function Get-RecentRestoreDrill {
    $dir = Join-Path $LocalBackupRoot 'restore_drill'
    if (-not (Test-Path -LiteralPath $dir)) { return $null }
    foreach ($f in (Get-ChildItem -LiteralPath $dir -Filter '*.ok.json' -File | Sort-Object LastWriteTime -Descending)) {
        try { $rec = Get-Content -LiteralPath $f.FullName -Raw | ConvertFrom-Json } catch { continue }
        $ts = Get-BackupTimestamp ([string]$rec.dump)
        if ($rec.ok -eq $true -and $ts -and ((Get-Date) - $ts).TotalDays -le 7) { return $rec }
    }
    return $null
}

function Invoke-CreateAdminMode {
    Assert-Interactive 'CreateAdmin'
    $config = Connect-Server
    Write-Info 'Enter the Django superuser details interactively:'
    $r = Invoke-RemoteRootScript -Config $config -Gateway 'create-admin' -Tty
    if ($r.ExitCode -ne 0) { Write-Err "createsuperuser failed with exit code $($r.ExitCode)." } else { Write-Success 'Superuser created.' }
    return $r.ExitCode
}

function Test-SecretValue([string]$Value) {
    if (-not $Value) { return 'the value is empty' }
    if ($Value.Length -gt 4096) { return 'the value is longer than 4096 characters' }
    if ($Value -cne $Value.Trim()) { return 'the value has leading or trailing whitespace' }
    if ($Value -match "['`"\\]") { return 'the value contains a quote or a backslash' }
    if ($Value -match '[\x00-\x1f\x7f]') { return 'the value contains a control character' }
    return $null
}

function Invoke-SetSecretMode([string]$KeyName) {
    Assert-Interactive 'SetSecret'
    if (-not $KeyName) { $KeyName = ([string](Read-Host -Prompt "Secret name ($($SecretKeyAllowList -join ', '))")).Trim() }
    if ($SecretKeyAllowList -cnotcontains $KeyName) { throw "Only these keys may be set: $($SecretKeyAllowList -join ', ')." }
    $config = Connect-Server
    $value = [string](Read-Host -Prompt "Value for $KeyName" -MaskInput)
    $problem = Test-SecretValue $value
    if ($problem) { throw "Rejected: $problem." }

    if ($KeyName -ceq 'CLOUDFLARE_DNS_API_TOKEN') {
        # Root-only /etc/letsencrypt/cloudflare.ini (never shared/.env: the application does not need it).
        $r = Invoke-RemoteRootScript -Config $config -Gateway 'set-dns-token' -StdinText $value -Capture
        if ($r.ExitCode -ne 0 -or -not ($r.Output -contains '[OK_UPDATED]')) { throw "Storing the Cloudflare token failed (exit $($r.ExitCode))." }
        Write-Success 'Cloudflare token stored root-only on the server. Next: deploy.ps1 -IssueCert.'
        return 0
    }
    $r = Invoke-RemoteRootScript -Config $config -Gateway 'set-secret' -ArgumentList @($KeyName) -StdinText $value -Capture
    if ($r.ExitCode -ne 0 -or -not ($r.Output -contains '[OK_UPDATED]')) { throw "Updating $KeyName failed (exit $($r.ExitCode))." }
    Write-Success "$KeyName updated in shared/.env (previous file kept as .env.bak.<timestamp>)."
    Write-Warn 'Restart the services (deploy.ps1 -Restart) for the new value to take effect.'
    return 0
}

function Invoke-LogsMode {
    Assert-Interactive 'Logs'
    $config = Connect-Server
    Write-Step 'Streaming service logs (Ctrl+C to exit)...'
    return (Invoke-RemoteRootScript -Config $config -Gateway 'logs' -ArgumentList @('200', '--follow') -Tty).ExitCode
}

function Invoke-RestartMode {
    $config = Connect-Server
    Write-Step 'Restarting application services and reloading Nginx...'
    $r = Invoke-RemoteRootScript -Config $config -Gateway 'restart'
    if ($r.ExitCode -ne 0) { Write-Err "Restart failed with exit code $($r.ExitCode)." } else { Write-Success 'Services restarted.' }
    return $r.ExitCode
}

function Invoke-IssueCertMode {
    $config = Connect-Server
    if ($config.CertMode -in @('cloudflare-origin', 'custom')) {
        throw "IssueCert is for Let's Encrypt modes ('http01' or 'dns01-cloudflare'). For '$($config.CertMode)', use deploy.ps1 -InstallCert -CertFile <path> -KeyFile <path> [-ChainFile <path>]."
    }
    $targetMode = if ($config.CertModeSet) { $config.CertMode } else { $null }
    Write-Step "Requesting the Let's Encrypt certificate for $($config.Domain)$(if ($targetMode) { " via $targetMode" })..."
    $gatewayArgs = @($config.AdminEmail)
    if ($targetMode) { $gatewayArgs += $targetMode }
    $r = Invoke-RemoteRootScript -Config $config -Gateway 'issue-cert' -ArgumentList $gatewayArgs -Capture
    if ($r.ExitCode -ne 0 -or -not ($r.Output -contains '[CERT_OK]')) {
        Write-Err "Issuing the certificate failed (exit $($r.ExitCode)). See the messages above."
        return $(if ($r.ExitCode -ne 0) { $r.ExitCode } else { 1 })
    }
    Write-Success "HTTPS is active: https://$($config.Domain)/ (renewed automatically by certbot.timer)."
    return 0
}

function Invoke-InstallCertMode([string]$CertPath, [string]$KeyPath, [string]$ChainPath) {
    if (-not $CertPath) {
        Assert-Interactive 'InstallCert without -CertFile'
        $CertPath = ([string](Read-Host -Prompt 'Path to certificate file (PEM)')).Trim()
    }
    if (-not $KeyPath) {
        Assert-Interactive 'InstallCert without -KeyFile'
        $KeyPath = ([string](Read-Host -Prompt 'Path to private key file (PEM)')).Trim()
    }
    if (-not (Test-Path -LiteralPath $CertPath -PathType Leaf)) { throw "Certificate file not found: $CertPath" }
    if (-not (Test-Path -LiteralPath $KeyPath -PathType Leaf)) { throw "Private key file not found: $KeyPath" }
    if ($ChainPath -and -not (Test-Path -LiteralPath $ChainPath -PathType Leaf)) { throw "Chain file not found: $ChainPath" }

    $config = Connect-Server
    if ($config.CertMode -notin @('cloudflare-origin', 'custom')) {
        throw "InstallCert is for CertMode 'cloudflare-origin' or 'custom' only (configured: '$($config.CertMode)'). Update CertMode in deploy_config.json first."
    }

    Write-Step "Uploading certificate files to temporary stage on $($config.ServerHost)..."
    $stage = $null
    try {
        $stage = New-RemoteStage $config
        [void](Send-RemoteFile -Config $config -LocalPath $CertPath -StageDir $stage -Name 'cert.pem')
        [void](Send-RemoteFile -Config $config -LocalPath $KeyPath -StageDir $stage -Name 'privkey.pem')
        $gatewayArgs = @($config.CertMode, "$stage/cert.pem", "$stage/privkey.pem")
        if ($ChainPath) {
            [void](Send-RemoteFile -Config $config -LocalPath $ChainPath -StageDir $stage -Name 'chain.pem')
            $gatewayArgs += "$stage/chain.pem"
        }

        Write-Step "Verifying and installing certificate on $($config.ServerHost) (mode: $($config.CertMode))..."
        $r = Invoke-RemoteRootScript -Config $config -Gateway 'install-cert' -ArgumentList $gatewayArgs -Capture
        if ($r.ExitCode -ne 0 -or -not ($r.Output -contains "[CERT_INSTALLED] $($config.CertMode)")) {
            Write-Err "Certificate installation failed (exit $($r.ExitCode)). See messages above."
            return $(if ($r.ExitCode -ne 0) { $r.ExitCode } else { 1 })
        }
    } finally {
        if ($stage) { Remove-RemoteStage $config $stage }
    }
    Write-Success "Certificate installed successfully ($($config.CertMode)) on https://$($config.Domain)/"
    return 0
}

function Invoke-StatusMode {
    $config = Connect-Server
    Write-Step "Server status of $($config.ServerHost)..."
    $r = Invoke-RemoteRootScript -Config $config -Gateway 'status' -ArgumentList @($config.Domain)

    Write-Host "`n=== [9] Off-server copies (this machine) ===" -ForegroundColor Cyan
    $newest = @(Get-LocalDumpList | Select-Object -First 1)
    if ($newest.Count -gt 0) {
        $hours = [math]::Round(((Get-Date) - (Get-BackupTimestamp $newest[0].Name)).TotalHours, 1)
        Write-Info "Newest verified off-server dump: $($newest[0].Name) ($hours hours old by its name)."
        if ($hours -gt 48) { Write-Warn 'The newest off-server dump is older than 48 hours.' }
    } else {
        Write-Warn 'No verified off-server dump in backups/soft.'
    }
    $taskInfo = Get-ScheduledTask -TaskPath $PullTaskPath -TaskName $PullTaskName -ErrorAction SilentlyContinue | Get-ScheduledTaskInfo -ErrorAction SilentlyContinue
    if ($taskInfo) {
        Write-Info "Pull task: last run $($taskInfo.LastRunTime), result $($taskInfo.LastTaskResult), next run $($taskInfo.NextRunTime)."
        if ($taskInfo.LastTaskResult -ne 0) { Write-Warn 'The last pull task run did not succeed.' }
    } else {
        Write-Warn 'Pull task is not registered (deploy.ps1 -RegisterPullTask).'
    }
    $drillDir = Join-Path $LocalBackupRoot 'restore_drill'
    $lastDrill = if (Test-Path -LiteralPath $drillDir) { Get-ChildItem -LiteralPath $drillDir -Filter '*.ok.json' -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1 }
    if ($lastDrill) { Write-Info "Last restore drill: $($lastDrill.Name) at $($lastDrill.LastWriteTime)." } else { Write-Warn 'No restore drill recorded.' }
    return $r.ExitCode
}

# ==============================================================================
# Menu, help and entry point
# ==============================================================================
function Invoke-ChangeDomainMode([string]$NewDomain) {
    if (-not $NewDomain) {
        Assert-Interactive 'ChangeDomain'
        $NewDomain = ([string](Read-Host -Prompt 'New primary domain name (lower-case)')).Trim()
    }
    $domainRegex = '^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
    if ($NewDomain -cnotmatch $domainRegex) { throw "New domain must be a lower-case hostname (got: '$NewDomain')." }

    $config = Connect-Server
    if ($NewDomain -ceq $config.Domain) { throw "Domain '$NewDomain' is already the active primary domain." }

    Write-Step "Changing primary domain from $($config.Domain) to $NewDomain on $($config.ServerHost)..."

    # Certificate check/issuance:
    # If the certificate for $NewDomain is not present yet, obtain it using CertMode.
    if ($config.CertMode -in @('http01', 'dns01-cloudflare')) {
        Write-Step "Requesting Let's Encrypt certificate for $NewDomain via $($config.CertMode)..."
        $gatewayArgs = @($config.AdminEmail, $config.CertMode, $NewDomain)
        $rCert = Invoke-RemoteRootScript -Config $config -Gateway 'issue-cert' -ArgumentList $gatewayArgs -Capture
        if ($rCert.ExitCode -ne 0 -or -not ($rCert.Output -contains '[CERT_OK]')) {
            throw "Issuing certificate for $NewDomain failed (exit $($rCert.ExitCode))."
        }
    } elseif ($config.CertMode -in @('cloudflare-origin', 'custom')) {
        if ($CertFile -and $KeyFile) {
            Write-Step "Installing TLS certificate for $NewDomain via $($config.CertMode)..."
            $stage = $null
            try {
                $stage = New-RemoteStage $config
                [void](Send-RemoteFile -Config $config -LocalPath $CertFile -StageDir $stage -Name 'cert.pem')
                [void](Send-RemoteFile -Config $config -LocalPath $KeyFile -StageDir $stage -Name 'privkey.pem')
                $gatewayArgs = @($config.CertMode, "$stage/cert.pem", "$stage/privkey.pem")
                if ($ChainFile) {
                    [void](Send-RemoteFile -Config $config -LocalPath $ChainFile -StageDir $stage -Name 'chain.pem')
                    $gatewayArgs += "$stage/chain.pem"
                }
                $gatewayArgs += $NewDomain
                $rCert = Invoke-RemoteRootScript -Config $config -Gateway 'install-cert' -ArgumentList $gatewayArgs -Capture
                if ($rCert.ExitCode -ne 0 -or -not ($rCert.Output -contains "[CERT_INSTALLED] $($config.CertMode)")) {
                    throw "Installing certificate for $NewDomain failed (exit $($rCert.ExitCode))."
                }
            } finally {
                if ($stage) { Remove-RemoteStage $config $stage }
            }
        }
    }

    # Execute domain change on server (atomically updates shared/DOMAIN, shared/DOMAINS_LEGACY, .env, and Nginx)
    Write-Step "Applying domain change on $($config.ServerHost)..."
    $rChange = Invoke-RemoteRootScript -Config $config -Gateway 'change-domain' -ArgumentList @($NewDomain) -Capture
    if ($rChange.ExitCode -ne 0 -or -not ($rChange.Output -contains "[DOMAIN_CHANGED] $NewDomain")) {
        throw "Domain change failed on the server (exit $($rChange.ExitCode)). State was rolled back on the server."
    }

    # Update deploy_config.json with timestamped backup
    Save-ConfigDomain $NewDomain

    Write-Success "Domain changed successfully!"
    Write-Success "  Primary domain (active): $NewDomain"
    Write-Success "  Legacy domain (transition): $($config.Domain)"
    Write-Warn "CRITICAL: OAuth redirect URI in Google Cloud Console must be updated to:"
    Write-Warn "  https://$NewDomain/api/accounts/gdrive/callback/"
    return 0
}

function Invoke-FinishDomainChangeMode {
    $config = Connect-Server
    Write-Step "Finalizing domain change on $($config.ServerHost) (converting transition domains to 301 redirects)..."
    $r = Invoke-RemoteRootScript -Config $config -Gateway 'finish-domain-change' -Capture
    if ($r.ExitCode -ne 0 -or -not ($r.Output -contains '[FINISH_DOMAIN_CHANGE_OK]')) {
        throw "Finalizing domain change failed (exit $($r.ExitCode))."
    }
    Write-Success "All transition domains converted to permanent 301 redirects."
    Write-Info "Certificates for legacy domains continue to be renewed automatically for HTTPS redirection."
    return 0
}

function Invoke-RemoveLegacyDomainMode([string]$LegacyDomain) {
    if (-not $LegacyDomain) {
        Assert-Interactive 'RemoveLegacyDomain'
        $LegacyDomain = ([string](Read-Host -Prompt 'Domain to retire from legacy redirect')).Trim()
    }
    $domainRegex = '^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
    if ($LegacyDomain -cnotmatch $domainRegex) { throw "Legacy domain must be a lower-case hostname (got: '$LegacyDomain')." }

    $config = Connect-Server
    if ($LegacyDomain -ceq $config.Domain) { throw "Cannot remove active primary domain '$LegacyDomain'." }

    Assert-Interactive 'RemoveLegacyDomain'
    Write-Warn "This will remove the 301 redirect for legacy domain '$LegacyDomain'."
    Write-Warn "Its TLS certificate directory will be archived into shared/retired/tls/ (no files deleted)."
    if (-not (Confirm-TypedWord "RETIRE $LegacyDomain" "Type 'RETIRE $LegacyDomain' to confirm removal")) {
        Write-Warn "Removal of legacy domain $LegacyDomain cancelled."
        return 0
    }

    Write-Step "Removing legacy domain $LegacyDomain on $($config.ServerHost)..."
    $r = Invoke-RemoteRootScript -Config $config -Gateway 'remove-legacy-domain' -ArgumentList @($LegacyDomain) -Capture
    if ($r.ExitCode -ne 0 -or -not ($r.Output -contains "[LEGACY_DOMAIN_REMOVED] $LegacyDomain")) {
        throw "Removing legacy domain failed on the server (exit $($r.ExitCode))."
    }
    Write-Success "Legacy domain $LegacyDomain removed and archived to shared/retired/ on the server."
    return 0
}

$MenuItems = @(
    @('InstallKey', 'Install SSH public key on the server'),
    @('Setup', 'Initial server provisioning and first deployment'),
    @('Update', 'Two-phase update (prepare, pull backup, activate)'),
    @('AddModule', 'Add a module (warehouse or accounting)'),
    @('Backup', 'Create a manual server backup and pull it'),
    @('PullBackups', 'Pull and verify all server backups'),
    @('PruneBackups', 'Prune server dumps verified off-server'),
    @('Restore', 'Restore the database from a server dump'),
    @('RestoreDrill', 'Restore drill of the newest local dump (Docker)'),
    @('Rollback', 'Roll back to the previous release'),
    @('GoLive', 'Run the go-live checklist and set GO_LIVE'),
    @('CreateAdmin', 'Create a Django superuser interactively'),
    @('SetSecret', 'Set an allowed secret in shared/.env'),
    @('RegisterPullTask', 'Register the scheduled backup pull task'),
    @('Logs', 'Stream service logs'),
    @('Restart', 'Restart services and reload Nginx'),
    @('IssueCert', "Issue the Let's Encrypt certificate (HTTP-01 or DNS-01 by CertMode)"),
    @('InstallCert', 'Install a Cloudflare Origin or Custom TLS certificate'),
    @('ChangeDomain', 'Change primary domain (new domain active, old in transition)'),
    @('FinishDomainChange', 'Finish domain change (convert transition domains to 301 redirect)'),
    @('RemoveLegacyDomain', 'Remove legacy domain redirect (archives TLS to shared/retired)'),
    @('Status', 'Server and off-server backup status'),
    @('ResetServer', 'Recreate the database empty (before GO_LIVE only)')
)

function Show-Menu {
    while ($true) {
        Write-Host '======================================================================' -ForegroundColor Cyan
        Write-Host '  Warehouse Management System - Server Operations' -ForegroundColor White
        Write-Host '======================================================================' -ForegroundColor Cyan
        for ($i = 0; $i -lt $MenuItems.Count; $i++) {
            Write-Host ('{0,2}) {1,-50} (-{2})' -f ($i + 1), $MenuItems[$i][1], $MenuItems[$i][0])
        }
        Write-Host ('{0,2}) Exit' -f ($MenuItems.Count + 1))
        $choice = ([string](Read-Host -Prompt "Select an option [1-$($MenuItems.Count + 1)]")).Trim()
        $n = 0
        if (-not [int]::TryParse($choice, [ref]$n) -or $n -lt 1 -or $n -gt $MenuItems.Count + 1) {
            Write-Warn 'Invalid selection.'
            continue
        }
        if ($n -eq $MenuItems.Count + 1) { return 0 }
        $code = Invoke-Mode $MenuItems[$n - 1][0]
        Write-Info "Finished with exit code $code."
        Wait-Console 'Press Enter to return to the menu...'
    }
}

function Show-Help {
    Write-Host @'
======================================================================
  Warehouse Management System - deploy.ps1
======================================================================
Modes (exactly one):
  -InstallKey        Install the local ED25519 public key on the server (interactive)
  -Setup             Provision the server and deploy HEAD (blocked after GO_LIVE)
  -Update            Build HEAD, upload, prepare, pull the pre-update backup, activate
                     (never changes the installed modules; Modules must match the server)
  -AddModule <code>  Add the warehouse or accounting module: verified backup, migrate, restart, health
                     check; a failure restores the previous modules (removing a module is not supported)
  -ResetServer       Before GO_LIVE only: recreate the database empty with Modules and deploy HEAD (typed RESET)
  -Backup            Create a manual server backup and pull it (verified)
  -PullBackups       Pull new verified backups and the media mirror into backups/soft
  -PruneBackups      Delete server dumps whose local copy matches a fresh server sha256
  -Restore           Restore the database from a server dump (typed confirmation)
  -RestoreDrill      Restore the newest verified local dump into a throwaway Docker PostgreSQL
  -Rollback          Switch back to the previous release
  -GoLive            Run the go-live checklist, then set the GO_LIVE flag
  -CreateAdmin       Create a Django superuser over an interactive SSH session
  -SetSecret <KEY>   Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET or OUTBOUND_HTTP_PROXY,
                     or CLOUDFLARE_DNS_API_TOKEN (root-only file for DNS-01 certificates)
  -RegisterPullTask  Register the daily backup pull task (use -Force to re-register)
  -Logs              Stream the service journal
  -Restart           Restart application services and reload Nginx
  -IssueCert         Issue the Let's Encrypt certificate (HTTP-01 or DNS-01 by CertMode)
  -InstallCert       Install a Cloudflare Origin or Custom TLS certificate (-CertFile, -KeyFile)
  -ChangeDomain <d>  Change primary domain to <d>: issues/installs cert, puts old domain in transition
  -FinishDomainChange Convert all legacy transition domains to permanent 301 redirects
  -RemoveLegacyDomain <d> Remove legacy domain redirect (archives its TLS files to shared/retired/)
  -Status            Server state, heartbeats, disk, certificate and off-server copies
  -Help              Show this help

Options:
  -NonInteractive    No prompts; modes that need typed confirmation are refused
  -AllowDirty        Deploy HEAD although the working tree has changes (typed DIRTY)
  -SkipBuild         Reuse a completed build of the same commit
  -Maintenance       Activate the update in maintenance mode
  -Force             Re-register the scheduled task
  -CertFile <path>   Certificate file for -InstallCert
  -KeyFile <path>    Private key file for -InstallCert
  -ChainFile <path>  Optional intermediate CA chain file for -InstallCert
  -ConfigFile <path> Configuration file (default deploy_config.json; absolute paths allowed)
'@
}

function Invoke-Mode([string]$Name) {
    $lock = $null
    try {
        if ($Name -notin @('Help', 'Status', 'Logs')) { $lock = Enter-DeployLock }
        $result = switch ($Name) {
            'InstallKey' { Invoke-InstallKeyMode }
            'Setup' { Invoke-SetupMode }
            'Update' { Invoke-UpdateMode }
            'AddModule' { Invoke-AddModuleMode $AddModule }
            'ResetServer' { Invoke-ResetServerMode }
            'Backup' { Invoke-BackupMode }
            'PullBackups' { Invoke-PullBackupsMode }
            'PruneBackups' { Invoke-PruneBackupsMode }
            'Restore' { Invoke-RestoreMode }
            'RestoreDrill' { Invoke-RestoreDrillMode }
            'Rollback' { Invoke-RollbackMode }
            'GoLive' { Invoke-GoLiveMode }
            'CreateAdmin' { Invoke-CreateAdminMode }
            'SetSecret' { Invoke-SetSecretMode $SetSecret }
            'RegisterPullTask' { Register-PullTask }
            'Logs' { Invoke-LogsMode }
            'Restart' { Invoke-RestartMode }
            'IssueCert' { Invoke-IssueCertMode }
            'InstallCert' { Invoke-InstallCertMode -CertPath $CertFile -KeyPath $KeyFile -ChainPath $ChainPath }
            'ChangeDomain' { Invoke-ChangeDomainMode $ChangeDomain }
            'FinishDomainChange' { Invoke-FinishDomainChangeMode }
            'RemoveLegacyDomain' { Invoke-RemoveLegacyDomainMode $RemoveLegacyDomain }
            'Status' { Invoke-StatusMode }
            'Help' { Show-Help; 0 }
            default { throw "Unknown mode: $Name" }
        }
        return (ConvertTo-ExitCode $result)
    } catch {
        Write-Err "$Name stopped: $($_.Exception.Message)"
        return 1
    } finally {
        if ($lock) { $lock.Dispose() }
    }
}

function Invoke-Main {
    try {
        $flags = [ordered]@{
            InstallKey = [bool]$InstallKey; Setup = [bool]$Setup; Update = [bool]$Update; Backup = [bool]$Backup
            PullBackups = [bool]$PullBackups; PruneBackups = [bool]$PruneBackups; Restore = [bool]$Restore
            RestoreDrill = [bool]$RestoreDrill; Rollback = [bool]$Rollback; GoLive = [bool]$GoLive
            CreateAdmin = [bool]$CreateAdmin; SetSecret = -not [string]::IsNullOrEmpty($SetSecret)
            RegisterPullTask = [bool]$RegisterPullTask; Logs = [bool]$Logs; Restart = [bool]$Restart
            IssueCert = [bool]$IssueCert; InstallCert = [bool]$InstallCert; Status = [bool]$Status; Help = [bool]$ShowHelp
            AddModule = -not [string]::IsNullOrEmpty($AddModule); ResetServer = [bool]$ResetServer
            ChangeDomain = -not [string]::IsNullOrEmpty($ChangeDomain)
            FinishDomainChange = [bool]$FinishDomainChange
            RemoveLegacyDomain = -not [string]::IsNullOrEmpty($RemoveLegacyDomain)
        }
        $chosen = @($flags.Keys | Where-Object { $flags[$_] })
        if ($chosen.Count -gt 1) {
            Write-Err "Specify only one mode (got: $($chosen -join ', '))."
            return 1
        }
        if ($chosen.Count -eq 0) {
            if ($NonInteractive) {
                Write-Err 'No mode specified in -NonInteractive mode.'
                return 1
            }
            return (ConvertTo-ExitCode (Show-Menu))
        }
        $code = Invoke-Mode $chosen[0]
        if ($chosen[0] -notin @('Help', 'Logs')) { Wait-Console }
        return $code
    } catch {
        Write-Err "deploy.ps1 stopped: $($_.Exception.Message)"
        return 1
    }
}

if ($MyInvocation.InvocationName -eq '.') { return }
exit (Invoke-Main)
