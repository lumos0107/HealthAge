"""HTTP 라우터.

각 파일이 하나의 리소스 그룹:
    health.py    GET /, GET /health  (인증 없음)
    users.py     /users CRUD (인증 필요, 본인 데이터만)
    analysis.py  /analyze, /reports/... (인증 필요)
    uploads.py   POST /uploads (인증 필요) — 턴 3-2에서 추가

라우터는 의존성 주입(get_current_user, get_user_client)으로 인증/DB 클라이언트를 받고,
실제 비즈니스 로직은 services/*에 위임한다.
"""
