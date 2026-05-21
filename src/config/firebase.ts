import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import { initializeAuth, getReactNativePersistence, Auth } from 'firebase/auth';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';

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
  apiKey:            'AIzaSyAHgAF2AxzcsxcoEq_n9nzKWQiHCdspEWU',
  authDomain:        'running-application-480c1.firebaseapp.com',
  projectId:         'running-application-480c1',
  storageBucket:     'running-application-480c1.firebasestorage.app',
  messagingSenderId: '796011606914',
  appId:             '1:796011606914:web:a6a1e6b9e1bc91e629959b',
};

const isConfigured =
  FIREBASE_CONFIG.apiKey !== '' && FIREBASE_CONFIG.projectId !== '';

export let db: Firestore | null = null;
export let auth: Auth | null = null;

if (isConfigured) {
  const app = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
  db = getFirestore(app);
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(ReactNativeAsyncStorage),
  });
  console.log('[Firebase] Firestore + Auth 연결됨 — 멀티유저 모드');
} else {
  console.log('[Firebase] 설정값 없음 — 로컬 모드로 동작');
}

export const isFirebaseReady = isConfigured;
