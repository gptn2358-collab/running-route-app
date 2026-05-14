import { ANTHROPIC_API_KEY } from '../config/anthropic';
import { RunRecord, RunSegment, UserProfile } from '../types';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const SYSTEM_PROMPT = `당신은 전문 러닝 코치 AI입니다. 한국어로 답변하며, 사용자의 실제 달리기 데이터를 바탕으로 개인화된 조언을 제공합니다.

## 코칭 철학
- 데이터 기반: 사용자의 실제 기록(페이스, 거리, 빈도)을 분석해 구체적인 조언을 제공합니다
- 점진적 향상: 급격한 부하 증가를 피하고 10% 규칙을 지킵니다
- 개인 맞춤: 현재 실력과 목표에 맞는 현실적인 계획을 제시합니다
- 부상 예방: 과훈련 징후와 회복의 중요성을 강조합니다

## 분석 관점
페이스 데이터가 있으면:
- 구간별 페이스 편차 (일정성 분석)
- 후반부 페이스 유지 능력 (지구력 지표)
- 평균 페이스 대비 목표 페이스 가능성

전체 기록 데이터가 있으면:
- 월별 주행 거리 트렌드
- 달리기 빈도와 일관성
- 평균 거리 변화 추이

## 답변 형식
- 핵심 인사이트를 먼저 제시
- 구체적 수치와 계획 포함
- 지나치게 길지 않게 (3-5문단 이내)
- 이모지 적절히 활용해 가독성 높이기
- 질문에 직접 답하고, 관련 데이터가 없으면 일반적 조언 제공`;

function buildUserContext(
  profile: UserProfile | null,
  history: RunRecord[],
  recentSegments?: RunSegment[],
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
  const avgPaceSec = history
    .filter(r => r.durationS > 0 && r.distanceM > 0)
    .reduce((s, r) => s + (r.durationS / r.distanceM) * 1000, 0) / history.length;

  lines.push(`총 달리기 횟수: ${history.length}회`);
  lines.push(`누적 거리: ${totalKm.toFixed(1)}km`);
  lines.push(`평균 거리: ${avgKm.toFixed(2)}km`);

  if (avgPaceSec > 0 && isFinite(avgPaceSec)) {
    const m = Math.floor(avgPaceSec / 60);
    const s = Math.round(avgPaceSec % 60);
    lines.push(`평균 페이스: ${m}'${String(s).padStart(2, '0')}"/km`);
  }

  const sortedHistory = [...history].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  const recent = sortedHistory.slice(0, 5);
  if (recent.length > 0) {
    lines.push('\n[최근 기록]');
    for (const r of recent) {
      const d = new Date(r.submittedAt);
      const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
      const km = (r.distanceM / 1000).toFixed(2);
      let paceStr = '-';
      if (r.durationS > 0 && r.distanceM > 0) {
        const sec = (r.durationS / r.distanceM) * 1000;
        paceStr = `${Math.floor(sec / 60)}'${Math.round(sec % 60).toString().padStart(2, '0')}"`;
      }
      lines.push(`  ${dateStr}: ${km}km (페이스 ${paceStr}/km)`);
    }
  }

  if (recentSegments && recentSegments.length > 0) {
    lines.push('\n[최근 달리기 구간 페이스]');
    for (const seg of recentSegments) {
      const m = Math.floor(seg.paceSecPerKm / 60);
      const s = Math.round(seg.paceSecPerKm % 60);
      lines.push(`  ${seg.km}km 구간: ${m}'${String(s).padStart(2, '0')}"/km`);
    }
  }

  return lines.join('\n');
}

export async function sendAIMessage(
  messages: ChatMessage[],
  profile: UserProfile | null,
  history: RunRecord[],
  recentSegments?: RunSegment[],
): Promise<string> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('AI 코치를 사용하려면 Anthropic API 키를 설정해주세요.\nsrc/config/anthropic.ts 파일에 키를 입력하세요.');
  }

  const userContext = buildUserContext(profile, history, recentSegments);
  const systemWithContext = `${SYSTEM_PROMPT}\n\n${userContext}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 1024,
      system: systemWithContext,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    }),
  });

  const data = await response.json();
  const textBlock = data.content?.find((b: any) => b.type === 'text');
  return textBlock?.text ?? '';
}