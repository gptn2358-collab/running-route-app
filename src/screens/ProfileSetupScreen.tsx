import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Switch,
  StyleSheet,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { UserProfile } from '../types';
import { generateUserId } from '../services/userService';

interface Props {
  existing: UserProfile | null;
  onSave: (profile: UserProfile) => void;
  onBack: () => void;
}

export default function ProfileSetupScreen({ existing, onSave, onBack }: Props) {
  const [nickname, setNickname] = useState(existing?.nickname ?? '');
  const [optedIn, setOptedIn] = useState(existing?.optedInRanking ?? true);

  function handleSave() {
    const trimmed = nickname.trim();
    const id = existing?.id ?? generateUserId();
    onSave({ id, nickname: trimmed || `러너_${id.slice(-4)}`, optedInRanking: optedIn });
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
        {existing && (
          <TouchableOpacity style={s.backBtn} onPress={onBack}>
            <Text style={s.backTxt}>← 뒤로</Text>
          </TouchableOpacity>
        )}

        <Text style={s.emoji}>🏃</Text>
        <Text style={s.title}>러너 프로필</Text>
        <Text style={s.subtitle}>
          닉네임을 설정하고 매달 랭킹에{'\n'}참여해보세요!
        </Text>

        <View style={s.card}>
          <Text style={s.label}>닉네임</Text>
          <TextInput
            style={s.input}
            placeholder="예: 한강러너, 북악트레일러"
            placeholderTextColor="#555"
            value={nickname}
            onChangeText={setNickname}
            maxLength={16}
            returnKeyType="done"
          />
          <Text style={s.hint}>미입력 시 자동 생성됩니다</Text>
        </View>

        <View style={s.card}>
          <View style={s.toggleRow}>
            <View style={s.toggleInfo}>
              <Text style={s.label}>월간 랭킹 참여</Text>
              <Text style={s.toggleDesc}>
                달리기 거리가 익명 통계로 집계됩니다
              </Text>
            </View>
            <Switch
              value={optedIn}
              onValueChange={setOptedIn}
              trackColor={{ false: '#333', true: '#00C853' }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {optedIn && (
          <View style={s.infoCard}>
            <Text style={s.infoTitle}>참여 시 수집되는 정보</Text>
            <Text style={s.infoText}>• 월별 총 달리기 거리</Text>
            <Text style={s.infoText}>• 불편 경로 달리기 거리 (리뷰 제출 시)</Text>
            <Text style={s.infoText}>• 닉네임 (익명 표시)</Text>
            <Text style={s.infoNote}>개인 위치 정보는 수집되지 않습니다</Text>
          </View>
        )}

        <TouchableOpacity style={s.saveBtn} onPress={handleSave}>
          <Text style={s.saveBtnTxt}>
            {existing ? '저장하기' : '시작하기'}
          </Text>
        </TouchableOpacity>

        {!existing && (
          <TouchableOpacity style={s.skipLink} onPress={onBack}>
            <Text style={s.skipTxt}>나중에 설정하기</Text>
          </TouchableOpacity>
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
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 50 : 30,
  },
  backBtn: { marginBottom: 16 },
  backTxt: { color: '#00C853', fontSize: 15 },
  emoji: { fontSize: 56, textAlign: 'center', marginBottom: 12, marginTop: 20 },
  title: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  label: { color: '#aaa', fontSize: 12, fontWeight: '600', marginBottom: 10 },
  input: {
    backgroundColor: '#242424',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 16,
  },
  hint: { color: '#444', fontSize: 11, marginTop: 6 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleInfo: { flex: 1, paddingRight: 12 },
  toggleDesc: { color: '#555', fontSize: 12, marginTop: 4 },
  infoCard: {
    backgroundColor: '#0d2818',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1a4a2a',
  },
  infoTitle: { color: '#00C853', fontSize: 13, fontWeight: '700', marginBottom: 8 },
  infoText: { color: '#6a9a7a', fontSize: 12, marginBottom: 4 },
  infoNote: { color: '#555', fontSize: 11, marginTop: 8 },
  saveBtn: {
    backgroundColor: '#00C853',
    borderRadius: 14,
    paddingVertical: 17,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  saveBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
  skipLink: { alignItems: 'center', paddingVertical: 12 },
  skipTxt: { color: '#444', fontSize: 14 },
});
