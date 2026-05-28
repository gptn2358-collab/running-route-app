import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, setDoc, deleteDoc,
  query, where, onSnapshot, arrayUnion, arrayRemove, deleteField,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { Challenge, ChallengeProgress, BattleRecord, UserProfile } from '../types';

// ─── 대결 목록 (open 상태) ─────────────────────────────────────

export async function getOpenChallenges(): Promise<Challenge[]> {
  if (!db) return [];
  try {
    // orderBy 없이 where만 사용 — 복합 인덱스 불필요, 정렬은 클라이언트에서 처리
    const snap = await getDocs(
      query(collection(db, 'challenges'), where('status', '==', 'open'))
    );
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Challenge));
    return list.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  } catch (e) {
    console.warn('[challengeService] 대결 목록 조회 실패:', e);
    return [];
  }
}

// ─── 대결 생성 ─────────────────────────────────────────────────

export async function createChallenge(
  profile: UserProfile,
  title: string,
  distanceKm: number,
  scheduledAt: string,
  maxParticipants: number,
): Promise<string | null> {
  if (!db) return null;
  try {
    const data: Omit<Challenge, 'id'> = {
      title,
      creatorId: profile.id,
      creatorNickname: profile.nickname,
      distanceKm,
      scheduledAt,
      maxParticipants,
      participants: [profile.id],
      participantNicknames: { [profile.id]: profile.nickname },
      status: 'open',
      createdAt: new Date().toISOString(),
    };
    const ref = await addDoc(collection(db, 'challenges'), data);
    return ref.id;
  } catch (e) {
    console.warn('[challengeService] 대결 생성 실패:', e);
    return null;
  }
}

// ─── 대결 참여 ─────────────────────────────────────────────────

export async function joinChallenge(
  challengeId: string,
  profile: UserProfile,
): Promise<boolean> {
  if (!db) return false;
  try {
    const ref = doc(db, 'challenges', challengeId);
    await updateDoc(ref, {
      participants: arrayUnion(profile.id),
      [`participantNicknames.${profile.id}`]: profile.nickname,
    });
    return true;
  } catch (e) {
    console.warn('[challengeService] 대결 참여 실패:', e);
    return false;
  }
}

// ─── 대결 취소 (주최자) ────────────────────────────────────────

export async function cancelChallenge(challengeId: string): Promise<boolean> {
  if (!db) return false;
  try {
    await deleteDoc(doc(db, 'challenges', challengeId));
    return true;
  } catch (e) {
    console.warn('[challengeService] 대결 취소 실패:', e);
    return false;
  }
}

// ─── 참여 취소 (참여자) ────────────────────────────────────────

export async function leaveChallenge(
  challengeId: string,
  profile: UserProfile,
): Promise<boolean> {
  if (!db) return false;
  try {
    const ref = doc(db, 'challenges', challengeId);
    await updateDoc(ref, {
      participants: arrayRemove(profile.id),
      [`participantNicknames.${profile.id}`]: deleteField(),
    });
    return true;
  } catch (e) {
    console.warn('[challengeService] 참여 취소 실패:', e);
    return false;
  }
}

// ─── 대결 상태 변경 ────────────────────────────────────────────

export async function startChallenge(challengeId: string): Promise<void> {
  if (!db) return;
  await updateDoc(doc(db, 'challenges', challengeId), { status: 'running' });
}

export async function finishChallenge(challengeId: string): Promise<void> {
  if (!db) return;
  await updateDoc(doc(db, 'challenges', challengeId), { status: 'finished' });
}

// ─── 진행 상황 업데이트 (러닝 중 5초마다) ──────────────────────

export async function updateProgress(
  challengeId: string,
  userId: string,
  nickname: string,
  distanceM: number,
  durationS: number,
  finished: boolean,
): Promise<void> {
  if (!db) return;
  const paceSecPerKm = distanceM > 0 ? (durationS / distanceM) * 1000 : 0;
  const data: ChallengeProgress = {
    userId,
    nickname,
    distanceM,
    durationS,
    paceSecPerKm,
    updatedAt: new Date().toISOString(),
    finished,
  };
  try {
    const ref = doc(db, 'challenges', challengeId, 'progress', userId);
    await setDoc(ref, data, { merge: true });
  } catch (e) {
    console.warn('[challengeService] 진행 상황 업데이트 실패:', e);
  }
}

// ─── 실시간 진행 상황 구독 ──────────────────────────────────────

export function subscribeProgress(
  challengeId: string,
  onUpdate: (entries: ChallengeProgress[]) => void,
): () => void {
  if (!db) return () => {};
  return onSnapshot(
    collection(db, 'challenges', challengeId, 'progress'),
    snap => {
      const entries = snap.docs.map(d => d.data() as ChallengeProgress);
      onUpdate(entries);
    },
    err => console.warn('[challengeService] 진행 상황 구독 실패:', err),
  );
}

// ─── 대결 전적 저장 / 조회 ─────────────────────────────────────

export async function saveBattleRecord(
  userId: string,
  record: BattleRecord,
): Promise<void> {
  if (!db) return;
  try {
    await setDoc(
      doc(db, 'users', userId, 'battleRecords', record.challengeId),
      record,
    );
  } catch (e) {
    console.warn('[challengeService] 전적 저장 실패:', e);
  }
}

export async function getUserBattleHistory(userId: string): Promise<BattleRecord[]> {
  if (!db) return [];
  try {
    const snap = await getDocs(collection(db, 'users', userId, 'battleRecords'));
    const list = snap.docs.map(d => d.data() as BattleRecord);
    return list.sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));
  } catch (e) {
    console.warn('[challengeService] 전적 조회 실패:', e);
    return [];
  }
}

// ─── 단일 대결 조회 ────────────────────────────────────────────

export async function getChallenge(challengeId: string): Promise<Challenge | null> {
  if (!db) return null;
  try {
    const snap = await getDoc(doc(db, 'challenges', challengeId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as Challenge;
  } catch {
    return null;
  }
}
