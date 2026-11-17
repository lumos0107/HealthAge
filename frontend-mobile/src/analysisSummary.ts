/**
 * 분석 탭 태블릿 1뎁스(①~④ 요약 카드)의 내용을 계산한다 — 화면과 결과 요약 PDF가 같이 쓴다(design-d).
 *
 * ⚠️ 여기서 새로 판단하는 값은 없다. AnalysisScreen에 있던 계산을 그대로 옮겼다.
 *    화면과 PDF가 다른 말을 하지 않도록 둘 다 이 함수 하나만 쓴다.
 * react-native를 import하지 않는다(vitest로 시험하고 PDF HTML에서도 쓰기 때문).
 */
import { metricsForReport } from './data';
import type { MetricDefinition, MetricKey, Report } from './data';
import { metricPeerRank, scoreGrade, sortByAttention } from './interpret';
import { ACTIONS, rankActions } from './lifestyleActions';
import type { Ctx } from './lifestyleActions';
import type { RealComboAnalysis, RealEgfr, RealRecommendations } from './health';

/** 지표가 몇 개 안 되는 카드의 결론 — «가장 나쁜 지표의 판정»을 그대로 쓴다.
 *
 *  ⚠️ 개수(levelSummary)는 제목의 질문에 답하지 않는다. 「간에 지방이 꼈나」에
 *  「지표 2개 중 2개가 기준 밖」은 계산 도구 이야기지 간 이야기가 아니고,
 *  판단은 배지가 이미 말한다. 백엔드가 지표마다 보내주는 판정이 실제 답이다.
 *
 *  ⚠️ 읽는 것은 `interpretation`이 아니라 `plain`이다. `interpretation`은 학회 원문
 *  라벨(「진행 간섬유화 배제 불가 (추가 평가 권장)」·「NPV~96%」)이라 2뎁스 배지에는
 *  맞지만 1뎁스 결론 문장으로는 §7(해요체·진단 단정 금지)과 축 2(전문용어 금지)에
 *  걸린다. 백엔드가 같은 dict에 해요체 한 문장을 함께 내려주고, 여기서는 그것을
 *  그대로 쓴다 — 프론트에서 다시 쓰면 지어내는 것이 된다.
 *  `plain`이 없는 계산기는 결론에 오르지 않는다(null → 카드가 결론을 안 그린다).
 *
 *  지표가 많은 카드(대사·지질 7종)에는 쓰지 않는다: 하나만 꺼내면 나머지가 묻히고,
 *  지표 이름이 전부 전문용어라 «무엇이» 그런지 1뎁스에 밝힐 수도 없다. */
const LEVEL_RANK: Record<string, number> = { very_high: 0, high: 1, moderate: 2, borderline: 2, low: 3, info: 4 };

export function worstInterpretation(items: { level: string; plain?: string | null }[]): string | null {
  const withText = items.filter((it) => it.plain);
  if (!withText.length) return null;
  const worst = [...withText].sort((a, b) => (LEVEL_RANK[a.level] ?? 9) - (LEVEL_RANK[b.level] ?? 9))[0];
  // 같은 판정이 전부면 «모두»로 묶어 하나만 말한다 — 같은 문장을 두 줄 쓰지 않는다.
  const allSame = withText.every((it) => it.plain === worst.plain);
  return allSame && withText.length > 1
    ? `${withText.length}개 지표 모두 ${worst.plain}`
    : worst.plain!;
}

export function levelSummary(levels: string[]): string | null {
  const judged = levels.filter((l) => l !== 'info');
  if (!judged.length) return null;
  const bad = judged.filter((l) => l !== 'low').length;
  // 해요체로 끝낸다(§7). 「기준 밖」처럼 명사로 끊으면 문장이 아니라 «라벨»로 읽혀
  // 카드 셋이 나란히 놓였을 때 표의 한 칸처럼 보인다.
  return bad === 0
    ? `지표 ${judged.length}개 모두 기준 안이에요`
    : `지표 ${judged.length}개 중 ${bad}개가 기준 밖이에요`;
}

const SCORE_LABEL = { 정상: '양호해요', 주의: '주의가 필요해요', 위험: '관리가 필요해요' } as const;

export type AnalysisInput = {
  report: Report;
  metricDefinitions: MetricDefinition[];
  recommendations: RealRecommendations | null;
  egfr: RealEgfr | null;
  combo: RealComboAnalysis | null;
  gender: 1 | 2;
  smoking?: 'never' | 'former' | 'current' | null;
  alcoholWeeklyG?: number | null;
};

export type AnalysisSummary = {
  score: number;
  /** components/v2 scoreTone과 같은 말(점수 70/40 경계). */
  scoreLabel: string;
  counts: { normal: number; warn: number; danger: number };
  /** 기준 밖 항목 이름, 주의 순 최대 3개 */
  focus: string[];
  /** 참고 점수가 세지 않는 신호(신장·대사증후군·심혈관·지방간·LDL 목표) */
  outsideScore: { label: string; detail: string }[];
  /** ② 검진지에 없는 값 — [라벨, 한 줄] */
  computed: [string, string][];
  /** ③ 또래 등수 상위 3 */
  peers: { key: MetricKey; name: string; rank: number }[];
  /** ④ 먼저 할 행동(행동 이름) */
  topAction: string | null;
  priorityMessage: string | null;
};

export function analysisSummary(a: AnalysisInput): AnalysisSummary {
  const { report, metricDefinitions, recommendations, egfr, combo } = a;
  const metrics = metricsForReport(report, metricDefinitions);

  const fattyLiver = combo?.fatty_liver ?? null;
  const flIndices = fattyLiver?.indices ?? null;
  const msDetail = combo?.metabolic_syndrome_detail ?? null;
  const ascvd = combo?.ascvd_simulation ?? null;
  const ldlTarget = combo?.ldl_target && !combo.ldl_target.error ? combo.ldl_target : null;
  const metabolicCalcs = (combo?.calculators?.items ?? []).filter((it) => ['lipid', 'insulin', 'adiposity', 'bp'].includes(it.category));

  // 점수 밖에 있는 신호 — 참고 점수는 '검사 항목 하나하나의 주의/위험 개수'만 감점한다.
  // 심혈관 10년 위험·대사증후군·지방간 지표·LDL 개인 목표·신장 기능은 이 점수에 전혀 들어가지 않아
  // "점수는 양호한데 아래 카드는 빨간" 상태가 구조적으로 생긴다. 그래서 점수 바로 아래 모아 보여 준다.
  const outsideScore: { label: string; detail: string }[] = [];
  if (egfr && egfr.severity !== 'normal') {
    outsideScore.push({ label: '신장 기능', detail: `${egfr.egfr} ${egfr.unit} · ${egfr.stage} ${egfr.label}` });
  }
  if (msDetail?.is_metabolic_syndrome) {
    outsideScore.push({ label: '대사증후군', detail: `5개 기준 중 ${msDetail.count}개 충족` });
  }
  // 'low'(낮은 편)만 빼고 경계 구간부터 싣는다 — 경계는 점수엔 흔적조차 없다.
  if (ascvd?.available && ascvd.risk_level && ascvd.risk_level !== 'low') {
    outsideScore.push({ label: '심혈관 10년 위험', detail: `${ascvd.risk_percent}%${ascvd.risk_label ? ` · ${ascvd.risk_label}` : ''}` });
  }
  for (const [name, idx] of [['FLI', flIndices?.fli], ['HSI', flIndices?.hsi]] as const) {
    if (idx?.level === 'high') outsideScore.push({ label: `지방간 지표 ${name}`, detail: idx.interpretation });
  }
  if (ldlTarget?.achieved === false) {
    outsideScore.push({ label: 'LDL 개인 목표', detail: `목표 ${ldlTarget.target_text}${ldlTarget.gap != null ? ` · ${ldlTarget.gap} 초과` : ''}` });
  }

  const computed = [
    egfr ? ['신장 기능', `${egfr.egfr} ${egfr.unit} · ${egfr.stage} ${egfr.label}`] : null,
    flIndices ? ['지방간 지표', worstInterpretation([flIndices.fli, flIndices.hsi].filter(Boolean) as { level: string; plain?: string | null }[])] : null,
    metabolicCalcs.length ? ['대사·지질', levelSummary(metabolicCalcs.map((it) => it.level)) ?? '계산 결과를 확인해 보세요'] : null,
    ascvd?.available ? ['심혈관 10년 위험', `${ascvd.risk_percent}% · ${ascvd.risk_label ?? '계산 완료'}`] : null,
    ldlTarget ? ['LDL 개인 목표', ldlTarget.achieved ? '목표 범위예요' : `목표 ${ldlTarget.target_text} · 현재 목표보다 높아요`] : null,
  ].filter((row): row is [string, string] => row != null);

  const peers = metrics
    .filter((m) => !m.infoOnly && typeof report.values[m.key] === 'number')
    .map((m) => ({ m, peer: metricPeerRank(m, report.values[m.key] as number) }))
    .filter((row) => row.peer != null)
    .sort((x, y) => y.peer!.rank - x.peer!.rank)
    .slice(0, 3)
    .map(({ m, peer }) => ({ key: m.key, name: m.shortName ?? m.name, rank: peer!.rank }));

  const ctx: Ctx = {
    values: report.values,
    gender: a.gender,
    weightKg: typeof report.values.weight === 'number' ? report.values.weight : null,
    smoking: a.smoking,
    alcoholWeeklyG: a.alcoholWeeklyG ?? 0,
    hypertensive: (report.values.sbp ?? 0) >= 140 || (report.values.dbp ?? 0) >= 90,
  };
  const first = rankActions(ACTIONS, ctx)[0];
  const action = first ? ACTIONS.find((x) => x.id === first.id) : null;

  return {
    score: report.score,
    scoreLabel: SCORE_LABEL[scoreGrade(report.score)],
    counts: {
      normal: metrics.filter((m) => !m.infoOnly && m.status === '정상').length,
      warn: report.manageCount,
      danger: report.trackCount,
    },
    focus: sortByAttention(metrics.filter((m) => !m.infoOnly && m.status !== '정상')).slice(0, 3).map((m) => m.shortName ?? m.name),
    outsideScore,
    computed,
    peers,
    topAction: action ? action.title(ctx) : null,
    priorityMessage: recommendations?.priority_messages?.[0] ?? null,
  };
}
