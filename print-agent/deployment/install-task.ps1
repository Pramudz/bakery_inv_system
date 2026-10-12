param(
  [string]$InstallDirectory = $PSScriptRoot,
  [string]$TaskName = 'Bakery POS Print Agent'
)

$ErrorActionPreference = 'Stop'
$folder = (Resolve-Path -LiteralPath $InstallDirectory).Path
$exe = Join-Path $folder 'ProsincPrintAgent.exe'
$config = Join-Path $folder 'agent-config.json'
$helper = Join-Path $folder 'windows-raw-print.ps1'
foreach ($path in @($exe, $config, $helper)) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing required file: $path" }
}
$action = New-ScheduledTaskAction -Execute $exe -Argument ('"{0}"' -f $config) -WorkingDirectory $folder
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Seconds 0)
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description 'Polls Bakery POS receipt print jobs' -Force | Out-Null
Write-Host "Installed scheduled task: $TaskName"
Write-Host "Start it now with: Start-ScheduledTask -TaskName '$TaskName'"
