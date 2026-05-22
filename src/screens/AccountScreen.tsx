import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Modal, Alert, ActivityIndicator,
  KeyboardAvoidingView, ScrollView, Platform,
} from 'react-native';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from 'firebase/auth';
import { auth } from '../config/firebase';

// ─── 단계 정의 ────────────────────────────────────────────────────
// info          : 이메일 + 마스킹된 비밀번호 표시
// verify        : 현재 비밀번호 입력 → Firebase 재인증
// new-password  : 새 비밀번호 + 확인 입력 → 변경 완료
type Step = 'info' | 'verify' | 'new-password';

interface Props {
  email: string;
  visible: boolean;
  onClose: () => void;
}

export default function AccountScreen({ email, visible, onClose }: Props) {
  const [step, setStep]           = useState<Step>('info');
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw]         = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew]     = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  function reset() {
    setStep('info');
    setCurrentPw('');
    setNewPw('');
    setConfirmPw('');
    setShowCurrent(false);
    setShowNew(false);
    setError('');
  }

  function handleClose() {
    reset();
    onClose();
  }

  // ── 1단계: 현재 비밀번호로 Firebase 재인증 ───────────────────────
  // Firebase는 비밀번호 변경 같은 민감한 작업 전에 반드시
  // reauthenticateWithCredential로 본인 확인을 요구합니다.
  async function handleVerify() {
    if (!currentPw) { setError('현재 비밀번호를 입력해주세요.'); return; }
    const user = auth?.currentUser;
    if (!user) { setError('로그인 정보를 찾을 수 없습니다.'); return; }

    setLoading(true);
    setError('');
    try {
      const credential = EmailAuthProvider.credential(email, currentPw);
      await reauthenticateWithCredential(user, credential);
      // 재인증 성공 → 새 비밀번호 입력 단계로
      setStep('new-password');
    } catch (e: any) {
      const code = e?.code ?? '';
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setError('현재 비밀번호가 올바르지 않습니다.');
      } else {
        setError('인증에 실패했습니다. 다시 시도해주세요.');
      }
    } finally {
      setLoading(false);
    }
  }

  // ── 2단계: 새 비밀번호로 변경 ────────────────────────────────────
  // reauthenticate 이후에만 updatePassword가 허용됩니다.
  async function handleChangePassword() {
    if (newPw.length < 6) { setError('새 비밀번호는 6자 이상이어야 합니다.'); return; }
    if (newPw !== confirmPw) { setError('새 비밀번호가 일치하지 않습니다.'); return; }
    const user = auth?.currentUser;
    if (!user) { setError('로그인 정보를 찾을 수 없습니다.'); return; }

    setLoading(true);
    setError('');
    try {
      await updatePassword(user, newPw);
      Alert.alert('변경 완료', '비밀번호가 성공적으로 변경되었습니다.');
      reset();
    } catch (e: any) {
      setError('비밀번호 변경에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={s.bg}
          contentContainerStyle={s.content}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          {/* 헤더 */}
          <View style={s.header}>
            <TouchableOpacity onPress={handleClose} style={s.backBtn}>
              <Text style={s.backTxt}>← 닫기</Text>
            </TouchableOpacity>
            <Text style={s.title}>계정 관리</Text>
          </View>

          {/* ── 공통: 이메일 표시 ──────────────────────────────── */}
          <View style={s.card}>
            <Text style={s.fieldLabel}>아이디 (이메일)</Text>
            <View style={s.fieldRow}>
              <Text style={s.fieldValue}>{email}</Text>
            </View>
            <Text style={s.fieldHint}>이메일은 변경할 수 없습니다</Text>
          </View>

          {/* ── step: info — 비밀번호 마스킹 표시 ─────────────── */}
          {step === 'info' && (
            <View style={s.card}>
              <Text style={s.fieldLabel}>비밀번호</Text>
              <View style={s.fieldRow}>
                <Text style={s.fieldValue}>••••••••</Text>
              </View>
              <TouchableOpacity
                style={s.changeBtn}
                onPress={() => { setError(''); setStep('verify'); }}
              >
                <Text style={s.changeBtnTxt}>비밀번호 변경</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── step: verify — 현재 비밀번호 확인 ─────────────── */}
          {step === 'verify' && (
            <View style={s.card}>
              <Text style={s.stepTitle}>현재 비밀번호 확인</Text>
              <Text style={s.stepDesc}>
                보안을 위해 현재 비밀번호를 먼저 입력해주세요.
              </Text>
              <View style={s.inputRow}>
                <TextInput
                  style={s.input}
                  placeholder="현재 비밀번호"
                  placeholderTextColor="#555"
                  value={currentPw}
                  onChangeText={v => { setCurrentPw(v); setError(''); }}
                  secureTextEntry={!showCurrent}
                  autoFocus
                />
                <TouchableOpacity
                  style={s.eyeBtn}
                  onPress={() => setShowCurrent(p => !p)}
                >
                  <Text style={s.eyeTxt}>{showCurrent ? '숨기기' : '보기'}</Text>
                </TouchableOpacity>
              </View>
              {!!error && <Text style={s.errorTxt}>{error}</Text>}
              <View style={s.btnRow}>
                <TouchableOpacity
                  style={s.cancelBtn}
                  onPress={() => { reset(); setStep('info'); }}
                >
                  <Text style={s.cancelBtnTxt}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.confirmBtn, loading && s.btnOff]}
                  onPress={handleVerify}
                  disabled={loading}
                >
                  {loading
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={s.confirmBtnTxt}>확인</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ── step: new-password — 새 비밀번호 입력 ─────────── */}
          {step === 'new-password' && (
            <View style={s.card}>
              <Text style={s.stepTitle}>새 비밀번호 설정</Text>
              <Text style={s.stepDesc}>6자 이상의 새 비밀번호를 입력해주세요.</Text>
              <View style={s.inputRow}>
                <TextInput
                  style={s.input}
                  placeholder="새 비밀번호 (6자 이상)"
                  placeholderTextColor="#555"
                  value={newPw}
                  onChangeText={v => { setNewPw(v); setError(''); }}
                  secureTextEntry={!showNew}
                  autoFocus
                />
                <TouchableOpacity
                  style={s.eyeBtn}
                  onPress={() => setShowNew(p => !p)}
                >
                  <Text style={s.eyeTxt}>{showNew ? '숨기기' : '보기'}</Text>
                </TouchableOpacity>
              </View>
              <TextInput
                style={[s.input, { marginTop: 10 }]}
                placeholder="새 비밀번호 확인"
                placeholderTextColor="#555"
                value={confirmPw}
                onChangeText={v => { setConfirmPw(v); setError(''); }}
                secureTextEntry
              />
              {!!error && <Text style={s.errorTxt}>{error}</Text>}
              <View style={s.btnRow}>
                <TouchableOpacity
                  style={s.cancelBtn}
                  onPress={() => { reset(); setStep('info'); }}
                >
                  <Text style={s.cancelBtnTxt}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.confirmBtn, loading && s.btnOff]}
                  onPress={handleChangePassword}
                  disabled={loading}
                >
                  {loading
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={s.confirmBtnTxt}>변경하기</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  bg: { flex: 1, backgroundColor: '#0f0f0f' },
  content: {
    padding: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 40,
    gap: 16,
  },
  header: { marginBottom: 8 },
  backBtn: { marginBottom: 12 },
  backTxt: { color: '#00C853', fontSize: 15 },
  title: { color: '#fff', fontSize: 22, fontWeight: '800' },

  card: { backgroundColor: '#1a1a1a', borderRadius: 20, padding: 20 },
  fieldLabel: { color: '#666', fontSize: 12, fontWeight: '600', marginBottom: 10 },
  fieldRow: {
    backgroundColor: '#242424',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  fieldValue: { color: '#ccc', fontSize: 16 },
  fieldHint: { color: '#444', fontSize: 11, marginTop: 8 },

  changeBtn: {
    marginTop: 14,
    backgroundColor: '#2a2a2a',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  changeBtnTxt: { color: '#00C853', fontSize: 14, fontWeight: '700' },

  stepTitle: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 6 },
  stepDesc: { color: '#666', fontSize: 13, marginBottom: 16, lineHeight: 20 },

  inputRow: { flexDirection: 'row', alignItems: 'center' },
  input: {
    flex: 1,
    backgroundColor: '#242424',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: '#fff',
    fontSize: 15,
  },
  eyeBtn: { paddingHorizontal: 12, paddingVertical: 13 },
  eyeTxt: { color: '#00C853', fontSize: 13 },

  errorTxt: { color: '#FF453A', fontSize: 13, marginTop: 10 },

  btnRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#2a2a2a',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelBtnTxt: { color: '#888', fontSize: 14, fontWeight: '600' },
  confirmBtn: {
    flex: 2,
    backgroundColor: '#00C853',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  confirmBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },
  btnOff: { opacity: 0.5 },
});
