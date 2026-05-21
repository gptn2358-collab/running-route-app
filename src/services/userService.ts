import { File, Paths } from 'expo-file-system';
import { doc, getDoc, setDoc } from 'firebase/firestore';
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
      if (snap.exists()) return snap.data() as UserProfile;
    } catch (e) {
      console.warn('[userService] Firestore 프로필 조회 실패:', e);
    }
  }
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
