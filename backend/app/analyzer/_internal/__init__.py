"""분석 모듈 내부 — 분리 대상 폴더.

⚠️ 격리 규칙 (반드시 준수):
   1. 이 폴더 안의 코드는 'from app.*' 를 import하지 않는다.
      (표준 라이브러리, polars, numpy, pandas 등 외부 패키지만 OK)
   2. 함수의 입출력은 dict, list, int, str, float, None 만 사용한다.
      Pydantic 모델, 사용자 정의 클래스 금지.
   3. 외부 상태 의존 금지 (DB 조회, 환경변수 직접 읽기 금지). 필요한 값은 인자로.
   4. 자기만의 의존성을 가진다 (polars, numpy 등은 이 폴더가 필요로 함).

이 규칙은 tests/test_analyzer_isolation.py에서 자동 검사한다.

미래 분리 시점에 이 폴더를 통째로 새 저장소(analyzer-service)로 이동한다.
"""
