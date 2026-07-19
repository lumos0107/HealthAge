"""Pydantic 스키마.

DB 컬럼 ↔ JSON 직렬화 사이의 검증 레이어.
백엔드의 입출력은 모두 이 스키마를 통과한다.

각 파일:
    common.py     공통 응답 (에러, 메시지)
    profile.py    profiles 테이블
    checkup.py    checkup_records 테이블 + OCR JSON 형식
    analysis.py   analysis_results 테이블
"""
