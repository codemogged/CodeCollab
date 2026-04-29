# Deploy the freshly built CodeCollab into a local install folder.
#
# Set the destination with the CODEBUDDY_INSTALL_DIR environment variable,
# or pass -Destination. Defaults to "$env:USERPROFILE\Desktop\CodeCollab Install"
# so first-time contributors get a sensible default without any user-specific
# paths being committed to the repo.
[CmdletBinding()]
param(
    [string]$Destination = $env:CODEBUDDY_INSTALL_DIR
)

$ErrorActionPreference = "Stop"

if (-not $Destination) {
    $Destination = Join-Path $env:USERPROFILE "Desktop\CodeCollab Install"
}

Write-Host "Deploy target: $Destination"

# Stop any running CodeCollab so we can overwrite it.
Get-Process -Name "CodeCollab" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1

if (-not (Test-Path $Destination)) {
    New-Item -ItemType Directory -Path $Destination -Force | Out-Null
}

# Clear previous install contents (but keep the folder so shortcuts survive)
Get-ChildItem -Path $Destination -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

$repoRoot = Split-Path -Parent $PSScriptRoot
$source = Join-Path $repoRoot "dist-electron\win-unpacked\*"
Copy-Item $source $Destination -Recurse -Force

foreach ($file in @("FRESH-START.bat", "UPDATE.ps1", "UNINSTALL-ALL.bat", "UNINSTALL-ALL.ps1")) {
    $src = Join-Path $repoRoot $file
    if (Test-Path $src) { Copy-Item $src $Destination -Force }
}

$debugSrc = Join-Path $repoRoot "debug-start.bat"
if (Test-Path $debugSrc) {
    Copy-Item $debugSrc (Join-Path $Destination "DEBUG-START.bat") -Force
}

Write-Output "Deploy complete -- $Destination updated"
