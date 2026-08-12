[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$BackupFile,
  [string]$RestoreDirectory = ''
)

$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$ResolvedBackupFile = (Resolve-Path -LiteralPath $BackupFile).Path
$Timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$ResolvedRestoreDirectory = if ($RestoreDirectory) {
  [System.IO.Path]::GetFullPath((Join-Path $RepoRoot $RestoreDirectory))
} else {
  Join-Path $RepoRoot ".wrangler\restore-validation\$Timestamp"
}
if (Test-Path -LiteralPath $ResolvedRestoreDirectory) {
  throw "Restore target already exists: $ResolvedRestoreDirectory"
}
New-Item -ItemType Directory -Path $ResolvedRestoreDirectory -Force | Out-Null
$RestoreSql = Join-Path $ResolvedRestoreDirectory 'restore.sql'
$SqlContent = Get-Content -Raw -Encoding utf8 -LiteralPath $ResolvedBackupFile
$TableOrder = @(
  'users',
  'sessions',
  'clubs',
  'categories',
  'budgets',
  'horses',
  'horse_name_aliases',
  'investments',
  'statement_imports',
  'cashflows',
  'recurring_rules',
  'scheduled_cashflows',
  'cashflow_reconciliations',
  'simulation_scenarios',
  'simulation_items',
  'horse_settlements',
  'alert_rules',
  'notifications',
  'audit_logs'
)
$DataByTable = @{}
$InsertPattern = '(?m)^INSERT INTO "(?<table>[^"]+)" .*;$'
foreach ($Match in [regex]::Matches($SqlContent, $InsertPattern)) {
  $TableName = $Match.Groups['table'].Value
  if (-not $DataByTable.ContainsKey($TableName)) {
    $DataByTable[$TableName] = [System.Collections.Generic.List[string]]::new()
  }
  $DataByTable[$TableName].Add($Match.Value)
}
$RestoreStatements = [System.Collections.Generic.List[string]]::new()
$RestoreStatements.Add('PRAGMA foreign_keys=ON;')
foreach ($TableName in $TableOrder) {
  if ($DataByTable.ContainsKey($TableName)) {
    $RestoreStatements.AddRange($DataByTable[$TableName])
  }
}
Set-Content -Encoding utf8 -LiteralPath $RestoreSql -Value ($RestoreStatements -join [Environment]::NewLine)

Push-Location $RepoRoot
try {
  & npm.cmd exec -- wrangler d1 migrations apply horse_asset_manager_local `
    --local `
    --persist-to $ResolvedRestoreDirectory `
    --config apps/api/wrangler.jsonc
  if ($LASTEXITCODE -ne 0) {
    throw "D1 restore schema migration failed with exit code $LASTEXITCODE."
  }
  & npm.cmd exec -- wrangler d1 execute horse_asset_manager_local `
    --local `
    --persist-to $ResolvedRestoreDirectory `
    --file $RestoreSql `
    --config apps/api/wrangler.jsonc
  if ($LASTEXITCODE -ne 0) {
    throw "D1 restore failed with exit code $LASTEXITCODE."
  }
  & npm.cmd exec -- wrangler d1 execute horse_asset_manager_local `
    --local `
    --persist-to $ResolvedRestoreDirectory `
    --command 'PRAGMA foreign_key_check;' `
    --config apps/api/wrangler.jsonc
  if ($LASTEXITCODE -ne 0) {
    throw "D1 restore verification failed with exit code $LASTEXITCODE."
  }
} finally {
  Pop-Location
}

Write-Output $ResolvedRestoreDirectory
