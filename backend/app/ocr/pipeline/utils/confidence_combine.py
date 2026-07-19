"""
LLM self-report와 휴리스틱 confidence를 결합.

결합 규칙:
  - confidence: min(llm, heuristic)   ← 더 낮은 평가 채택 (보수적)
  - flags: 두 평가의 flags 합집합
  - LLM이 0.7 미만이면 "low_llm_confidence" flag 추가

[step12] 신규.
"""

from __future__ import annotations


LLM_LOW_THRESHOLD = 0.7  # LLM이 이 미만이면 low_llm_confidence flag


def combine_confidence(
    llm_eval: dict[str, float],
    heur_eval: dict[str, tuple[float, list[str]]],
) -> dict[str, dict]:
    """LLM 평가와 휴리스틱 평가를 결합.
    
    Args:
        llm_eval: {"sbp": 0.95, "dbp": 0.6, ...}
                  LLM이 self-report한 각 변수의 confidence (없을 수 있음).
        heur_eval: {"sbp": (1.0, []), "dbp": (0.5, ["out_of_range_suspect"]), ...}
                   휴리스틱 평가 결과.
    
    Returns:
        {"sbp": {"confidence": 0.95, "flags": []},
         "dbp": {"confidence": 0.5, "flags": ["out_of_range_suspect"]}, ...}
        
        키 합집합 — 두 평가 중 어느 한 쪽에라도 있는 키는 모두 포함.
        LLM 평가 없는 키는 LLM 부분 무시 (휴리스틱만 사용).
    """
    all_keys = set(llm_eval.keys()) | set(heur_eval.keys())
    result: dict[str, dict] = {}
    
    for key in all_keys:
        llm_conf = llm_eval.get(key)
        heur = heur_eval.get(key, (1.0, []))
        heur_conf, heur_flags = heur
        
        flags: list[str] = list(heur_flags)  # 휴리스틱 flag 먼저
        
        if llm_conf is None:
            # LLM 평가 없음 → 휴리스틱만
            final_conf = heur_conf
        else:
            # LLM + 휴리스틱
            final_conf = min(llm_conf, heur_conf)
            if llm_conf < LLM_LOW_THRESHOLD:
                if "low_llm_confidence" not in flags:
                    flags.append("low_llm_confidence")
        
        result[key] = {
            "confidence": round(final_conf, 2),
            "flags": flags,
        }
    
    return result
