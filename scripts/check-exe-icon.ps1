# Inspect the embedded icon of the CodeCollab installed executable.
# Defaults to the standard install location; override via -ExePath or $env:CODECOLLAB_EXE.
param(
    [string]$ExePath
)

Add-Type -AssemblyName System.Drawing

if (-not $ExePath) { $ExePath = $env:CODECOLLAB_EXE }
if (-not $ExePath) {
    $candidates = @(
        (Join-Path $env:LOCALAPPDATA 'Programs\CodeCollab\CodeCollab.exe'),
        (Join-Path $env:USERPROFILE 'Desktop\CodeCollab Install\CodeCollab.exe'),
        (Join-Path (Split-Path -Parent $PSScriptRoot) 'dist-electron\win-unpacked\CodeCollab.exe')
    )
    $ExePath = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $ExePath -or -not (Test-Path $ExePath)) {
    Write-Error "CodeCollab.exe not found. Pass -ExePath or set CODECOLLAB_EXE."
    exit 1
}
$exe = $ExePath
$icon = [System.Drawing.Icon]::ExtractAssociatedIcon($exe)
Write-Host ("Embedded icon size: {0} x {1}" -f $icon.Width, $icon.Height)
$out = Join-Path $env:TEMP 'codecollab-exe-icon.png'
$icon.ToBitmap().Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "Saved to: $out"
$icon.Dispose()
