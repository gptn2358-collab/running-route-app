import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Switch, Platform, Alert,
} from 'react-native';
import { UserProfile, RunRecord, BattleRecord } from '../types';
import { getUserRunHistory } from '../services/rankingService';
import { getUserBattleHistory } from '../services/challengeService';
import { saveProfile, signOut } from '../services/userService';
import AccountScreen from './AccountScreen';

interface Props {
  profile: UserProfile | null;
  email: string;
  onProfileChange: (p: UserProfile) => void;
  onEditProfile: () => void;
}

export default function MyPageScreen({ profile, email, onProfileChange, onEditProfile }: Props) {
  const [allRuns, setAllRuns]         = useState<RunRecord[]>([]);
  const [battleHistory, setBattleHistory] = useState<BattleRecord[]>([]);
  const [showAccount, setShowAccount] = useState(false);

  function handleSignOut() {
    Alert.alert('로그아웃', '정말 로그아웃 하시겠어요?', [
      { text: '취소', style: 'cancel' },
      { text: '로그아웃', style: 'destructive', onPress: () => signOut() },
    ]);
  }

  useEffect(() => {
    getUserRunHistory(profile?.id ?? '').then(setAllRuns);
    if (profile?.id) {
      getUserBattleHistory(profile.id).then(setBattleHistory);
    }
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

      {/* 대결 전적 */}
      <View style={s.statsCard}>
        <Text style={s.cardTitle}>대결 전적</Text>
        {battleHistory.length === 0 ? (
          <Text style={s.battleEmpty}>아직 참여한 대결이 없어요</Text>
        ) : (
          <>
            {/* 요약 수치 */}
            <View style={s.statsRow}>
              <View style={s.statItem}>
                <Text style={s.statBig}>{battleHistory.length}</Text>
                <Text style={s.statLbl}>총 대결</Text>
              </View>
              <View style={s.statDiv} />
              <View style={s.statItem}>
                <Text style={[s.statBig, s.goldTxt]}>
                  {battleHistory.filter(b => b.rank === 1).length}
                </Text>
                <Text style={s.statLbl}>🥇 1등</Text>
              </View>
              <View style={s.statDiv} />
              <View style={s.statItem}>
                <Text style={s.statBig}>
                  {battleHistory.length > 0
                    ? (battleHistory.reduce((s, b) => s + b.rank, 0) / battleHistory.length).toFixed(1)
                    : '-'}
                </Text>
                <Text style={s.statLbl}>평균 순위</Text>
              </View>
            </View>

            {/* 최근 전적 목록 */}
            <View style={s.battleList}>
              {battleHistory.slice(0, 5).map(b => {
                const date = new Date(b.finishedAt);
                const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
                const rankEmoji = b.rank === 1 ? '🥇' : b.rank === 2 ? '🥈' : b.rank === 3 ? '🥉' : `${b.rank}위`;
                return (
                  <View key={b.challengeId} style={s.battleRow}>
                    <Text style={s.battleRankEmoji}>{rankEmoji}</Text>
                    <View style={s.battleInfo}>
                      <Text style={s.battleTitle} numberOfLines={1}>{b.title}</Text>
                      <Text style={s.battleSub}>
                        {b.distanceKm} km · {b.totalParticipants}명 참여 · {dateStr}
                      </Text>
                    </View>
                    <Text style={[s.battleRankNum, b.rank === 1 && s.goldTxt]}>
                      {b.rank}/{b.totalParticipants}
                    </Text>
                  </View>
                );
              })}
            </View>
          </>
        )}
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

      {/* 계정 관리 배너 */}
      <TouchableOpacity style={s.accountBanner} onPress={() => setShowAccount(true)}>
        <View style={s.accountBannerLeft}>
          <Text style={s.accountBannerTitle}>계정 관리</Text>
          <Text style={s.accountBannerSub}>
            {email ? email : '아이디 · 비밀번호 변경'}
          </Text>
        </View>
        <Text style={s.accountBannerArrow}>›</Text>
      </TouchableOpacity>

      {/* AccountScreen 모달 */}
      <AccountScreen
        email={email}
        visible={showAccount}
        onClose={() => setShowAccount(false)}
      />

      {/* 로그아웃 */}
      <TouchableOpacity style={s.logoutBtn} onPress={handleSignOut}>
        <Text style={s.logoutTxt}>로그아웃</Text>
      </TouchableOpacity>

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

  goldTxt: { color: '#FFD60A' },
  battleEmpty: { color: '#444', fontSize: 13, textAlign: 'center', paddingVertical: 12 },
  battleList: { marginTop: 16, gap: 2 },
  battleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#242424',
    gap: 10,
  },
  battleRankEmoji: { fontSize: 20, width: 28, textAlign: 'center' },
  battleInfo: { flex: 1 },
  battleTitle: { color: '#ddd', fontSize: 14, fontWeight: '600' },
  battleSub: { color: '#555', fontSize: 11, marginTop: 2 },
  battleRankNum: { color: '#666', fontSize: 13, fontWeight: '700' },

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

  accountBanner: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  accountBannerLeft: { flex: 1 },
  accountBannerTitle: { color: '#ddd', fontSize: 15, fontWeight: '700' },
  accountBannerSub: { color: '#555', fontSize: 12, marginTop: 3 },
  accountBannerArrow: { color: '#444', fontSize: 22 },

  logoutBtn: {
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3a1a1a',
  },
  logoutTxt: { color: '#FF453A', fontSize: 15, fontWeight: '700' },
});
