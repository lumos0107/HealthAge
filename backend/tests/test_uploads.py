"""POST /uploads 라우터 테스트."""
from __future__ import annotations

import time
from io import BytesIO
from unittest.mock import AsyncMock, patch

import jwt
import pytest
from fastapi.testclient import TestClient
from PIL import Image


# ══════════════════════════════════════════════════════════════════
# Fixtures
# ══════════════════════════════════════════════════════════════════

@pytest.fixture
def secret() -> str:
    from app.config import settings
    return settings.supabase_jwt_secret


@pytest.fixture
def user_id() -> str:
    return "test-user-uuid-1234"


@pytest.fixture
def token(secret: str, user_id: str) -> str:
    return jwt.encode(
        {
            "sub": user_id,
            "email": "test@example.com",
            "aud": "authenticated",
            "exp": int(time.time()) + 3600,
        },
        secret,
        algorithm="HS256",
    )


@pytest.fixture
def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def client() -> TestClient:
    from app.main import app
    with TestClient(app) as c:
        yield c


def _make_png_bytes(size: tuple[int, int] = (100, 100)) -> bytes:
    """테스트용 PNG."""
    img = Image.new("RGB", size, color="white")
    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


# ══════════════════════════════════════════════════════════════════
# 인증
# ══════════════════════════════════════════════════════════════════

class TestUploadAuth:
    def test_upload_without_token_returns_401(self, client: TestClient):
        files = {"file": ("test.png", _make_png_bytes(), "image/png")}
        r = client.post("/uploads", files=files)
        assert r.status_code in (401, 403)


# ══════════════════════════════════════════════════════════════════
# 검증
# ══════════════════════════════════════════════════════════════════

class TestUploadValidation:
    def test_empty_file_returns_400(self, client: TestClient, auth_headers: dict):
        files = {"file": ("empty.png", b"", "image/png")}
        r = client.post("/uploads", headers=auth_headers, files=files)
        assert r.status_code == 400
        assert "빈 파일" in r.json()["detail"]

    def test_pdf_returns_400(self, client: TestClient, auth_headers: dict):
        """PDF는 허용 안 함 (이미지만)."""
        files = {"file": ("doc.pdf", b"%PDF-1.4 fake", "application/pdf")}
        r = client.post("/uploads", headers=auth_headers, files=files)
        assert r.status_code == 400
        assert "지원하지 않는" in r.json()["detail"]

    def test_oversized_returns_400(self, client: TestClient, auth_headers: dict):
        """10MB 초과 거부."""
        # 11MB짜리 가짜 PNG bytes (검증 단계에서 size로만 거부)
        big_bytes = b"x" * (11 * 1024 * 1024)
        files = {"file": ("big.png", big_bytes, "image/png")}
        r = client.post("/uploads", headers=auth_headers, files=files)
        assert r.status_code == 400
        assert "크기 초과" in r.json()["detail"]


# ══════════════════════════════════════════════════════════════════
# OCR 호출
# ══════════════════════════════════════════════════════════════════

class TestUploadFlow:
    def test_upload_calls_ocr_and_returns_result(
        self, client: TestClient, auth_headers: dict
    ):
        """정상 흐름: 이미지 → OCR mock → 응답."""
        mock_ocr_result = {
            "meta": {"exam_date": "2024-03-15", "ocr_confidence": 0.85},
            "measurements": {"sbp": {"value": 130}, "dbp": {"value": 85}},
            "lifestyle": {"smoking": "non"},
        }

        from app.services import upload_service

        with patch.object(
            upload_service, "extract_ocr", new=AsyncMock(return_value=mock_ocr_result)
        ):
            files = {"file": ("test.png", _make_png_bytes(), "image/png")}
            r = client.post("/uploads", headers=auth_headers, files=files)

        assert r.status_code == 200, r.text
        body = r.json()
        assert "ocr" in body
        assert "warnings" in body
        assert body["ocr"]["measurements"]["sbp"]["value"] == 130
        assert body["warnings"] == []  # confidence 0.85라 경고 없음

    def test_low_confidence_adds_warning(
        self, client: TestClient, auth_headers: dict
    ):
        """OCR 신뢰도 < 0.7 → 경고 추가."""
        mock_ocr_result = {
            "meta": {"ocr_confidence": 0.5},
            "measurements": {"sbp": {"value": 130}},
            "lifestyle": {},
        }

        from app.services import upload_service

        with patch.object(
            upload_service, "extract_ocr", new=AsyncMock(return_value=mock_ocr_result)
        ):
            files = {"file": ("test.png", _make_png_bytes(), "image/png")}
            r = client.post("/uploads", headers=auth_headers, files=files)

        assert r.status_code == 200
        body = r.json()
        assert len(body["warnings"]) >= 1
        assert any("신뢰도" in w for w in body["warnings"])

    def test_empty_measurements_adds_warning(
        self, client: TestClient, auth_headers: dict
    ):
        """OCR이 검진 수치 못 찾으면 경고."""
        mock_ocr_result = {
            "meta": {"ocr_confidence": 0.9},
            "measurements": {},
            "lifestyle": {},
        }

        from app.services import upload_service

        with patch.object(
            upload_service, "extract_ocr", new=AsyncMock(return_value=mock_ocr_result)
        ):
            files = {"file": ("test.png", _make_png_bytes(), "image/png")}
            r = client.post("/uploads", headers=auth_headers, files=files)

        assert r.status_code == 200
        body = r.json()
        assert any("검진 수치" in w for w in body["warnings"])


class TestUploadOCRErrors:
    def test_ocr_connection_error_returns_503(
        self, client: TestClient, auth_headers: dict
    ):
        """OCR backend 연결 실패 → 503."""
        from app.ocr.service import OCRError
        from app.services import upload_service

        with patch.object(
            upload_service,
            "extract_ocr",
            new=AsyncMock(side_effect=OCRError("Ollama 서버에 연결할 수 없습니다")),
        ):
            files = {"file": ("test.png", _make_png_bytes(), "image/png")}
            r = client.post("/uploads", headers=auth_headers, files=files)

        assert r.status_code == 503
        assert "OCR 서버" in r.json()["detail"]

    def test_ocr_other_error_returns_500(
        self, client: TestClient, auth_headers: dict
    ):
        """OCR 그 외 실패 → 500."""
        from app.ocr.service import OCRError
        from app.services import upload_service

        with patch.object(
            upload_service,
            "extract_ocr",
            new=AsyncMock(side_effect=OCRError("JSON 파싱 실패")),
        ):
            files = {"file": ("test.png", _make_png_bytes(), "image/png")}
            r = client.post("/uploads", headers=auth_headers, files=files)

        assert r.status_code == 500
