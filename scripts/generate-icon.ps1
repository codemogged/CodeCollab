<#
  Generates the CodeCollab app icon (build/icon.ico + build/icon.png) from the
  source PNG at build/source-logo.png.

  Output sizes for .ico: 256, 128, 64, 48, 32, 16
  build/icon.png is written at 512x512 for Linux/AppImage and macOS fallback.

  Run: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/generate-icon.ps1
#>

Add-Type -AssemblyName System.Drawing

$buildDir = Join-Path (Join-Path $PSScriptRoot "..") "build"
$sourcePath = Join-Path $buildDir "source-logo.png"
$icoPath = Join-Path $buildDir "icon.ico"
$pngPath = Join-Path $buildDir "icon.png"

if (-Not (Test-Path $sourcePath)) {
    Write-Host "ERROR: source logo not found at $sourcePath" -ForegroundColor Red
    Write-Host "Place your master PNG (square, transparent background) there and re-run." -ForegroundColor Yellow
    exit 1
}

$source = [System.Drawing.Image]::FromFile($sourcePath)
Write-Host "Loaded source: $($source.Width) x $($source.Height)"

function Resample-Bitmap([System.Drawing.Image]$src, [int]$size) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $rect = New-Object System.Drawing.Rectangle 0, 0, $size, $size
    $g.DrawImage($src, $rect)
    $g.Dispose()
    return $bmp
}

# 512px PNG for non-Windows targets
$pngBmp = Resample-Bitmap $source 512
$pngBmp.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
$pngBmp.Dispose()
Write-Host "PNG written: $pngPath (512x512)"

# Multi-size ICO (PNG-compressed entries, supported by Windows Vista+)
$sizes = @(256, 128, 64, 48, 32, 16)
$bitmaps = @()
foreach ($s in $sizes) { $bitmaps += Resample-Bitmap $source $s }

$ms = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter($ms)

# ICO header
$bw.Write([UInt16]0)
$bw.Write([UInt16]1)
$bw.Write([UInt16]$sizes.Count)

# Encode each bitmap as PNG bytes
$pngDatas = @()
foreach ($bmp in $bitmaps) {
    $tmp = New-Object System.IO.MemoryStream
    $bmp.Save($tmp, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngDatas += , $tmp.ToArray()
    $tmp.Dispose()
}

$headerSize = 6
$dirEntrySize = 16
$offset = $headerSize + ($dirEntrySize * $sizes.Count)

for ($i = 0; $i -lt $sizes.Count; $i++) {
    $s = $sizes[$i]
    $data = $pngDatas[$i]
    $w = if ($s -ge 256) { 0 } else { $s }
    $h = if ($s -ge 256) { 0 } else { $s }
    $bw.Write([byte]$w)
    $bw.Write([byte]$h)
    $bw.Write([byte]0)
    $bw.Write([byte]0)
    $bw.Write([UInt16]1)
    $bw.Write([UInt16]32)
    $bw.Write([UInt32]$data.Length)
    $bw.Write([UInt32]$offset)
    $offset += $data.Length
}

foreach ($data in $pngDatas) { $bw.Write($data) }

$bw.Flush()
[System.IO.File]::WriteAllBytes($icoPath, $ms.ToArray())

$bw.Dispose(); $ms.Dispose()
foreach ($bmp in $bitmaps) { $bmp.Dispose() }
$source.Dispose()

Write-Host "ICO written: $icoPath ($($sizes.Count) sizes)" -ForegroundColor Green
