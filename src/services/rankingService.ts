import { File, Paths } from 'expo-file-system';
import { RunRecord, RankingEntry, MonthlyRanking } from '../types';

const recordsFile = () => new File(Paths.document, 'run_records.json');

export function getMonthKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function formatMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-');
  return `${y}년 ${parseInt(m, 10)}월`;
}

// ─── Local record storage ────────────────────────────────────────

async function loadRecords(): Promise<RunRecord[]> {
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

/**
 * Submit or update a run record.
 * If a record with the same runId already exists, it is updated in place
 * (so reviewing a run can upgrade isOffRun without double-counting distance).
 *
 * NOTE: In production, replace the local write with an API call to your
 * backend (Firebase Firestore, Supabase, etc.) before the local write,
 * or remove the local write entirely if the server is the source of truth.
 */
export async function submitRunRecord(record: RunRecord): Promise<void> {
  const records = await loadRecords();
  const idx = records.findIndex(r => r.runId === record.runId);
  if (idx >= 0) {
    records[idx] = record;
  } else {
    records.push(record);
  }
  recordsFile().write(JSON.stringify(records));
}

// ─── Mock community data ─────────────────────────────────────────
// Replace this array with an API call (e.g. GET /api/rankings?month=YYYY-MM)
// to load real community data in production.

const MOCK_COMMUNITY: { nickname: string; longKm: number; offKm: number }[] = [
  { nickname: '한강마라토너', longKm: 148.3, offKm: 9.2 },
  { nickname: '북악트레일러', longKm: 102.7, offKm: 47.4 },
  { nickname: '서초런클럽', longKm: 91.5, offKm: 13.6 },
  { nickname: '성수강변', longKm: 78.0, offKm: 7.1 },
  { nickname: '이태원언덕', longKm: 66.8, offKm: 34.9 },
  { nickname: '망원조거', longKm: 61.2, offKm: 5.8 },
  { nickname: '잠실마스터', longKm: 54.4, offKm: 21.3 },
  { nickname: '경리단길', longKm: 45.9, offKm: 8.7 },
  { nickname: '여의도파워', longKm: 39.1, offKm: 25.0 },
  { nickname: '광화문런너', longKm: 31.6, offKm: 3.4 },
];

// ─── Ranking computation ─────────────────────────────────────────

export async function getMonthlyRanking(
  month: string,
  currentUserId: string,
): Promise<MonthlyRanking> {
  const records = await loadRecords();
  const monthRecords = records.filter(r => r.month === month);

  // Aggregate the current user's real data
  const userMap = new Map<string, { nickname: string; longKm: number; offKm: number }>();
  for (const r of monthRecords) {
    const prev = userMap.get(r.userId) ?? { nickname: r.nickname, longKm: 0, offKm: 0 };
    // Each runId is unique, so distanceM is counted once per run
    prev.longKm += r.distanceM / 1000;
    if (r.isOffRun) prev.offKm += r.distanceM / 1000;
    userMap.set(r.userId, prev);
  }

  type Entry = { nickname: string; km: number; userId?: string };

  const allLong: Entry[] = MOCK_COMMUNITY.map(m => ({ nickname: m.nickname, km: m.longKm }));
  const allOff: Entry[] = MOCK_COMMUNITY.map(m => ({ nickname: m.nickname, km: m.offKm }));

  userMap.forEach((data, userId) => {
    allLong.push({ nickname: data.nickname, km: data.longKm, userId });
    allOff.push({ nickname: data.nickname, km: data.offKm, userId });
  });

  const toEntries = (list: Entry[]): RankingEntry[] =>
    list
      .filter(e => e.km > 0)
      .sort((a, b) => b.km - a.km)
      .slice(0, 10)
      .map((e, i) => ({
        rank: i + 1,
        nickname: e.nickname,
        valueKm: Math.round(e.km * 10) / 10,
        isCurrentUser: !!e.userId && e.userId === currentUserId,
      }));

  return { month, longRunner: toEntries(allLong), offRunner: toEntries(allOff) };
}
