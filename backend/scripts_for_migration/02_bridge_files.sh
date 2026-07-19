#!/usr/bin/env bash
# ============================================================================
# 02_bridge_files.sh — health_project/scripts/에 다리 파일 두기
# ============================================================================
# 분석 코드의 진실의 원천이 health-service로 옮겨갔지만,
# health_project/scripts/run_analysis.py 등 기존 배치 스크립트가
# 여전히 'from thresholds import ...' 식으로 import한다.
#
# 다리 파일을 두면 기존 스크립트가 새 위치를 자동으로 보게 된다.
# 분석 로직 수정은 health-service 한 곳에서만.
# ============================================================================

set -euo pipefail

HEALTH_PROJECT="${HEALTH_PROJECT:-$HOME/Documents/health_project}"
HEALTH_SERVICE="${HEALTH_SERVICE:-$HOME/Documents/health-service}"

SCRIPTS_DIR="$HEALTH_PROJECT/scripts"
INTERNAL_DIR="$HEALTH_SERVICE/app/analyzer/_internal"

[ -d "$SCRIPTS_DIR" ] || { echo "❌ 폴더 없음: $SCRIPTS_DIR"; exit 1; }
[ -d "$INTERNAL_DIR" ] || { echo "❌ 폴더 없음: $INTERNAL_DIR"; exit 1; }

# 다리 파일 생성 헬퍼
make_bridge() {
    local module=$1
    local target="$SCRIPTS_DIR/$module.py"

    cat > "$target" <<EOF
"""호환용 다리 파일. 실제 코드는 health-service에 있다.

이 파일을 통해 health_project의 기존 배치 스크립트
(run_analysis.py, comprehensive_analysis.py 등)가
새 위치의 분석 코드를 그대로 import할 수 있다.

분석 로직 수정은 다음 경로에서:
    $INTERNAL_DIR/$module.py
"""
import sys
from pathlib import Path

_HEALTH_SERVICE = Path(r"$HEALTH_SERVICE")
if str(_HEALTH_SERVICE) not in sys.path:
    sys.path.insert(0, str(_HEALTH_SERVICE))

# 통째로 re-export
from app.analyzer._internal.$module import *  # noqa: F401, F403
EOF
    echo "  ✅ $target"
}

echo "==> 기존 파일 백업"
for module in thresholds ocr_adapter health_report; do
    src="$SCRIPTS_DIR/$module.py"
    if [ -f "$src" ]; then
        cp "$src" "$src.before_migration.bak"
        echo "  📦 $src → $src.before_migration.bak"
    fi
done

echo "==> 다리 파일 생성"
make_bridge thresholds
make_bridge ocr_adapter
make_bridge health_report

# core/pipeline.py도 같이
if [ -f "$HEALTH_PROJECT/core/pipeline.py" ]; then
    cp "$HEALTH_PROJECT/core/pipeline.py" "$HEALTH_PROJECT/core/pipeline.py.before_migration.bak"
    cat > "$HEALTH_PROJECT/core/pipeline.py" <<EOF
"""호환용 다리. 실제 코드는 health-service에."""
import sys
from pathlib import Path

_HEALTH_SERVICE = Path(r"$HEALTH_SERVICE")
if str(_HEALTH_SERVICE) not in sys.path:
    sys.path.insert(0, str(_HEALTH_SERVICE))

from app.analyzer._internal.pipeline import *  # noqa: F401, F403
EOF
    echo "  ✅ $HEALTH_PROJECT/core/pipeline.py"
fi

echo ""
echo "✅ 다리 파일 생성 완료"
echo ""
echo "이제 health_project의 기존 명령들이 여전히 동작합니다:"
echo "    cd $HEALTH_PROJECT"
echo "    python scripts/run_analysis.py"
echo ""
echo "분석 로직을 수정하려면:"
echo "    cd $HEALTH_SERVICE"
echo "    vi app/analyzer/_internal/thresholds.py  (또는 다른 파일)"
echo ""
echo "복구하려면:"
echo "    각 모듈마다 .before_migration.bak 을 원본으로 복원"
