#Requires -Version 7.4
# Exit-code test for deploy.ps1 (plan 10.4 d-2): the process exit code must equal the remote exit code
# (0 and 3) even when the remote side prints output (no output leaks into function return values).
param([Parameter(Mandatory)][string]$FakeSsh, [Parameter(Mandatory)][string]$Config)
. (Join-Path $PSScriptRoot '..\..\deploy.ps1')
$SshExe = $FakeSsh
$SshKeygenExe = $FakeSsh
$ConfigFile = $Config
$Status = $true
$NonInteractive = $true
exit (Invoke-Main)
