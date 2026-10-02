$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$outputDir = Join-Path $projectRoot 'release\store'
$version = (Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).version
$builder = Join-Path $projectRoot 'node_modules\.bin\electron-builder.cmd'
$sdkBinRoot = 'C:\Program Files (x86)\Windows Kits\10\bin'
$makeAppx = Get-ChildItem -LiteralPath $sdkBinRoot -Directory |
  Sort-Object Name -Descending |
  ForEach-Object { Join-Path $_.FullName 'x64\makeappx.exe' } |
  Where-Object { Test-Path -LiteralPath $_ } |
  Select-Object -First 1

if (-not $makeAppx) { throw 'Windows SDK MakeAppx.exe não encontrado.' }
if (-not (Test-Path -LiteralPath $builder)) { throw 'electron-builder não instalado. Execute npm install.' }
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
& (Join-Path $PSScriptRoot 'prepare-store-assets.ps1')

foreach ($arch in @('x64', 'ia32')) {
  $oldPackage = Join-Path $outputDir "Firaw-Pdf-Editor-$version-$arch.appx"
  if (Test-Path -LiteralPath $oldPackage) { Remove-Item -LiteralPath $oldPackage -Force }
}

Push-Location $projectRoot
try {
  $buildLog = Join-Path $outputDir 'store-build.log'
  & $builder --config store.electron-builder.cjs --win appx --x64 --ia32 2>&1 |
    ForEach-Object { "$_" } | Tee-Object -FilePath $buildLog
  $builderExitCode = $LASTEXITCODE
  if ($builderExitCode -ne 0 -and -not (Select-String -LiteralPath $buildLog -Pattern 'spawn UNKNOWN' -Quiet)) {
    throw "electron-builder falhou com código $builderExitCode. Consulte $buildLog."
  }

  foreach ($arch in @('x64', 'ia32')) {
    $mapping = Join-Path $outputDir "__appx-$arch\mapping.txt"
    $package = Join-Path $outputDir "Firaw-Pdf-Editor-$version-$arch.appx"
    if (-not (Test-Path -LiteralPath $mapping)) { throw "Mapeamento ausente: $mapping" }
    if (-not (Test-Path -LiteralPath $package)) {
      & $makeAppx pack /o /f $mapping /p $package | Select-Object -Last 3
      if ($LASTEXITCODE -ne 0) { throw "Falha ao empacotar $arch." }
    }
    if ((Get-Item -LiteralPath $package).Length -lt 1000000) { throw "Pacote $arch incompleto." }
    Write-Host "Pacote Microsoft Store: $package"
  }
} finally {
  Pop-Location
}
