param(
    [ValidateSet('install', 'status', 'disable', 'remove', 'preview')]
    [string]$Action = 'status'
)
$ErrorActionPreference = 'Stop'
$utf8 = New-Object Text.UTF8Encoding($false)
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$sha = [Security.Cryptography.SHA256]::Create()
try {
    $taskSuffix = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($projectRoot + $identity.User.Value)))).Replace('-', '').Substring(0, 10)
} finally { $sha.Dispose() }
$taskName = 'PRI-Daily-' + $taskSuffix

if ($Action -eq 'status') {
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if (-not $task) { Write-Output 'PRI daily task is not installed.'; exit 0 }
    $info = $task | Get-ScheduledTaskInfo
    [PSCustomObject]@{ TaskName = $taskName; State = $task.State; LastRunTime = $info.LastRunTime
        NextRunTime = $info.NextRunTime; LastTaskResult = $info.LastTaskResult }
    exit 0
}
if ($Action -eq 'disable') {
    Disable-ScheduledTask -TaskName $taskName | Out-Null
    Write-Output 'PRI daily task disabled.'
    exit 0
}
if ($Action -eq 'remove') {
    if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    }
    Write-Output 'PRI daily task removed. Reports and local data retained.'
    exit 0
}
$node = (Get-Command node -CommandType Application | Select-Object -First 1).Source
$xmlLines = & $node (Join-Path $PSScriptRoot 'scheduled-daily.mjs') --task-xml --user $identity.User.Value
if ($LASTEXITCODE -ne 0) { throw 'PRI schedule configuration is invalid. Check .env and project dependencies.' }
$taskXml = $xmlLines -join [Environment]::NewLine
if ($Action -eq 'preview') { Write-Output $taskXml; exit 0 }
& $node (Join-Path $PSScriptRoot 'local.mjs') check
if ($LASTEXITCODE -ne 0) { throw 'PRI local readiness check failed; task was not registered.' }
Register-ScheduledTask -TaskName $taskName -Xml $taskXml -Force | Out-Null
Write-Output ('PRI daily task installed: ' + $taskName)
Write-Output 'Runs as the current signed-in user. Missed schedules resume after logon/wake; logs/daily contains results.'
