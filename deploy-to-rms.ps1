# ============================================================
# Deploy to RMS - Build client & copy all changed files to RMS
# ============================================================
# Run this script from the project root:
#   .\deploy-to-rms.ps1
# ============================================================

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot
$ClientDir   = Join-Path $ProjectRoot "client"
$ServerDir   = Join-Path $ProjectRoot "server"
$RMSDir      = Join-Path $ProjectRoot "RMS"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Deploying to RMS folder" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Step 1: Build the React client
Write-Host "[1/3] Building client..." -ForegroundColor Yellow
Push-Location $ClientDir
try {
    npm run build
    if ($LASTEXITCODE -ne 0) {
        throw "Client build failed!"
    }
    Write-Host "  Client build successful!" -ForegroundColor Green
} finally {
    Pop-Location
}

# Step 2: Replace client/dist in RMS
Write-Host "`n[2/3] Copying client/dist to RMS..." -ForegroundColor Yellow
$srcDist  = Join-Path $ClientDir "dist"
$destDist = Join-Path $RMSDir "client\dist"

# Remove old dist
if (Test-Path $destDist) {
    Remove-Item -Path $destDist -Recurse -Force
    Write-Host "  Removed old RMS/client/dist" -ForegroundColor DarkGray
}

# Copy new dist
Copy-Item -Path $srcDist -Destination $destDist -Recurse -Force
Write-Host "  Copied new dist to RMS/client/dist" -ForegroundColor Green

# Step 3: Copy changed server files to RMS
Write-Host "`n[3/3] Copying server files to RMS..." -ForegroundColor Yellow

# List of server files that were modified
$serverFiles = @(
    "index.js",
    "controllers\itemsController.js"
)

foreach ($file in $serverFiles) {
    $src  = Join-Path $ServerDir $file
    $dest = Join-Path $RMSDir "server\$file"
    
    if (Test-Path $src) {
        Copy-Item -Path $src -Destination $dest -Force
        Write-Host "  Copied: server\$file" -ForegroundColor Green
    } else {
        Write-Host "  WARNING: Source not found: $src" -ForegroundColor Red
    }
}

# Also copy the migration script (useful for first-time setup)
$migrationSrc  = Join-Path $ServerDir "scripts\add-expire-duration-columns.js"
$migrationDest = Join-Path $RMSDir "server\scripts\add-expire-duration-columns.js"
if (Test-Path $migrationSrc) {
    # Ensure scripts directory exists in RMS
    $destScriptsDir = Join-Path $RMSDir "server\scripts"
    if (!(Test-Path $destScriptsDir)) {
        New-Item -ItemType Directory -Path $destScriptsDir -Force | Out-Null
    }
    Copy-Item -Path $migrationSrc -Destination $migrationDest -Force
    Write-Host "  Copied: server\scripts\add-expire-duration-columns.js" -ForegroundColor Green
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Deployment Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "`nFiles deployed to: $RMSDir" -ForegroundColor White
Write-Host "Changed files:" -ForegroundColor White
Write-Host "  - client/dist/ (full rebuild)" -ForegroundColor White
Write-Host "  - server/index.js (auto-migration)" -ForegroundColor White
Write-Host "  - server/controllers/itemsController.js (expire duration)" -ForegroundColor White
Write-Host "  - server/scripts/add-expire-duration-columns.js (migration)" -ForegroundColor White
Write-Host ""
