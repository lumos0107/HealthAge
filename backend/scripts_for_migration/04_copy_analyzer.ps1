# ============================================================================
# 04_copy_analyzer.ps1 - Migrate analyzer code from health_project to _internal/
# ============================================================================
# Usage:
#   cd C:\Users\dlsrn\health-service
#   .\scripts_for_migration\04_copy_analyzer.ps1 -SourceDir "C:\Users\dlsrn\문서\health_project"
#
# What this script does:
#   1. Copy 5 Python files to app/analyzer/_internal/
#      (pipeline.py, thresholds.py, ocr_adapter.py, health_report.py, peer_compare.py)
#   2. Copy data/stats/ Parquet files to health-service/data/stats/ (1.3MB total)
#   3. Remove sys.path manipulation in pipeline.py
#   4. Convert absolute imports to relative (e.g. 'from ocr_adapter' -> 'from .ocr_adapter')
#   5. Fix STATS_PATH in peer_compare.py (PROJECT_ROOT depth adjusted)
#   6. Run isolation tests to verify
#
# Idempotent. Safe to re-run when source files change.
# ============================================================================

param(
    [Parameter(Mandatory=$true)]
    [string]$SourceDir,

    [string]$DestInternal = ".\app\analyzer\_internal",
    [string]$DestStats = ".\data\stats"
)

$ErrorActionPreference = "Stop"

# ----------------------------------------------------------------------------
# Step 1: Validate source files
# ----------------------------------------------------------------------------
Write-Host "==> 1. Validate source" -ForegroundColor Cyan

$RequiredFiles = @{
    "core\pipeline.py" = "pipeline.py"
    "scripts\thresholds.py" = "thresholds.py"
    "scripts\ocr_adapter.py" = "ocr_adapter.py"
    "scripts\health_report.py" = "health_report.py"
    "scripts\peer_compare.py" = "peer_compare.py"
}

foreach ($rel in $RequiredFiles.Keys) {
    $src = Join-Path $SourceDir $rel
    if (-not (Test-Path $src)) {
        Write-Error "Missing: $src"
        exit 1
    }
}

$StatsSourceDir = Join-Path $SourceDir "data\stats"
if (-not (Test-Path $StatsSourceDir)) {
    Write-Error "Missing stats dir: $StatsSourceDir"
    exit 1
}
$RequiredStats = @(
    "peer_stats.parquet",
    "change_stats.parquet",
    "group_stats.parquet",
    "group_demographics.parquet"
)
foreach ($s in $RequiredStats) {
    $p = Join-Path $StatsSourceDir $s
    if (-not (Test-Path $p)) {
        Write-Warning "Stats file missing (may be optional): $p"
    }
}
Write-Host "  [OK] All required source files present" -ForegroundColor Green

# ----------------------------------------------------------------------------
# Step 2: Copy Python files
# ----------------------------------------------------------------------------
Write-Host "==> 2. Copy 5 Python files to $DestInternal" -ForegroundColor Cyan

if (-not (Test-Path $DestInternal)) {
    Write-Error "Destination missing: $DestInternal (run from health-service root)"
    exit 1
}

foreach ($rel in $RequiredFiles.Keys) {
    $src = Join-Path $SourceDir $rel
    $dst = Join-Path $DestInternal $RequiredFiles[$rel]
    Copy-Item $src $dst -Force
    Write-Host "  copied  $rel  ->  _internal\$($RequiredFiles[$rel])"
}
Write-Host "  [OK] 5 files copied" -ForegroundColor Green

# ----------------------------------------------------------------------------
# Step 3: Copy Parquet stats (1.3MB total)
# ----------------------------------------------------------------------------
Write-Host "==> 3. Copy data/stats/ (~1.3MB)" -ForegroundColor Cyan

if (-not (Test-Path $DestStats)) {
    New-Item -ItemType Directory -Path $DestStats -Force | Out-Null
}

Get-ChildItem -Path $StatsSourceDir -Filter "*.parquet" | ForEach-Object {
    $dst = Join-Path $DestStats $_.Name
    Copy-Item $_.FullName $dst -Force
    $sizeKB = [math]::Round($_.Length / 1KB, 1)
    Write-Host "  copied  $($_.Name)  ($sizeKB KB)"
}
Write-Host "  [OK] Stats files copied" -ForegroundColor Green

# ----------------------------------------------------------------------------
# Step 4: Fix pipeline.py - remove sys.path manipulation + relative imports
# ----------------------------------------------------------------------------
Write-Host "==> 4. Patch pipeline.py" -ForegroundColor Cyan

$PipelinePy = Join-Path $DestInternal "pipeline.py"
$content = Get-Content $PipelinePy -Raw -Encoding UTF8

# Remove sys.path block (lines that add scripts/ to sys.path).
# We match the typical 5-line block: PROJECT_ROOT, SCRIPTS_DIR, if not in sys.path / insert.
# Use multiline regex to remove the block entirely.
$content = $content -replace '(?ms)PROJECT_ROOT\s*=\s*Path\(__file__\)\.resolve\(\)\.parent\.parent\s*\r?\nSCRIPTS_DIR\s*=\s*PROJECT_ROOT\s*/\s*"scripts"\s*\r?\nif\s+str\(SCRIPTS_DIR\)\s+not\s+in\s+sys\.path:\s*\r?\n\s+sys\.path\.insert\(0,\s*str\(SCRIPTS_DIR\)\)\s*\r?\n', ''

# Also try to remove a standalone `import sys` if no other sys usage remains.
# Conservative: only remove if pipeline.py originally had it only for sys.path.
if ($content -notmatch '\bsys\.[a-z]') {
    $content = $content -replace '(?m)^import sys\s*\r?\n', ''
}

# Convert absolute imports to relative
foreach ($mod in @("ocr_adapter", "health_report", "thresholds", "peer_compare")) {
    $content = $content -replace "(?m)^from $mod import ", "from .$mod import "
}

Set-Content -Path $PipelinePy -Value $content -Encoding UTF8 -NoNewline
Write-Host "  [OK] pipeline.py patched" -ForegroundColor Green

# ----------------------------------------------------------------------------
# Step 5: Fix health_report.py - relative import for peer_compare
# ----------------------------------------------------------------------------
Write-Host "==> 5. Patch health_report.py" -ForegroundColor Cyan

$HealthReportPy = Join-Path $DestInternal "health_report.py"
$content = Get-Content $HealthReportPy -Raw -Encoding UTF8
$content = $content -replace '(?m)^from peer_compare import ', 'from .peer_compare import '
Set-Content -Path $HealthReportPy -Value $content -Encoding UTF8 -NoNewline
Write-Host "  [OK] health_report.py patched" -ForegroundColor Green

# ----------------------------------------------------------------------------
# Step 6: Fix peer_compare.py - PROJECT_ROOT depth (parent.parent -> .parent x4)
# ----------------------------------------------------------------------------
Write-Host "==> 6. Patch peer_compare.py (PROJECT_ROOT depth)" -ForegroundColor Cyan

$PeerComparePy = Join-Path $DestInternal "peer_compare.py"
$content = Get-Content $PeerComparePy -Raw -Encoding UTF8

# Original: PROJECT_ROOT = Path(__file__).resolve().parent.parent
#   In health_project/scripts/peer_compare.py:
#     __file__.parent = scripts/
#     .parent = health_project/  <- finds data/stats/
#
# After move to app/analyzer/_internal/peer_compare.py:
#     __file__.parent       = _internal/
#     .parent.parent        = analyzer/
#     .parent.parent.parent = app/
#     .parent.parent.parent.parent = health-service/  <- need this depth
#
# Replace the 2-deep parent chain with 4-deep.
$content = $content -replace 'Path\(__file__\)\.resolve\(\)\.parent\.parent', 'Path(__file__).resolve().parent.parent.parent.parent'

Set-Content -Path $PeerComparePy -Value $content -Encoding UTF8 -NoNewline
Write-Host "  [OK] peer_compare.py patched (PROJECT_ROOT now points to health-service)" -ForegroundColor Green

# ----------------------------------------------------------------------------
# Step 7: Verify - run isolation tests
# ----------------------------------------------------------------------------
Write-Host "==> 7. Run isolation tests" -ForegroundColor Cyan
& uv run pytest tests/test_analyzer_isolation.py -v
if ($LASTEXITCODE -ne 0) {
    Write-Host "[FAIL] Isolation tests failed. Check the above output." -ForegroundColor Red
    exit 1
}
Write-Host "  [OK] Isolation tests passed" -ForegroundColor Green

# ----------------------------------------------------------------------------
# Step 8: Quick import sanity check
# ----------------------------------------------------------------------------
Write-Host "==> 8. Sanity check: can _internal modules be imported?" -ForegroundColor Cyan
$pyCheck = @"
try:
    from app.analyzer._internal.thresholds import evaluate_value
    from app.analyzer._internal.ocr_adapter import parse_ocr_json
    from app.analyzer._internal.peer_compare import load_stats
    from app.analyzer._internal.health_report import generate_report
    from app.analyzer._internal.pipeline import run_full_pipeline
    print('[OK] all imports succeeded')
except Exception as e:
    print(f'[FAIL] {type(e).__name__}: {e}')
    raise
"@

& uv run python -c $pyCheck
if ($LASTEXITCODE -ne 0) {
    Write-Host "[FAIL] Import check failed." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[SUCCESS] Analyzer code migration complete" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. uv run pytest                  # all tests still pass"
Write-Host "  2. Restart the server"
Write-Host "  3. Try POST /analyze in Swagger - should now return 200 instead of 503"
