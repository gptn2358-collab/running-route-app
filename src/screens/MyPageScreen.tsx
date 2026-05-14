import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Switch, Platform, Alert,
} from 'react-native';
import { UserProfile, RunRecord } from '../types';
import { getUserRunHistory } from '../services/rankingService';
import { saveProfile } from '../services/userService';

interface Props {
  profile: UserProfile | null;
  onProfileChange: (p: UserProfile) => void;
  onEditProfile: () => void;
}

export default function MyPageScreen({ profile, onProfileChange, onEditProfile }: Props) {
  const [allRuns, setAllRuns] = useState<RunRecord[]>([]);

  useEffect(() => {
    getUserRunHistory(profile?.id ?? '').then(setAllRuns);
  }, [profile]);

  const totalKm = allRuns.reduce((s, r) => s + r.distanceM, 0) / 1000;
  const offRuns = allRuns.filter(r => r.isOffRun).length;

  async function toggleRanking(val: boolean) {
    if (!profile) {
      Alert.alert('프로필 없음', '먼저 프로필을 설정해주세요.');
      onEditProfile();
      return;
    }
    const updated: UserProfile = { ...profile, optedInRanking: val };
    await saveProfile(updated);
    onProfileChange(updated);
  }

  return (
    <ScrollView style={s.bg} contentContainerStyle={s.content} bounces={false}>
      {/* 헤더 */}
      <View style={s.header}>
        <Text style={s.headerTitle}>마이페이지</Text>
      </View>

      {/* 프로필 카드 */}
      <View style={s.profileCard}>
        <View style={s.avatar}>
          <Text style={s.avatarTxt}>
            {profile ? profile.nickname.charAt(0).toUpperCase() : '?'}
          </Text>
        </View>
        <View style={s.profileInfo}>
          <Text style={s.nickname}>
            {profile ? profile.nickname : '닉네임 없음'}
          </Text>
          <Text style={s.profileSub}>
            {profile ? '달리기 기록 집계 중' : '프로필을 설정해주세요'}
          </Text>
        </View>
        <TouchableOpacity style={s.editBtn} onPress={onEditProfile}>
          <Text style={s.editBtnTxt}>편집</Text>
        </TouchableOpacity>
      </View>

      {/* 누적 통계 */}
      <View style={s.statsCard}>
        <Text style={s.cardTitle}>나의 누적 기록</Text>
        <View style={s.statsRow}>
          <View style={s.statItem}>
            <Text style={s.statBig}>{allRuns.length}</Text>
            <Text style={s.statLbl}>총 달리기</Text>
          </View>
          <View style={s.statDiv} />
          <View style={s.statItem}>
            <Text style={s.statBig}>{totalKm.toFixed(1)}</Text>
            <Text style={s.statUnit}>km</Text>
            <Text style={s.statLbl}>누적 거리</Text>
          </View>
          <View style={s.statDiv} />
          <View style={s.statItem}>
            <Text style={s.statBig}>{offRuns}</Text>
            <Text style={s.statLbl}>오프코스</Text>
          </View>
        </View>
      </View>

      {/* 설정 */}
      <View style={s.sectionCard}>
        <Text style={s.cardTitle}>랭킹 설정</Text>

        <View style={s.settingRow}>
          <View style={s.settingLeft}>
            <Text style={s.settingLabel}>랭킹 참여</Text>
            <Text style={s.settingDesc}>
              달리기 기록을 커뮤니티 랭킹에 공개합니다
            </Text>
          </View>
          <Switch
            value={profile?.optedInRanking ?? false}
            onValueChange={toggleRanking}
            trackColor={{ false: '#333', true: '#00C853' }}
            thumbColor="#fff"
          />
        </View>

        {profile?.optedInRanking && (
          <View style={s.rankingOnBadge}>
            <Text style={s.rankingOnTxt}>
              🏆 랭킹 참여 중 — 달리기 기록이 매달 집계됩니다
            </Text>
          </View>
        )}
      </View>

      {/* 오프러너 설명 */}
      <View style={[s.sectionCard, s.offCard]}>
        <Text style={[s.cardTitle, s.offTitle]}>🛡️ 오프러너 뱃지란?</Text>
        <Text style={s.offDesc}>
          도로 상태나 지형이 좋지 않은 코스를 달린 거리를 집계합니다.{'\n\n'}
          데이터가 부족한 구간을 달리며 서비스 개선에 기여해주신 분들을{'\n'}
          먼저 알아보고 감사의 인사를 전하기 위한 카테고리입니다. 🙏{'\n\n'}
          리뷰 제출 시 불편사항이 있거나 평점이 낮으면 자동 집계됩니다.
        </Text>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#0f0f0f' },
  content: {
    padding: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 32,
    gap: 16,
  },

  header: { marginBottom: 4 },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: '800' },

  profileCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#00C853',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTxt: { color: '#fff', fontSize: 24, fontWeight: '800' },
  profileInfo: { flex: 1 },
  nickname: { color: '#fff', fontSize: 18, fontWeight: '700' },
  profileSub: { color: '#666', fontSize: 13, marginTop: 2 },
  editBtn: {
    backgroundColor: '#2a2a2a',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  editBtnTxt: { color: '#aaa', fontSize: 13, fontWeight: '600' },

  statsCard: { backgroundColor: '#1a1a1a', borderRadius: 20, padding: 20 },
  cardTitle: { color: '#666', fontSize: 12, fontWeight: '600', marginBottom: 16 },
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  statItem: { flex: 1, alignItems: 'center' },
  statBig: { color: '#00C853', fontSize: 24, fontWeight: '800' },
  statUnit: { color: '#555', fontSize: 12 },
  statLbl: { color: '#666', fontSize: 11, marginTop: 2 },
  statDiv: { width: 1, height: 40, backgroundColor: '#2a2a2a' },

  sectionCard: { backgroundColor: '#1a1a1a', borderRadius: 20, padding: 20 },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingLeft: { flex: 1 },
  settingLabel: { color: '#ddd', fontSize: 15, fontWeight: '600', marginBottom: 3 },
  settingDesc: { color: '#666', fontSize: 12, lineHeight: 18 },
  rankingOnBadge: {
    marginTop: 14,
    backgroundColor: '#0d2018',
    borderRadius: 10,
    padding: 12,
  },
  rankingOnTxt: { color: '#00C853', fontSize: 12, fontWeight: '600' },

  offCard: { backgroundColor: '#1a1209', borderWidth: 1, borderColor: '#3a2a0a' },
  offTitle: { color: '#FFD60A' },
  offDesc: { color: '#9a8060', fontSize: 13, lineHeight: 20 },
});
