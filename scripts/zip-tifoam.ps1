$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$package = (Resolve-Path -LiteralPath (Join-Path $root 'build/tifoam-package')).Path
$expected = Join-Path $root 'build/tifoam-package'
if ($package -ne $expected) { throw 'Unexpected package directory' }

$archivePath = Join-Path $root 'build/tifoam-test.zip'
if ([System.IO.File]::Exists($archivePath)) {
  [System.IO.File]::Delete($archivePath)
}
$archive = [System.IO.Compression.ZipFile]::Open(
  $archivePath,
  [System.IO.Compression.ZipArchiveMode]::Create
)
try {
  Get-ChildItem -LiteralPath $package -Recurse -File | ForEach-Object {
    $relative = $_.FullName.Substring($package.Length + 1).Replace('\', '/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
      $archive,
      $_.FullName,
      $relative,
      [System.IO.Compression.CompressionLevel]::Optimal
    ) | Out-Null
  }
} finally {
  $archive.Dispose()
}
Write-Host "Portable deployment ZIP: $archivePath"
