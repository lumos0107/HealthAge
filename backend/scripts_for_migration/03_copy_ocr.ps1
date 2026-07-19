# ============================================================================
# 03_copy_ocr.ps1 - Migrate OCR friend's ocr_pipeline to app/ocr/pipeline
# ============================================================================
# Usage:
#   1. Unzip OCR friend's package and confirm the ocr_pipeline/ folder location.
#   2. In PowerShell:
#        cd C:\Users\dlsrn\health-service
#        .\scripts_for_migration\03_copy_ocr.ps1 -SourceDir "C:\path\to\ocr_pipeline"
#
# What this script does:
#   1. Backup and remove existing app/ocr/pipeline/
#   2. Copy source to app/ocr/pipeline/
#   3. Remove excluded items (debug/, __pycache__/, test_*.py)
#   4. Bulk-replace import paths (8 patterns)
#   5. Remove DEBUG_DIR.mkdir line from config.py (Cloud Run compat)
#   6. Create top-level __init__.py
#   7. Verify: check for missing import rewrites
#
# Idempotent. Safe to re-run when OCR friend sends a new zip.
# ============================================================================

param(
    [Parameter(Mandatory=$true)]
    [string]$SourceDir,

    [string]$DestDir = ".\app\ocr\pipeline"
)

$ErrorActionPreference = "Stop"

Write-Host "==> 1. Validate input" -ForegroundColor Cyan
if (-not (Test-Path $SourceDir)) {
    Write-Error "Source folder not found: $SourceDir"
    exit 1
}

$RequiredFiles = @("entry.py", "config.py", "run_multipage.py", "utils\vision_backend.py")
foreach ($f in $RequiredFiles) {
    $path = Join-Path $SourceDir $f
    if (-not (Test-Path $path)) {
        Write-Error "Required file missing: $path"
        exit 1
    }
}
Write-Host "  [OK] Source files validated" -ForegroundColor Green

Write-Host "==> 2. Backup and remove existing destination" -ForegroundColor Cyan
if (Test-Path $DestDir) {
    $BackupDir = "$DestDir.before_$(Get-Date -Format 'yyyyMMdd_HHmmss').bak"
    Write-Host "  Backup: $DestDir -> $BackupDir"
    Move-Item $DestDir $BackupDir
}

Write-Host "==> 3. Copy" -ForegroundColor Cyan
New-Item -ItemType Directory -Path $DestDir -Force | Out-Null
Copy-Item -Path "$SourceDir\*" -Destination $DestDir -Recurse -Force
Write-Host "  [OK] Copy complete" -ForegroundColor Green

Write-Host "==> 4. Remove excluded items (debug/, __pycache__/, test_*.py)" -ForegroundColor Cyan
Get-ChildItem -Path $DestDir -Directory -Recurse -Include "debug","__pycache__" | ForEach-Object {
    Write-Host "  rm $($_.FullName)"
    Remove-Item $_.FullName -Recurse -Force
}
Get-ChildItem -Path $DestDir -File -Recurse -Filter "test_*.py" | ForEach-Object {
    Write-Host "  rm $($_.FullName)"
    Remove-Item $_.FullName -Force
}
Write-Host "  [OK] Excluded items removed" -ForegroundColor Green

Write-Host "==> 5. Bulk-replace import paths" -ForegroundColor Cyan
$PythonFiles = Get-ChildItem -Path $DestDir -Filter "*.py" -Recurse
$TotalReplacements = 0

foreach ($file in $PythonFiles) {
    $content = Get-Content $file.FullName -Raw -Encoding UTF8
    $original = $content

    # Pattern 1: import config -> from app.ocr.pipeline import config
    $content = $content -replace '(?m)^import config\b', 'from app.ocr.pipeline import config'

    # Pattern 2-7: from <module> import / from <module>.<sub> import
    foreach ($module in @("utils", "splitter", "pipelines", "merger", "run_multipage", "entry")) {
        $content = $content -replace "(?m)^from $module import ", "from app.ocr.pipeline.$module import "
        $content = $content -replace "(?m)^from $module\.", "from app.ocr.pipeline.$module."
    }

    if ($content -ne $original) {
        Set-Content -Path $file.FullName -Value $content -Encoding UTF8 -NoNewline
        $TotalReplacements++
        $rel = $file.FullName.Substring($PWD.Path.Length + 1)
        Write-Host "  edited $rel"
    }
}
Write-Host "  [OK] $TotalReplacements files modified" -ForegroundColor Green

Write-Host "==> 6. Remove DEBUG_DIR.mkdir from config.py (Cloud Run compat)" -ForegroundColor Cyan
$ConfigPy = Join-Path $DestDir "config.py"
$content = Get-Content $ConfigPy -Raw -Encoding UTF8
$content = $content -replace '(?m)^DEBUG_DIR\.mkdir\(exist_ok=True\)\s*\r?\n', ''
Set-Content -Path $ConfigPy -Value $content -Encoding UTF8 -NoNewline
Write-Host "  [OK] DEBUG_DIR.mkdir line removed" -ForegroundColor Green

Write-Host "==> 7. Create top-level __init__.py" -ForegroundColor Cyan
$InitPy = Join-Path $DestDir "__init__.py"
$InitContent = "# OCR pipeline - migrated from OCR friend's ocr_pipeline package.`r`n# Entry point: app.ocr.pipeline.entry.extract_from_image_bytes`r`n"
Set-Content -Path $InitPy -Value $InitContent -Encoding UTF8 -NoNewline
Write-Host "  [OK] Created $InitPy" -ForegroundColor Green

Write-Host "==> 8. Verify: check for missing import rewrites" -ForegroundColor Cyan
$AllowedTopLevel = @("config", "utils", "splitter", "pipelines", "merger", "run_multipage", "entry")
$Violations = @()

foreach ($file in (Get-ChildItem -Path $DestDir -Filter "*.py" -Recurse)) {
    $lines = Get-Content $file.FullName -Encoding UTF8
    $lineNum = 0
    foreach ($line in $lines) {
        $lineNum++
        if ($line -match '^(from|import)\s+(\w+)') {
            $module = $matches[2]
            if ($AllowedTopLevel -contains $module -and $line -notmatch 'app\.ocr\.pipeline') {
                $rel = $file.FullName.Substring($PWD.Path.Length + 1)
                $Violations += "  ${rel}:${lineNum}  ->  $line"
            }
        }
    }
}

if ($Violations.Count -gt 0) {
    Write-Host "[FAIL] Missing import rewrites:" -ForegroundColor Red
    $Violations | ForEach-Object { Write-Host $_ -ForegroundColor Red }
    exit 1
}
Write-Host "  [OK] All imports rewritten correctly" -ForegroundColor Green

Write-Host ""
Write-Host "[SUCCESS] OCR migration complete" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. uv sync           # install OCR deps (Pillow, opencv, requests)"
Write-Host "  2. uv run pytest     # verify tests pass"
Write-Host "  3. uv run uvicorn app.main:app --reload --reload-dir app"
