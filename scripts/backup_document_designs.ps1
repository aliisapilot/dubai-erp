# Read-only production backup. Configure normal PostgreSQL PGHOST/PGPORT/PGUSER/
# PGPASSWORD/PGDATABASE/PGSSLMODE environment variables outside this script.
# No credential is written into the backup or command output.
param([Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference = 'Stop'
if (-not $env:PGHOST -or -not $env:PGDATABASE) { throw 'Configure PostgreSQL connection environment variables first.' }
foreach ($program in @('pg_dump','pg_restore','psql')) { if (-not (Get-Command $program -ErrorAction SilentlyContinue)) { throw "$program is required." } }
if (Test-Path -LiteralPath $Destination) { throw 'Choose a new backup directory; existing backups are never overwritten.' }
$backupDirectory = New-Item -ItemType Directory -Path $Destination
$archive = Join-Path $backupDirectory.FullName 'database.dump'
# Full database backup retains styles, related company records, schema, policies,
# and storage metadata. Supabase Storage object bytes require a separate export.
& pg_dump --format=custom --file=$archive --no-password
if ($LASTEXITCODE -ne 0) { throw 'Database backup failed. Do not migrate.' }
& pg_restore --list $archive | Set-Content -LiteralPath (Join-Path $backupDirectory.FullName 'archive-contents.txt')
if ($LASTEXITCODE -ne 0) { throw 'Archive validation failed. Do not migrate.' }
$audit = Join-Path $PSScriptRoot '../supabase/audits/document_design_preflight.sql'
& psql --no-password --no-psqlrc --set ON_ERROR_STOP=1 --file=$audit --output=(Join-Path $backupDirectory.FullName 'preflight.txt')
if ($LASTEXITCODE -ne 0) { throw 'Schema/RLS audit failed. Do not migrate.' }
Get-FileHash -Algorithm SHA256 -LiteralPath $archive | Select-Object Algorithm,Hash | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $backupDirectory.FullName 'sha256.json')
Write-Output 'Archive and read-only audit captured. Restore into a disposable database and compare template JSON before approving migration. Export referenced Storage files separately.'
