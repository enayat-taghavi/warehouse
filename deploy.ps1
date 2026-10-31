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
    [string]$RollbackRelease,
    [switch]$GoLive,
    [switch]$CreateAdmin,
    [switch]$ResetLockout,
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
$MobileEnvFile = ''  # empty = frontend\src\environments\environment.mobile.ts (Get-MobileEnvPath)
$FrontDistRelative = 'dist\warehouse-app\browser'

$RemoteBackupDir = '/var/www/warehouse/shared/backups'
$RemoteGoLiveFlag = '/var/www/warehouse/shared/GO_LIVE'

$PullTaskPath = '\Warehouse\'
$PullTaskName = 'WarehouseSoftPullBackups'
$SecretKeyAllowList = @('GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'OUTBOUND_HTTP_PROXY', 'CLOUDFLARE_DNS_API_TOKEN')
# Installable modules discovered dynamically from the repository; WH_MODULES on the server.
$KnownModules = @()
$AllModules = ''
# Modules installed when the configuration names none: every module except the opt-in ones (opt_in=True).
$DefaultModules = ''
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
    $SshKeyscanExe = Join-Path $WindowsOpenSsh 'ssh-keyscan.exe'
} else {
    $SshExe = Find-Application 'ssh.exe'
    $SshKeygenExe = Find-Application 'ssh-keygen.exe'
    $SshKeyscanExe = Find-Application 'ssh-keyscan.exe'
}
$KnownHostsFile = Join-Path $env:USERPROFILE '.ssh\known_hosts'
# Branding asked before every build (Setup, Update, ResetServer); written into the build snapshot only.
$BrandingKeys = @('SystemName', 'AppShortName', 'OrganizationName')
$BrandingValueRegex = '^[^\x00-\x1f\x7f<>&"''\\`{}]{1,80}$'
# The temporary password-less sudo file the first Setup asks for; Setup removes it once the gateway is installed.
$BootstrapSudoersFile = '/etc/sudoers.d/90-warehouse-setup-temp'
$GitExe = Find-Application 'git.exe'
if ($GitExe) {
    $gitKeyscan = Join-Path (Split-Path (Split-Path $GitExe)) 'usr\bin\ssh-keyscan.exe'
    if (Test-Path -LiteralPath $gitKeyscan) { $SshKeyscanExe = $gitKeyscan }
}
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
    if ($Value -is [int]) {
        if ($Value -ge 0 -and $Value -le 255) { return $Value }
        return 1
    }
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
        [switch]$Quiet,
        [switch]$SuppressStdErr
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
        if ($errText -and $errText.Trim() -and -not $SuppressStdErr) {
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

# Repo, bundle and server use the same folder names.
$BundleBackendDir = 'backend'
$BundleFrontDir = 'frontend'

function Get-KnownModules([string]$Sha = 'HEAD') {
    $r = Invoke-Git @('ls-tree', '-d', '--name-only', $Sha, "$BundleBackendDir/modules/")
    if ($r.ExitCode -eq 0 -and -not [string]::IsNullOrWhiteSpace($r.Output)) {
        $lines = $r.Output -split "[\r\n]+" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
        $mods = @($lines | ForEach-Object { Split-Path ($_.Trim().Replace('\', '/')) -Leaf } | Sort-Object -Unique)
        if ($mods.Count -gt 0) { return $mods }
    }
    $localModsDir = Join-Path $ScriptRoot 'backend\modules'
    if (Test-Path -LiteralPath $localModsDir) {
        $mods = @(Get-ChildItem -LiteralPath $localModsDir -Directory | ForEach-Object { $_.Name } | Sort-Object -Unique)
        if ($mods.Count -gt 0) { return $mods }
    }
    return @()
}

function Get-DefaultModules([string]$Sha = 'HEAD') {
    # Opt-in modules (opt_in=True in modules/<m>/module.py) install only when named in Modules.
    return (@($KnownModules | Where-Object {
        $r = Invoke-Git @('show', "${Sha}:$BundleBackendDir/modules/$_/module.py")
        -not ($r.ExitCode -eq 0 -and $r.Output -match '(?m)^\s*opt_in\s*=\s*True')
    }) -join ',')
}

$KnownModules = @(Get-KnownModules 'HEAD')
$AllModules = $KnownModules -join ','
$DefaultModules = Get-DefaultModules 'HEAD'

function Test-LocalTool([string[]]$Name) {
    $map = @{ ssh = $SshExe; 'ssh-keygen' = $SshKeygenExe; 'ssh-keyscan' = $SshKeyscanExe; git = $GitExe; tar = $TarExe; npm = $NpmCmd; docker = $DockerExe }
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

function Test-DeployConfig {
    # Validates the raw configuration. Returns { Problems (ordered: key -> message), Config }.
    param([Parameter(Mandatory)]$RawConfig, [string]$SourcePath, [switch]$ForSetup)
    $hostRegex = '^(?=.{1,253}$)[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$'
    $domainRegex = '^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
    $problems = [ordered]@{}

    $serverHost = ([string]$RawConfig.ServerHost).Trim()
    $ip = $null
    if (-not ($serverHost -match $hostRegex -or [System.Net.IPAddress]::TryParse($serverHost, [ref]$ip))) { $problems['ServerHost'] = 'ServerHost must be a hostname or an IP address' }

    $sshUser = ([string]$RawConfig.SshUser).Trim()
    if ($sshUser -notmatch '^[a-z_][a-z0-9_-]{0,31}$') { $problems['SshUser'] = 'SshUser must match ^[a-z_][a-z0-9_-]{0,31}$' }

    $portText = [string]$RawConfig.SshPort
    if (-not $portText) { $portText = '22' }
    $port = 0
    if (-not [int]::TryParse($portText, [ref]$port) -or $port -lt 1 -or $port -gt 65535) { $problems['SshPort'] = 'SshPort must be between 1 and 65535' }

    $domain = ([string]$RawConfig.Domain).Trim()
    if ($domain -cnotmatch $domainRegex) { $problems['Domain'] = 'Domain must be a lower-case hostname' }

    $fingerprint = ([string]$RawConfig.HostKeyFingerprint).Trim()
    if ($fingerprint -cnotmatch '^SHA256:[A-Za-z0-9+/]{43}$') { $problems['HostKeyFingerprint'] = 'HostKeyFingerprint is required and must match ^SHA256:[A-Za-z0-9+/]{43}$' }

    $dbName = ([string]$RawConfig.DbName).Trim()
    $dbUser = ([string]$RawConfig.DbUser).Trim()
    foreach ($pair in @(@('DbName', $dbName), @('DbUser', $dbUser))) {
        if ($pair[1] -and $pair[1] -cnotmatch '^[a-z_][a-z0-9_]{0,62}$') { $problems[$pair[0]] = "$($pair[0]) must match ^[a-z_][a-z0-9_]{0,62}$" }
    }

    $allowedHosts = ([string]$RawConfig.AllowedHosts).Trim() -replace '\s*,\s*', ','
    if (-not $allowedHosts) { $allowedHosts = $domain }
    if ($allowedHosts -notmatch '^[A-Za-z0-9.,*-]+$') { $problems['AllowedHosts'] = 'AllowedHosts must match ^[A-Za-z0-9.,*-]+$' }

    $modulesSet = $null -ne $RawConfig.PSObject.Properties['Modules']
    $modules = if ($modulesSet) { ConvertTo-CanonicalModuleList ([string]$RawConfig.Modules) } else { $DefaultModules }
    if (-not $modules) { $problems['Modules'] = "Modules must list known modules separated by commas ($($KnownModules -join ', '))" }

    $certModeSet = $null -ne $RawConfig.PSObject.Properties['CertMode']
    $certMode = if ($certModeSet) { ([string]$RawConfig.CertMode).Trim().ToLowerInvariant() } else { $DefaultCertMode }
    if ($certMode -notin $KnownCertModes) { $problems['CertMode'] = "CertMode must be one of: $($KnownCertModes -join ', ')" }

    # Names shown in the user interface; empty keeps the names in the code (frontend/src/app/core/branding.ts).
    $branding = [ordered]@{}
    foreach ($key in $BrandingKeys) {
        $value = ([string]$RawConfig.$key).Trim()
        if ($value -and $value -notmatch $BrandingValueRegex) { $problems[$key] = "$key must be at most 80 characters without control characters or any of < > & `" ' \ `` { }" }
        $branding[$key] = $value
    }

    $adminEmail = ([string]$RawConfig.AdminEmail).Trim()
    if ($ForSetup) {
        if ($adminEmail -notmatch '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$') { $problems['AdminEmail'] = 'AdminEmail must be a valid e-mail address (required for Setup)' }
        elseif ($adminEmail -match '@example\.com$') { $problems['AdminEmail'] = 'AdminEmail must not be an @example.com address (Let''s Encrypt rejects it)' }
        if (-not $dbName) { $problems['DbName'] = 'DbName is required for Setup' }
        if (-not $dbUser) { $problems['DbUser'] = 'DbUser is required for Setup' }
    }

    $config = [pscustomobject]@{
        ServerHost = $serverHost; SshUser = $sshUser; SshPort = $port; Domain = $domain
        HostKeyFingerprint = $fingerprint; DbName = $dbName; DbUser = $dbUser
        AllowedHosts = $allowedHosts; AdminEmail = $adminEmail; SourcePath = $SourcePath
        Modules = $modules; ModulesSet = $modulesSet
        CertMode = $certMode; CertModeSet = $certModeSet
        SystemName = $branding['SystemName']; AppShortName = $branding['AppShortName']; OrganizationName = $branding['OrganizationName']
    }
    return [pscustomobject]@{ Problems = $problems; Config = $config }
}

function Assert-DeployConfig {
    param([Parameter(Mandatory)]$RawConfig, [string]$SourcePath, [switch]$ForSetup)
    $t = Test-DeployConfig -RawConfig $RawConfig -SourcePath $SourcePath -ForSetup:$ForSetup
    if ($t.Problems.Count -gt 0) {
        throw "Invalid deployment configuration ($SourcePath): $(@($t.Problems.Values) -join '; ')."
    }
    return $t.Config
}

function Get-ServerModuleList($Config) {
    # Installed modules of the server; $null when its root tooling predates modules (unknown subcommand),
    # which only happens on servers set up before WH_MODULES existed, where every module is installed.
    $r = Invoke-RemoteRootScript -Config $Config -Gateway 'modules' -Capture -Quiet
    $found = @($r.Output | ForEach-Object { if ($_ -match '^\[MODULES\] ([a-z,]+)$') { $Matches[1] } })
    # Compared as a set: server tooling from before per-module deploy prints catalog order (warehouse,accounting).
    $canonical = if ($found.Count -eq 1) { ConvertTo-CanonicalModuleList $found[0] } else { $null }
    if ($r.ExitCode -eq 0 -and $canonical) { return $canonical }
    if ($r.ExitCode -eq 2 -and $found.Count -eq 0 -and $r.StdErr -like '*unrecognized subcommand*') { return $null }
    throw "Could not read the installed modules of the server (exit $($r.ExitCode))."
}

function Save-ConfigSetting([System.Collections.IDictionary]$Values) {
    # Writes the given keys into the configuration file (a .bak copy of an existing file is kept).
    # Every other key is left as it is; a missing file is created.
    $path = Get-ConfigPath
    if (Test-Path -LiteralPath $path -PathType Leaf) {
        $raw = Get-Content -LiteralPath $path -Raw -Encoding utf8 | ConvertFrom-Json
        Copy-Item -LiteralPath $path -Destination "$path.bak-$((Get-Date).ToString('yyyyMMdd_HHmmss'))"
    } else {
        $raw = [pscustomobject]@{}
    }
    foreach ($k in $Values.Keys) { $raw | Add-Member -NotePropertyName $k -NotePropertyValue $Values[$k] -Force }
    Write-Utf8LfFile $path (($raw | ConvertTo-Json -Depth 10) + "`n")
}

function Save-ConfigModuleList([string]$Modules) {
    # Records the server's new module list, so that Update keeps matching the server.
    Save-ConfigSetting ([ordered]@{ Modules = $Modules })
}

function Save-ConfigDomain([string]$Domain) {
    # Records the server's new primary domain.
    Save-ConfigSetting ([ordered]@{ Domain = $Domain })
}

function Get-MobileEnvPath {
    # Tests point $MobileEnvFile at a copy so the repository file is never touched.
    if ($script:MobileEnvFile) { return $script:MobileEnvFile }
    return (Join-Path $ScriptRoot 'frontend\src\environments\environment.mobile.ts')
}

function Update-MobileServerOrigin([string]$Domain) {
    # The next production APK talks to the new primary domain. Apps already installed move on their own
    # (DomainMigrationService) once nothing is left unsent; only this build-time default changes here.
    $path = Get-MobileEnvPath
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        Write-Warn "Mobile environment file not found ($path): set serverOrigin to https://$Domain before the next APK build."
        return $false
    }
    $text = [System.IO.File]::ReadAllText($path, $Utf8NoBom)
    $originRe = "(serverOrigin:\s*')https://[^']*(')"
    if ($text -notmatch $originRe) {
        Write-Warn "No serverOrigin line in ${path}: set it to https://$Domain before the next APK build."
        return $false
    }
    $text = [regex]::Replace($text, $originRe, "`${1}https://$Domain`${2}")
    $text = [regex]::Replace($text, '(Mobile Production \()[^)]*(\))', "`${1}$Domain`${2}")
    Write-Utf8LfFile $path $text
    return $true
}

function Get-ConfigPath {
    if ([System.IO.Path]::IsPathRooted($ConfigFile)) { return $ConfigFile }
    return (Join-Path $ScriptRoot $ConfigFile)
}

function Read-MenuChoice {
    # Numbered menu; Enter picks $DefaultIndex. Returns the chosen 0-based index.
    param([string]$Title, [string[]]$Labels, [int]$DefaultIndex, [string]$DefaultTag = 'current')
    Write-Info $Title
    for ($i = 0; $i -lt $Labels.Count; $i++) {
        Write-Host ('  {0}) {1}{2}' -f ($i + 1), $Labels[$i], $(if ($i -eq $DefaultIndex) { "   <- $DefaultTag" } else { '' }))
    }
    for ($try = 0; ; $try++) {
        $answer = ([string](Read-Host -Prompt "Choice [Enter = $($DefaultIndex + 1)]")).Trim()
        if (-not $answer) { return $DefaultIndex }
        $n = 0
        if ([int]::TryParse($answer, [ref]$n) -and $n -ge 1 -and $n -le $Labels.Count) { return ($n - 1) }
        Write-Warn "Enter a number from 1 to $($Labels.Count)."
        if ($try -ge 4) { throw "Invalid selection '$answer'." }
    }
}

function Read-ModuleChoice([string]$Current) {
    # Each module alone, then the default set (without opt-in modules), then every module when that differs.
    $combos = @(@($DefaultModules, $AllModules) | Where-Object { $_ -and $_.Contains(',') } | Select-Object -Unique)
    $options = @($KnownModules) + $combos
    $idx = [array]::IndexOf($options, $Current)
    $tag = 'current'
    if ($idx -lt 0) { $idx = [Math]::Max(0, [array]::IndexOf($options, $DefaultModules)); $tag = 'default' }
    $labels = @($KnownModules | ForEach-Object { "$_ only" }) + @($combos | ForEach-Object { $_.Replace(',', ' and ') })
    return $options[(Read-MenuChoice 'Modules to install:' $labels $idx $tag)]
}

function Read-CertModeChoice([string]$Current) {
    $options = @('http01', 'dns01-cloudflare', 'cloudflare-origin', 'custom')
    $labels = @(
        'http01            Let''s Encrypt over HTTP (DNS points straight at the server, port 80 open)',
        'dns01-cloudflare  Let''s Encrypt over Cloudflare DNS (needs a Cloudflare API token; deploy.ps1 asks for it)',
        'cloudflare-origin Cloudflare Origin certificate (files from the Cloudflare dashboard)',
        'custom            your own certificate files')
    $idx = [array]::IndexOf($options, $Current)
    $tag = 'current'
    if ($idx -lt 0) { $idx = 0; $tag = 'default' }
    return $options[(Read-MenuChoice 'Certificate mode:' $labels $idx $tag)]
}

function Get-BrandingPreset {
    # System name choices from config/deploy/branding-presets.json (kept out of this ASCII-only script).
    $path = Join-Path $ScriptRoot 'config\deploy\branding-presets.json'
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { return @() }
    return @(([System.IO.File]::ReadAllText($path, $Utf8NoBom) | ConvertFrom-Json).systemNames |
            Where-Object { ([string]$_.systemName) -match $BrandingValueRegex -and ([string]$_.shortName) -match $BrandingValueRegex })
}

function Read-ConfigText {
    # One text question showing the current value; Enter keeps it. $Validate returns a problem text or $null.
    param([string]$Prompt, [string]$Current, [scriptblock]$Validate, [switch]$AllowClear)
    $hint = if ($Current) { " [$Current]" } elseif ($AllowClear) { ' [none]' } else { '' }
    if ($AllowClear -and $Current) { $hint += ' (- clears)' }
    for ($try = 0; ; $try++) {
        $answer = ([string](Read-Host -Prompt "$Prompt$hint")).Trim()
        if (-not $answer) { $answer = $Current }
        if ($AllowClear -and $answer -eq '-') { return '' }
        $problem = if ($Validate) { & $Validate $answer } else { $null }
        if (-not $problem) { return $answer }
        Write-Warn $problem
        if ($try -ge 4) { throw "Invalid value for: $Prompt" }
    }
}

function Read-BrandingChoice {
    # System and short name from the preset list (Enter keeps the current names), then the organization.
    # Returns the changed keys.
    param([Parameter(Mandatory)]$RawConfig, [string]$Modules)
    $changes = [ordered]@{}
    $curSystem = [string]$RawConfig.SystemName
    $curShort = [string]$RawConfig.AppShortName
    $entries = [System.Collections.Generic.List[object]]::new()
    $default = -1
    foreach ($p in (Get-BrandingPreset)) {
        $fits = if ([string]$p.modules -ceq $Modules) { '   (fits the selected modules)' } else { '' }
        if ($p.systemName -ceq $curSystem -and $p.shortName -ceq $curShort) { $default = $entries.Count }
        $entries.Add([pscustomobject]@{ Label = "$($p.systemName)  /  $($p.shortName)$fits"; System = $p.systemName; Short = $p.shortName; Custom = $false })
    }
    if ($default -lt 0) {
        $default = $entries.Count
        $inCode = '(name in the code)'
        $keepLabel = if ($curSystem -or $curShort) { "Keep: $(if ($curSystem) { $curSystem } else { $inCode })  /  $(if ($curShort) { $curShort } else { $inCode })" } else { 'Keep the names in the code' }
        $entries.Add([pscustomobject]@{ Label = $keepLabel; System = $curSystem; Short = $curShort; Custom = $false })
    }
    $entries.Add([pscustomobject]@{ Label = 'Other (type the names)'; System = $null; Short = $null; Custom = $true })
    $pick = $entries[(Read-MenuChoice 'System name  /  short name (page title, login page, installed app):' @($entries | ForEach-Object { $_.Label }) $default)]
    $check = { param($v) if ($v -and $v -notmatch $BrandingValueRegex) { 'At most 80 characters, without < > & " '' \ ` { }.' } else { $null } }
    if ($pick.Custom) {
        $system = Read-ConfigText -Prompt 'Full system name' -Current $curSystem -Validate $check
        $short = Read-ConfigText -Prompt 'Short app name' -Current $curShort -Validate $check
    } else {
        $system = $pick.System
        $short = $pick.Short
    }
    if ($null -eq $RawConfig.PSObject.Properties['SystemName'] -or $system -cne $curSystem) { $changes['SystemName'] = $system }
    if ($null -eq $RawConfig.PSObject.Properties['AppShortName'] -or $short -cne $curShort) { $changes['AppShortName'] = $short }
    $curOrg = [string]$RawConfig.OrganizationName
    $org = Read-ConfigText -Prompt 'Organization that owns the system (login footer, ID card page)' -Current $curOrg -Validate $check -AllowClear
    if ($null -eq $RawConfig.PSObject.Properties['OrganizationName'] -or $org -cne $curOrg) { $changes['OrganizationName'] = $org }
    return $changes
}

# Questions for configuration keys (Modules, CertMode, branding and HostKeyFingerprint have their own flows).
$ConfigPrompts = [ordered]@{
    ServerHost   = @{ Prompt = 'Server IP address or hostname'; Default = '' }
    SshUser      = @{ Prompt = 'SSH user on the server (a sudo user, not root)'; Default = '' }
    SshPort      = @{ Prompt = 'SSH port'; Default = '22' }
    Domain       = @{ Prompt = 'Domain of the application (e.g. soft.example.com)'; Default = '' }
    AllowedHosts = @{ Prompt = 'Allowed hosts, comma separated'; Default = '' }
    AdminEmail   = @{ Prompt = 'Administrator e-mail (certificate expiry notices)'; Default = '' }
    DbName       = @{ Prompt = 'PostgreSQL database name'; Default = 'warehouse_db' }
    DbUser       = @{ Prompt = 'PostgreSQL user name'; Default = 'warehouse' }
}

function Read-ConfigKey {
    # Asks one key of $ConfigPrompts showing its current value (or default); validated with Test-DeployConfig.
    param([Parameter(Mandatory)]$RawConfig, [Parameter(Mandatory)][string]$Key, [switch]$ForSetup)
    $current = [string]$RawConfig.$Key
    if (-not $current) { $current = if ($Key -eq 'AllowedHosts') { [string]$RawConfig.Domain } else { $ConfigPrompts[$Key].Default } }
    $forSetupFlag = [bool]$ForSetup
    $validate = {
        param($v)
        $probe = $RawConfig.PSObject.Copy()
        $probe | Add-Member -NotePropertyName $Key -NotePropertyValue $(if ($Key -eq 'Domain') { $v.ToLowerInvariant() } else { $v }) -Force
        (Test-DeployConfig -RawConfig $probe -ForSetup:$forSetupFlag).Problems[$Key]
    }.GetNewClosure()
    $value = Read-ConfigText -Prompt $ConfigPrompts[$Key].Prompt -Current $current -Validate $validate
    if ($Key -eq 'Domain') { $value = $value.ToLowerInvariant() }
    if ($Key -eq 'SshPort') { $value = [int]$value }
    return $value
}

function Complete-DeployConfig {
    # Interactive only: asks for every missing or invalid key (showing the current value), the branding names
    # before a build when they were never answered, pins the host key when no fingerprint is recorded yet,
    # and saves the answers. Valid keys are not asked again here (Setup reviews them, see Invoke-SetupReview).
    param([Parameter(Mandatory)]$RawConfig, [string]$Path, [switch]$ForSetup, [switch]$ForBuild)
    $changed = [ordered]@{}
    $askNames = $false
    for ($round = 0; $round -lt 5; $round++) {
        $t = Test-DeployConfig -RawConfig $RawConfig -SourcePath $Path -ForSetup:$ForSetup
        $keys = @($t.Problems.Keys | Where-Object { $_ -ne 'HostKeyFingerprint' })
        if ($keys.Count -eq 0) { break }
        if ($round -eq 0) { Write-Step "Completing the deployment configuration ($Path)..." }
        foreach ($key in $keys) {
            if ($null -ne $RawConfig.PSObject.Properties[$key] -and [string]$RawConfig.$key) { Write-Warn $t.Problems[$key] }
            if ($key -in $BrandingKeys) {
                # An invalid name is asked again through the name menu below.
                $RawConfig.PSObject.Properties.Remove($key)
                $askNames = $true
                continue
            }
            $value = switch ($key) {
                'Modules' { Read-ModuleChoice ([string]$RawConfig.Modules) }
                'CertMode' { Read-CertModeChoice ([string]$RawConfig.CertMode) }
                default { Read-ConfigKey -RawConfig $RawConfig -Key $key -ForSetup:$ForSetup }
            }
            $RawConfig | Add-Member -NotePropertyName $key -NotePropertyValue $value -Force
            $changed[$key] = $value
        }
    }
    if (($ForBuild -or $askNames) -and @($BrandingKeys | Where-Object { $null -eq $RawConfig.PSObject.Properties[$_] }).Count -gt 0) {
        $modules = ConvertTo-CanonicalModuleList $(if ($null -ne $RawConfig.PSObject.Properties['Modules']) { [string]$RawConfig.Modules } else { $DefaultModules })
        $names = Read-BrandingChoice -RawConfig $RawConfig -Modules $modules
        foreach ($k in $names.Keys) { $RawConfig | Add-Member -NotePropertyName $k -NotePropertyValue $names[$k] -Force; $changed[$k] = $names[$k] }
    }
    $t = Test-DeployConfig -RawConfig $RawConfig -SourcePath $Path -ForSetup:$ForSetup
    if ($t.Problems.Contains('HostKeyFingerprint') -and -not $t.Problems.Contains('ServerHost') -and -not $t.Problems.Contains('SshPort')) {
        $fp = Update-PinnedHostKey -ServerHost $t.Config.ServerHost -Port $t.Config.SshPort
        $RawConfig | Add-Member -NotePropertyName 'HostKeyFingerprint' -NotePropertyValue $fp -Force
        $changed['HostKeyFingerprint'] = $fp
    }
    if ($changed.Count -gt 0) {
        Save-ConfigSetting $changed
        Write-Success "Configuration saved: $Path ($(@($changed.Keys) -join ', '))."
    }
    return $RawConfig
}

function Invoke-ConnectionReview {
    param([switch]$ForSetup)
    if ($NonInteractive) { return (Get-DeployConfig -ForSetup:$ForSetup) }
    $path = Get-ConfigPath
    $raw = if (Test-Path -LiteralPath $path -PathType Leaf) {
        Get-Content -LiteralPath $path -Raw -Encoding utf8 | ConvertFrom-Json
    } else {
        [pscustomobject]@{}
    }
    Write-Step 'Reviewing server connection settings (Enter keeps the value in brackets)...'
    $changed = [ordered]@{}
    foreach ($key in @('ServerHost', 'SshUser', 'SshPort')) {
        $value = Read-ConfigKey -RawConfig $raw -Key $key -ForSetup:$ForSetup
        if ([string]$value -cne [string]$raw.$key) {
            $raw | Add-Member -NotePropertyName $key -NotePropertyValue $value -Force
            $changed[$key] = $value
        }
    }
    if ($changed.Count -gt 0) {
        Save-ConfigSetting $changed
        Write-Success "Configuration saved: $path ($(@($changed.Keys) -join ', '))."
    } else {
        Write-Info 'Connection settings confirmed.'
    }
    return (Get-DeployConfig -ForSetup:$ForSetup)
}

function Invoke-SetupReview {
    # Setup (interactive): the settings are asked again with their current value; Enter keeps it.
    # First Setup: server host, ssh user, ssh port, domain, hosts, e-mail, database, modules, certificate mode and names.
    # Returns the re-read configuration.
    param([Parameter(Mandatory)][bool]$FirstSetup)
    $path = Get-ConfigPath
    $raw = Get-Content -LiteralPath $path -Raw -Encoding utf8 | ConvertFrom-Json
    Write-Step 'Reviewing the settings for this Setup (Enter keeps the value in brackets)...'
    $changed = [ordered]@{}
    if ($FirstSetup) {
        foreach ($key in @('ServerHost', 'SshUser', 'SshPort', 'Domain', 'AllowedHosts', 'AdminEmail', 'DbName', 'DbUser')) {
            $value = Read-ConfigKey -RawConfig $raw -Key $key -ForSetup
            if ([string]$value -cne [string]$raw.$key) { $raw | Add-Member -NotePropertyName $key -NotePropertyValue $value -Force; $changed[$key] = $value }
        }
        $t = Test-DeployConfig -RawConfig $raw -ForSetup
        $modules = Read-ModuleChoice $(if ($t.Config.ModulesSet) { $t.Config.Modules } else { '' })
        if (-not $t.Config.ModulesSet -or $modules -cne $t.Config.Modules) { $raw | Add-Member -NotePropertyName 'Modules' -NotePropertyValue $modules -Force; $changed['Modules'] = $modules }
        $certMode = Read-CertModeChoice $(if ($t.Config.CertModeSet) { $t.Config.CertMode } else { '' })
        if (-not $t.Config.CertModeSet -or $certMode -cne $t.Config.CertMode) { $raw | Add-Member -NotePropertyName 'CertMode' -NotePropertyValue $certMode -Force; $changed['CertMode'] = $certMode }
    } else {
        Write-Info 'The server is already set up: domain, modules and database stay as they are (use -ChangeDomain or -AddModule to change them).'
    }
    $names = Read-BrandingChoice -RawConfig $raw -Modules (Test-DeployConfig -RawConfig $raw -ForSetup).Config.Modules
    foreach ($k in $names.Keys) { $changed[$k] = $names[$k] }
    if ($changed.Count -gt 0) {
        Save-ConfigSetting $changed
        Write-Success "Configuration saved: $path ($(@($changed.Keys) -join ', '))."
    } else {
        Write-Info 'No setting changed.'
    }
    return (Get-DeployConfig -ForSetup)
}

function Get-DeployConfig {
    # -ForBuild (Update, ResetServer): interactive runs also ask for the branding names once (Setup reviews them).
    param([switch]$ForSetup, [switch]$ForBuild)
    $path = Get-ConfigPath
    if (Test-Path -LiteralPath $path -PathType Leaf) {
        try {
            $raw = Get-Content -LiteralPath $path -Raw -Encoding utf8 | ConvertFrom-Json
        } catch {
            throw "Configuration file is not valid JSON: $path"
        }
    } elseif ($NonInteractive) {
        throw "Configuration file not found: $path"
    } else {
        Write-Info "No configuration file yet; it is created from your answers: $path"
        $raw = [pscustomobject]@{}
    }
    if (-not $NonInteractive) { $raw = Complete-DeployConfig -RawConfig $raw -Path $path -ForSetup:$ForSetup -ForBuild:$ForBuild }
    return (Assert-DeployConfig -RawConfig $raw -SourcePath $path -ForSetup:$ForSetup)
}

function Get-SudoPrefix($Config) {
    if ($Config.SshUser -eq 'root') { return '' }
    return 'sudo -n '
}

function Get-KnownHostsLookup([string]$ServerHost, [int]$Port) {
    if ($Port -eq 22) { return $ServerHost }
    return "[$ServerHost]:$Port"
}

function Get-PinnedHostKeyProblem([string]$Lookup, [string]$Fingerprint) {
    # $null when known_hosts holds the host and every entry for it matches the pinned fingerprint.
    $r = Invoke-Process -FilePath $SshKeygenExe -ArgumentList @('-l', '-F', $Lookup, '-f', $KnownHostsFile) -Capture -Quiet
    $found = @($r.Output | Where-Object { $_ -and -not $_.StartsWith('#') -and $_ -match '\bED25519\b' } | ForEach-Object {
            if ($_ -match '(SHA256:[A-Za-z0-9+/]{43})') { $Matches[1] } else { '<unparsed>' }
        })
    if ($found.Count -eq 0) { return "Host $Lookup is not in known_hosts." }
    $mismatch = @($found | Where-Object { $_ -cne $Fingerprint })
    if ($mismatch.Count -gt 0) {
        return "SECURITY: known_hosts entry for $Lookup does not match the pinned fingerprint $Fingerprint (found: $($found -join ', '))."
    }
    return $null
}

function Get-SshKeyFingerprint([string]$KeyBase64) {
    # OpenSSH SHA256 fingerprint: unpadded base64 of the SHA-256 of the key blob.
    $hash = [System.Security.Cryptography.SHA256]::HashData([Convert]::FromBase64String($KeyBase64))
    return 'SHA256:' + [Convert]::ToBase64String($hash).TrimEnd('=')
}

function Get-ServerHostKey([string]$ServerHost, [int]$Port) {
    # The ED25519 host key the network offers (base64). Unauthenticated until compared with the console reading.
    Test-LocalTool 'ssh-keyscan'
    $r = Invoke-Process -FilePath $SshKeyscanExe -ArgumentList @('-T', '15', '-t', 'ed25519', '-p', [string]$Port, $ServerHost) -Capture -Quiet
    $keys = @($r.Output | ForEach-Object { if ($_ -match '^\S+ ssh-ed25519 ([A-Za-z0-9+/]+={0,2})$') { $Matches[1] } })
    if ($keys.Count -ne 1) {
        throw "Could not read the ED25519 host key of ${ServerHost}:$Port (ssh-keyscan exit $($r.ExitCode)). Check ServerHost, SshPort and that the server is running."
    }
    return $keys[0]
}

function Update-PinnedHostKey {
    # Pins the server's host key from the operator's out-of-band reading on the server console: the key the
    # network offers is accepted only if its fingerprint equals the typed one. The host's known_hosts entries
    # are replaced (ssh-keygen keeps known_hosts.old). Returns the fingerprint; the caller records it.
    param([Parameter(Mandatory)][string]$ServerHost, [Parameter(Mandatory)][int]$Port, [string]$PinnedFingerprint)
    Assert-Interactive 'Pinning the SSH host key'
    $lookup = Get-KnownHostsLookup $ServerHost $Port
    Write-Step "Pinning the SSH host key of $lookup..."
    if ($PinnedFingerprint) {
        Write-Warn "Pinned until now: $PinnedFingerprint. A new key is expected only after the server was reinstalled; otherwise stop (Ctrl+C) and investigate."
    }
    Write-Info 'Read the fingerprint on the server itself, not over SSH: open the provider''s web console (VNC/KVM), log in and run:'
    Write-Host '    ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub' -ForegroundColor Yellow
    Write-Info 'Then paste its output line here (or only the SHA256:... part).'
    $typedLine = [string](Read-Host -Prompt 'Fingerprint shown on the server console')
    if ($typedLine -cnotmatch '(SHA256:[A-Za-z0-9+/]{43})') { throw 'No SHA256:... fingerprint in the input; nothing was changed.' }
    $typed = $Matches[1]
    $key = Get-ServerHostKey $ServerHost $Port
    $offered = Get-SshKeyFingerprint $key
    if ($offered -cne $typed) {
        throw "SECURITY: the key offered over the network ($offered) does not match the console fingerprint ($typed). Nothing was changed. Make sure you read the ED25519 key of this server ($ServerHost); a mismatch can mean someone is intercepting the connection."
    }
    [void][System.IO.Directory]::CreateDirectory((Split-Path -Parent $KnownHostsFile))
    $prefix = ''
    if (Test-Path -LiteralPath $KnownHostsFile -PathType Leaf) {
        $r = Invoke-Process -FilePath $SshKeygenExe -ArgumentList @('-R', $lookup, '-f', $KnownHostsFile) -Capture -Quiet
        if ($r.ExitCode -ne 0) { throw "Removing the old known_hosts entries for $lookup failed (exit $($r.ExitCode))." }
        $existing = [System.IO.File]::ReadAllText($KnownHostsFile)
        if ($existing -and -not $existing.EndsWith("`n")) { $prefix = "`n" }
    }
    [System.IO.File]::AppendAllText($KnownHostsFile, "$prefix$lookup ssh-ed25519 $key`n", $Utf8NoBom)
    Write-Success "Host key pinned: $typed (the previous known_hosts is kept as known_hosts.old)."
    return $typed
}

function Assert-PinnedHostKey($Config) {
    $lookup = Get-KnownHostsLookup $Config.ServerHost $Config.SshPort
    $problem = Get-PinnedHostKeyProblem $lookup $Config.HostKeyFingerprint
    if (-not $problem) { return }
    if ($NonInteractive) {
        throw "$problem Refusing to connect; run deploy.ps1 interactively to pin the key from the server console."
    }
    Write-Warn $problem
    $fp = Update-PinnedHostKey -ServerHost $Config.ServerHost -Port $Config.SshPort -PinnedFingerprint $Config.HostKeyFingerprint
    if ($fp -cne $Config.HostKeyFingerprint) {
        Save-ConfigSetting ([ordered]@{ HostKeyFingerprint = $fp })
        $Config.HostKeyFingerprint = $fp
        Write-Success "HostKeyFingerprint updated in $(Get-ConfigPath)."
    }
    $problem = Get-PinnedHostKeyProblem $lookup $fp
    if ($problem) { throw $problem }
}

function Sync-HostKeyIfChanged($Config) {
    # If the remote server host key has changed (e.g. server OS was reinstalled), automatically
    # remove stale known_hosts entries and sync the new host key into known_hosts and deploy_config.json.
    try {
        $lookup = Get-KnownHostsLookup $Config.ServerHost $Config.SshPort
        $key = Get-ServerHostKey $Config.ServerHost $Config.SshPort
        $offeredFp = Get-SshKeyFingerprint $key
        $currentProblem = Get-PinnedHostKeyProblem $lookup $offeredFp
        if ($currentProblem -or ($Config.HostKeyFingerprint -and $Config.HostKeyFingerprint -cne $offeredFp)) {
            Write-Info "Server host key changed on $lookup ($offeredFp). Updating known_hosts and configuration automatically..."
            [void][System.IO.Directory]::CreateDirectory((Split-Path -Parent $KnownHostsFile))
            if (Test-Path -LiteralPath $KnownHostsFile -PathType Leaf) {
                [void](Invoke-Process -FilePath $SshKeygenExe -ArgumentList @('-R', $lookup, '-f', $KnownHostsFile) -Capture -Quiet)
            }
            $existing = if (Test-Path -LiteralPath $KnownHostsFile -PathType Leaf) { [System.IO.File]::ReadAllText($KnownHostsFile) } else { '' }
            $prefix = if ($existing -and -not $existing.EndsWith("`n")) { "`n" } else { '' }
            [System.IO.File]::AppendAllText($KnownHostsFile, "$prefix$lookup ssh-ed25519 $key`n", $Utf8NoBom)
            if ($Config.HostKeyFingerprint -cne $offeredFp) {
                $Config.HostKeyFingerprint = $offeredFp
                try { Save-ConfigSetting ([ordered]@{ HostKeyFingerprint = $offeredFp }) } catch {}
            }
            Write-Success "Host key synced automatically: $offeredFp"
        }
    } catch {
        Write-Verbose "Sync-HostKeyIfChanged skipped: $_"
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
        [switch]$Quiet,
        [switch]$SuppressStdErr
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
        foreach ($k in 'Capture', 'Raw', 'Quiet', 'SuppressStdErr') { if ($PSBoundParameters[$k]) { $p[$k] = $true } }
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
        [switch]$Quiet,
        [switch]$SuppressStdErr
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
    foreach ($k in 'Capture', 'Raw', 'Quiet', 'SuppressStdErr') { if ($PSBoundParameters[$k]) { $p[$k] = $true } }
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
    param([switch]$ForSetup, [switch]$ForBuild)
    Test-LocalTool 'ssh', 'ssh-keygen'
    $config = Get-DeployConfig -ForSetup:$ForSetup -ForBuild:$ForBuild
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
    $script:KnownModules = @(Get-KnownModules $sha)
    $script:AllModules = $script:KnownModules -join ','
    $script:DefaultModules = Get-DefaultModules $sha
    Write-Success "Deploying commit $sha (Known modules: $AllModules)"
    return $sha
}

function Get-BrandingStamp($Config) {
    # $null when no name is configured (the code's names are built); otherwise a hash of the names.
    $values = @($BrandingKeys | ForEach-Object { if ($Config) { [string]$Config.$_ } else { '' } })
    if (-not ($values -join '')) { return $null }
    $text = @(for ($i = 0; $i -lt $BrandingKeys.Count; $i++) { "$($BrandingKeys[$i])=$($values[$i])" }) -join "`n"
    return [Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData($Utf8NoBom.GetBytes($text))).ToLowerInvariant()
}

function Set-SnapshotBranding([string]$SnapshotFront, $Config) {
    # Writes the configured names into the build snapshot (never into the working tree); empty keeps the code's names.
    # The values were validated (no quote, backslash, < > & { } or control character), so they are safe as
    # TypeScript string, HTML text and JSON value.
    $system = [string]$Config.SystemName
    $short = [string]$Config.AppShortName
    $org = [string]$Config.OrganizationName
    if (-not ($system -or $short -or $org)) { return }
    Write-Info 'Writing the configured names into the build snapshot...'

    $tsPath = Join-Path $SnapshotFront 'src\app\core\branding.ts'
    $ts = [System.IO.File]::ReadAllText($tsPath)
    foreach ($pair in @(@('systemName', $system), @('shortName', $short), @('organizationName', $org))) {
        if (-not $pair[1]) { continue }
        $pattern = "(?m)^(\s*$($pair[0]): )'[^'\r\n]*',"
        if ([regex]::Matches($ts, $pattern).Count -ne 1) { throw "branding.ts in the snapshot has no single '$($pair[0])' entry." }
        $ts = [regex]::Replace($ts, $pattern, '${1}''' + $pair[1].Replace('$', '$$') + "',")
    }
    Write-Utf8LfFile $tsPath $ts

    $manifestPath = Join-Path $SnapshotFront 'public\manifest.webmanifest'
    $manifest = [System.IO.File]::ReadAllText($manifestPath) | ConvertFrom-Json
    if ($short) { $manifest.name = $short; $manifest.short_name = $short }
    if ($system) { $manifest.description = $system }
    Write-Utf8LfFile $manifestPath (($manifest | ConvertTo-Json -Depth 10) + "`n")

    if ($system) {
        $indexPath = Join-Path $SnapshotFront 'src\index.html'
        $html = [System.IO.File]::ReadAllText($indexPath)
        foreach ($pattern in @('<title>[^<]*</title>', '(<meta name="description" content=")[^"]*(")')) {
            if ([regex]::Matches($html, $pattern).Count -ne 1) { throw "index.html in the snapshot has no single match for $pattern." }
        }
        $html = [regex]::Replace($html, '<title>[^<]*</title>', '<title>' + $system.Replace('$', '$$') + '</title>')
        $html = [regex]::Replace($html, '(<meta name="description" content=")[^"]*(")', '${1}' + $system.Replace('$', '$$') + '${2}')
        Write-Utf8LfFile $indexPath $html
    }
}

function Build-IsolatedFrontend([string]$Sha, $Config) {
    # Builds the frontend from the commit inside scratch/deploy/<sha>; the project's own dist is never touched.
    # The configured branding names are written into the snapshot before the build and are part of the marker.
    if ($Sha -cnotmatch '^[0-9a-f]{40}$') { throw "Invalid commit: $Sha" }
    $scratchDir = Join-Path $LocalDeployScratch $Sha
    $snapshotFront = Join-Path $scratchDir $BundleFrontDir
    $distDir = Join-Path $snapshotFront $FrontDistRelative
    $marker = Join-Path $scratchDir '.build-complete'
    $stamp = Get-BrandingStamp $Config
    $buildModules = if ($Config -and $Config.Modules) { ConvertTo-CanonicalModuleList $Config.Modules } else { $DefaultModules }
    $modulesMarker = "MODULES=$buildModules"
    $expectedMarker = if ($stamp) { "COMMIT=$Sha $modulesMarker BRANDING=$stamp" } else { "COMMIT=$Sha $modulesMarker" }

    if ($SkipBuild) {
        $markerOk = (Test-Path -LiteralPath $marker) -and ([System.IO.File]::ReadAllText($marker).Trim() -ceq $expectedMarker)
        $distOk = (Test-Path -LiteralPath (Join-Path $distDir 'index.html')) -and (Test-Path -LiteralPath (Join-Path $distDir 'ngsw.json')) -and (Test-Path -LiteralPath (Join-Path $distDir 'build-modules.txt'))
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
        $repoFront = $BundleFrontDir
        if ((Invoke-Native $GitExe @('-C', $ScriptRoot, 'archive', '--format=tar', '-o', $frontTar, $Sha, '--', $repoFront)) -ne 0) {
            throw "git archive of $repoFront failed for $Sha."
        }
        if ((Invoke-Native $TarExe @('-xf', $frontTar, '-C', $scratchDir)) -ne 0) { throw 'Extracting the frontend snapshot failed.' }
    } finally {
        if (Test-Path -LiteralPath $frontTar) { Remove-Item -LiteralPath $frontTar -Force }
    }
    if ($Config) { Set-SnapshotBranding $snapshotFront $Config }

    $sourceNodeModules = Join-Path $ScriptRoot 'frontend\node_modules'
    if (-not (Test-Path -LiteralPath $sourceNodeModules)) { throw "node_modules not found at $sourceNodeModules" }
    $junction = Join-Path $snapshotFront 'node_modules'
    New-SafeJunction $junction $sourceNodeModules
    try {
        Write-Info "Running npm run build:modules (WH_MODULES=$buildModules, includes the ngsw patch)..."
        $prevWhModules = $env:WH_MODULES
        try {
            $env:WH_MODULES = $buildModules
            $code = Invoke-Native $NpmCmd @('run', 'build:modules') -WorkingDirectory $snapshotFront
            if ($code -ne 0) { throw "npm run build:modules failed with exit code $code." }
        } finally {
            $env:WH_MODULES = $prevWhModules
        }
    } finally {
        Remove-SafeJunction $junction
    }

    foreach ($required in 'index.html', 'ngsw.json', 'build-modules.txt') {
        if (-not (Test-Path -LiteralPath (Join-Path $distDir $required))) { throw "Build output is missing $required in $distDir." }
    }
    Write-Utf8LfFile $marker "$expectedMarker`n"
    Write-Success 'Isolated frontend build completed.'
    return $snapshotFront
}

function Get-BackendWhitelist([string]$Sha) {
    $repoBackend = $BundleBackendDir
    $prefix = [regex]::Escape($repoBackend)
    $r = Invoke-Git @('ls-tree', '-r', '-z', '--name-only', $Sha, '--', $repoBackend)
    if ($r.ExitCode -ne 0) { throw "git ls-tree failed for $Sha." }
    $names = $r.Output.Split([char]0)
    $apps = @($names | ForEach-Object {
        if ($_ -match "^$prefix/((?:core/|modules/[^/]+/|)([^/]+))/__init__\.py$") { $Matches[1] }
    } | Sort-Object -Unique)
    $files = @('backend_paths.py', 'manage.py', 'requirements.txt', 'requirements.lock')
    foreach ($f in $files) {
        if ($names -notcontains "$repoBackend/$f") { throw "Commit $Sha has no $repoBackend/$f; it is mandatory in the bundle." }
    }
    if ($apps.Count -eq 0) { throw "No backend app packages found in $Sha." }
    # Module manifests (modules/<m>/module.py) sit outside any app package; module_catalog builds INSTALLED_APPS from them.
    $manifests = @($names | ForEach-Object {
        if ($_ -match "^$prefix/(modules/[^/]+/module\.py)$") { $Matches[1] }
    } | Sort-Object -Unique)
    $moduleDirs = @($apps | ForEach-Object { if ($_ -match '^(modules/[^/]+)/') { $Matches[1] } } | Sort-Object -Unique)
    foreach ($d in $moduleDirs) {
        if ($manifests -notcontains "$d/module.py") { throw "Commit $Sha has no $repoBackend/$d/module.py; every module needs its manifest in the bundle." }
    }
    return [pscustomobject]@{ Apps = $apps; Files = $files; Manifests = $manifests; RepoDir = $repoBackend }
}

function Test-BundleStage([string]$StageDir, $Whitelist, [string]$ExpectedModules = $null) {
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
    $backendTop = @(Get-ChildItem -LiteralPath (Join-Path $StageDir $BundleBackendDir) -Force | ForEach-Object { $_.Name } | Sort-Object)
    $expectedTopDirs = @($Whitelist.Apps | ForEach-Object { $_.Split('/')[0] } | Sort-Object -Unique)
    $expectedTop = @(@($expectedTopDirs) + @($Whitelist.Files) | Sort-Object)
    if (($backendTop -join '|') -cne ($expectedTop -join '|')) {
        $problems.Add("backend top level differs from the whitelist (got: $($backendTop -join ', '))")
    }
    foreach ($appRel in $Whitelist.Apps) {
        if (-not (Test-Path -LiteralPath (Join-Path $StageDir "backend/$appRel/__init__.py"))) {
            $problems.Add("backend app $appRel missing from bundle")
        }
    }
    foreach ($manifestRel in $Whitelist.Manifests) {
        if (-not (Test-Path -LiteralPath (Join-Path $StageDir "backend/$manifestRel"))) {
            $problems.Add("module manifest $manifestRel missing from bundle")
        }
    }
    $dist = Join-Path $StageDir "frontend\$FrontDistRelative"
    foreach ($required in 'index.html', 'ngsw.json', 'build-modules.txt') {
        if (-not (Test-Path -LiteralPath (Join-Path $dist $required))) { $problems.Add("frontend $required missing from bundle") }
    }
    $buildModulesFile = Join-Path $dist 'build-modules.txt'
    if (Test-Path -LiteralPath $buildModulesFile) {
        $actualText = [System.IO.File]::ReadAllText($buildModulesFile).Trim()
        $actualSet = @($actualText -split '[, ]+' | Where-Object { $_ } | Sort-Object -Unique)
        if (-not [string]::IsNullOrWhiteSpace($ExpectedModules)) {
            $expectedSet = @($ExpectedModules -split '[, ]+' | Where-Object { $_ } | Sort-Object -Unique)
            if (($actualSet -join ',') -cne ($expectedSet -join ',')) {
                $problems.Add("build-modules.txt mismatch: bundle has '$($actualSet -join ',')', expected '$($expectedSet -join ',')'")
            }
        }
    }
    foreach ($required in 'scripts/deploy/warehouse-deploy.sh', 'scripts/deploy/warehouse-nightly-backup.sh', 'scripts/remote-setup.sh', 'RELEASE') {
        if (-not (Test-Path -LiteralPath (Join-Path $StageDir $required.Replace('/', '\')))) { $problems.Add("$required missing from bundle") }
    }
    if ($problems.Count -gt 0) { throw "Bundle gate failed:`n  $($problems -join "`n  ")" }
}

function New-DeploymentBundle([string]$Sha, [string]$SnapshotFront, [string]$ExpectedModules = $null) {
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
        $repoBackend = $whitelist.RepoDir
        foreach ($f in $whitelist.Files) { $pathspecs.Add("$repoBackend/$f") }
        foreach ($a in $whitelist.Apps) { $pathspecs.Add("$repoBackend/$a") }
        foreach ($m in $whitelist.Manifests) { $pathspecs.Add("$repoBackend/$m") }
        $pathspecs.AddRange([string[]]@('scripts/deploy', 'scripts/remote-setup.sh', ":(exclude,glob)$repoBackend/**/test_phase*.py"))
        $archiveArgs = @('-C', $ScriptRoot, 'archive', '--format=tar', '-o', $sourceTar, $Sha, '--') + $pathspecs.ToArray()
        if ((Invoke-Native $GitExe $archiveArgs) -ne 0) { throw "git archive failed for $Sha." }
        if ((Invoke-Native $TarExe @('-xf', $sourceTar, '-C', $stageDir)) -ne 0) { throw 'Extracting the source snapshot failed.' }

        $frontTarget = Join-Path $stageDir $BundleFrontDir
        [void][System.IO.Directory]::CreateDirectory($frontTarget)
        Copy-Item -LiteralPath (Join-Path $SnapshotFront 'dist') -Destination (Join-Path $frontTarget 'dist') -Recurse -Force

        $machine = if ($env:COMPUTERNAME -match '^[A-Za-z0-9-]{1,63}$') { $env:COMPUTERNAME } else { 'unknown' }
        $release = "COMMIT=$Sha`nDATE=$((Get-Date).ToString('yyyy-MM-ddTHH:mm:sszzz'))`nBUILD_MACHINE=$machine`n"
        Write-Utf8LfFile (Join-Path $stageDir 'RELEASE') $release

        Write-Info 'Checking bundle gates (whitelist, CR, forbidden files, frontend artifacts)...'
        Test-BundleStage $stageDir $whitelist $ExpectedModules
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
function Read-YesNo([string]$Prompt, [bool]$Default = $true) {
    $answer = ([string](Read-Host -Prompt "$Prompt $(if ($Default) { '[Y/n]' } else { '[y/N]' })")).Trim().ToLowerInvariant()
    if (-not $answer) { return $Default }
    return ($answer -in @('y', 'yes'))
}

function Test-KeyLogin($Config) {
    # True when the server accepts the local key without a password (BatchMode never prompts).
    $sshArgs = @('-p', [string]$Config.SshPort, '-o', 'StrictHostKeyChecking=yes', '-o', 'UpdateHostKeys=no', '-o', 'ConnectTimeout=15',
        '-o', 'BatchMode=yes', '-o', 'PreferredAuthentications=publickey', '-T', "$($Config.SshUser)@$($Config.ServerHost)", 'echo [KEY_LOGIN_OK]')
    $r = Invoke-Process -FilePath $SshExe -ArgumentList $sshArgs -Capture -Quiet
    return ($r.ExitCode -eq 0 -and $r.Output -contains '[KEY_LOGIN_OK]')
}

function Test-SudoRestricted($Config) {
    # True when "sudo -n -l" is readable and grants no unrestricted ALL rule.
    $sudo = Invoke-Ssh -Config $Config -RemoteCommand 'sudo -n -l' -Capture -Quiet
    $unrestricted = @($sudo.Output | Where-Object { $_ -match '\)\s*((NOPASSWD|PASSWD|SETENV|NOSETENV):\s*)*ALL\s*$' })
    return ($sudo.ExitCode -eq 0 -and $unrestricted.Count -eq 0)
}

function Assert-BootstrapSudo($Config) {
    # The first Setup (no root gateway yet) needs password-less sudo; shows the console steps until it works.
    if ($Config.SshUser -eq 'root') { return }
    $user = $Config.SshUser
    for ($attempt = 1; ; $attempt++) {
        $r = Invoke-Ssh -Config $Config -RemoteCommand 'sudo -n true && echo [SUDO_OK]' -Capture -Quiet
        if ($r.ExitCode -eq 0 -and $r.Output -contains '[SUDO_OK]') {
            Write-Success "Password-less sudo is available for $user."
            return
        }
        Write-Warn "The first Setup needs temporary password-less sudo for '$user'; Setup removes it again when it succeeds."
        Write-Info 'On the server console (the provider''s web console), logged in as this user, run:'
        Write-Host "    echo '$user ALL=(ALL) NOPASSWD:ALL' | sudo tee $BootstrapSudoersFile" -ForegroundColor Yellow
        Write-Host "    sudo chmod 440 $BootstrapSudoersFile" -ForegroundColor Yellow
        Write-Host "    sudo visudo -cf $BootstrapSudoersFile" -ForegroundColor Yellow
        Write-Info "The last command must print 'parsed OK'. If '$user' cannot use sudo at all, log in as root and run the same commands without 'sudo'."
        if ($NonInteractive -or $attempt -ge 3) { throw "Password-less sudo is not available for $user; run the commands above on the server, then Setup again." }
        Wait-Console 'Press Enter once the commands have run on the server...'
    }
}

function Remove-BootstrapSudo($Config) {
    # After Setup: removes the temporary sudoers file; the gateway rule (/etc/sudoers.d/warehouse) stays.
    # Without full password-less sudo there is nothing left to remove (also after a re-run of a failed first Setup).
    if ($Config.SshUser -eq 'root') { return }
    $user = $Config.SshUser
    $probe = Invoke-Ssh -Config $Config -RemoteCommand 'sudo -n true && echo [SUDO_OK]' -Capture -Quiet
    if (-not ($probe.ExitCode -eq 0 -and $probe.Output -contains '[SUDO_OK]')) { return }
    $r = Invoke-RemoteRootScript -Config $Config -Body "rm -f -- $BootstrapSudoersFile`necho '[BOOTSTRAP_SUDO_REMOVED]'" -Capture -Quiet
    if ($r.ExitCode -ne 0 -or -not ($r.Output -contains '[BOOTSTRAP_SUDO_REMOVED]')) {
        Write-Warn "Could not remove $BootstrapSudoersFile (exit $($r.ExitCode)). On the server console run: sudo rm -f $BootstrapSudoersFile"
        return
    }
    Write-Success "Temporary password-less sudo removed ($BootstrapSudoersFile)."
    if (-not (Test-SudoRestricted $Config)) {
        Write-Warn "sudo of '$user' is still unrestricted through another rule. Everything works, but -GoLive refuses it."
        Write-Info 'Before go-live, on the server console, list the rules that grant it:'
        Write-Host "    sudo -l -U $user" -ForegroundColor Yellow
        Write-Host "    sudo grep -rn '$user\|%sudo\|%admin' /etc/sudoers /etc/sudoers.d" -ForegroundColor Yellow
        Write-Info "Remove the ALL rule for '$user' (or take it out of the sudo group) only after making sure you can still become root on the console; keep /etc/sudoers.d/warehouse."
    }
}

function Show-SshHardeningGuide($Config) {
    # Password login is turned off by the operator on the console, and only once key login is proven.
    Write-Step 'SSH hardening...'
    if (-not (Test-KeyLogin $Config)) {
        Write-Warn 'Key login does not work yet, so keep password login on for now. Run deploy.ps1 -InstallKey first.'
        return
    }
    Write-Success 'Key login works.'
    Write-Info 'Turn off SSH password login (-GoLive requires it). On the server console, as root or with sudo, run:'
    Write-Host "    printf 'PasswordAuthentication no\nKbdInteractiveAuthentication no\n' | sudo tee /etc/ssh/sshd_config.d/00-warehouse-no-password.conf" -ForegroundColor Yellow
    Write-Host '    sudo sshd -t && sudo systemctl reload ssh' -ForegroundColor Yellow
    Write-Info 'Keep the console open until deploy.ps1 -Status still connects afterwards.'
}

function Invoke-PostSetupGuide {
    # Interactive follow-up of Setup, each step optional: certificate, first administrator, SSH hardening.
    param([Parameter(Mandatory)]$Config, [Parameter(Mandatory)][string]$CertMode, [bool]$TlsPending, [bool]$FirstSetup)
    if ($TlsPending) {
        Write-Step "Certificate for $($Config.Domain) (mode $CertMode)..."
        try {
            $code = switch ($CertMode) {
                'dns01-cloudflare' {
                    Write-Info 'Cloudflare API token: dash.cloudflare.com > My Profile > API Tokens > Create Token > template "Edit zone DNS",'
                    Write-Info "Zone Resources: Include > Specific zone > the zone of $($Config.Domain). Copy the token (Cloudflare shows it once)."
                    if (Read-YesNo 'Enter the token and issue the certificate now?') {
                        $c = Invoke-SetSecretMode 'CLOUDFLARE_DNS_API_TOKEN'
                        if ($c -eq 0) { Invoke-IssueCertMode } else { $c }
                    } else { $null }
                }
                'http01' {
                    Write-Info "The DNS A record of $($Config.Domain) must point to $($Config.ServerHost) (in Cloudflare: 'DNS only', grey cloud) and port 80 must be open."
                    if (Read-YesNo 'Issue the certificate now?') { Invoke-IssueCertMode } else { $null }
                }
                default {
                    if ($CertMode -eq 'cloudflare-origin') {
                        Write-Info 'Cloudflare dashboard > SSL/TLS > Origin Server > Create Certificate (PEM): save the certificate and the private key as two files on this computer; set SSL/TLS mode to Full (strict).'
                    } else {
                        Write-Info 'Have the certificate (PEM), its private key and, if any, the intermediate chain ready as files on this computer.'
                    }
                    if (Read-YesNo 'Install the certificate files now?') { Invoke-InstallCertMode } else { $null }
                }
            }
        } catch {
            Write-Err "Certificate step stopped: $($_.Exception.Message)"
            $code = 1
        }
        $later = switch ($CertMode) { 'dns01-cloudflare' { 'deploy.ps1 -SetSecret CLOUDFLARE_DNS_API_TOKEN, then deploy.ps1 -IssueCert' } 'http01' { 'deploy.ps1 -IssueCert' } default { 'deploy.ps1 -InstallCert' } }
        if ($null -eq $code) { Write-Info "Later: $later" } elseif ($code -ne 0) { Write-Warn "The certificate is not installed yet; fix the cause above and run: $later" }
    }
    if ($FirstSetup) {
        Write-Step 'Optional settings (each can be set later with deploy.ps1 -SetSecret <KEY>)...'
        $restart = $false
        try {
            Write-Info 'An outbound proxy is needed only if the server cannot reach Google directly (Google Drive backups).'
            if (Read-YesNo 'Set an outbound HTTP proxy now?' $false) {
                if ((Invoke-SetSecretMode 'OUTBOUND_HTTP_PROXY') -eq 0) { $restart = $true }
            }
            Write-Info 'Google Drive backups need an OAuth client: Google Cloud console > APIs & Services > Credentials > Create OAuth client ID (Web application),'
            Write-Info "with the authorized redirect URI https://$($Config.Domain)/api/accounts/gdrive/callback/"
            if (Read-YesNo 'Enter the Google OAuth client ID and secret now?' $false) {
                if ((Invoke-SetSecretMode 'GOOGLE_OAUTH_CLIENT_ID') -eq 0) { $restart = $true }
                if ((Invoke-SetSecretMode 'GOOGLE_OAUTH_CLIENT_SECRET') -eq 0) { $restart = $true }
            }
        } catch {
            Write-Err "Optional setting stopped: $($_.Exception.Message)"
        }
        if ($restart) {
            try { [void](Invoke-RestartMode) } catch { Write-Err "Restart stopped: $($_.Exception.Message). Later: deploy.ps1 -Restart" }
        }

        Write-Step 'First administrator...'
        if (Read-YesNo 'Create the first administrator (Django superuser) now?') {
            try { [void](Invoke-CreateAdminMode) } catch { Write-Err "CreateAdmin stopped: $($_.Exception.Message). Later: deploy.ps1 -CreateAdmin" }
        } else {
            Write-Info 'Later: deploy.ps1 -CreateAdmin'
        }
        Show-SshHardeningGuide $Config
    }
}

function Invoke-InstallKeyMode {
    param([switch]$FromSetup)
    Assert-Interactive 'InstallKey'
    Test-LocalTool 'ssh', 'ssh-keygen'
    $config = Invoke-ConnectionReview
    Sync-HostKeyIfChanged $config
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
    if (Test-KeyLogin $config) {
        Write-Success "The server already accepts this key for $($config.SshUser); nothing to install."
    } else {
        $lit = ConvertTo-ShellLiteral $pub
        $remote = "umask 077; mkdir -p ~/.ssh && touch ~/.ssh/authorized_keys && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys && (grep -qxF $lit ~/.ssh/authorized_keys || printf '%s\n' $lit >> ~/.ssh/authorized_keys)"
        Write-Info "Connecting as $($config.SshUser) to install the key: enter that user's SSH password when prompted."
        Write-Info '(A fresh server allows password login. If it is refused, check the user name and password on the server console.)'
        $r = Invoke-Ssh -Config $config -RemoteCommand $remote -Tty
        if ($r.ExitCode -ne 0) { throw "Installing the public key failed (exit $($r.ExitCode))." }
    }
    Test-SshConnection $config
    if (-not $FromSetup) { Write-Info 'Next: deploy.ps1 -Setup. Keep password login on until Setup has finished; Setup then shows how to turn it off.' }
    return 0
}

function Invoke-SetupMode {
    Test-LocalTool 'git', 'tar', 'npm', 'ssh', 'ssh-keygen'
    $config = Invoke-ConnectionReview -ForSetup
    Sync-HostKeyIfChanged $config
    Assert-PinnedHostKey $config
    if (-not (Test-KeyLogin $config)) {
        # Without the key every remote step would ask for the SSH password again.
        if ($NonInteractive) { throw "The server does not accept this computer's SSH key for $($config.SshUser); run deploy.ps1 -InstallKey first." }
        Write-Warn "The server does not accept this computer's SSH key for $($config.SshUser) yet."
        if (-not (Read-YesNo 'Install it now (asks for the SSH password once)?')) { throw 'Run deploy.ps1 -InstallKey first.' }
        [void](Invoke-InstallKeyMode -FromSetup)
    }
    Test-SshConnection $config
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
        Assert-BootstrapSudo $config
        $check = Invoke-RemoteRootScript -Config $config -Body "if [ -e $RemoteGoLiveFlag ]; then echo '[GO_LIVE_EXISTS]'; else echo '[NO_GO_LIVE]'; fi" -Capture -Quiet
    }
    if ($check.ExitCode -ne 0 -or -not (($check.Output -contains '[GO_LIVE_EXISTS]') -xor ($check.Output -contains '[NO_GO_LIVE]'))) {
        throw "Could not check the GO_LIVE flag (exit $($check.ExitCode))."
    }
    if ($check.Output -contains '[GO_LIVE_EXISTS]') { throw 'Server is GO-LIVE; Setup is blocked to protect live data.' }

    if (-not $NonInteractive) { $config = Invoke-SetupReview -FirstSetup (-not $viaGateway) }
    $modules = $config.Modules
    Write-Info "Modules: $modules (remote-setup refuses to change the modules of an existing installation)."
    $certMode = $config.CertMode
    Write-Info "Certificate mode: $certMode"

    $sha = Get-DeployCommit
    $front = Build-IsolatedFrontend $sha $config
    $bundle = New-DeploymentBundle $sha $front $config.Modules
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
            $config.AllowedHosts, [string]$config.SshPort, "$stage/bundle.tar.gz", $bundle.Sha256, $modules, $certMode)
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
    $tlsPending = @($r.Output | Where-Object { $_ -like '[[]TLS_PENDING[]]*' }).Count -gt 0
    if ($tlsPending) {
        Write-Warn "Setup completed WITHOUT a certificate: the application runs, but $($config.Domain) is not reachable until one is issued (HTTP only redirects to HTTPS)."
        if ($NonInteractive) {
            Write-Warn $(switch ($certMode) { 'dns01-cloudflare' { 'Next: deploy.ps1 -SetSecret CLOUDFLARE_DNS_API_TOKEN, then deploy.ps1 -IssueCert.' } 'http01' { 'Next: deploy.ps1 -IssueCert.' } default { 'Next: deploy.ps1 -InstallCert.' } })
        }
    } else {
        Write-Success "Setup completed: https://$($config.Domain)/"
    }
    $record = [ordered]@{}
    if (-not $config.ModulesSet) { $record['Modules'] = $modules }
    if (-not $config.CertModeSet) { $record['CertMode'] = $certMode }
    if ($record.Count -gt 0) {
        try { Save-ConfigSetting $record } catch { Write-Warn "Could not record $(@($record.Keys) -join ', ') in the configuration: $($_.Exception.Message)" }
    }
    try {
        [void](Register-PullTask)
    } catch {
        Write-Warn "Could not register the backup pull task: $($_.Exception.Message). Run deploy.ps1 -RegisterPullTask."
    }
    Remove-BootstrapSudo $config
    if (-not $NonInteractive) { Invoke-PostSetupGuide -Config $config -CertMode $certMode -TlsPending $tlsPending -FirstSetup (-not $viaGateway) }
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
    $config = Connect-Server -ForBuild
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
    $front = Build-IsolatedFrontend $sha $config
    $bundle = New-DeploymentBundle $sha $front $config.Modules
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
        $installed = @((Get-DeployConfig).Modules.Split(','))
        $missing = @($KnownModules | Where-Object { $_ -notin $installed })
        if ($missing.Count -eq 0) { throw "Every module is already installed ($($installed -join ', '))." }
        Write-Info "Installed modules (configuration): $($installed -join ', ')"
        $Code = $missing[(Read-MenuChoice 'Module to add:' $missing 0 'default')]
    }
    if ($Code -cnotin $KnownModules) { throw "Unknown module '$Code' (known: $($KnownModules -join ', '))." }
    Test-LocalTool 'git', 'tar', 'npm'
    $config = Connect-Server -ForBuild
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

    # Build and release the frontend with the updated module list before changing WH_MODULES on the server
    Write-Step "Building frontend with updated module list ($newModules) and deploying release..."
    $newConfig = $config.PSObject.Copy()
    $newConfig.Modules = $newModules
    $sha = Get-DeployCommit
    $front = Build-IsolatedFrontend $sha $newConfig
    $bundle = New-DeploymentBundle $sha $front $newModules
    $stage = $null
    try {
        $stage = New-RemoteStage $config
        [void](Send-RemoteFile $config $bundle.Path $stage 'bundle.tar.gz')
        $prepared = Invoke-PrepareAndPullBackup $config $sha $bundle $stage
        if ($prepared.ExitCode -ne 0) { return $prepared.ExitCode }

        $activateArgs = @($prepared.Release, '--verified-backup', $prepared.Backup, '--domain', $config.Domain)
        if ($Maintenance) { $activateArgs += '--maintenance' }
        $act = Invoke-RemoteRootScript -Config $config -Gateway 'deploy-activate' -ArgumentList $activateArgs
        if ($act.ExitCode -ne 0) {
            Write-Err "Release activation failed with exit code $($act.ExitCode)."
            return $act.ExitCode
        }
    } finally {
        if ($stage) { Remove-RemoteStage $config $stage }
        Remove-LocalBundle $bundle
    }

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
    $config = Connect-Server -ForBuild
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
    $front = Build-IsolatedFrontend $sha $config
    $bundle = New-DeploymentBundle $sha $front $config.Modules
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

    if ($RollbackRelease) {
        $targetName = $RollbackRelease.Trim()
        if (-not (Confirm-TypedWord 'YES' "Type YES to switch the server back to release $targetName")) {
            Write-Warn 'Rollback cancelled.'
            return 0
        }
        $r = Invoke-RemoteRootScript -Config $config -Gateway 'deploy-rollback' -ArgumentList @('--release', $targetName, '--domain', $config.Domain)
        if ($r.ExitCode -ne 0) { Write-Err "Rollback failed with exit code $($r.ExitCode)." } else { Write-Success "Rollback completed to $targetName." }
        return $r.ExitCode
    }

    Write-Step 'Querying available releases on the server...'
    $listRes = Invoke-RemoteRootScript -Config $config -Gateway 'deploy-rollback' -ArgumentList @('--list') -Capture -Quiet -SuppressStdErr
    $availableReleases = [System.Collections.Generic.List[object]]::new()
    if ($listRes.ExitCode -eq 0) {
        foreach ($line in $listRes.Output) {
            if ($line -match '^\[RELEASE_ITEM\] name=([^\s]+) tag=([^\s]*) compat=([^\s]+) commit=([^\s]*) date=([^\s]*)') {
                $availableReleases.Add([pscustomobject]@{
                    Name = $Matches[1]
                    Tag = $Matches[2]
                    Compat = $Matches[3]
                    Commit = $Matches[4]
                    Date = $Matches[5]
                })
            }
        }
    }

    $candidates = @($availableReleases | Where-Object { $_.Tag -ne 'active' })
    $targetReleaseName = $null

    if ($candidates.Count -gt 0) {
        Write-Info 'Available releases on the server:'
        for ($i = 0; $i -lt $candidates.Count; $i++) {
            $cand = $candidates[$i]
            $tagStr = if ($cand.Tag -eq 'previous') { ' (previous release)' } else { '' }
            $compatStr = if ($cand.Compat -eq 'ok') { '[COMPATIBLE]' } else { '[INCOMPATIBLE - schema mismatch]' }
            $color = if ($cand.Compat -eq 'ok') { 'Green' } else { 'DarkYellow' }
            $commitStr = if ($cand.Commit) { " commit: $($cand.Commit.Substring(0, [Math]::Min(10, $cand.Commit.Length)))" } else { '' }
            Write-Host ('  {0}) {1}{2}{3}  {4}' -f ($i + 1), $cand.Name, $tagStr, $commitStr, $compatStr) -ForegroundColor $color
        }

        $prevIndex = [array]::FindIndex([object[]]$candidates,[System.Predicate[object]]{ param($c) $c.Tag -eq 'previous' })
        if ($prevIndex -lt 0) { $prevIndex = 0 }

        $promptMsg = "Type YES to switch to previous release, or enter number [1-$($candidates.Count)]:"
        $answer = ([string](Read-Host -Prompt $promptMsg)).Trim()

        if ($answer -ceq 'YES') {
            $targetReleaseName = $candidates[$prevIndex].Name
        } else {
            $pickIdx = 0
            if ([int]::TryParse($answer, [ref]$pickIdx) -and $pickIdx -ge 1 -and $pickIdx -le $candidates.Count) {
                $selected = $candidates[$pickIdx - 1]
                $targetReleaseName = $selected.Name
                if ($selected.Compat -ne 'ok') {
                    Write-Warn "Release $($selected.Name) is marked as incompatible with current database schema. Rollback will be refused unless schema matches or a matching backup is restored."
                }
                if (-not (Confirm-TypedWord 'YES' "Type YES to confirm switching server to release $($selected.Name)")) {
                    Write-Warn 'Rollback cancelled.'
                    return 0
                }
            } else {
                Write-Warn 'Rollback cancelled.'
                return 0
            }
        }
    } else {
        if ($listRes.ExitCode -ne 0) {
            Write-Info 'Server tooling predates multi-release listing (will activate after your next -Update).'
            Write-Info 'Proceeding with standard rollback to the recorded previous release.'
        }
        if (-not (Confirm-TypedWord 'YES' 'Type YES to switch the server back to the previous release')) {
            Write-Warn 'Rollback cancelled.'
            return 0
        }
    }

    $gwArgs = @('--domain', $config.Domain)
    if ($targetReleaseName) { $gwArgs = @('--release', $targetReleaseName) + $gwArgs }
    $r = Invoke-RemoteRootScript -Config $config -Gateway 'deploy-rollback' -ArgumentList $gwArgs
    if ($r.ExitCode -ne 0) { Write-Err "Rollback failed with exit code $($r.ExitCode)." } else { Write-Success "Rollback completed$(if ($targetReleaseName) { " to $targetReleaseName" } else { '' })." }
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
        $pass = Test-SudoRestricted $config
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

function Invoke-ResetLockoutMode {
    $config = Connect-Server
    Write-Step "Resetting login lockouts on $($config.ServerHost)..."
    $r = Invoke-RemoteRootScript -Config $config -Gateway 'reset-lockout'
    if ($r.ExitCode -ne 0) {
        Write-Err "Resetting login lockouts failed with exit code $($r.ExitCode)."
    } else {
        Write-Success 'Login attempt lockouts cleared successfully.'
    }
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
    if (-not $KeyName) { $KeyName = $SecretKeyAllowList[(Read-MenuChoice 'Secret to set (the current value is never shown):' $SecretKeyAllowList 0 'default')] }
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
        $NewDomain = ([string](Read-Host -Prompt "New primary domain name (current: $((Get-DeployConfig).Domain))")).Trim().ToLowerInvariant()
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
    $mobileUpdated = Update-MobileServerOrigin $NewDomain

    Write-Success "Domain changed successfully!"
    Write-Success "  Primary domain (active): $NewDomain"
    Write-Success "  Legacy domain (transition): $($config.Domain)"
    if ($mobileUpdated) {
        Write-Success "  Mobile app server origin: https://$NewDomain ($(Get-MobileEnvPath))"
    }
    Write-Warn "CRITICAL: OAuth redirect URI in Google Cloud Console must be updated to:"
    Write-Warn "  https://$NewDomain/api/accounts/gdrive/callback/"
    Write-Warn "Commit the mobile environment change and build and publish a new APK (npm run build:mobile); installed apps switch to $NewDomain by themselves once their offline data is sent."
    Write-Warn "Web notifications: browsers must allow notifications again on $NewDomain (permission is per domain); Android (FCM) notifications need nothing."
    Write-Warn "ID cards: if a custom domain is set in the ID card settings, change it to https://$NewDomain; cards already printed keep working only while $($config.Domain) still redirects."
    Write-Warn "Run -FinishDomainChange only after users have opened the app on $NewDomain. Even then $($config.Domain) keeps serving the API and app files (only page navigation is redirected), so an installed app can still send its offline data before it moves."
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
    Write-Warn "Links on that domain stop working, including QR codes on ID cards printed while it was the primary domain."
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
    @('Setup', 'Initial server provisioning and first deployment'),
    @('InstallKey', 'Install SSH public key on the server'),
    @('CreateAdmin', 'Create a Django superuser interactively'),
    @('ResetLockout', 'Reset login lockouts and failed attempts (django-axes)'),
    @('IssueCert', "Issue the Let's Encrypt certificate (HTTP-01 or DNS-01 by CertMode)"),
    @('InstallCert', 'Install a Cloudflare Origin or Custom TLS certificate'),
    @('SetSecret', 'Set an allowed secret in shared/.env'),
    @('RegisterPullTask', 'Register the scheduled backup pull task'),
    @('GoLive', 'Run the go-live checklist and set GO_LIVE'),
    @('Status', 'Server and off-server backup status'),
    @('Update', 'Two-phase update (prepare, pull backup, activate)'),
    @('Restart', 'Restart services and reload Nginx'),
    @('Logs', 'Stream service logs'),
    @('AddModule', 'Add a module (warehouse or accounting)'),
    @('Backup', 'Create a manual server backup and pull it'),
    @('PullBackups', 'Pull and verify all server backups'),
    @('PruneBackups', 'Prune server dumps verified off-server'),
    @('Restore', 'Restore the database from a server dump'),
    @('RestoreDrill', 'Restore drill of the newest local dump (Docker)'),
    @('Rollback', 'Roll back to the previous release'),
    @('ChangeDomain', 'Change primary domain (new domain active, old in transition)'),
    @('FinishDomainChange', 'Finish domain change (convert transition domains to 301 redirect)'),
    @('RemoveLegacyDomain', 'Remove legacy domain redirect (archives TLS to shared/retired)'),
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
New server: deploy.ps1 -Setup (or deploy.ps1 -InstallKey, then -Setup). Interactive runs ask for
any missing or invalid configuration value, pin the host key against the server console, and
show every step that has to be done on the server console.

Modes (exactly one):
  -Setup             Provision the server and deploy HEAD (blocked after GO_LIVE)
  -InstallKey        Install the local ED25519 public key on the server (interactive)
  -CreateAdmin       Create a Django superuser over an interactive SSH session
  -ResetLockout      Reset login attempt lockouts on the server (django-axes)
  -IssueCert         Issue the Let's Encrypt certificate (HTTP-01 or DNS-01 by CertMode)
  -InstallCert       Install a Cloudflare Origin or Custom TLS certificate (-CertFile, -KeyFile)
  -SetSecret <KEY>   Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET or OUTBOUND_HTTP_PROXY,
                     or CLOUDFLARE_DNS_API_TOKEN (root-only file for DNS-01 certificates)
  -RegisterPullTask  Register the daily backup pull task (use -Force to re-register)
  -GoLive            Run the go-live checklist, then set the GO_LIVE flag
  -Status            Server state, heartbeats, disk, certificate and off-server copies
  -Update            Build HEAD, upload, prepare, pull the pre-update backup, activate
                     (never changes the installed modules; Modules must match the server)
  -Restart           Restart application services and reload Nginx
  -Logs              Stream the service journal
  -AddModule <code>  Add the warehouse or accounting module: verified backup, migrate, restart, health
                     check; a failure restores the previous modules (removing a module is not supported)
  -Backup            Create a manual server backup and pull it (verified)
  -PullBackups       Pull new verified backups and the media mirror into backups/soft
  -PruneBackups      Delete server dumps whose local copy matches a fresh server sha256
  -Restore           Restore the database from a server dump (typed confirmation)
  -RestoreDrill      Restore the newest verified local dump into a throwaway Docker PostgreSQL
  -Rollback          Switch back to the previous release (or an older release with -RollbackRelease)
  -ChangeDomain <d>  Change primary domain to <d>: issues/installs cert, puts old domain in transition
  -FinishDomainChange Convert all legacy transition domains to permanent 301 redirects
  -RemoveLegacyDomain <d> Remove legacy domain redirect (archives its TLS files to shared/retired/)
  -ResetServer       Before GO_LIVE only: recreate the database empty with Modules and deploy HEAD (typed RESET)
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
            'ResetLockout' { Invoke-ResetLockoutMode }
            'SetSecret' { Invoke-SetSecretMode $SetSecret }
            'RegisterPullTask' { Register-PullTask }
            'Logs' { Invoke-LogsMode }
            'Restart' { Invoke-RestartMode }
            'IssueCert' { Invoke-IssueCertMode }
            'InstallCert' { Invoke-InstallCertMode -CertPath $CertFile -KeyPath $KeyFile -ChainPath $ChainFile }
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
    # Persian names (branding) must show and be typed correctly in the console.
    try { [Console]::OutputEncoding = $Utf8NoBom; [Console]::InputEncoding = $Utf8NoBom } catch { Write-Verbose "Console encoding unchanged: $_" }
    try {
        if ($RollbackRelease -and -not $Rollback) { $Rollback = $true }
        $flags = [ordered]@{
            InstallKey = [bool]$InstallKey; Setup = [bool]$Setup; Update = [bool]$Update; Backup = [bool]$Backup
            PullBackups = [bool]$PullBackups; PruneBackups = [bool]$PruneBackups; Restore = [bool]$Restore
            RestoreDrill = [bool]$RestoreDrill; Rollback = [bool]$Rollback; GoLive = [bool]$GoLive
            CreateAdmin = [bool]$CreateAdmin; ResetLockout = [bool]$ResetLockout; SetSecret = -not [string]::IsNullOrEmpty($SetSecret)
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
