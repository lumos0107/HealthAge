"""라우터 통합 테스트.

Supabase 호출은 mock으로 대체. JWT 토큰은 실제 인코드/디코드 (auth.py 그대로).
실행: uv run pytest tests/test_routers.py
"""
from __future__ import annotations

import time
from unittest.mock import MagicMock, patch

import jwt
import pytest
from fastapi.testclient import TestClient


# ══════════════════════════════════════════════════════════════════
# Fixtures
# ══════════════════════════════════════════════════════════════════

@pytest.fixture
def secret() -> str:
    """테스트용 JWT secret. .env의 SUPABASE_JWT_SECRET과 동일해야 함."""
    from app.config import settings
    return settings.supabase_jwt_secret


@pytest.fixture
def user_id() -> str:
    return "test-user-uuid-1234"


@pytest.fixture
def other_user_id() -> str:
    return "other-user-uuid-5678"


@pytest.fixture
def token(secret: str, user_id: str) -> str:
    """유효한 JWT 토큰 생성."""
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
    """FastAPI 테스트 클라이언트."""
    from app.main import app
    with TestClient(app) as c:
        yield c


# ══════════════════════════════════════════════════════════════════
# Health (인증 없음)
# ══════════════════════════════════════════════════════════════════

class TestHealth:
    def test_root(self, client: TestClient):
        r = client.get("/")
        assert r.status_code == 200
        body = r.json()
        assert body["service"] == "Health Analyzer API"
        assert "version" in body

    def test_health_returns_status_ok(self, client: TestClient):
        """통계 조회가 실패해도 status: ok."""
        r = client.get("/health")
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "ok"
        assert "version" in body
        # users, checkups_total은 통계 조회 실패 시 0
        assert "users" in body
        assert "checkups_total" in body


# ══════════════════════════════════════════════════════════════════
# Users — 인증 필수
# ══════════════════════════════════════════════════════════════════

class TestUsersAuth:
    def test_get_users_without_token_returns_401(self, client: TestClient):
        r = client.get("/users")
        assert r.status_code in (401, 403)

    def test_get_user_without_token_returns_401(self, client: TestClient):
        r = client.get("/users/anything")
        assert r.status_code in (401, 403)

    def test_get_user_with_wrong_user_id_returns_403(
        self, client: TestClient, auth_headers: dict, other_user_id: str
    ):
        """본인 토큰으로 다른 user_id 조회 → 403."""
        r = client.get(f"/users/{other_user_id}", headers=auth_headers)
        assert r.status_code == 403
        assert "본인" in r.json()["detail"]


class TestUsersRead:
    def test_get_my_user(
        self, client: TestClient, auth_headers: dict, user_id: str
    ):
        """본인 user_id로 조회 — Supabase mock으로 응답."""
        from app.routers import users

        mock_profile = {
            "id": user_id,
            "name": "테스트 사용자",
            "gender": 1,
            "birth_year": 1980,
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z",
        }

        with patch.object(users, "get_user_client") as mock_get_client:
            mock_client = MagicMock()
            mock_resp = MagicMock()
            mock_resp.data = mock_profile
            mock_client.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = mock_resp
            mock_get_client.return_value = mock_client

            r = client.get(f"/users/{user_id}", headers=auth_headers)

        assert r.status_code == 200, r.text
        assert r.json()["id"] == user_id
        assert r.json()["name"] == "테스트 사용자"

    def test_get_my_user_not_found_returns_404(
        self, client: TestClient, auth_headers: dict, user_id: str
    ):
        from app.routers import users

        with patch.object(users, "get_user_client") as mock_get_client:
            mock_client = MagicMock()
            mock_resp = MagicMock()
            mock_resp.data = None
            mock_client.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = mock_resp
            mock_get_client.return_value = mock_client

            r = client.get(f"/users/{user_id}", headers=auth_headers)

        assert r.status_code == 404


class TestUsersUpdate:
    def test_post_user_upsert(
        self, client: TestClient, auth_headers: dict, user_id: str
    ):
        """POST /users — body의 name/gender/birth_year 채움."""
        from app.routers import users

        updated = {
            "id": user_id,
            "name": "홍길동",
            "gender": 1,
            "birth_year": 1985,
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-05-19T00:00:00Z",
        }

        with patch.object(users, "get_user_client") as mock_get_client:
            mock_client = MagicMock()
            mock_resp = MagicMock()
            mock_resp.data = [updated]
            mock_client.table.return_value.update.return_value.eq.return_value.execute.return_value = mock_resp
            mock_get_client.return_value = mock_client

            r = client.post(
                "/users",
                headers=auth_headers,
                json={"name": "홍길동", "gender": 1, "birth_year": 1985},
            )

        assert r.status_code == 200, r.text
        assert r.json()["name"] == "홍길동"

    def test_patch_user_wrong_id_returns_403(
        self, client: TestClient, auth_headers: dict, other_user_id: str
    ):
        r = client.patch(
            f"/users/{other_user_id}",
            headers=auth_headers,
            json={"name": "trying"},
        )
        assert r.status_code == 403


# ══════════════════════════════════════════════════════════════════
# Analyze — stub은 NotImplementedError → 503 반환
# ══════════════════════════════════════════════════════════════════

class TestAnalyze:
    def test_analyze_without_token(self, client: TestClient):
        r = client.post("/analyze", json={"ocr": {}})
        assert r.status_code in (401, 403)

    def test_analyze_wrong_user_id_returns_403(
        self, client: TestClient, auth_headers: dict, other_user_id: str
    ):
        r = client.post(
            "/analyze",
            headers=auth_headers,
            json={"ocr": {"meta": {}, "measurements": {}}, "user_id": other_user_id},
        )
        assert r.status_code == 403

    def test_analyze_validates_input(
        self, client: TestClient, auth_headers: dict, user_id: str
    ):
        """분석 모듈이 빈 OCR을 거부 (500). stub 시절엔 503이었음."""
        from app.routers import analysis

        # user_info 조회 mock (없어도 동작 가능)
        with patch.object(analysis, "get_user_client") as mock_get_client:
            mock_client = MagicMock()
            mock_resp = MagicMock()
            mock_resp.data = {"name": "테스트", "gender": 1, "birth_year": 1980}
            mock_client.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = mock_resp
            mock_get_client.return_value = mock_client

            r = client.post(
                "/analyze",
                headers=auth_headers,
                json={
                    "ocr": {"meta": {}, "measurements": {}, "lifestyle": {}},
                    "user_id": user_id,
                    "save": False,
                },
            )

        assert r.status_code == 500
        assert "분석 실패" in r.json()["detail"]


# ══════════════════════════════════════════════════════════════════
# Reports
# ══════════════════════════════════════════════════════════════════

class TestReports:
    def test_reports_wrong_user_returns_403(
        self, client: TestClient, auth_headers: dict, other_user_id: str
    ):
        r = client.get(f"/reports/{other_user_id}", headers=auth_headers)
        assert r.status_code == 403

    def test_reports_years_empty(
        self, client: TestClient, auth_headers: dict, user_id: str
    ):
        from app.routers import analysis

        with patch.object(analysis, "get_user_client") as mock_get_client:
            mock_client = MagicMock()
            mock_resp = MagicMock()
            mock_resp.data = []  # 검진 없음
            mock_client.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value = mock_resp
            mock_get_client.return_value = mock_client

            r = client.get(f"/reports/{user_id}", headers=auth_headers)

        assert r.status_code == 200
        body = r.json()
        assert body["years"] == []
        assert body["count"] == 0
