<# 
  Generates a CodeBuddy app icon (build/icon.ico) using .NET System.Drawing.
  Sizes: 256x256, 128x128, 64x64, 48x48, 32x32, 16x16
  Run: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/generate-icon.ps1
#>

Add-Type -AssemblyName System.Drawing

$outputDir = Join-Path (Join-Path $PSScriptRoot "..") "build"
if (-Not (Test-Path $outputDir)) { New-Item -ItemType Directory -Path $outputDir | Out-Null }
$icoPath = Join-Path $outputDir "icon.ico"
$pngPath = Join-Path $outputDir "icon.png"

function New-CodeBuddyBitmap([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

    # Background: rounded rectangle with gradient
    $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.Point 0, 0),
        (New-Object System.Drawing.Point $size, $size),
        [System.Drawing.Color]::FromArgb(99, 102, 241),   # indigo-500
        [System.Drawing.Color]::FromArgb(139, 92, 246)    # violet-500
    )
    $radius = [int]($size * 0.22)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc(0, 0, $radius * 2, $radius * 2, 180, 90)
    $path.AddArc($size - $radius * 2, 0, $radius * 2, $radius * 2, 270, 90)
    $path.AddArc($size - $radius * 2, $size - $radius * 2, $radius * 2, $radius * 2, 0, 90)
    $path.AddArc(0, $size - $radius * 2, $radius * 2, $radius * 2, 90, 90)
    $path.CloseFigure()
    $g.FillPath($bgBrush, $path)

    # Code bracket symbols: < / >
    $fontSize = [int]($size * 0.32)
    $font = New-Object System.Drawing.Font("Consolas", $fontSize, [System.Drawing.FontStyle]::Bold)
    $textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    $rect = New-Object System.Drawing.RectangleF(0, 0, $size, $size)
    $g.DrawString("CB", $font, $textBrush, $rect, $sf)

    # Cleanup
    $sf.Dispose(); $font.Dispose(); $textBrush.Dispose()
    $bgBrush.Dispose(); $path.Dispose(); $g.Dispose()

    return $bmp
}

# Generate each size
$sizes = @(256, 128, 64, 48, 32, 16)
$bitmaps = @()
foreach ($s in $sizes) {
    $bitmaps += New-CodeBuddyBitmap $s
}

# Save 256px as PNG (for electron-builder linux/mac)
$bitmaps[0].Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)

# Write ICO file (multi-size)
$ms = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter($ms)

# ICO header
$bw.Write([UInt16]0)           # reserved
$bw.Write([UInt16]1)           # type: icon
$bw.Write([UInt16]$sizes.Count) # count

# Collect PNG data for each size
$pngDatas = @()
foreach ($bmp in $bitmaps) {
    $pngMs = New-Object System.IO.MemoryStream
    $bmp.Save($pngMs, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngDatas += , $pngMs.ToArray()
    $pngMs.Dispose()
}

# Write directory entries, then image data
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
    $bw.Write([byte]0)         # color palette
    $bw.Write([byte]0)         # reserved
    $bw.Write([UInt16]1)       # color planes
    $bw.Write([UInt16]32)      # bits per pixel
    $bw.Write([UInt32]$data.Length)
    $bw.Write([UInt32]$offset)
    $offset += $data.Length
}

foreach ($data in $pngDatas) {
    $bw.Write($data)
}

$bw.Flush()
[System.IO.File]::WriteAllBytes($icoPath, $ms.ToArray())

$bw.Dispose(); $ms.Dispose()
foreach ($bmp in $bitmaps) { $bmp.Dispose() }

Write-Host "Icon generated: $icoPath ($($sizes.Count) sizes)"
Write-Host "PNG generated:  $pngPath (256x256)"
