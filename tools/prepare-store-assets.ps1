$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$source = Join-Path $PSScriptRoot '..\assets\icon.png'
$destination = Join-Path $PSScriptRoot '..\store\assets\appx'
New-Item -ItemType Directory -Force -Path $destination | Out-Null

$image = [System.Drawing.Image]::FromFile((Resolve-Path $source).Path)
try {
  $sizes = @{
    'StoreLogo.png' = @(50, 50)
    'Square150x150Logo.png' = @(150, 150)
    'Square44x44Logo.png' = @(44, 44)
    'Wide310x150Logo.png' = @(310, 150)
  }
  foreach ($name in $sizes.Keys) {
    $width, $height = $sizes[$name]
    $bitmap = [System.Drawing.Bitmap]::new($width, $height)
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      try {
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $side = [Math]::Min($width, $height)
        $graphics.DrawImage($image, [System.Drawing.Rectangle]::new([int](($width-$side)/2), [int](($height-$side)/2), $side, $side))
      } finally { $graphics.Dispose() }
      $bitmap.Save((Join-Path $destination $name), [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $bitmap.Dispose() }
  }
} finally { $image.Dispose() }
