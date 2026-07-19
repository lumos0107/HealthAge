"""analyzer/_internal/ 격리 검사.

분리 가능성을 보존하기 위해 _internal/ 안의 코드는 외부와 격리되어야 한다.
이 테스트들은 약속을 코드로 강제한다.

이 테스트가 실패하면:
  분리 가능성이 깨진 것. 분리 후 분석 서비스로 옮길 때 작업이 폭증한다.

검사 항목:
  1. _internal/ 안의 어떤 파일도 `from app.*` / `import app.*` 하지 않음.
  2. 함수 시그니처가 dict/기본 타입만 받고 반환 (Pydantic 모델 금지).
     → 정적 검사가 어려워서 사회적 약속으로 두고, 1번만 자동 검사.
  3. 입출력 코드에 직접 환경변수 접근(`os.environ[]`) 없음. (옵션)
"""
from __future__ import annotations

import ast
from pathlib import Path

import pytest

# _internal 폴더 경로 — 이 파일 기준으로 한 단계 위로 올라가서 app/analyzer/_internal
INTERNAL_DIR = Path(__file__).resolve().parent.parent / "app" / "analyzer" / "_internal"


def _iter_py_files() -> list[Path]:
    """_internal/ 안의 모든 .py 파일."""
    assert INTERNAL_DIR.is_dir(), f"_internal 폴더 없음: {INTERNAL_DIR}"
    files = sorted(INTERNAL_DIR.rglob("*.py"))
    # __pycache__ 제외
    return [f for f in files if "__pycache__" not in f.parts]


def _imports_from(tree: ast.AST) -> list[tuple[str, int]]:
    """AST에서 (모듈 경로, 줄번호) 모두 추출. import X / from X import ... 둘 다."""
    imports: list[tuple[str, int]] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                imports.append((alias.name, node.lineno))
        elif isinstance(node, ast.ImportFrom):
            # from . import ...  → node.module is None, level >= 1 (상대 import)
            # from app.x import ... → node.module = "app.x", level = 0
            if node.module is not None:
                imports.append((node.module, node.lineno))
    return imports


def test_internal_directory_exists():
    """_internal 폴더가 있어야 한다."""
    assert INTERNAL_DIR.is_dir(), f"_internal 폴더 없음: {INTERNAL_DIR}"


def test_internal_has_files():
    """_internal에 최소 한 개의 .py 파일이 있어야 한다."""
    files = _iter_py_files()
    assert len(files) > 0, "_internal/ 폴더가 비어있다"


@pytest.mark.parametrize("py_file", _iter_py_files(), ids=lambda p: p.name)
def test_internal_does_not_import_app(py_file: Path):
    """❌ _internal/의 어느 파일도 'from app.*' 를 import하면 안 됨.

    이 규칙이 깨지면 분리 시 그 import 체인까지 다 풀어야 해서 작업이 폭증한다.
    """
    source = py_file.read_text(encoding="utf-8")
    try:
        tree = ast.parse(source)
    except SyntaxError as e:
        pytest.fail(f"{py_file} 구문 에러: {e}")

    violations: list[str] = []
    for module_name, lineno in _imports_from(tree):
        if module_name == "app" or module_name.startswith("app."):
            violations.append(f"  {py_file.name}:{lineno}  →  '{module_name}'")

    if violations:
        msg = (
            "❌ _internal/ 격리 규칙 위반 — 'app.*' import 발견:\n"
            + "\n".join(violations)
            + "\n\n"
            "_internal/ 안에선 app.* 를 import하면 안 됩니다.\n"
            "표준 라이브러리, polars, numpy 등 외부 패키지만 사용하세요.\n"
            "분리 가능성 보존을 위한 규칙입니다."
        )
        pytest.fail(msg)


def test_internal_pipeline_exposes_run_full_pipeline():
    """app.analyzer.__init__.py가 의존하는 함수가 _internal에 있어야 한다.

    STUB 단계에선 함수가 NotImplementedError를 던지지만, 적어도 함수 객체는 존재해야 함.
    """
    from app.analyzer._internal import pipeline

    assert hasattr(pipeline, "run_full_pipeline"), (
        "_internal/pipeline.py 에 run_full_pipeline 함수가 없습니다. "
        "이 함수는 app.analyzer.__init__.py의 진입점이 의존합니다."
    )
    assert callable(pipeline.run_full_pipeline), "run_full_pipeline이 호출 가능하지 않음"
