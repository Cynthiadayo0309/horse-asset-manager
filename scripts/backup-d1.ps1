[CmdletBinding()]
param(
  [switch]$Local,
  [ValidateSet('dev')]
  [string]$Environment = 'dev',
  [string]$DatabaseName = '',
  [string]$OutputDirectory = ''
)

$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$ResolvedDatabaseName = if ($DatabaseName) {
  $DatabaseName
} elseif ($Local) {
  'horse_asset_manager_local'
} else {
  'horse_asset_manager_dev'
}
$ResolvedOutputDirectory = if ($OutputDirectory) {
  [System.IO.Path]::GetFullPath((Join-Path $RepoRoot $OutputDirectory))
} else {
  Join-Path $RepoRoot '.backups\d1'
}
New-Item -ItemType Directory -Path $ResolvedOutputDirectory -Force | Out-Null

$Timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$Scope = if ($Local) { 'local' } else { $Environment }
$BackupPath = Join-Path $ResolvedOutputDirectory "$ResolvedDatabaseName-$Scope-$Timestamp.sql"
$Arguments = @(
  'exec', '--', 'wrangler', 'd1', 'export', $ResolvedDatabaseName,
  '--output', $BackupPath,
  '--config', 'apps/api/wrangler.jsonc'
)
if ($Local) {
  $Arguments += '--local'
} else {
  $Arguments += @('--remote', '--env', $Environment)
}

Push-Location $RepoRoot
try {
  & npm.cmd @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "D1 export failed with exit code $LASTEXITCODE."
  }
} finally {
  Pop-Location
}

$Backup = Get-Item -LiteralPath $BackupPath
if ($Backup.Length -eq 0) {
  throw 'The backup file is empty.'
}
Write-Output $Backup.FullName
