param([switch]$AllowDirty)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$package = (Resolve-Path -LiteralPath (Join-Path $root 'build/deployment-package')).Path
if ($package -ne (Join-Path $root 'build/deployment-package')) { throw 'Unexpected package directory' }
$release = Get-Content -LiteralPath (Join-Path $package 'release.json') -Raw | ConvertFrom-Json
if ($release.application -ne 'prosinc-erp' -or ($release.dirty -and -not $AllowDirty)) { throw 'A clean Prosinc ERP package is required for a production ZIP; -AllowDirty is for local validation only' }
if ($release.version -notmatch '^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$' -or $release.commit -notmatch '^[0-9a-f]{40}$') { throw 'Invalid release metadata' }
$expected = @($release.files.PSObject.Properties.Name | Sort-Object)
$actual = @(Get-ChildItem -LiteralPath $package -Recurse -File | ForEach-Object { $_.FullName.Substring($package.Length + 1).Replace('\', '/') } | Where-Object { $_ -ne 'release.json' } | Sort-Object)
if (($expected -join "`n") -ne ($actual -join "`n")) { throw 'Package file list differs from release metadata' }
foreach ($relative in $expected) {
  if ($relative -match '(^|/)(\.env[^/]*|node_modules|uploads|logs?)(/|$)' -or $relative -match '\.(?:log|sql\.gz)$') { throw "Forbidden package path: $relative" }
  $file = Join-Path $package $relative
  $hash = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($hash -ne $release.files.$relative) { throw "Package hash mismatch: $relative" }
}
$suffix = if ($release.dirty) { '-dirty' } else { '' }
$archivePath = Join-Path $root "build/prosinc-erp-$($release.version)-$($release.commit.Substring(0,12))$suffix.zip"
if (Test-Path -LiteralPath $archivePath) { throw "Archive already exists: $archivePath" }
$archive = [System.IO.Compression.ZipFile]::Open($archivePath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($relative in @($expected) + 'release.json') {
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, (Join-Path $package $relative), $relative, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally { $archive.Dispose() }
$zip = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
try {
  $zipNames = @($zip.Entries | ForEach-Object FullName | Sort-Object)
  $expectedNames = @(@($expected) + 'release.json' | Sort-Object)
  if (($zipNames -join "`n") -ne ($expectedNames -join "`n")) { throw 'ZIP entry list is incomplete' }
  foreach ($entry in $zip.Entries) {
    $stream = $entry.Open()
    try {
      $sha = [System.Security.Cryptography.SHA256]::Create()
      try { $hash = [System.BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
      finally { $sha.Dispose() }
      $source = Join-Path $package $entry.FullName
      $want = if ($entry.FullName -eq 'release.json') { (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant() } else { $release.files.($entry.FullName) }
      if ($hash -ne $want) { throw "ZIP content hash mismatch: $($entry.FullName)" }
    }
    finally { $stream.Dispose() }
  }
} catch {
  $zip.Dispose()
  Remove-Item -LiteralPath $archivePath
  throw
} finally { $zip.Dispose() }
Write-Host "Verified deployment ZIP: $archivePath"
