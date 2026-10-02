$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$url = 'http://127.0.0.1:4173/'

function Get-LocalPage {
  try { return Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2 }
  catch { return $null }
}

$page = Get-LocalPage
if ($page -and $page.Content -notmatch 'Firaw - Pdf Editor') {
  throw 'A porta 4173 já está em uso por outro aplicativo.'
}
if (-not $page) {
  $node = (Get-Command node.exe -ErrorAction Stop).Source
  Start-Process -FilePath $node -ArgumentList (Join-Path $project 'web\server.cjs') -WorkingDirectory $project -WindowStyle Hidden
  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    Start-Sleep -Milliseconds 250
    $page = Get-LocalPage
    if ($page) { break }
  }
  if (-not $page -or $page.Content -notmatch 'Firaw - Pdf Editor') {
    throw 'Não foi possível iniciar a página local do Firaw - Pdf Editor.'
  }
}
Start-Process $url
