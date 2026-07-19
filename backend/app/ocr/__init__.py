"""OCR 모듈.

구조:
    service.py        OCRService — 백엔드가 사용하는 진입점
    pipeline/         OCR 친구의 코드 (이관됨)
    backends/         비전 모델 백엔드 (OllamaBackend는 pipeline 안에, GeminiBackend는 여기)

라우터는 `from app.ocr.service import extract_ocr` 만 import.
어떤 backend를 쓸지는 환경변수가 결정.
"""
