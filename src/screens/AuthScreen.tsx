import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithCredential,
} from 'firebase/auth';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { auth } from '../config/firebase';

WebBrowser.maybeCompleteAuthSession();

// ┌─ Google OAuth 클라이언트 ID ────────────────────────────────────
// │  Firebase Console → 인증 → 로그인 제공업체 → Google → 웹 클라이언트 ID
const GOOGLE_WEB_CLIENT_ID = ''; // ← 입력 필요
// └───────────────────────────────────────────────────────────────

interface Props {
  onSuccess: () => void;
}

type Mode = 'login' | 'signup' | 'reset';

const AUTH_ERRORS: Record<string, string> = {
  'auth/email-already-in-use': '이미 사용 중인 이메일입니다.',
  'auth/user-not-found':       '등록되지 않은 이메일입니다.',
  'auth/wrong-password':       '비밀번호가 올바르지 않습니다.',
  'auth/invalid-email':        '올바른 이메일 형식이 아닙니다.',
  'auth/weak-password':        '비밀번호는 6자 이상이어야 합니다.',
  'auth/invalid-credential':   '이메일 또는 비밀번호가 올바르지 않습니다.',
};

export default function AuthScreen({ onSuccess }: Props) {
  const [mode, setMode]           = useState<Mode>('login');
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [resetSent, setResetSent] = useState(false);

  const [, googleResponse, promptGoogleAsync] = Google.useAuthRequest(
    GOOGLE_WEB_CLIENT_ID
      ? { clientId: GOOGLE_WEB_CLIENT_ID }
      : { clientId: 'not-configured', androidClientId: 'not-configured', iosClientId: 'not-configured' },
  );

  useEffect(() => {
    if (googleResponse?.type === 'success') {
      const idToken = googleResponse.authentication?.idToken;
      if (idToken && auth) {
        const credential = GoogleAuthProvider.credential(idToken);
        signInWithCredential(auth, credential)
          .then(onSuccess)
          .catch(e => setError(AUTH_ERRORS[e.code] ?? e.message));
      }
    }
  }, [googleResponse]);

  async function handleEmailAuth() {
    const trimmed = email.trim();
    if (!trimmed || password.length < 6) {
      setError('이메일을 입력하고 비밀번호는 6자 이상이어야 합니다.');
      return;
    }
    if (!auth) {
      setError('Firebase가 설정되지 않았습니다. firebase.ts를 확인해주세요.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      if (mode === 'signup') {
        await createUserWithEmailAndPassword(auth, trimmed, password);
      } else {
        await signInWithEmailAndPassword(auth, trimmed, password);
      }
      onSuccess();
    } catch (e: any) {
      setError(AUTH_ERRORS[e.code] ?? e.message);
    } finally {
      setLoading(false);
    }
  }

  function handleGooglePress() {
    if (!GOOGLE_WEB_CLIENT_ID) {
      Alert.alert(
        'Google 로그인 설정 필요',
        'AuthScreen.tsx 파일의 GOOGLE_WEB_CLIENT_ID에\nGoogle OAuth 웹 클라이언트 ID를 입력해주세요.\n\n(Firebase Console → 인증 → Google → 웹 클라이언트 ID)',
      );
      return;
    }
    promptGoogleAsync();
  }

  async function handlePasswordReset() {
    const trimmed = email.trim();
    if (!trimmed) {
      setError('이메일을 입력해주세요.');
      return;
    }
    if (!auth) {
      setError('Firebase가 설정되지 않았습니다.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await sendPasswordResetEmail(auth, trimmed);
      setResetSent(true);
    } catch (e: any) {
      setError(AUTH_ERRORS[e.code] ?? '재설정 이메일 발송에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError('');
    setResetSent(false);
  }

  return (
    <KeyboardAvoidingView
      style={s.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={s.bg}
        contentContainerStyle={s.container}
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
        <Text style={s.emoji}>🏃</Text>
        <Text style={s.title}>달리기 경로 앱</Text>
        <Text style={s.subtitle}>로그인하고 랭킹에 참여해보세요</Text>

        {/* ── 비밀번호 찾기 모드 ─────────────────────────────── */}
        {mode === 'reset' ? (
          <>
            <TouchableOpacity style={s.backLink} onPress={() => switchMode('login')}>
              <Text style={s.backLinkTxt}>← 로그인으로 돌아가기</Text>
            </TouchableOpacity>

            <Text style={s.resetTitle}>비밀번호 재설정</Text>
            <Text style={s.resetDesc}>
              가입한 이메일 주소를 입력하면{'\n'}재설정 링크를 보내드립니다.
            </Text>

            {resetSent ? (
              <View style={s.sentBox}>
                <Text style={s.sentIcon}>✉️</Text>
                <Text style={s.sentTitle}>이메일을 발송했습니다</Text>
                <Text style={s.sentDesc}>
                  {email.trim()} 으로 재설정 링크를 보냈어요.{'\n'}
                  메일함을 확인해주세요. (스팸 폴더도 확인)
                </Text>
                <TouchableOpacity style={s.mainBtn} onPress={() => switchMode('login')}>
                  <Text style={s.mainBtnTxt}>로그인으로 돌아가기</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <TextInput
                  style={s.input}
                  placeholder="가입한 이메일"
                  placeholderTextColor="#555"
                  value={email}
                  onChangeText={v => { setEmail(v); setError(''); }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                />
                {!!error && <Text style={s.errorTxt}>{error}</Text>}
                <TouchableOpacity
                  style={[s.mainBtn, loading && s.mainBtnOff]}
                  onPress={handlePasswordReset}
                  disabled={loading}
                >
                  {loading
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={s.mainBtnTxt}>재설정 링크 보내기</Text>
                  }
                </TouchableOpacity>
              </>
            )}
          </>
        ) : (
          <>
            {/* 탭 */}
            <View style={s.tabs}>
              <TouchableOpacity
                style={[s.tab, mode === 'login' && s.tabOn]}
                onPress={() => switchMode('login')}
              >
                <Text style={[s.tabTxt, mode === 'login' && s.tabTxtOn]}>로그인</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.tab, mode === 'signup' && s.tabOn]}
                onPress={() => switchMode('signup')}
              >
                <Text style={[s.tabTxt, mode === 'signup' && s.tabTxtOn]}>회원가입</Text>
              </TouchableOpacity>
            </View>

            {/* 입력 */}
            <TextInput
              style={s.input}
              placeholder="이메일"
              placeholderTextColor="#555"
              value={email}
              onChangeText={v => { setEmail(v); setError(''); }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextInput
              style={s.input}
              placeholder="비밀번호 (6자 이상)"
              placeholderTextColor="#555"
              value={password}
              onChangeText={v => { setPassword(v); setError(''); }}
              secureTextEntry
            />

            {!!error && <Text style={s.errorTxt}>{error}</Text>}

            <TouchableOpacity
              style={[s.mainBtn, loading && s.mainBtnOff]}
              onPress={handleEmailAuth}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.mainBtnTxt}>{mode === 'login' ? '로그인' : '회원가입'}</Text>
              }
            </TouchableOpacity>

            {/* 비밀번호 찾기 링크 — 로그인 모드에서만 표시 */}
            {mode === 'login' && (
              <TouchableOpacity
                style={s.forgotLink}
                onPress={() => switchMode('reset')}
              >
                <Text style={s.forgotTxt}>비밀번호를 잊으셨나요?</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {/* 구분선 + Google — reset 모드 아닐 때만 */}
        {mode !== 'reset' && (
          <>
        {/* 구분선 */}
        <View style={s.dividerRow}>
          <View style={s.dividerLine} />
          <Text style={s.dividerTxt}>또는</Text>
          <View style={s.dividerLine} />
        </View>

        {/* Google */}
        <TouchableOpacity style={s.googleBtn} onPress={handleGooglePress}>
          <Text style={s.googleBtnTxt}>G  Google로 계속하기</Text>
        </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  bg: { flex: 1, backgroundColor: '#0f0f0f' },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 28,
    paddingBottom: Platform.OS === 'ios' ? 50 : 30,
  },
  emoji: { fontSize: 56, textAlign: 'center', marginBottom: 10 },
  title: {
    color: '#fff', fontSize: 26, fontWeight: '800',
    textAlign: 'center', marginBottom: 6,
  },
  subtitle: {
    color: '#666', fontSize: 14,
    textAlign: 'center', marginBottom: 32,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    padding: 4,
    marginBottom: 20,
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  tabOn: { backgroundColor: '#2a2a2a' },
  tabTxt: { color: '#555', fontSize: 14, fontWeight: '600' },
  tabTxtOn: { color: '#fff' },
  input: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 16,
    marginBottom: 12,
  },
  errorTxt: { color: '#FF453A', fontSize: 13, marginBottom: 12, textAlign: 'center' },
  mainBtn: {
    backgroundColor: '#00C853',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 20,
  },
  mainBtnOff: { opacity: 0.5 },
  mainBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 10,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#2a2a2a' },
  dividerTxt: { color: '#444', fontSize: 13 },
  googleBtn: {
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  googleBtnTxt: { color: '#ddd', fontSize: 15, fontWeight: '600' },

  forgotLink: { alignItems: 'center', paddingVertical: 12 },
  forgotTxt: { color: '#00C853', fontSize: 14 },

  backLink: { marginBottom: 24 },
  backLinkTxt: { color: '#00C853', fontSize: 14 },

  resetTitle: { color: '#fff', fontSize: 20, fontWeight: '800', marginBottom: 8 },
  resetDesc: {
    color: '#666', fontSize: 14, lineHeight: 22, marginBottom: 24,
  },

  sentBox: { alignItems: 'center', gap: 12, paddingVertical: 8 },
  sentIcon: { fontSize: 48 },
  sentTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  sentDesc: {
    color: '#888', fontSize: 14, textAlign: 'center', lineHeight: 22,
  },
});
