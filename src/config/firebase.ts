import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';

// ─────────────────────────────────────────────────────────────────
//  Firebase 프로젝트 설정값을 여기에 입력하세요.
//
//  설정값 위치:
//    Firebase Console (https://console.firebase.google.com)
//    → 프로젝트 선택 → ⚙️ 프로젝트 설정 → 일반 → 내 앱 → 웹 앱 추가
//    → SDK 설정 및 구성에 있는 firebaseConfig 복사
//
//  값이 비어 있으면 Firebase 없이 로컬 모드로 동작합니다.
// ─────────────────────────────────────────────────────────────────

const FIREBASE_CONFIG = {
  apiKey:            '',   // ← 붙여넣기
  authDomain:        '',   // ← 붙여넣기
  projectId:         '',   // ← 붙여넣기
  storageBucket:     '',   // ← 붙여넣기
  messagingSenderId: '',   // ← 붙여넣기
  appId:             '',   // ← 붙여넣기
};

const isConfigured =
  FIREBASE_CONFIG.apiKey !== '' && FIREBASE_CONFIG.projectId !== '';

export let db: Firestore | null = null;

if (isConfigured) {
  const app = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
  db = getFirestore(app);
  console.log('[Firebase] Firestore 연결됨 — 실제 멀티유저 랭킹 모드');
} else {
  console.log('[Firebase] 설정값 없음 — 로컬 모드로 동작');
}

export const isFirebaseReady = isConfigured;
