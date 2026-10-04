<#
.SYNOPSIS
    Warehouse Management System - Production Deployment & Continuous Update Automation
.DESCRIPTION
    Automates remote provisioning, building, continuous deployment, database backups,
    service monitoring, and SSL certificate management for Ubuntu 22.04 / 24.04 LTS servers.
    Operates strictly via OpenSSH and SCP from Windows.
.EXAMPLE
    .\deploy.ps1 -Setup      # Full initial server setup and provisioning
    .\deploy.ps1 -Update     # Fast continuous update (builds front, takes DB snapshot, deploys, restarts)
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
    [switch]$Help,
    [string]$ConfigFile = "deploy_config.json"
)

$ErrorActionPreference = "Stop"
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

# ==============================================================================
# Cryptographic Random Generator
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
# Prerequisites Check
# ==============================================================================
function Test-Prerequisites {
    Write-Step "Checking local requirements (OpenSSH, Node.js, npm)..."

    $sshCmd = Get-Command "ssh" -ErrorAction SilentlyContinue
    $scpCmd = Get-Command "scp" -ErrorAction SilentlyContinue

    if (-not $sshCmd -or -not $scpCmd) {
        Write-Err "OpenSSH client (ssh/scp) not found on this system."
        Write-Info "Please install OpenSSH Client via Windows Optional Features."
        exit 1
    }

    $nodeCmd = Get-Command "node" -ErrorAction SilentlyContinue
    $npmCmd = Get-Command "npm" -ErrorAction SilentlyContinue

    if (-not $nodeCmd -or -not $npmCmd) {
        Write-Err "Node.js or npm not found. Required for building Angular frontend."
        exit 1
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
    Write-Info "Please answer the following prompts to configure the remote server."

    $existing = Load-Config

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
    $dbPassInput = Read-Host "PostgreSQL Database Password [Auto-generated]: "
    $dbPassword = if ([string]::IsNullOrWhiteSpace($dbPassInput)) { $defaultDbPass } else { $dbPassInput }

    # 9. Django Secret Key
    $defaultSecret = if ($existing -and $existing.DjangoSecretKey) { $existing.DjangoSecretKey } else { (New-RandomSecret 50) }
    $secretInput = Read-Host "Django Secret Key [Auto-generated]: "
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

# ==============================================================================
# SSH Key Management
# ==============================================================================
function Ensure-SshKey($Config) {
    Write-Step "Checking SSH Key Authentication..."

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
            Write-Info "Connecting to server to add key (you may be prompted for the server SSH password once)..."
            $pubKeyContent = (Get-Content $selectedPub -Raw).Trim()
            $remoteCmd = "mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo '$pubKeyContent' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
            & ssh -p $Config.SshPort -o StrictHostKeyChecking=accept-new "$($Config.SshUser)@$($Config.ServerHost)" $remoteCmd
            if ($LASTEXITCODE -eq 0) {
                Write-Success "SSH public key successfully installed on remote server!"
            } else {
                Write-Warn "Could not automatically copy SSH key. Continuing..."
            }
        }
    }
}

# ==============================================================================
# Frontend Build
# ==============================================================================
function Build-Frontend {
    Write-Step "Building Angular frontend in production mode..."
    $frontDir = Join-Path $ScriptRoot "warehouse-front"

    if (-not (Test-Path (Join-Path $frontDir "package.json"))) {
        Write-Err "Frontend directory or package.json not found in $frontDir"
        exit 1
    }

    Push-Location $frontDir
    try {
        Write-Info "Running: npm run build..."
        & npm run build
        if ($LASTEXITCODE -ne 0) {
            Write-Err "Frontend build failed with exit code $LASTEXITCODE"
            exit 1
        }
    } finally {
        Pop-Location
    }

    $distIndex = Join-Path $frontDir "dist\warehouse-app\browser\index.html"
    if (-not (Test-Path $distIndex)) {
        Write-Err "Build artifact index.html was not found at: $distIndex"
        exit 1
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

    # 1. Copy Backend Code (filtering heavy & transient directories)
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
    $frontDistTarget = Join-Path $tempStage "warehouse-front\dist"
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
    & ssh -p $Config.SshPort -o StrictHostKeyChecking=accept-new "$($Config.SshUser)@$($Config.ServerHost)" $Command
    return $LASTEXITCODE
}

function Upload-File($Config, [string]$LocalPath, [string]$RemotePath) {
    & scp -P $Config.SshPort -o StrictHostKeyChecking=accept-new $LocalPath "$($Config.SshUser)@$($Config.ServerHost):$RemotePath"
    if ($LASTEXITCODE -ne 0) {
        Write-Err "Failed to upload $LocalPath to $RemotePath."
        exit 1
    }
}

# ==============================================================================
# Full Initial Setup (-Setup)
# ==============================================================================
function Invoke-SetupMode {
    Test-Prerequisites

    $config = Prompt-Configuration
    Ensure-SshKey $config

    Build-Frontend
    $bundleZip = Create-DeploymentBundle

    Write-Step "Uploading deployment bundle and setup script to remote server..."
    Upload-File $config $bundleZip "/tmp/deploy_bundle.zip"
    Upload-File $config (Join-Path $ScriptRoot "scripts\remote-setup.sh") "/tmp/remote-setup.sh"

    Write-Step "Executing remote server provisioning on $($config.ServerHost)..."
    $setupArgs = "'$($config.Domain)' '$($config.AdminEmail)' '$($config.DbName)' '$($config.DbUser)' '$($config.DbPassword)' '$($config.DjangoSecretKey)' '$($config.AllowedHosts)' '$($config.SshPort)'"
    $remoteExec = "chmod +x /tmp/remote-setup.sh && /tmp/remote-setup.sh $setupArgs"

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
}

# ==============================================================================
# Continuous Update (-Update)
# ==============================================================================
function Invoke-UpdateMode {
    Test-Prerequisites

    $config = Load-Config
    if (-not $config) {
        Write-Warn "No existing configuration found. Running Setup first..."
        Invoke-SetupMode
        return
    }

    Write-Step "Starting Continuous Update for $($config.ServerHost)..."

    Build-Frontend
    $bundleZip = Create-DeploymentBundle

    Write-Step "Uploading update bundle and update script to remote server..."
    Upload-File $config $bundleZip "/tmp/deploy_bundle.zip"
    Upload-File $config (Join-Path $ScriptRoot "scripts\remote-update.sh") "/tmp/remote-update.sh"

    Write-Step "Executing remote application update..."
    $remoteExec = "chmod +x /tmp/remote-update.sh && /tmp/remote-update.sh"
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
}

# ==============================================================================
# Database Backup Download (-Backup)
# ==============================================================================
function Invoke-BackupMode {
    $config = Load-Config
    if (-not $config) {
        Write-Err "Configuration file $ConfigFile not found. Please run -Setup first."
        exit 1
    }

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
        exit 1
    }

    $localDest = Join-Path $localBackupDir "backup_${timestamp}.dump.gz"
    Write-Info "Downloading backup to: $localDest"
    & scp -P $config.SshPort -o StrictHostKeyChecking=accept-new "$($config.SshUser)@$($config.ServerHost):$remoteBackupFile" $localDest

    if ($LASTEXITCODE -eq 0) {
        Write-Success "Database backup saved locally to: $localDest"
    } else {
        Write-Err "Failed to download backup file."
    }
}

# ==============================================================================
# Service Monitoring & Diagnostics (-Logs, -Restart, -Status)
# ==============================================================================
function Invoke-LogsMode {
    $config = Load-Config
    if (-not $config) {
        Write-Err "Configuration not found. Run -Setup first."
        exit 1
    }
    Write-Step "Connecting to live journalctl logs for Daphne backend (Ctrl+C to exit)..."
    & ssh -p $config.SshPort -t "$($config.SshUser)@$($config.ServerHost)" "journalctl -u warehouse-backend -f -n 50"
}

function Invoke-RestartMode {
    $config = Load-Config
    if (-not $config) {
        Write-Err "Configuration not found. Run -Setup first."
        exit 1
    }
    Write-Step "Restarting backend and Nginx services on $($config.ServerHost)..."
    $cmd = "systemctl restart warehouse-backend && nginx -t && systemctl reload nginx && systemctl status warehouse-backend --no-pager"
    Invoke-RemoteCommand $config $cmd
}

function Invoke-StatusMode {
    $config = Load-Config
    if (-not $config) {
        Write-Err "Configuration not found. Run -Setup first."
        exit 1
    }
    Write-Step "Querying service status on $($config.ServerHost)..."
    $cmd = "systemctl status warehouse-backend nginx postgresql redis-server --no-pager && echo '--- Disk Usage ---' && df -h / && echo '--- Memory Usage ---' && free -h"
    Invoke-RemoteCommand $config $cmd
}

# ==============================================================================
# Interactive Menu (When executed with no arguments)
# ==============================================================================
function Show-Menu {
    Clear-Host
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
        "7" { Write-Info "Exiting."; exit 0 }
        default { Write-Warn "Invalid selection. Please choose 1-7."; Start-Sleep -Seconds 1; Show-Menu }
    }
}

# ==============================================================================
# Main Entry Point
# ==============================================================================
if ($Setup) {
    Invoke-SetupMode
} elseif ($Update) {
    Invoke-UpdateMode
} elseif ($Backup) {
    Invoke-BackupMode
} elseif ($Logs) {
    Invoke-LogsMode
} elseif ($Restart) {
    Invoke-RestartMode
} elseif ($Status) {
    Invoke-StatusMode
} elseif ($Help) {
    Get-Help $MyInvocation.MyCommand.Path -Full
} else {
    Show-Menu
}
