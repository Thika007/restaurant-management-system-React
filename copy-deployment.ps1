# PowerShell Script to Copy Deployment Files
# Run this script from the project root directory

Write-Host "========================================"
Write-Host "Restaurant Management System Deployment"
Write-Host "========================================"
Write-Host ""

# Get the project root directory (where this script is located)
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Write-Host "Project root: $projectRoot" -ForegroundColor Cyan

# Prompt for deployment destination
$deployPath = Read-Host "Enter deployment folder path (e.g., E:\Deployment\Restaurant Management System)"

# Validate deployment path
if (-not $deployPath) {
    Write-Host "Error: Deployment path is required!" -ForegroundColor Red
    exit 1
}

# Create deployment folder if it doesn't exist
if (-not (Test-Path $deployPath)) {
    Write-Host "Creating deployment folder: $deployPath" -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $deployPath -Force | Out-Null
} else {
    Write-Host "Deployment folder exists: $deployPath" -ForegroundColor Yellow
    $overwrite = Read-Host "Folder exists. Overwrite? (Y/N)"
    if ($overwrite -ne "Y" -and $overwrite -ne "y") {
        Write-Host "Deployment cancelled." -ForegroundColor Red
        exit 0
    }
}

Write-Host ""
Write-Host "Starting file copy..." -ForegroundColor Green
Write-Host ""

# Check if build exists
$distPath = Join-Path $projectRoot "client\dist"
if (-not (Test-Path $distPath)) {
    Write-Host "ERROR: Build folder not found at: $distPath" -ForegroundColor Red
    Write-Host "Please run 'npm run build' in the client folder first!" -ForegroundColor Red
    exit 1
}

# Copy build folder (dist)
Write-Host "[1/4] Copying build folder (dist)..." -ForegroundColor Cyan
$targetDist = Join-Path $deployPath "dist"
if (Test-Path $targetDist) {
    Remove-Item -Path $targetDist -Recurse -Force
}
Copy-Item -Path $distPath -Destination $targetDist -Recurse -Force
Write-Host "   ✓ Build folder copied" -ForegroundColor Green

# Copy server folder
Write-Host "[2/4] Copying server folder..." -ForegroundColor Cyan
$serverPath = Join-Path $projectRoot "server"
$targetServer = Join-Path $deployPath "server"
if (-not (Test-Path $serverPath)) {
    Write-Host "   ERROR: Server folder not found!" -ForegroundColor Red
    exit 1
}

if (Test-Path $targetServer) {
    Remove-Item -Path $targetServer -Recurse -Force
}

# Copy server folder but exclude node_modules
Write-Host "   Copying server files (excluding node_modules)..." -ForegroundColor Gray
$serverFiles = Get-ChildItem -Path $serverPath -Recurse -File | Where-Object {
    $_.FullName -notlike "*\node_modules\*"
}
$serverFolders = Get-ChildItem -Path $serverPath -Directory | Where-Object {
    $_.Name -ne "node_modules"
}

# Create directory structure
foreach ($folder in $serverFolders) {
    $relativePath = $folder.FullName.Substring($serverPath.Length + 1)
    $targetFolder = Join-Path $targetServer $relativePath
    if (-not (Test-Path $targetFolder)) {
        New-Item -ItemType Directory -Path $targetFolder -Force | Out-Null
    }
}

# Copy files
foreach ($file in $serverFiles) {
    $relativePath = $file.FullName.Substring($serverPath.Length + 1)
    $targetFile = Join-Path $targetServer $relativePath
    $targetDir = Split-Path -Parent $targetFile
    if (-not (Test-Path $targetDir)) {
        New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
    }
    Copy-Item -Path $file.FullName -Destination $targetFile -Force
}

Write-Host "   ✓ Server folder copied (node_modules excluded)" -ForegroundColor Green

# Copy scripts folder
Write-Host "[3/4] Copying scripts folder..." -ForegroundColor Cyan
$scriptsPath = Join-Path $projectRoot "scripts"
$targetScripts = Join-Path $deployPath "scripts"
if (Test-Path $scriptsPath) {
    if (Test-Path $targetScripts) {
        Remove-Item -Path $targetScripts -Recurse -Force
    }
    Copy-Item -Path $scriptsPath -Destination $targetScripts -Recurse -Force
    Write-Host "   ✓ Scripts folder copied" -ForegroundColor Green
} else {
    Write-Host "   WARNING: Scripts folder not found!" -ForegroundColor Yellow
}

# Copy README files
Write-Host "[4/4] Copying documentation files..." -ForegroundColor Cyan
$readmeFiles = @(
    "README.md",
    "ADMIN_SETUP.md"
)

foreach ($readmeFile in $readmeFiles) {
    $sourceFile = Join-Path $projectRoot $readmeFile
    if (Test-Path $sourceFile) {
        Copy-Item -Path $sourceFile -Destination (Join-Path $deployPath $readmeFile) -Force
        Write-Host "   ✓ Copied $readmeFile" -ForegroundColor Green
    }
}

# Copy server documentation
$serverReadme = Join-Path $projectRoot "server\README_SETUP.md"
if (Test-Path $serverReadme) {
    Copy-Item -Path $serverReadme -Destination (Join-Path $deployPath "README_SETUP.md") -Force
    Write-Host "   ✓ Copied server/README_SETUP.md" -ForegroundColor Green
}

$serverTroubleshoot = Join-Path $projectRoot "server\TROUBLESHOOTING.md"
if (Test-Path $serverTroubleshoot) {
    Copy-Item -Path $serverTroubleshoot -Destination (Join-Path $deployPath "TROUBLESHOOTING.md") -Force
    Write-Host "   ✓ Copied server/TROUBLESHOOTING.md" -ForegroundColor Green
}

# Copy this deployment guide
$deploymentGuide = Join-Path $projectRoot "DEPLOYMENT.md"
if (Test-Path $deploymentGuide) {
    Copy-Item -Path $deploymentGuide -Destination (Join-Path $deployPath "DEPLOYMENT.md") -Force
    Write-Host "   ✓ Copied DEPLOYMENT.md" -ForegroundColor Green
}

Write-Host ""
Write-Host "========================================"
Write-Host "Deployment Complete!" -ForegroundColor Green
Write-Host "========================================"
Write-Host ""
Write-Host "Deployment folder: $deployPath" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. On target computer, navigate to: $deployPath\server"
Write-Host "2. Run: npm install"
Write-Host "3. Configure .env file with database settings"
Write-Host "4. Run database scripts from scripts/ folder"
Write-Host "5. Start server: npm start"
Write-Host ""
Write-Host "See DEPLOYMENT.md for detailed instructions." -ForegroundColor Gray

