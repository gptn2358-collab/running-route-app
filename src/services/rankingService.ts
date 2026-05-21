import { File, Paths } from 'expo-file-system';
import {
  collection, doc, setDoc, getDocs, query, where,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { RunRecord, RankingEntry, MonthlyRanking } from '../types';

// ─── 날짜 유틸 ────────────────────────────────────────────────────

export function getMonthKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function formatMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-');
  return `${y}년 ${parseInt(m, 10)}월`;
}

// ─── 로컬 저장소 (오프라인 캐시 겸 Firebase 미설정 시 메인 DB) ────

const recordsFile = () => new File(Paths.document, 'run_records.json');

async function loadLocalRecords(): Promise<RunRecord[]> {
  try {
    const file = recordsFile();
    if (!file.exists) return [];
    const raw = await file.text();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveLocalRecord(record: RunRecord): Promise<void> {
  const records = await loadLocalRecords();
  const idx = records.findIndex(r => r.runId === record.runId);
  if (idx >= 0) records[idx] = record;
  else records.push(record);
  recordsFile().write(JSON.stringify(records));
}

// ─── 사용자 달리기 기록 조회 ──────────────────────────────────────

export async function getUserRunHistory(userId: string): Promise<RunRecord[]> {
  const all = await loadLocalRecords();
  const records = userId
    ? all.filter(r => r.userId === userId)
    : all;
  return records.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

// ─── 기록 제출 ────────────────────────────────────────────────────

export async function submitRunRecord(record: RunRecord): Promise<void> {
  await saveLocalRecord(record);
  if (db) {
    try {
      await setDoc(doc(db, 'run_records', record.runId), record);
    } catch (e) {
      console.warn('[Ranking] Firestore 저장 실패 (오프라인?):', e);
    }
  }
}

// ─── 목 커뮤니티 데이터 (Firebase 미설정 시에만 사용) ─────────────

const MOCK_COMMUNITY = [
  { nickname: '한강마라토너', longKm: 47.2, offCount: 3 },
  { nickname: '북악트레일러', longKm: 34.8, offCount: 8 },
  { nickname: '서초런클럽',   longKm: 26.5, offCount: 2 },
  { nickname: '성수강변',     longKm: 20.3, offCount: 1 },
  { nickname: '이태원언덕',   longKm: 16.1, offCount: 5 },
  { nickname: '망원조거',     longKm: 12.4, offCount: 1 },
  { nickname: '잠실마스터',   longKm:  9.7, offCount: 2 },
  { nickname: '경리단길',     longKm:  7.3, offCount: 0 },
  { nickname: '여의도파워',   longKm:  5.1, offCount: 3 },
  { nickname: '광화문런너',   longKm:  3.2, offCount: 0 },
];

// ─── 랭킹 계산 ────────────────────────────────────────────────────

export async function getMonthlyRanking(
  month: string,
  currentUserId: string,
): Promise<MonthlyRanking> {

  let sourceRecords: RunRecord[] = [];
  let usingFirebase = false;

  if (db) {
    try {
      const snap = await getDocs(
        query(collection(db, 'run_records'), where('month', '==', month))
      );
      sourceRecords = snap.docs.map(d => d.data() as RunRecord);
      usingFirebase = true;
    } catch (e) {
      console.warn('[Ranking] Firestore 조회 실패, 로컬 데이터로 대체:', e);
      sourceRecords = await loadLocalRecords();
    }
  } else {
    sourceRecords = (await loadLocalRecords()).filter(r => r.month === month);
  }

  // userId 별로 집계
  const userMap = new Map<string, { nickname: string; longKm: number; offCount: number }>();

  for (const r of sourceRecords) {
    const prev = userMap.get(r.userId) ?? { nickname: r.nickname, longKm: 0, offCount: 0 };
    prev.longKm += r.distanceM / 1000;
    // 오프구간을 통과한 런닝 횟수 집계 (offRunCount > 0이면 1회로 카운트)
    if (r.offRunCount > 0) prev.offCount += 1;
    userMap.set(r.userId, prev);
  }

  type LongEntry  = { nickname: string; km: number; userId?: string };
  type OffEntry   = { nickname: string; count: number; userId?: string };

  const baseLong: LongEntry[] = usingFirebase
    ? []
    : MOCK_COMMUNITY.map(m => ({ nickname: m.nickname, km: m.longKm }));

  const baseOff: OffEntry[] = usingFirebase
    ? []
    : MOCK_COMMUNITY.map(m => ({ nickname: m.nickname, count: m.offCount }));

  userMap.forEach((data, userId) => {
    baseLong.push({ nickname: data.nickname, km: data.longKm, userId });
    baseOff.push({ nickname: data.nickname, count: data.offCount, userId });
  });

  // 롱러너: km 내림차순
  const longEntries: RankingEntry[] = baseLong
    .filter(e => e.km > 0)
    .sort((a, b) => b.km - a.km)
    .slice(0, 10)
    .map((e, i) => ({
      rank: i + 1,
      nickname: e.nickname,
      valueKm: Math.round(e.km * 10) / 10,
      valueCount: 0,
      isCurrentUser: !!e.userId && e.userId === currentUserId,
    }));

  // 오프러너: 횟수 내림차순
  const offEntries: RankingEntry[] = baseOff
    .filter(e => e.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map((e, i) => ({
      rank: i + 1,
      nickname: e.nickname,
      valueKm: 0,
      valueCount: e.count,
      isCurrentUser: !!e.userId && e.userId === currentUserId,
    }));

  // 내 순위 (TOP 10 밖)
  const findMyLongRank = (): { rank: number; valueKm: number } | null => {
    if (!currentUserId) return null;
    const sorted = baseLong.filter(e => e.km > 0).sort((a, b) => b.km - a.km);
    const idx = sorted.findIndex(e => e.userId === currentUserId);
    if (idx === -1) return null;
    return { rank: idx + 1, valueKm: Math.round(sorted[idx].km * 10) / 10 };
  };

  const findMyOffRank = (): { rank: number; valueCount: number } | null => {
    if (!currentUserId) return null;
    const sorted = baseOff.filter(e => e.count > 0).sort((a, b) => b.count - a.count);
    const idx = sorted.findIndex(e => e.userId === currentUserId);
    if (idx === -1) return null;
    return { rank: idx + 1, valueCount: sorted[idx].count };
  };

  return {
    month,
    longRunner: longEntries,
    offRunner:  offEntries,
    myLongRank: findMyLongRank(),
    myOffRank:  findMyOffRank(),
  };
}
