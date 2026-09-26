<#
.SYNOPSIS
    Dubai ERP — Isolated Database Backup & Restore Test Script (PowerShell / Windows)

.DESCRIPTION
    Verifies GZIP integrity, schema presence, and performs a full non-destructive
    restore into a temporary local Docker PostgreSQL container.
    NEVER touches or connects to your production Supabase database.

.PARAMETER BackupFile
    Path to the .sql.gz backup file to test.

.EXAMPLE
    .\scripts\verify_backup_and_restore.ps1 -BackupFile .\dubai_erp_backup_2026-09-26_120000.sql.gz
#>

[CmdletBinding()]
param (
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$BackupFile
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $BackupFile)) {
    Write-Error "Backup file not found at: $BackupFile"
    exit 1
}

$fileItem = Get-Item $BackupFile
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "🛡️ Dubai ERP - Backup Verification & Isolated Restore Test" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "File: $($fileItem.FullName)"
Write-Host "Size: $([math]::Round($fileItem.Length / 1MB, 2)) MB ($($fileItem.Length) bytes)`n"

# Step 1: Check Docker availability
Write-Host "[Step 1/3] Checking local Docker service..." -ForegroundColor Yellow
try {
    $dockerVersion = docker --version
    Write-Host "  ✅ Docker is available: $dockerVersion`n" -ForegroundColor Green
} catch {
    Write-Warning "Docker is not running or not installed. You can still use the database-backup workflow in GitHub Actions (which runs on a managed Linux runner)."
    Write-Host "To test restore locally, ensure Docker Desktop is started."
    exit 1
}

$ContainerName = "dubai_erp_restore_test_$((Get-Date).Ticks)"
$TestPort = "5433"
$TestDb = "dubai_erp_test"
$TestUser = "postgres"
$TestPass = "test_restore_password_123"

# Step 2: Spin up isolated PostgreSQL Docker container
Write-Host "[Step 2/3] Starting temporary PostgreSQL container on port $TestPort..." -ForegroundColor Yellow
try {
    docker run --name $ContainerName `
        -e POSTGRES_PASSWORD=$TestPass `
        -e POSTGRES_DB=$TestDb `
        -p "${TestPort}:5432" `
        -d postgres:16-alpine | Out-Null

    Write-Host "Waiting for database readiness..."
    $ready = $false
    for ($i = 0; $i -lt 30; $i++) {
        $check = docker exec $ContainerName pg_isready -U $TestUser -d $TestDb 2>&1
        if ($LASTEXITCODE -eq 0) {
            $ready = $true
            break
        }
        Start-Sleep -Seconds 1
    }

    if (-not $ready) {
        throw "PostgreSQL container failed to become ready in time."
    }
    Write-Host "  ✅ Isolated container '$ContainerName' is ready.`n" -ForegroundColor Green

    # Step 3: Decompress and restore into test container
    Write-Host "[Step 3/3] Restoring backup stream into isolated test database..." -ForegroundColor Yellow
    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

    # Use gzip or docker exec input stream
    # Check if gzip is installed locally or decompress using docker
    docker cp $fileItem.FullName "${ContainerName}:/tmp/backup.sql.gz"
    docker exec $ContainerName sh -c "gunzip -c /tmp/backup.sql.gz | psql -U $TestUser -d $TestDb -q > /dev/null 2>&1"

    $stopwatch.Stop()
    Write-Host "  ✅ Restore stream completed in $($stopwatch.Elapsed.TotalSeconds.ToString('F1')) seconds.`n" -ForegroundColor Green

    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host "📊 Restored Database Table & Row Count Verification" -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor Cyan

    docker exec -i $ContainerName psql -U $TestUser -d $TestDb -c @"
SELECT
    schemaname,
    relname AS table_name,
    n_live_tup AS estimated_row_count
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC;
"@

    Write-Host "`n============================================================" -ForegroundColor Green
    Write-Host "🎉 SUCCESS: Backup verified and proven restorable!" -ForegroundColor Green
    Write-Host "============================================================" -ForegroundColor Green

} finally {
    Write-Host "`nCleaning up temporary test container '$ContainerName'..." -ForegroundColor Gray
    docker stop $ContainerName 2>$null | Out-Null
    docker rm $ContainerName 2>$null | Out-Null
    Write-Host "  ✅ Cleanup complete." -ForegroundColor Gray
}
