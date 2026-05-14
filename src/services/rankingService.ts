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

// ─── 사용자 달리기 기록 조회 (RunHistoryScreen / MainHomeScreen 용) ─

export async function getUserRunHistory(userId: string): Promise<RunRecord[]> {
  const all = await loadLocalRecords();
  const records = userId
    ? all.filter(r => r.userId === userId)
    : all;
  return records.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

// ─── 기록 제출 ────────────────────────────────────────────────────
//
//  [Firebase 미설정] 로컬 파일에만 저장
//  [Firebase 설정됨] 로컬 저장 + Firestore에 업로드
//
//  Firestore 컬렉션 구조:
//    run_records / {runId}
//      - runId, userId, nickname, month, distanceM, isOffRun, submittedAt

export async function submitRunRecord(record: RunRecord): Promise<void> {
  // 1. 항상 로컬에 저장 (오프라인 안전망)
  await saveLocalRecord(record);

  // 2. Firebase가 설정되어 있으면 Firestore에도 업로드
  if (db) {
    try {
      await setDoc(doc(db, 'run_records', record.runId), record);
    } catch (e) {
      // 오프라인 상태라면 로컬에는 이미 저장됨 — 다음 번에 재시도 가능
      console.warn('[Ranking] Firestore 저장 실패 (오프라인?):', e);
    }
  }
}

// ─── 목 커뮤니티 데이터 (Firebase 미설정 시에만 사용) ─────────────
//
//  Firebase를 연결하면 이 데이터는 완전히 무시되고
//  Firestore의 실제 사용자 기록만으로 랭킹이 구성됩니다.

const MOCK_COMMUNITY = [
  { nickname: '한강마라토너', longKm: 47.2, offKm: 8.2  },
  { nickname: '북악트레일러', longKm: 34.8, offKm: 18.6 },
  { nickname: '서초런클럽',   longKm: 26.5, offKm: 5.9  },
  { nickname: '성수강변',     longKm: 20.3, offKm: 3.7  },
  { nickname: '이태원언덕',   longKm: 16.1, offKm: 11.2 },
  { nickname: '망원조거',     longKm: 12.4, offKm: 3.0  },
  { nickname: '잠실마스터',   longKm:  9.7, offKm: 5.8  },
  { nickname: '경리단길',     longKm:  7.3, offKm: 2.1  },
  { nickname: '여의도파워',   longKm:  5.1, offKm: 7.4  },
  { nickname: '광화문런너',   longKm:  3.2, offKm: 1.0  },
];

// ─── 랭킹 계산 ────────────────────────────────────────────────────

export async function getMonthlyRanking(
  month: string,
  currentUserId: string,
): Promise<MonthlyRanking> {

  // ── 데이터 수집 ──────────────────────────────────────────────────
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
    // Firebase 미설정 — 로컬 기록만 사용 (목 데이터와 합산)
    sourceRecords = (await loadLocalRecords()).filter(r => r.month === month);
  }

  // ── userId 별로 집계 ─────────────────────────────────────────────
  const userMap = new Map<string, { nickname: string; longKm: number; offKm: number }>();

  for (const r of sourceRecords) {
    const prev = userMap.get(r.userId) ?? { nickname: r.nickname, longKm: 0, offKm: 0 };
    prev.longKm += r.distanceM / 1000;
    if (r.isOffRun) prev.offKm += r.distanceM / 1000;
    userMap.set(r.userId, prev);
  }

  // ── 전체 목록 구성 ───────────────────────────────────────────────
  type Entry = { nickname: string; km: number; userId?: string };

  // Firebase가 연결되면 실제 사용자 데이터만 사용 (목 데이터 제거)
  // Firebase 미연결이면 목 데이터로 채워서 랭킹이 비어 보이지 않도록 함
  const baseLong: Entry[] = usingFirebase
    ? []
    : MOCK_COMMUNITY.map(m => ({ nickname: m.nickname, km: m.longKm }));

  const baseOff: Entry[] = usingFirebase
    ? []
    : MOCK_COMMUNITY.map(m => ({ nickname: m.nickname, km: m.offKm }));

  userMap.forEach((data, userId) => {
    baseLong.push({ nickname: data.nickname, km: data.longKm, userId });
    baseOff.push({ nickname: data.nickname, km: data.offKm, userId });
  });

  // ── 정렬 + 슬라이스 헬퍼 ────────────────────────────────────────
  const sortedDesc = (list: Entry[]) =>
    list.filter(e => e.km > 0).sort((a, b) => b.km - a.km);

  const toEntries = (list: Entry[]): RankingEntry[] =>
    sortedDesc(list)
      .slice(0, 10)
      .map((e, i) => ({
        rank: i + 1,
        nickname: e.nickname,
        valueKm: Math.round(e.km * 10) / 10,
        isCurrentUser: !!e.userId && e.userId === currentUserId,
      }));

  // 내가 TOP 10 밖일 때 내 순위 반환
  const findMyRank = (list: Entry[]): { rank: number; valueKm: number } | null => {
    if (!currentUserId) return null;
    const sorted = sortedDesc(list);
    const idx = sorted.findIndex(e => e.userId === currentUserId);
    if (idx === -1) return null;
    return { rank: idx + 1, valueKm: Math.round(sorted[idx].km * 10) / 10 };
  };

  return {
    month,
    longRunner: toEntries(baseLong),
    offRunner:  toEntries(baseOff),
    myLongRank: findMyRank(baseLong),
    myOffRank:  findMyRank(baseOff),
  };
}
