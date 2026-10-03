param([Parameter(Mandatory=$true)][string]$Queue, [Parameter(Mandatory=$true)][string]$File)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class RawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct DOCINFO { public string pDocName; public string pOutputFile; public string pDatatype; }
  [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool OpenPrinter(string name, out IntPtr handle, IntPtr defaults);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool ClosePrinter(IntPtr handle);
  [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)] public static extern int StartDocPrinter(IntPtr handle, int level, ref DOCINFO doc);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool EndDocPrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool StartPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool EndPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool WritePrinter(IntPtr handle, byte[] bytes, int count, out int written);
}
'@
$handle = [IntPtr]::Zero
if (-not [RawPrinter]::OpenPrinter($Queue, [ref]$handle, [IntPtr]::Zero)) { throw "Cannot open printer queue '$Queue': $([Runtime.InteropServices.Marshal]::GetLastWin32Error())" }
$docStarted = $false
$pageStarted = $false
try {
  $doc = New-Object RawPrinter+DOCINFO
  $doc.pDocName = 'Bakery POS receipt'
  $doc.pDatatype = 'RAW'
  if ([RawPrinter]::StartDocPrinter($handle, 1, [ref]$doc) -eq 0) { throw 'Windows spooler rejected the raw document.' }
  $docStarted = $true
  if (-not [RawPrinter]::StartPagePrinter($handle)) { throw 'Windows spooler rejected the page.' }
  $pageStarted = $true
  [byte[]]$bytes = [IO.File]::ReadAllBytes($File)
  $written = 0
  if (-not [RawPrinter]::WritePrinter($handle, $bytes, $bytes.Length, [ref]$written) -or $written -ne $bytes.Length) { throw "Windows spooler wrote $written of $($bytes.Length) bytes." }
} finally {
  if ($pageStarted) { [void][RawPrinter]::EndPagePrinter($handle) }
  if ($docStarted) { [void][RawPrinter]::EndDocPrinter($handle) }
  [void][RawPrinter]::ClosePrinter($handle)
}
