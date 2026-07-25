// 자동 생성(백엔드 analyze() 실산출) — root 데모 계정용 풀 분석 더미.
// 홍길동 2024년 검진값(sbp138·bmi26.3·waist93·glucose112·ldl145·hdl39·tg178 등, 50세 남)을
// 백엔드에 넣어 나온 실제 combo_analysis·recommendations를 그대로 임베드했다(수치·정합성 실제와 동일).
// highlights(시계열)만 6개년 악화 스토리에 맞춰 수작업.
import type { RealComboAnalysis, RealRecommendations, RealTimeseries } from './health';

export const dummyComboAnalysis = ({
  "combo_groups": {
    "matched": [
      {
        "combo_name": "비만+이상지질혈증+지방간의심",
        "category": "메타볼릭 트리오",
        "meaning": "대사이상 지방간 증후군 패턴",
        "components": [
          "비만",
          "이상지질혈증",
          "지방간 의심"
        ],
        "is_ascvd_risk": false,
        "population": {
          "n_in_combo": 22444,
          "pct_of_total": 2.26,
          "expected_n_if_independent": 8394,
          "observed_to_expected": 2.67,
          "top_metrics": [
            {
              "metric": "혈청지피티(ALT)",
              "combo_mean": 59.39,
              "non_combo_mean": 23.01,
              "diff": 36.38,
              "cohens_d": 1.927,
              "single_means": {
                "비만": 22.74,
                "이상지질혈증": 20.28,
                "지방간 의심": 48.19
              }
            },
            {
              "metric": "트리글리세라이드",
              "combo_mean": 252.82,
              "non_combo_mean": 119.9,
              "diff": 132.92,
              "cohens_d": 1.559,
              "single_means": {
                "비만": 105.59,
                "이상지질혈증": 151.11,
                "지방간 의심": 107.59
              }
            },
            {
              "metric": "BMI",
              "combo_mean": 29.13,
              "non_combo_mean": 23.69,
              "diff": 5.44,
              "cohens_d": 1.489,
              "single_means": {
                "비만": 27.71,
                "이상지질혈증": 22.37,
                "지방간 의심": 22.37
              }
            }
          ]
        }
      },
      {
        "combo_name": "대사증후군+비만",
        "category": "대사",
        "meaning": "대사 이상 가중",
        "components": [
          "대사증후군",
          "비만"
        ],
        "is_ascvd_risk": false,
        "population": {
          "n_in_combo": 99183,
          "pct_of_total": 9.98,
          "expected_n_if_independent": 47068,
          "observed_to_expected": 2.11,
          "top_metrics": [
            {
              "metric": "허리둘레",
              "combo_mean": 95.54,
              "non_combo_mean": 79.99,
              "diff": 15.55,
              "cohens_d": 1.598,
              "single_means": {
                "대사증후군": 84.68,
                "비만": 89.1
              }
            },
            {
              "metric": "BMI",
              "combo_mean": 29.4,
              "non_combo_mean": 23.65,
              "diff": 5.74,
              "cohens_d": 1.597,
              "single_means": {
                "대사증후군": 23.24,
                "비만": 27.9
              }
            },
            {
              "metric": "수축기혈압",
              "combo_mean": 135.94,
              "non_combo_mean": 121.23,
              "diff": 14.71,
              "cohens_d": 1.057,
              "single_means": {
                "대사증후군": 134.79,
                "비만": 124.17
              }
            }
          ]
        }
      },
      {
        "combo_name": "비만+지방간의심",
        "category": "간 질환",
        "meaning": "대사이상 관련 지방간 (MASLD)",
        "components": [
          "비만",
          "지방간 의심"
        ],
        "is_ascvd_risk": false,
        "population": {
          "n_in_combo": 116214,
          "pct_of_total": 11.69,
          "expected_n_if_independent": 70551,
          "observed_to_expected": 1.65,
          "top_metrics": [
            {
              "metric": "혈청지피티(ALT)",
              "combo_mean": 58.1,
              "non_combo_mean": 22.33,
              "diff": 35.77,
              "cohens_d": 1.723,
              "single_means": {
                "비만": 22.77,
                "지방간 의심": 48.58
              }
            },
            {
              "metric": "BMI",
              "combo_mean": 29.08,
              "non_combo_mean": 23.58,
              "diff": 5.5,
              "cohens_d": 1.538,
              "single_means": {
                "비만": 27.95,
                "지방간 의심": 22.56
              }
            },
            {
              "metric": "허리둘레",
              "combo_mean": 93.99,
              "non_combo_mean": 79.9,
              "diff": 14.09,
              "cohens_d": 1.439,
              "single_means": {
                "비만": 89.38,
                "지방간 의심": 80.53
              }
            }
          ]
        }
      },
      {
        "combo_name": "비만+당뇨전단계",
        "category": "대사",
        "meaning": "당뇨 진행 위험군",
        "components": [
          "비만",
          "당뇨 전단계"
        ],
        "is_ascvd_risk": false,
        "population": {
          "n_in_combo": 145168,
          "pct_of_total": 14.6,
          "expected_n_if_independent": 117491,
          "observed_to_expected": 1.24,
          "top_metrics": [
            {
              "metric": "BMI",
              "combo_mean": 28.41,
              "non_combo_mean": 23.51,
              "diff": 4.9,
              "cohens_d": 1.363,
              "single_means": {
                "비만": 28.24,
                "당뇨 전단계": 22.29
              }
            },
            {
              "metric": "허리둘레",
              "combo_mean": 91.53,
              "non_combo_mean": 79.84,
              "diff": 11.69,
              "cohens_d": 1.173,
              "single_means": {
                "비만": 90.4,
                "당뇨 전단계": 78.39
              }
            },
            {
              "metric": "수축기혈압",
              "combo_mean": 128.63,
              "non_combo_mean": 121.68,
              "diff": 6.95,
              "cohens_d": 0.484,
              "single_means": {
                "비만": 126.52,
                "당뇨 전단계": 123.72
              }
            }
          ]
        }
      }
    ],
    "not_evaluable": [
      {
        "combo_name": "대사증후군+흡연",
        "category": "심혈관",
        "met": [
          "대사증후군"
        ],
        "missing": [
          "현재 흡연자"
        ],
        "reason": "현재 흡연자 정보가 없어 판정할 수 없습니다."
      },
      {
        "combo_name": "음주+지방간의심",
        "category": "간 질환",
        "met": [
          "지방간 의심"
        ],
        "missing": [
          "음주자"
        ],
        "reason": "음주자 정보가 없어 판정할 수 없습니다."
      },
      {
        "combo_name": "흡연+음주+비만",
        "category": "생활습관 트리플",
        "met": [
          "비만"
        ],
        "missing": [
          "현재 흡연자",
          "음주자"
        ],
        "reason": "현재 흡연자, 음주자 정보가 없어 판정할 수 없습니다."
      }
    ],
    "matched_count": 4,
    "ascvd_risk_combos": [],
    "highest_synergy": {
      "combo_name": "비만+이상지질혈증+지방간의심",
      "category": "메타볼릭 트리오",
      "meaning": "대사이상 지방간 증후군 패턴",
      "components": [
        "비만",
        "이상지질혈증",
        "지방간 의심"
      ],
      "is_ascvd_risk": false,
      "population": {
        "n_in_combo": 22444,
        "pct_of_total": 2.26,
        "expected_n_if_independent": 8394,
        "observed_to_expected": 2.67,
        "top_metrics": [
          {
            "metric": "혈청지피티(ALT)",
            "combo_mean": 59.39,
            "non_combo_mean": 23.01,
            "diff": 36.38,
            "cohens_d": 1.927,
            "single_means": {
              "비만": 22.74,
              "이상지질혈증": 20.28,
              "지방간 의심": 48.19
            }
          },
          {
            "metric": "트리글리세라이드",
            "combo_mean": 252.82,
            "non_combo_mean": 119.9,
            "diff": 132.92,
            "cohens_d": 1.559,
            "single_means": {
              "비만": 105.59,
              "이상지질혈증": 151.11,
              "지방간 의심": 107.59
            }
          },
          {
            "metric": "BMI",
            "combo_mean": 29.13,
            "non_combo_mean": 23.69,
            "diff": 5.44,
            "cohens_d": 1.489,
            "single_means": {
              "비만": 27.71,
              "이상지질혈증": 22.37,
              "지방간 의심": 22.37
            }
          }
        ]
      }
    },
    "population": {
      "year": 2024,
      "total_n": 994018,
      "source": "국민건강보험공단 표본 (최신 연도)"
    },
    "caveats": [
      "모집단 통계는 공단 원자료 기준이라 약물 복용 정보가 없습니다. 서비스 판정은 '수치 또는 해당 약물 복용'을 함께 보므로, 약을 드시는 분은 모집단 기준보다 넓게 잡힐 수 있습니다.",
      "모집단의 지방간 의심 기준은 GGT>60이고 서비스 기준은 GGT>75입니다 (약대 자문 반영). 두 기준이 달라 비교 시 참고가 필요합니다.",
      "O/E비는 '함께 나타나는 경향'을 뜻하며 인과관계나 개인의 위험도 예측이 아닙니다."
    ]
  },
  "fatty_liver": {
    "applicable": true,
    "type": null,
    "provisional": true,
    "basis": "음주 정보가 없어 유형을 구분할 수 없습니다.",
    "cardiometabolic_factors": [
      "비만/복부비만",
      "혈당 이상",
      "혈압 이상",
      "고중성지방",
      "낮은 HDL"
    ],
    "note": "음주량(주당 순알코올)을 입력하시면 MASLD/MetALD/ALD 구분이 가능합니다.",
    "indices": {
      "fli": {
        "value": 69.4,
        "level": "high",
        "interpretation": "지방간 가능성 높음",
        "cutoffs": "<30 낮음 / 30~59 중간 / ≥60 높음",
        "formula": "Fatty Liver Index (Bedogni 2006)"
      },
      "hsi": {
        "value": 37.0,
        "level": "high",
        "interpretation": "지방간 시사",
        "cutoffs": "<30 낮음 / 30~36 중간 / >36 시사",
        "formula": "Hepatic Steatosis Index (Lee 2010, 한국인 기반)"
      },
      "unavailable": [],
      "disclaimer": "FLI·HSI는 검진 수치로 지방간 가능성을 가늠하는 선별용 참고 지표입니다. 초음파 등 영상 검사에 의한 진단을 대체하지 않습니다."
    }
  },
  "disclaimer": "조합 그룹 결과는 국민건강보험공단 표본과의 통계 비교이며, 진단이 아닙니다. 판단은 의료진과 상담하세요.",
  "single_groups": [
    {
      "key": "g_hypertension",
      "name": "고혈압",
      "category": "임상",
      "desc": "수축기 ≥140 또는 이완기 ≥90 또는 고혈압약 복용",
      "applies": false
    },
    {
      "key": "g_pre_hypertension",
      "name": "고혈압 전단계",
      "category": "임상",
      "desc": "수축기 130-139 또는 이완기 80-89",
      "applies": true
    },
    {
      "key": "g_diabetes",
      "name": "당뇨",
      "category": "임상",
      "desc": "공복혈당 ≥126 또는 당뇨약 복용",
      "applies": false
    },
    {
      "key": "g_pre_diabetes",
      "name": "당뇨 전단계",
      "category": "임상",
      "desc": "공복혈당 100-125",
      "applies": true
    },
    {
      "key": "g_metabolic_syndrome",
      "name": "대사증후군",
      "category": "임상",
      "desc": "5개 기준 중 3개 이상 (약물 복용 포함)",
      "applies": true
    },
    {
      "key": "g_obesity",
      "name": "비만",
      "category": "임상",
      "desc": "BMI ≥25",
      "applies": true
    },
    {
      "key": "g_dyslipidemia",
      "name": "이상지질혈증",
      "category": "임상",
      "desc": "LDL≥160 또는 HDL미달 또는 TG≥200 또는 이상지질혈증약 복용",
      "applies": true
    },
    {
      "key": "g_fatty_liver_suspect",
      "name": "지방간 의심",
      "category": "임상",
      "desc": "ALT>40 또는 GGT>75",
      "applies": true
    },
    {
      "key": "g_smoker_current",
      "name": "현재 흡연자",
      "category": "생활습관",
      "desc": null,
      "applies": null
    },
    {
      "key": "g_smoker_former",
      "name": "과거 흡연자",
      "category": "생활습관",
      "desc": null,
      "applies": null
    },
    {
      "key": "g_non_smoker",
      "name": "비흡연자",
      "category": "생활습관",
      "desc": null,
      "applies": null
    },
    {
      "key": "g_drinker",
      "name": "음주자",
      "category": "생활습관",
      "desc": null,
      "applies": null
    },
    {
      "key": "g_non_drinker",
      "name": "비음주자",
      "category": "생활습관",
      "desc": null,
      "applies": null
    }
  ],
  "ascvd_simulation": {
    "available": true,
    "is_simulation": true,
    "risk_percent": 5.8,
    "risk_level": "borderline",
    "risk_label": "경계 구간",
    "inputs": {
      "age": 50,
      "gender": "남",
      "total_cholesterol": 220.0,
      "hdl": 39.0,
      "sbp": 138.0,
      "smoker": false,
      "diabetes": false,
      "on_bp_medication": false
    },
    "scenarios": [
      {
        "name": "수축기혈압이 120이라면",
        "risk_percent": 4.6,
        "delta": -1.2
      },
      {
        "name": "HDL이 60이라면",
        "risk_percent": 3.7,
        "delta": -2.1
      }
    ],
    "method": "Pooled Cohort Equations (2013 ACC/AHA)",
    "limitations": [
      "이 식은 미국 코호트에서 만들어졌으며 한국인에서는 위험도를 실제보다 높게 추정하는 경향이 보고되었습니다.",
      "국내 진료지침은 이 식을 한국인에게 그대로 적용하도록 권고하지 않습니다.",
      "따라서 표시된 %는 진단이나 예측이 아니라, 수치가 달라질 때 위험이 어느 방향으로 얼마나 움직이는지 보기 위한 참고 시뮬레이션입니다.",
      "가족력·병력이 반영되지 않아 실제 위험과 다를 수 있습니다."
    ],
    "how_to_read": "절대적인 % 값보다, 아래 '무엇을 바꾸면' 항목의 변화 폭을 참고하세요."
  },
  "calculators": {
    "items": [
      {
        "key": "non_hdl_c",
        "title": "Non-HDL 콜레스테롤",
        "category": "lipid",
        "value": 181.0,
        "level": "borderline",
        "interpretation": "경계 고위험",
        "inputs": {
          "total_cholesterol": 220.0,
          "hdl": 39.0
        },
        "cutoffs": "<130 적정 / 130~159 적정상회 / 160~189 경계 / 190~219 높음 / ≥220 매우높음 (NCEP ATP III)",
        "note": "개인 목표치는 위험군에 따라 다릅니다(비-HDL 목표 = LDL 목표 + 30).",
        "formula": "Non-HDL-C = 총콜레스테롤 − HDL"
      },
      {
        "key": "castelli_1",
        "title": "Castelli 지수 I",
        "category": "lipid",
        "value": 5.64,
        "level": "high",
        "interpretation": "높음",
        "cutoffs": "<4.0 적정 / 4.0~5.0 경계 / >5.0 높음 (참고, 성별·문헌별 상이)",
        "formula": "Castelli-I = 총콜레스테롤 / HDL"
      },
      {
        "key": "castelli_2",
        "title": "Castelli 지수 II",
        "category": "lipid",
        "value": 3.72,
        "level": "high",
        "interpretation": "높음",
        "cutoffs": "<3.0 적정 / 3.0~3.5 경계 / >3.5 높음 (참고)",
        "formula": "Castelli-II = LDL / HDL"
      },
      {
        "key": "aip",
        "title": "AIP 죽상형성지수",
        "category": "lipid",
        "value": 0.299,
        "level": "high",
        "interpretation": "고위험",
        "cutoffs": "<0.11 저위험 / 0.11~0.21 중간 / >0.21 고위험 (Dobiásová)",
        "formula": "AIP = log10(TG/HDL), mmol/L 변환 적용",
        "percentile": 77.1,
        "peer_label": "한국인 50세 남성 중 상위 23%",
        "peer_n": 65260,
        "peer_year": 2017
      },
      {
        "key": "tyg",
        "title": "TyG 지수",
        "category": "insulin",
        "value": 9.21,
        "level": "high",
        "interpretation": "인슐린저항성 가능성 높음",
        "inputs": {
          "tg": 178.0,
          "fbs": 112.0
        },
        "cutoffs": "<8.5 낮음 / 8.5~8.9 경계 / ≥9.0 높음 (연구별 상이, 참고용)",
        "note": "국제 단일 진단 컷오프는 미확립이나, 한국 성인 대사증후군 스크리닝용으로 ~8.8이 반복 검증됨(Shin 2019 등). 한국인 국가검진 55세 남성 중앙값도 8.80.",
        "formula": "TyG = ln(TG × 공복혈당 / 2)  [Simental-Mendía 2008]",
        "percentile": 71.2,
        "peer_label": "한국인 50세 남성 중 상위 29%",
        "peer_n": 65272,
        "peer_year": 2017
      },
      {
        "key": "mets_ir",
        "title": "METS-IR",
        "category": "insulin",
        "value": 43.15,
        "level": "low",
        "interpretation": "참고: 인슐린저항성 낮은 편",
        "cutoffs": "참고선 ~50 (검증된 단일 컷오프 없음, 연구별 상이)",
        "formula": "METS-IR = ln(2·FPG+TG)·BMI / ln(HDL)",
        "note": "인슐린저항성 대리지표. 진단 컷오프 미확립 — 추이·참고용.",
        "percentile": 81.3,
        "peer_label": "한국인 50세 남성 중 상위 19%",
        "peer_n": 65260,
        "peer_year": 2017
      },
      {
        "key": "lap",
        "title": "LAP 지질축적산물",
        "category": "adiposity",
        "value": 56.3,
        "level": "info",
        "interpretation": "지질축적 정도(참고)",
        "cutoffs": "단일 컷오프 없음 — 집단 내 사분위로 해석",
        "formula": "LAP = (허리−65)×TG(mmol/L)",
        "note": "내장지방·대사위험 대리지표. 진단 컷오프 미확립.",
        "percentile": 78.4,
        "peer_label": "한국인 50세 남성 중 상위 22%",
        "peer_n": 65021,
        "peer_year": 2017
      },
      {
        "key": "vai",
        "title": "VAI 내장지방지수",
        "category": "adiposity",
        "value": 2.64,
        "level": "info",
        "interpretation": "내장지방 기능이상 정도(참고)",
        "cutoffs": "정상체중 건강군 ≈1.0 기준 (연령별 컷오프 필요)",
        "formula": "VAI = 성별식(WC·BMI·TG·HDL), mmol/L 변환 적용",
        "note": "내장지방 기능이상 대리지표. 연령의존 컷오프 — 참고용.",
        "percentile": 78.0,
        "peer_label": "한국인 50세 남성 중 상위 22%",
        "peer_n": 65258,
        "peer_year": 2017
      },
      {
        "key": "de_ritis",
        "title": "De Ritis 비 (AST/ALT)",
        "category": "liver",
        "value": 0.76,
        "level": "low",
        "interpretation": "비알코올성/급성 간질환 시사 (<1)",
        "cutoffs": "<1 비알코올/급성 / 1~2 중간 / >2 알코올성·진행 시사",
        "formula": "De Ritis = AST / ALT"
      },
      {
        "key": "bard",
        "title": "BARD 점수",
        "category": "liver",
        "value": 0,
        "level": "low",
        "interpretation": "진행 간섬유화 가능성 낮음 (배제 근거, NPV~96%)",
        "components": [],
        "inputs": {
          "bmi": 26.4,
          "ast": 34.0,
          "alt": 45.0,
          "ast_alt_ratio": 0.76,
          "diabetes": false
        },
        "cutoffs": "0~1 배제 쪽 / 2~4 배제 불가",
        "formula": "BARD = BMI≥28(1) + AST/ALT≥0.8(2) + 당뇨(1)  [Harrison 2008]"
      },
      {
        "key": "map",
        "title": "평균동맥압 (MAP)",
        "category": "bp",
        "value": 104.7,
        "level": "intermediate",
        "interpretation": "다소 높음",
        "cutoffs": "70~100 정상 / <70 낮음 / >110 높음 (mmHg)",
        "formula": "MAP = (SBP + 2×DBP) / 3"
      },
      {
        "key": "prevent",
        "title": "AHA PREVENT (10·30년)",
        "category": "cardiovascular",
        "value": 4.6,
        "unit": "%",
        "level": "low",
        "interpretation": "10년 심혈관(CVD) 위험 낮음",
        "value_30yr": 26.3,
        "cutoffs": "<5 낮음 / 5~7.5 경계 / 7.5~20 중간 / ≥20 높음",
        "formula": "AHA PREVENT Total CVD (Khan 2024, race-free·eGFR 반영)",
        "note": "30년 위험 26.3%. PCE 후속 모델(30~79세). 참고용, 진단 아님."
      },
      {
        "key": "framingham",
        "title": "Framingham Hard CHD (10년)",
        "category": "cardiovascular",
        "value": 7.0,
        "unit": "%",
        "level": "intermediate",
        "interpretation": "10년 관상동맥질환 위험 경계",
        "cutoffs": "<5 낮음 / 5~7.5 경계 / 7.5~20 중간 / ≥20 높음",
        "formula": "Framingham Hard CHD 10년 (Wilson 1998, MDCalc calc/38)",
        "note": "당뇨 미반영·서구 코호트 기반 참고용. 진단 아님."
      },
      {
        "key": "score2",
        "title": "SCORE2 / OP (10년)",
        "category": "cardiovascular",
        "value": 5.0,
        "unit": "%",
        "level": "intermediate",
        "interpretation": "10년 심혈관(CVD) 위험 경계",
        "cutoffs": "<5 낮음 / 5~7.5 경계 / 7.5~20 중간 / ≥20 높음",
        "formula": "SCORE2 (ESC 2021, High-risk 지역 보정)",
        "note": "유럽 모델을 한국에 High-risk 지역으로 근사한 참고값. 진단 아님."
      }
    ],
    "unavailable": [],
    "disclaimer": "검진 수치로 산출하는 선별용 참고 지표입니다. 진단을 대체하지 않으며, 컷오프는 연구·위험군에 따라 달라질 수 있습니다. 위험엔진(PREVENT·Framingham)은 서구 코호트 기반 참고용 시뮬레이션입니다."
  }
}) as unknown as RealComboAnalysis;

export const dummyRecommendations = ({
  "user_id": null,
  "user_name": null,
  "age": 50,
  "priority_messages": [
    "🚨 대사증후군에 해당합니다 (5/5개 충족). 심혈관 질환 위험이 매우 높으니 의료진 상담을 권장합니다.",
    "🩺 지방간 의심 - 간 초음파 검사 및 절주 권장."
  ],
  "recommendations": {
    "common": [
      {
        "category": "체중 조절",
        "items": [
          "정상 BMI(18.5~24.9) 유지를 목표로 합니다.",
          "체중의 5~10% 감량만으로도 대사 지표가 크게 개선됩니다."
        ]
      },
      {
        "category": "금연",
        "items": [
          "흡연은 모든 대사증후군 인자를 악화시킵니다.",
          "금연 클리닉 또는 의료진 상담을 권장합니다."
        ]
      },
      {
        "category": "절주 / 음주 관리",
        "items": [
          "남성 하루 2잔, 여성 하루 1잔 이하로 제한.",
          "주 2회 이상 금주일 유지를 권장합니다."
        ]
      },
      {
        "category": "식사 요법",
        "items": [
          "포화지방, 트랜스지방, 단순당 섭취를 줄입니다.",
          "통곡물, 채소, 과일, 견과류, 생선 위주의 식단(지중해식 권장).",
          "나트륨 섭취 1일 2,000mg 이하로 제한."
        ]
      },
      {
        "category": "운동 요법",
        "items": [
          "주 5일 이상, 1회 30분 이상 중강도 유산소 운동 (빠르게 걷기 등).",
          "주 2회 이상 근력 운동 병행.",
          "앉아 있는 시간을 최소화합니다."
        ]
      }
    ],
    "metabolic_factors": [
      {
        "factor": "복부비만",
        "title": "복부비만 관리",
        "target": "남 허리둘레 <90cm / 여 <85cm",
        "details": [
          "내장지방 감소를 위해 유산소 운동을 우선합니다.",
          "허리둘레 측정을 월 1회 시행하여 변화 추적.",
          "체중의 5% 감량 시 허리둘레가 평균 3~5cm 줄어듭니다."
        ],
        "by_medication": false,
        "reason": "허리둘레 93.0cm (기준 ≥90)"
      },
      {
        "factor": "고혈압",
        "title": "혈압 관리",
        "target": "수축기 <130mmHg, 이완기 <85mmHg",
        "details": [
          "DASH 식단(저염, 채소/과일 중심) 권장.",
          "나트륨 섭취 제한 (1일 2,000mg 이하).",
          "가정 혈압 측정을 주 3회 이상 시행.",
          "약물 복용 중이라면 임의 중단 금지, 의료진 상담 필수."
        ],
        "by_medication": false,
        "reason": "혈압 138.0/88.0 (기준 ≥130/85)"
      },
      {
        "factor": "고혈당",
        "title": "혈당 관리",
        "target": "공복혈당 <100mg/dL",
        "details": [
          "단순당(설탕, 시럽, 청량음료) 제한.",
          "복합 탄수화물(현미, 잡곡) 위주 섭취.",
          "식후 30분 가벼운 걷기 권장.",
          "당뇨 약물 복용 중이라면 저혈당 증상(어지러움, 식은땀) 주의.",
          "HbA1c 추가 검사로 3개월 평균 혈당 확인 권장."
        ],
        "by_medication": false,
        "reason": "공복혈당 112.0 (기준 ≥100)"
      },
      {
        "factor": "낮은 HDL",
        "title": "HDL 콜레스테롤 관리",
        "target": "남 ≥40mg/dL, 여 ≥50mg/dL (이상적: ≥60)",
        "details": [
          "유산소 운동이 HDL 상승에 가장 효과적.",
          "오메가-3 섭취 (등푸른 생선, 견과류).",
          "트랜스지방 섭취 제한.",
          "금연 시 HDL이 평균 5~10% 상승합니다."
        ],
        "by_medication": false,
        "reason": "HDL 39.0 (기준 <40)"
      },
      {
        "factor": "고중성지방",
        "title": "중성지방 관리",
        "target": "<150mg/dL",
        "details": [
          "탄수화물/단순당 섭취 제한.",
          "알코올 섭취 제한 (TG는 음주에 매우 민감).",
          "유산소 운동 (주 150분 이상).",
          "오메가-3 보충제는 의료진과 상담 후 결정."
        ],
        "by_medication": false,
        "reason": "TG 178.0 (기준 ≥150)"
      }
    ],
    "group_specific": [
      {
        "group_id": "g_obesity",
        "title": "비만 관리",
        "details": [
          "단계적 체중 감량 (3~6개월에 5~10%).",
          "지속 가능한 식습관 변화를 우선.",
          "BMI 25 미만 도달을 목표로 설정."
        ]
      },
      {
        "group_id": "g_fatty_liver_suspect",
        "title": "지방간 관리",
        "details": [
          "체중 감량이 가장 효과적인 치료.",
          "알코올 섭취 중단/제한.",
          "간 초음파 등 추가 검사 권장.",
          "간 효소 수치를 3~6개월 후 재검사."
        ]
      }
    ],
    "medication_notes": [],
    "elderly_notes": []
  },
  "_meta": {
    "generated_at": "2026-07-25T20:53:44",
    "version": "v1 (약대 자문)",
    "disclaimer": "본 권장사항은 일반 가이드라인이며, 개인별 의료 상담을 대체할 수 없습니다."
  }
}) as unknown as RealRecommendations;

export const dummyHighlights: NonNullable<RealTimeseries['highlights']> = [
  { metric: '체질량지수(BMI)', type: '구간 상승', severity: 'high', message: '2014년 정상(22.5)에서 2024년 비만(26.3)으로, 여러 해에 걸쳐 정상→주의→위험 구간으로 올라섰어요.' },
  { metric: '허리둘레', type: '구간 상승', severity: 'high', message: '80cm에서 93cm로 늘며 복부비만 위험 구간에 들어섰어요. 대사증후군과 함께 보는 지표예요.' },
  { metric: '공복혈당', type: '구간 상승', severity: 'warn', message: '86에서 112mg/dL로 오르며 당뇨병 전단계(100~125) 구간에 진입했어요.' },
  { metric: 'HDL 콜레스테롤', type: '구간 하락', severity: 'warn', message: '54에서 39mg/dL로 낮아져 관리가 필요한 구간에 들어섰어요(높을수록 좋은 지표).' },
];
