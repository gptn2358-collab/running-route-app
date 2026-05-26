import { File, Paths } from 'expo-file-system';
import { doc, getDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import { UserProfile } from '../types';

const profileFile = () => new File(Paths.document, 'user_profile.json');

// ─── 로컬 파일 (오프라인 백업) ────────────────────────────────────

async function loadLocalProfile(): Promise<UserProfile | null> {
  try {
    const file = profileFile();
    if (!file.exists) return null;
    const raw = await file.text();
    return JSON.parse(raw) as UserProfile;
  } catch {
    return null;
  }
}

function saveLocalProfile(profile: UserProfile): void {
  profileFile().write(JSON.stringify(profile));
}

// ─── 프로필 로드/저장 (Firestore 우선, 없으면 로컬) ──────────────

export async function loadProfile(uid?: string): Promise<UserProfile | null> {
  if (uid && db) {
    try {
      const snap = await getDoc(doc(db, 'users', uid));
      if (snap.exists()) {
        const p = snap.data() as UserProfile;
        saveLocalProfile(p); // 로컬 캐시 갱신
        return p;
      }
      // Firestore에 이 uid의 프로필이 없음 → 프로필 설정 화면으로
      return null;
    } catch (e) {
      console.warn('[userService] Firestore 프로필 조회 실패:', e);
      // 오프라인 시: 로컬 캐시가 이 uid와 일치할 때만 사용
      const local = await loadLocalProfile();
      return local?.id === uid ? local : null;
    }
  }
  // uid 없음 = Firebase 미연결 로컬 모드
  return loadLocalProfile();
}

export async function saveProfile(profile: UserProfile): Promise<void> {
  saveLocalProfile(profile);
  if (db) {
    try {
      await setDoc(doc(db, 'users', profile.id), profile);
    } catch (e) {
      console.warn('[userService] Firestore 프로필 저장 실패:', e);
    }
  }
}

// 닉네임 사용 가능 여부 확인 (currentUid 본인은 제외)
export async function checkNicknameAvailable(
  nickname: string,
  currentUid?: string,
): Promise<boolean> {
  if (!db) return true; // 로컬 모드는 멀티유저 없음 — 항상 허용
  try {
    const snap = await getDocs(
      query(collection(db, 'users'), where('nickname', '==', nickname))
    );
    // 결과가 없거나, 본인 문서만 있으면 사용 가능
    return snap.docs.every(d => d.id === currentUid);
  } catch (e) {
    console.warn('[userService] 닉네임 중복 확인 실패:', e);
    return true; // 오류 시 차단하지 않음 (네트워크 불안정 대비)
  }
}

export function generateUserId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ─── Firebase Auth 유틸 ───────────────────────────────────────────

export function getCurrentUid(): string | null {
  return auth?.currentUser?.uid ?? null;
}

export async function signOut(): Promise<void> {
  if (auth) {
    const { signOut: fbSignOut } = await import('firebase/auth');
    await fbSignOut(auth);
  }
}
