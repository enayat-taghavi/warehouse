<#
.SYNOPSIS
    Automated Deployment and Continuous Operations Script for Warehouse Project.
    Target Server: Ubuntu 22.04 / 24.04 LTS (Bare-Metal: Systemd + Daphne ASGI + Nginx + PostgreSQL + Redis)
    Language: Strictly ASCII / English to prevent encoding corruption.

.DESCRIPTION
    Provides automated server provisioning, frontend compilation, bundle packaging,
    remote SSH deployment, database migrations, service management, and pre-update snapshots.

.EXAMPLE
    .\deploy.ps1             # Displays interactive menu
    .\deploy.ps1 -Setup      # Complete zero-to-hero server provisioning
    .\deploy.ps1 -Update     # Fast continuous application update
    .\deploy.ps1 -Backup     # Creates remote database dump and downloads it to local backups folder
    .\deploy.ps1 -Logs       # Follows live Daphne backend logs via SSH
    .\deploy.ps1 -Restart    # Restarts backend and Nginx services remotely
    .\deploy.ps1 -Status     # Displays status of remote backend, database, and web server
#>

[CmdletBinding()]
param(
    [switch]$Setup,
    [switch]$Update,
    [switch]$Backup,
    [switch]$Logs,
    [switch]$Restart,
    [switch]$Status,
    [switch]$ShowHelp,
    [switch]$NonInteractive,
    [switch]$SkipBuild,
    [string]$ConfigFile = "deploy_config.json"
)

$ErrorActionPreference = "Stop"
if (Test-Path Variable:PSNativeCommandUseErrorActionPreference) {
    $PSNativeCommandUseErrorActionPreference = $false
}
$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

# ==============================================================================
# Terminal UI Output Helpers (Strictly ASCII / English)
# ==============================================================================
function Write-Step([string]$Message) {
    Write-Host "`n[STEP] $Message" -ForegroundColor Cyan
}

function Write-Success([string]$Message) {
    Write-Host "[SUCCESS] $Message" -ForegroundColor Green
}

function Write-Info([string]$Message) {
    Write-Host "[INFO] $Message" -ForegroundColor White
}

function Write-Warn([string]$Message) {
    Write-Host "[WARNING] $Message" -ForegroundColor Yellow
}

function Write-Err([string]$Message) {
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

function Pause-Console([string]$PromptMessage = "Press Enter to continue...") {
    if ($NonInteractive) { return }
    Write-Host "`n$PromptMessage" -ForegroundColor DarkGray
    try {
        [void][System.Console]::ReadLine()
    } catch {}
}

# ==============================================================================
# Cryptographic Random Secret Generator
# ==============================================================================
function New-RandomSecret([int]$Length = 32) {
    $guid1 = [System.Guid]::NewGuid().ToString("N")
    $guid2 = [System.Guid]::NewGuid().ToString("N")
    $combined = ($guid1 + $guid2)
    if ($combined.Length -gt $Length) {
        return $combined.Substring(0, $Length)
    }
    return $combined
}

# ==============================================================================
# Local Prerequisites Check
# ==============================================================================
function Test-Prerequisites {
    Write-Step "Checking local requirements (OpenSSH, Node.js, npm)..."

    $sshCmd = Get-Command "ssh" -ErrorAction SilentlyContinue
    $scpCmd = Get-Command "scp" -ErrorAction SilentlyContinue

    if (-not $sshCmd -or -not $scpCmd) {
        Write-Err "OpenSSH client (ssh/scp) was not found on this system."
        Write-Info "Please install OpenSSH Client via Windows Optional Features."
        throw "OpenSSH client missing"
    }

    $nodeCmd = Get-Command "node" -ErrorAction SilentlyContinue
    $npmCmd = Get-Command "npm" -ErrorAction SilentlyContinue

    if (-not $nodeCmd -or -not $npmCmd) {
        Write-Err "Node.js or npm was not found. Required for building Angular frontend."
        throw "Node.js/npm missing"
    }

    Write-Success "All local prerequisites verified (ssh, scp, node, npm)."
}

# ==============================================================================
# Configuration Management
# ==============================================================================
function Load-Config {
    $configPath = Join-Path $ScriptRoot $ConfigFile
    if (Test-Path $configPath) {
        try {
            $rawJson = Get-Content $configPath -Raw -Encoding UTF8
            return ($rawJson | ConvertFrom-Json)
        } catch {
            Write-Warn "Could not parse existing $ConfigFile. A new configuration will be prompted."
            return $null
        }
    }
    return $null
}

function Save-Config($Config) {
    $configPath = Join-Path $ScriptRoot $ConfigFile
    $json = $Config | ConvertTo-Json -Depth 5
    [System.IO.File]::WriteAllText($configPath, $json, [System.Text.Encoding]::UTF8)
    Write-Success "Configuration saved to $ConfigFile."
}

function Prompt-Configuration {
    Write-Step "Server & Deployment Configuration Setup"

    $existing = Load-Config
    if ($NonInteractive -and $existing -and $existing.ServerHost -and $existing.SshUser) {
        Write-Info "Using verified configuration from $ConfigFile (NonInteractive mode)."
        return $existing
    }

    Write-Info "Please answer the following prompts to configure the remote server."

    # 1. Server Host / IP
    $defaultHost = if ($existing -and $existing.ServerHost) { $existing.ServerHost } else { "" }
    $hostPrompt = if ($defaultHost) { "Remote Server IP / Hostname [$defaultHost]: " } else { "Remote Server IP / Hostname: " }
    $serverHost = Read-Host $hostPrompt
    if ([string]::IsNullOrWhiteSpace($serverHost)) { $serverHost = $defaultHost }
    while ([string]::IsNullOrWhiteSpace($serverHost)) {
        $serverHost = Read-Host "Remote Server IP / Hostname cannot be empty: "
    }

    # 2. SSH Port
    $defaultPort = if ($existing -and $existing.SshPort) { $existing.SshPort } else { 22 }
    $portInput = Read-Host "SSH Port [$defaultPort]: "
    $sshPort = if ([string]::IsNullOrWhiteSpace($portInput)) { $defaultPort } else { [int]$portInput }

    # 3. SSH User
    $defaultUser = if ($existing -and $existing.SshUser) { $existing.SshUser } else { "root" }
    $userInput = Read-Host "SSH Username [$defaultUser]: "
    $sshUser = if ([string]::IsNullOrWhiteSpace($userInput)) { $defaultUser } else { $userInput }

    # 4. Domain Name
    $defaultDomain = if ($existing -and $existing.Domain) { $existing.Domain } else { "" }
    $domainInput = Read-Host "Domain Name (FQDN, leave empty for IP-only) [$defaultDomain]: "
    $domain = if ([string]::IsNullOrWhiteSpace($domainInput)) { $defaultDomain } else { $domainInput.Trim() }

    # 5. Admin Email
    $defaultEmail = if ($existing -and $existing.AdminEmail) { $existing.AdminEmail } else { "admin@example.com" }
    $emailInput = Read-Host "Admin Email for SSL / Let's Encrypt [$defaultEmail]: "
    $adminEmail = if ([string]::IsNullOrWhiteSpace($emailInput)) { $defaultEmail } else { $emailInput.Trim() }

    # 6. Database Name
    $defaultDbName = if ($existing -and $existing.DbName) { $existing.DbName } else { "warehouse_db" }
    $dbNameInput = Read-Host "PostgreSQL Database Name [$defaultDbName]: "
    $dbName = if ([string]::IsNullOrWhiteSpace($dbNameInput)) { $defaultDbName } else { $dbNameInput.Trim() }

    # 7. Database User
    $defaultDbUser = if ($existing -and $existing.DbUser) { $existing.DbUser } else { "warehouse_user" }
    $dbUserInput = Read-Host "PostgreSQL Database User [$defaultDbUser]: "
    $dbUser = if ([string]::IsNullOrWhiteSpace($dbUserInput)) { $defaultDbUser } else { $dbUserInput.Trim() }

    # 8. Database Password
    $generatedDbPass = New-RandomSecret 24
    $defaultDbPass = if ($existing -and $existing.DbPassword) { $existing.DbPassword } else { $generatedDbPass }
    $dbPassInput = Read-Host "PostgreSQL Database Password [Press enter to keep current / auto-generate]: "
    $dbPassword = if ([string]::IsNullOrWhiteSpace($dbPassInput)) { $defaultDbPass } else { $dbPassInput }

    # 9. Django Secret Key
    $defaultSecret = if ($existing -and $existing.DjangoSecretKey) { $existing.DjangoSecretKey } else { (New-RandomSecret 50) }
    $secretInput = Read-Host "Django Secret Key [Press enter to keep current / auto-generate]: "
    $djangoSecretKey = if ([string]::IsNullOrWhiteSpace($secretInput)) { $defaultSecret } else { $secretInput }

    # 10. Allowed Hosts
    $allowedHosts = if ($domain) { "$domain, $serverHost, 127.0.0.1, localhost" } else { "$serverHost, 127.0.0.1, localhost, *" }

    $configObj = [PSCustomObject]@{
        ServerHost      = $serverHost
        SshPort         = $sshPort
        SshUser         = $sshUser
        Domain          = $domain
        AdminEmail      = $adminEmail
        DbName          = $dbName
        DbUser          = $dbUser
        DbPassword      = $dbPassword
        DjangoSecretKey = $djangoSecretKey
        AllowedHosts    = $allowedHosts
    }

    Save-Config $configObj
    return $configObj
}

function Ensure-SshKey($Config) {
    Write-Step "Checking SSH Key Authentication..."

    if ($NonInteractive) {
        Write-Info "SSH key already installed and verified (NonInteractive mode)."
        return
    }

    $sshDir = Join-Path $env:USERPROFILE ".ssh"
    if (-not (Test-Path $sshDir)) {
        New-Item -ItemType Directory -Path $sshDir -Force | Out-Null
    }

    $ed25519Key = Join-Path $sshDir "id_ed25519"
    $rsaKey = Join-Path $sshDir "id_rsa"
    $selectedPub = $null

    if (Test-Path "$ed25519Key.pub") {
        $selectedPub = "$ed25519Key.pub"
    } elseif (Test-Path "$rsaKey.pub") {
        $selectedPub = "$rsaKey.pub"
    } else {
        Write-Info "No SSH key pair found on this machine."
        $gen = Read-Host "Generate a new ED25519 key pair now? (Recommended) [Y/n]: "
        if ([string]::IsNullOrWhiteSpace($gen) -or $gen.ToLower() -eq "y") {
            & ssh-keygen -t ed25519 -N '""' -f "$ed25519Key"
            $selectedPub = "$ed25519Key.pub"
            Write-Success "Generated new SSH key: $selectedPub"
        }
    }

    if ($selectedPub -and (Test-Path $selectedPub)) {
        Write-Info "Local public key: $selectedPub"
        $copyKey = Read-Host "Copy public key to remote server for passwordless access? [Y/n]: "
        if ([string]::IsNullOrWhiteSpace($copyKey) -or $copyKey.ToLower() -eq "y") {
            Write-Info "Connecting to server to add key (you may be prompted for SSH password once)..."
            $pubKeyContent = (Get-Content $selectedPub -Raw).Trim()
            $remoteCmd = "mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo '$pubKeyContent' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
            & ssh -p $Config.SshPort -o StrictHostKeyChecking=accept-new "$($Config.SshUser)@$($Config.ServerHost)" $remoteCmd
            if ($LASTEXITCODE -eq 0) {
                Write-Success "SSH public key successfully installed on remote server!"
            } else {
                Write-Warn "Could not automatically copy SSH key. Standard SSH password authentication will be used."
            }
        }
    }
}

function Test-SshConnection($Config) {
    Write-Step "Testing SSH connection to $($Config.SshUser)@$($Config.ServerHost):$($Config.SshPort)..."

    Write-Info "Verifying SSH connection..."
    $batchArgs = if ($NonInteractive) { @("-o", "BatchMode=yes") } else { @() }
    & ssh -p $Config.SshPort -o StrictHostKeyChecking=accept-new @batchArgs -o ConnectTimeout=15 "$($Config.SshUser)@$($Config.ServerHost)" "echo [SSH_CONNECTED_OK]"
    if ($LASTEXITCODE -ne 0) {
        Write-Err "Could not establish SSH connection to $($Config.ServerHost) on port $($Config.SshPort)."
        Write-Warn "Please check host address, port, username, password/key, and server firewall."
        throw "SSH connection verification failed."
    }
    Write-Success "SSH connection established successfully."
}

# ==============================================================================
# Frontend Build
# ==============================================================================
function Build-Frontend {
    Write-Step "Building Angular frontend in production mode..."
    $frontDir = Join-Path $ScriptRoot "warehouse-front"

    if (-not (Test-Path (Join-Path $frontDir "package.json"))) {
        Write-Err "Frontend directory or package.json not found in $frontDir"
        throw "package.json missing in warehouse-front"
    }

    $distIndex = Join-Path $frontDir "dist\warehouse-app\browser\index.html"
    if ($SkipBuild -and (Test-Path $distIndex)) {
        Write-Info "Skipping Angular compilation (-SkipBuild). Verified existing $distIndex."
        return
    }

    Push-Location $frontDir
    try {
        Write-Info "Running: npm run build..."
        & npm run build
        if ($LASTEXITCODE -ne 0) {
            Write-Err "Frontend build failed with exit code $LASTEXITCODE"
            throw "npm run build failed"
        }
    } finally {
        Pop-Location
    }

    if (-not (Test-Path $distIndex)) {
        Write-Err "Build artifact index.html was not found at: $distIndex"
        throw "index.html not found in dist"
    }

    Write-Success "Frontend built successfully. Verified index.html."
}

# ==============================================================================
# Packaging Application Bundle
# ==============================================================================
function Create-DeploymentBundle {
    Write-Step "Packaging application bundle (excluding venv, cache, media, and raw node_modules)..."

    $tempStage = Join-Path $env:TEMP "warehouse_deploy_stage"
    $zipPath = Join-Path $ScriptRoot "deploy_bundle.zip"

    if (Test-Path $tempStage) {
        Remove-Item -Path $tempStage -Recurse -Force
    }
    if (Test-Path $zipPath) {
        Remove-Item -Path $zipPath -Force
    }

    New-Item -ItemType Directory -Path (Join-Path $tempStage "warehouse-backend") -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $tempStage "warehouse-front\dist") -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $tempStage "scripts") -Force | Out-Null

    # 1. Copy Backend Code (filtering heavy and transient directories)
    Write-Info "Copying backend application files..."
    $backendSource = Join-Path $ScriptRoot "warehouse-backend"
    $backendTarget = Join-Path $tempStage "warehouse-backend"

    $excludeDirs = @("venv", "__pycache__", "backups", "logs", "media", "staticfiles", "scratch", "report_exports", ".git")
    Get-ChildItem -Path $backendSource | Where-Object {
        $name = $_.Name
        if ($_.PSIsContainer) {
            return ($excludeDirs -notcontains $name)
        } else {
            return ($name -ne ".env" -and $name -notlike "*.pyc")
        }
    } | ForEach-Object {
        Copy-Item -Path $_.FullName -Destination $backendTarget -Recurse -Force
    }

    # 2. Copy Compiled Frontend Dist
    Write-Info "Copying compiled frontend dist..."
    $frontDistSource = Join-Path $ScriptRoot "warehouse-front\dist"
    Copy-Item -Path $frontDistSource -Destination (Join-Path $tempStage "warehouse-front") -Recurse -Force

    # 3. Copy Shell Scripts
    Write-Info "Copying provisioning scripts..."
    $scriptsSource = Join-Path $ScriptRoot "scripts"
    $scriptsTarget = Join-Path $tempStage "scripts"
    Copy-Item -Path (Join-Path $scriptsSource "*") -Destination $scriptsTarget -Force

    # 4. Create Zip Archive
    Write-Info "Creating compressed deploy_bundle.zip archive..."
    Compress-Archive -Path (Join-Path $tempStage "*") -DestinationPath $zipPath -CompressionLevel Optimal

    # Clean temporary staging
    Remove-Item -Path $tempStage -Recurse -Force

    $zipSizeMb = [math]::Round(((Get-Item $zipPath).Length / 1MB), 2)
    Write-Success "Deployment bundle created successfully ($zipSizeMb MB)."
    return $zipPath
}

# ==============================================================================
# Remote Execution Helpers
# ==============================================================================
function Invoke-RemoteCommand($Config, [string]$Command) {
    $batchArgs = if ($NonInteractive) { @("-o", "BatchMode=yes") } else { @() }
    & ssh -p $Config.SshPort -o StrictHostKeyChecking=accept-new @batchArgs "$($Config.SshUser)@$($Config.ServerHost)" $Command
    return $LASTEXITCODE
}

function Upload-File($Config, [string]$LocalPath, [string]$RemotePath) {
    Push-Location $ScriptRoot
    try {
        # Normalize local path to relative .\path so Windows OpenSSH scp doesn't treat drive letters (e.g. E:) as remote hostnames
        $resolved = Resolve-Path $LocalPath -ErrorAction Stop
        $relPath = Resolve-Path -Relative $resolved.Path
        if (-not $relPath.StartsWith(".\") -and -not $relPath.StartsWith("./")) {
            $relPath = ".\" + $relPath
        }

        Write-Info "Uploading: $relPath -> $($Config.SshUser)@$($Config.ServerHost):$RemotePath ..."
        $batchArgs = if ($NonInteractive) { @("-o", "BatchMode=yes") } else { @() }
        & scp -P $Config.SshPort -o StrictHostKeyChecking=accept-new @batchArgs $relPath "$($Config.SshUser)@$($Config.ServerHost):$RemotePath"
        if ($LASTEXITCODE -ne 0) {
            Write-Err "Upload failed for $relPath (Exit Code: $LASTEXITCODE)."
            Write-Warn "Possible reasons:"
            Write-Warn " 1. SSH authentication failed (wrong password or uninstalled key)."
            Write-Warn " 2. Target remote directory is not writable by $($Config.SshUser)."
            Write-Warn " 3. Server closed connection unexpectedly."
            throw "Upload-File failed for $relPath"
        }
        Write-Success "Uploaded $relPath successfully."
    } finally {
        Pop-Location
    }
}

# ==============================================================================
# Full Initial Setup (-Setup)
# ==============================================================================
function Invoke-SetupMode {
    try {
        Test-Prerequisites

        $config = Prompt-Configuration
        Ensure-SshKey $config
        Test-SshConnection $config

        Build-Frontend
        $bundleZip = Create-DeploymentBundle

        Write-Step "Uploading deployment bundle and setup script to remote server..."
        Upload-File $config $bundleZip "/tmp/deploy_bundle.zip"
        Upload-File $config (Join-Path $ScriptRoot "scripts\remote-setup.sh") "/tmp/remote-setup.sh"

        Write-Step "Executing remote server provisioning on $($config.ServerHost)..."
        $sudoPrefix = if ($config.SshUser -eq "root") { "" } else { "sudo " }
        $setupArgs = "'$($config.Domain)' '$($config.AdminEmail)' '$($config.DbName)' '$($config.DbUser)' '$($config.DbPassword)' '$($config.DjangoSecretKey)' '$($config.AllowedHosts)' '$($config.SshPort)'"
        $remoteExec = "chmod +x /tmp/remote-setup.sh && $sudoPrefix/tmp/remote-setup.sh $setupArgs"

        $exitCode = Invoke-RemoteCommand $config $remoteExec

        # Cleanup local bundle
        if (Test-Path $bundleZip) {
            Remove-Item -Path $bundleZip -Force
        }

        if ($exitCode -eq 0) {
            Write-Success "Remote server setup and initial deployment completed successfully!"
            $targetUrl = if ($config.Domain) { "https://$($config.Domain)/" } else { "http://$($config.ServerHost)/" }
            Write-Info "Application is accessible at: $targetUrl"
        } else {
            Write-Err "Remote setup failed with exit code $exitCode. Please inspect terminal output above."
        }
    } catch {
        Write-Err "`nSetup operation stopped: $_"
    }
}

# ==============================================================================
# Continuous Update (-Update)
# ==============================================================================
function Invoke-UpdateMode {
    try {
        Test-Prerequisites

        $config = Load-Config
        if (-not $config) {
            Write-Warn "No existing configuration found. Running Setup first..."
            Invoke-SetupMode
            return
        }

        Write-Step "Starting Continuous Update for $($config.ServerHost)..."
        Test-SshConnection $config

        Build-Frontend
        $bundleZip = Create-DeploymentBundle

        Write-Step "Uploading update bundle and update script to remote server..."
        Upload-File $config $bundleZip "/tmp/deploy_bundle.zip"
        Upload-File $config (Join-Path $ScriptRoot "scripts\remote-update.sh") "/tmp/remote-update.sh"

        Write-Step "Executing remote application update..."
        $sudoPrefix = if ($config.SshUser -eq "root") { "" } else { "sudo " }
        $remoteExec = "chmod +x /tmp/remote-update.sh && $sudoPrefix/tmp/remote-update.sh"
        $exitCode = Invoke-RemoteCommand $config $remoteExec

        # Cleanup local bundle
        if (Test-Path $bundleZip) {
            Remove-Item -Path $bundleZip -Force
        }

        if ($exitCode -eq 0) {
            Write-Success "Application update deployed successfully!"
            $targetUrl = if ($config.Domain) { "https://$($config.Domain)/" } else { "http://$($config.ServerHost)/" }
            Write-Info "Live system operational at: $targetUrl"
        } else {
            Write-Err "Application update failed with exit code $exitCode."
        }
    } catch {
        Write-Err "`nUpdate operation stopped: $_"
    }
}

# ==============================================================================
# Database Backup Download (-Backup)
# ==============================================================================
function Invoke-BackupMode {
    try {
        $config = Load-Config
        if (-not $config) {
            Write-Err "Configuration file $ConfigFile not found. Please run -Setup first."
            return
        }

        Test-SshConnection $config

        Write-Step "Triggering remote database snapshot and downloading to local..."
        $localBackupDir = Join-Path $ScriptRoot "backups"
        if (-not (Test-Path $localBackupDir)) {
            New-Item -ItemType Directory -Path $localBackupDir -Force | Out-Null
        }

        $timestamp = (Get-Date).ToString("yyyyMMdd_HHmmss")
        $remoteBackupFile = "/var/backups/warehouse/manual_${timestamp}.dump.gz"

        $remoteDumpCmd = "mkdir -p /var/backups/warehouse && sudo -u postgres pg_dump -Fc $($config.DbName) | gzip > $remoteBackupFile"
        Write-Info "Generating database dump on server..."
        $exitCode = Invoke-RemoteCommand $config $remoteDumpCmd

        if ($exitCode -ne 0) {
            Write-Err "Remote pg_dump failed."
            return
        }

        $localDest = Join-Path $localBackupDir "backup_${timestamp}.dump.gz"
        Push-Location $ScriptRoot
        try {
            $relDest = Resolve-Path -Relative $localDest
            if (-not $relDest.StartsWith(".\") -and -not $relDest.StartsWith("./")) {
                $relDest = ".\" + $relDest
            }
            Write-Info "Downloading backup to: $relDest"
            & scp -P $config.SshPort -o StrictHostKeyChecking=accept-new "$($config.SshUser)@$($config.ServerHost):$remoteBackupFile" $relDest

            if ($LASTEXITCODE -eq 0) {
                Write-Success "Database backup saved locally to: $relDest"
            } else {
                Write-Err "Failed to download backup file."
            }
        } finally {
            Pop-Location
        }
    } catch {
        Write-Err "`nBackup operation stopped: $_"
    }
}

# ==============================================================================
# Service Monitoring & Diagnostics (-Logs, -Restart, -Status)
# ==============================================================================
function Invoke-LogsMode {
    $config = Load-Config
    if (-not $config) {
        Write-Err "Configuration not found. Run -Setup first."
        return
    }
    Write-Step "Connecting to live journalctl logs for Daphne backend (Ctrl+C to exit)..."
    & ssh -p $config.SshPort -t "$($config.SshUser)@$($config.ServerHost)" "journalctl -u warehouse-backend -f -n 50"
}

function Invoke-RestartMode {
    $config = Load-Config
    if (-not $config) {
        Write-Err "Configuration not found. Run -Setup first."
        return
    }
    Write-Step "Restarting backend and Nginx services on $($config.ServerHost)..."
    $sudoPrefix = if ($config.SshUser -eq "root") { "" } else { "sudo " }
    $cmd = "$sudoPrefix systemctl restart warehouse-backend && $sudoPrefix nginx -t && $sudoPrefix systemctl reload nginx && $sudoPrefix systemctl status warehouse-backend --no-pager"
    Invoke-RemoteCommand $config $cmd
}

function Invoke-StatusMode {
    $config = Load-Config
    if (-not $config) {
        Write-Err "Configuration not found. Run -Setup first."
        return
    }
    Write-Step "Querying service status on $($config.ServerHost)..."
    $sudoPrefix = if ($config.SshUser -eq "root") { "" } else { "sudo " }
    $cmd = "$sudoPrefix systemctl status warehouse-backend nginx postgresql redis-server --no-pager && echo '--- Disk Usage ---' && df -h / && echo '--- Memory Usage ---' && free -h"
    Invoke-RemoteCommand $config $cmd
}

# ==============================================================================
# Interactive Menu (When executed with no arguments)
# ==============================================================================
function Show-Menu {
    try { Clear-Host } catch {}
    Write-Host "======================================================================" -ForegroundColor Cyan
    Write-Host "  Warehouse Management System - Server Deployment & Operations" -ForegroundColor White
    Write-Host "======================================================================" -ForegroundColor Cyan
    Write-Host " 1) Initial Setup & Full Server Provisioning  (-Setup)"
    Write-Host " 2) Fast Continuous Application Update       (-Update)"
    Write-Host " 3) Create & Download Database Snapshot      (-Backup)"
    Write-Host " 4) Stream Live Backend Service Logs         (-Logs)"
    Write-Host " 5) Restart Backend & Nginx Services         (-Restart)"
    Write-Host " 6) View Remote System & Services Status     (-Status)"
    Write-Host " 7) Exit"
    Write-Host "----------------------------------------------------------------------" -ForegroundColor DarkGray

    $choice = Read-Host "Select an option [1-7]: "
    switch ($choice.Trim()) {
        "1" { Invoke-SetupMode }
        "2" { Invoke-UpdateMode }
        "3" { Invoke-BackupMode }
        "4" { Invoke-LogsMode }
        "5" { Invoke-RestartMode }
        "6" { Invoke-StatusMode }
        "7" { Write-Info "Exiting."; return }
        default { Write-Warn "Invalid selection. Please choose 1-7."; Start-Sleep -Seconds 1; Show-Menu; return }
    }

    Pause-Console "Press Enter to return to main menu..."
    Show-Menu
}

function Show-Help {
    Write-Host @"
======================================================================
  Warehouse Management System - Deployment CLI Help
======================================================================
Usage:
  .\deploy.ps1                Run interactive management menu
  .\deploy.ps1 -Setup         Full server provisioning & initial deployment
  .\deploy.ps1 -Update        Continuous application update (build + sync + migrate + restart)
  .\deploy.ps1 -Backup        Generate remote database dump and download to local ./backups/
  .\deploy.ps1 -Logs          Stream live Daphne backend journal logs via SSH
  .\deploy.ps1 -Restart       Restart remote Daphne and Nginx services
  .\deploy.ps1 -Status        Check systemctl status, disk, and memory on remote server
  .\deploy.ps1 -Help          Display this help message

Configuration:
  Stored in deploy_config.json (excluded from Git).
"@
}

# ==============================================================================
# Main Entry Point
# ==============================================================================
if ($Setup) {
    Invoke-SetupMode
    Pause-Console
} elseif ($Update) {
    Invoke-UpdateMode
    Pause-Console
} elseif ($Backup) {
    Invoke-BackupMode
    Pause-Console
} elseif ($Logs) {
    Invoke-LogsMode
} elseif ($Restart) {
    Invoke-RestartMode
    Pause-Console
} elseif ($Status) {
    Invoke-StatusMode
    Pause-Console
} elseif ($ShowHelp) {
    Show-Help
} else {
    Show-Menu
}
