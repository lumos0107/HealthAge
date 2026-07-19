#!/usr/bin/env bash
# ============================================================================
# 01_copy_analyzer.sh — 분석 코드를 _internal/로 이관
# ============================================================================
# 본인 PC에서 한 번만 실행. PowerShell 사용자는 아래 명령어를 수동으로 옮기면 됨.
#
# 전제:
#   분석 측 코드 위치: C:\Users\seungjun\Documents\health_project\
#     - scripts/thresholds.py
#     - scripts/ocr_adapter.py
#     - scripts/health_report.py
#     - core/pipeline.py
#
#   백엔드 위치: C:\Users\seungjun\Documents\health-service\
# ============================================================================

set -euo pipefail

# === 경로 설정 (필요시 수정) ===
HEALTH_PROJECT="${HEALTH_PROJECT:-$HOME/Documents/health_project}"
HEALTH_SERVICE="${HEALTH_SERVICE:-$HOME/Documents/health-service}"

SRC_SCRIPTS="$HEALTH_PROJECT/scripts"
SRC_CORE="$HEALTH_PROJECT/core"
DST_INTERNAL="$HEALTH_SERVICE/app/analyzer/_internal"

# === 검증 ===
echo "==> 경로 확인"
for src in "$SRC_SCRIPTS/thresholds.py" "$SRC_SCRIPTS/ocr_adapter.py" \
           "$SRC_SCRIPTS/health_report.py" "$SRC_CORE/pipeline.py"; do
    if [ ! -f "$src" ]; then
        echo "  ❌ 소스 파일 없음: $src"
        exit 1
    fi
done
echo "  ✅ 모든 소스 파일 확인됨"

[ -d "$DST_INTERNAL" ] || { echo "❌ 대상 폴더 없음: $DST_INTERNAL"; exit 1; }

# === 복사 ===
echo "==> 4개 파일 복사"
cp -v "$SRC_SCRIPTS/thresholds.py"    "$DST_INTERNAL/thresholds.py"
cp -v "$SRC_SCRIPTS/ocr_adapter.py"   "$DST_INTERNAL/ocr_adapter.py"
cp -v "$SRC_SCRIPTS/health_report.py" "$DST_INTERNAL/health_report.py"
cp -v "$SRC_CORE/pipeline.py"         "$DST_INTERNAL/pipeline.py"

# === import 경로 정리 ===
# core/pipeline.py의 원본은 sys.path.insert로 scripts/를 통과시키고 있다.
# _internal/에선 같은 패키지 안이라 그게 필요 없다.
echo "==> import 경로 정리 (pipeline.py)"

# 1) sys.path 조작 코드 블록 제거 (수동 확인 권장)
echo "  ⚠️  pipeline.py의 다음 라인들을 직접 제거하거나 주석 처리하세요:"
echo "       import sys"
echo "       from pathlib import Path"
echo "       PROJECT_ROOT = Path(__file__).resolve().parent.parent"
echo "       SCRIPTS_DIR = PROJECT_ROOT / 'scripts'"
echo "       if str(SCRIPTS_DIR) not in sys.path:"
echo "           sys.path.insert(0, str(SCRIPTS_DIR))"

# 2) import 경로 자동 치환 (같은 _internal 폴더 안으로)
echo "==> from X import → relative import 치환"
for module in thresholds ocr_adapter health_report; do
    # macOS sed (-i '')와 GNU sed (-i)의 호환을 위해 백업 파일 만든 뒤 삭제
    sed -i.bak "s/^from ${module} import /from .${module} import /" \
        "$DST_INTERNAL/pipeline.py"
    rm "$DST_INTERNAL/pipeline.py.bak"
done

echo "  → 'from thresholds import ...' → 'from .thresholds import ...' 등"

# === 격리 검사 ===
echo "==> 격리 테스트 실행"
cd "$HEALTH_SERVICE"
if command -v uv &>/dev/null; then
    uv run pytest tests/test_analyzer_isolation.py -v
else
    pytest tests/test_analyzer_isolation.py -v
fi

echo ""
echo "✅ 이관 완료"
echo ""
echo "다음 단계:"
echo "  1. uv run pytest                # 전체 테스트 통과 확인"
echo "  2. health_project/scripts/에 다리 파일 두기 (기존 분석 시스템 호환용)"
echo "     - 02_bridge_files.sh 참조"
