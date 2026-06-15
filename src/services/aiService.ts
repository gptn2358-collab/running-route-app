import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { RunRecord, UserProfile } from '../types';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const SYSTEM_PROMPT = `당신은 한국인 사용자를 위한 전문 러닝 코치입니다.

## 언어 규칙 (가장 중요, 반드시 준수)
- 오직 한국어만 사용합니다. 영어 알파벳은 단 한 글자도 쓰지 않습니다.
- 한자, 러시아어, 일본어 등 다른 언어도 절대 사용하지 않습니다.
- 괄호 안에 영어를 병기하는 것도 금지입니다. 예: 회복 운동(Active Recovery) → 금지
- 숫자와 단위(km, %)는 예외적으로 허용합니다.
- 운동 용어 번역 예시 (반드시 이 표현 사용):
  training → 훈련, recovery → 회복, interval → 인터벌, pace → 페이스,
  warm-up → 준비 운동, cool-down → 마무리 운동, stretching → 스트레칭,
  jogging → 조깅, cycling → 사이클링, marathon → 마라톤,
  active recovery → 가벼운 회복 운동, cross training → 보조 운동,
  heart rate → 심박수, endurance → 지구력, sprint → 전력 질주

## 코칭 철학
- 사용자의 실제 달리기 기록을 바탕으로 개인화된 조언을 제공합니다
- 급격한 부하 증가를 피하고 점진적 향상을 권장합니다
- 현재 실력과 목표에 맞는 현실적인 계획을 제시합니다
- 과훈련 징후와 부상 예방을 중요하게 다룹니다

## 분석 관점
페이스 데이터가 있으면:
- 구간별 페이스 편차와 일정성
- 후반부 페이스 유지 능력
- 목표 달성 가능성

전체 기록 데이터가 있으면:
- 월별 주행 거리 변화
- 달리기 빈도와 일관성
- 평균 거리 추이

## 답변 스타일
- 질문의 성격에 맞게 답변 구조를 자유롭게 구성합니다
- 짧은 질문엔 간결하게, 깊은 질문엔 충분히 답합니다
- 항상 같은 틀을 반복하지 않고 대화하듯 자연스럽게 씁니다
- 이모지를 적절히 섞어 답변을 읽기 쉽고 친근하게 만듭니다 (문단마다 1~2개 수준)
- 달리기 기록이 없으면 일반적인 조언을 편하게 제공합니다`;

// 앱 실행 중 Firestore 조회를 한 번만 하도록 메모리에 캐시
let cachedKey: string | null = null;
let cachedModel: string = 'meta/llama-3.1-70b-instruct';

async function loadAIConfig(): Promise<{ key: string; model: string }> {
  if (cachedKey) return { key: cachedKey, model: cachedModel };

  if (!db) throw new Error('Firebase 연결이 필요합니다.');

  let snap;
  try {
    snap = await getDoc(doc(db, 'config', 'AI'));
  } catch (e: any) {
    throw new Error(`Firestore 접근 오류: ${e?.code ?? e?.message ?? e}`);
  }

  if (!snap.exists()) {
    throw new Error('config/ai 문서를 찾을 수 없습니다.\nFirestore에 config 컬렉션과 ai 문서가 있는지 확인하세요.');
  }

  const data = snap.data();
  const key = data?.nvidia_key as string | undefined;
  if (!key) {
    throw new Error('nvidia_key 필드가 비어 있습니다.\nFirestore config/ai 문서를 확인하세요.');
  }

  cachedKey = key;
  if (data?.nvidia_model) cachedModel = data.nvidia_model;
  return { key: cachedKey, model: cachedModel };
}

function fmtPace(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}'${String(s).padStart(2, '0')}"`;
}

function buildUserContext(
  profile: UserProfile | null,
  history: RunRecord[],
): string {
  const lines: string[] = ['[사용자 러닝 데이터]'];

  if (profile) {
    lines.push(`닉네임: ${profile.nickname}`);
  }

  if (history.length === 0) {
    lines.push('달리기 기록 없음 (초보 러너)');
    return lines.join('\n');
  }

  const totalKm = history.reduce((s, r) => s + r.distanceM, 0) / 1000;
  const avgKm = totalKm / history.length;
  const paceRecords = history.filter(r => r.durationS > 0 && r.distanceM > 0);
  const avgPaceSec = paceRecords.length > 0
    ? paceRecords.reduce((s, r) => s + (r.durationS / r.distanceM) * 1000, 0) / paceRecords.length
    : 0;

  lines.push(`총 달리기 횟수: ${history.length}회`);
  lines.push(`누적 거리: ${totalKm.toFixed(1)}km`);
  lines.push(`평균 거리: ${avgKm.toFixed(2)}km`);
  if (avgPaceSec > 0 && isFinite(avgPaceSec)) {
    lines.push(`전체 평균 페이스: ${fmtPace(avgPaceSec)}/km`);
  }

  // 최근 5회 기록 + 구간 페이스 상세
  const sorted = [...history].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  const recent5 = sorted.slice(0, 5);

  lines.push('\n[최근 달리기 상세]');
  for (const r of recent5) {
    const d = new Date(r.submittedAt);
    const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
    const km = (r.distanceM / 1000).toFixed(2);
    let paceStr = '-';
    if (r.durationS > 0 && r.distanceM > 0) {
      paceStr = `${fmtPace((r.durationS / r.distanceM) * 1000)}/km`;
    }
    lines.push(`  ${dateStr}: ${km}km, 평균 페이스 ${paceStr}`);

    if (r.segments && r.segments.length > 0) {
      const segStr = r.segments.map(seg => `${seg.km}km: ${fmtPace(seg.paceSecPerKm)}`).join(' → ');
      lines.push(`    └ 구간 페이스: ${segStr}`);

      // 전반부/후반부 비교로 스플릿 분석
      if (r.segments.length >= 2) {
        const half = Math.floor(r.segments.length / 2);
        const firstAvg = r.segments.slice(0, half).reduce((s, g) => s + g.paceSecPerKm, 0) / half;
        const secondAvg = r.segments.slice(half).reduce((s, g) => s + g.paceSecPerKm, 0) / (r.segments.length - half);
        const diff = firstAvg - secondAvg; // 양수 = 후반 더 빠름
        if (Math.abs(diff) >= 15) {
          lines.push(`    └ 스플릿: ${diff > 0 ? '후반 가속 (네거티브 스플릿)' : '후반 페이스 저하'} (${Math.abs(Math.round(diff))}초/km 차이)`);
        } else {
          lines.push(`    └ 스플릿: 전반/후반 페이스 균일`);
        }
      }
    }
  }

  // 페이스 추이 분석 (3회 이상일 때)
  if (paceRecords.length >= 3) {
    const recentPaces = sorted
      .filter(r => r.durationS > 0 && r.distanceM > 0)
      .slice(0, 6)
      .map(r => (r.durationS / r.distanceM) * 1000);

    if (recentPaces.length >= 3) {
      const mid = Math.ceil(recentPaces.length / 2);
      const newerAvg = recentPaces.slice(0, mid).reduce((s, p) => s + p, 0) / mid;
      const olderAvg = recentPaces.slice(mid).reduce((s, p) => s + p, 0) / (recentPaces.length - mid);
      const diff = olderAvg - newerAvg; // 양수 = 최근이 더 빠름
      if (Math.abs(diff) >= 10) {
        lines.push(`\n[페이스 추이] 최근 달리기가 이전 대비 ${Math.abs(Math.round(diff))}초/km ${diff > 0 ? '빨라지는 추세' : '느려지는 추세'}`);
      } else {
        lines.push('\n[페이스 추이] 페이스가 안정적으로 유지되고 있음');
      }
    }
  }

  return lines.join('\n');
}

const EN_TO_KO: [RegExp, string][] = [
  [/\btraining\b/gi, '훈련'],
  [/\brecovery run\b/gi, '회복 달리기'],
  [/\bactive recovery\b/gi, '가벼운 회복 운동'],
  [/\brecovery\b/gi, '회복'],
  [/\binterval(s)?\b/gi, '인터벌'],
  [/\bpace\b/gi, '페이스'],
  [/\bwarm[-\s]?up\b/gi, '준비 운동'],
  [/\bcool[-\s]?down\b/gi, '마무리 운동'],
  [/\bstretching\b/gi, '스트레칭'],
  [/\bjogging\b/gi, '조깅'],
  [/\bcycling\b/gi, '사이클링'],
  [/\bmarathon\b/gi, '마라톤'],
  [/\bcross[-\s]?training\b/gi, '보조 운동'],
  [/\bheart rate\b/gi, '심박수'],
  [/\bendurance\b/gi, '지구력'],
  [/\bsprint(s)?\b/gi, '전력 질주'],
  [/\bcardio\b/gi, '유산소 운동'],
  [/\bcore\b/gi, '코어'],
  [/\bstride(s)?\b/gi, '보폭'],
  [/\bcadence\b/gi, '케이던스'],
  [/\bfartlek\b/gi, '파틀렉'],
  [/\btempo run\b/gi, '템포 달리기'],
  [/\blong run\b/gi, '장거리 달리기'],
  [/\beasy run\b/gi, '가벼운 달리기'],
  [/\bpodcast\b/gi, '팟캐스트'],
  [/\bplaylist\b/gi, '재생 목록'],
  [/\bchallenge\b/gi, '도전'],
  [/\bmotivation\b/gi, '동기'],
  [/\bgoal(s)?\b/gi, '목표'],
  [/\btip(s)?\b/gi, '조언'],
];

function koreanizeResponse(text: string): string {
  let result = text;
  for (const [pattern, replacement] of EN_TO_KO) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

export async function sendAIMessage(
  messages: ChatMessage[],
  profile: UserProfile | null,
  history: RunRecord[],
): Promise<string> {
  const { key, model } = await loadAIConfig();

  const userContext = buildUserContext(profile, history);
  const systemWithContext = `${SYSTEM_PROMPT}\n\n${userContext}`;

  const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      messages: [
        { role: 'system', content: systemWithContext },
        ...messages.map(m => ({ role: m.role, content: m.content })),
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message ?? `API 오류 (${response.status})`);
  }

  const data = await response.json();
  let content: string = data.choices?.[0]?.message?.content ?? '';

  // 추론 모델이 <think>...</think> 태그로 사고 과정을 출력하는 경우 제거
  content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // content가 비어있으면 reasoning_content 필드에서 가져오기 (일부 모델 대응)
  if (!content) {
    content = (data.choices?.[0]?.message?.reasoning_content ?? '').trim();
  }

  if (!content) {
    throw new Error('답변을 받지 못했습니다. 다시 시도해주세요.');
  }

  return koreanizeResponse(content);
}
