import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Platform,
} from 'react-native';
import { UserProfile, RunRecord } from '../types';
import { getUserRunHistory } from '../services/rankingService';
import { getMonthlyRanking, getMonthKey, formatMonthLabel } from '../services/rankingService';

interface Props {
  profile: UserProfile | null;
  onStartRun: () => void;
}

interface MonthStats {
  runs: number;
  totalKm: number;
  totalDurationS: number;
}

function fmtKm(m: number) { return (m / 1000).toFixed(1); }

function fmtDuration(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}시간 ${m}분`;
  return `${m}분`;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 6)  return '새벽 달리기 준비됐나요? 🌙';
  if (h < 11) return '상쾌한 아침 달리기 어때요? ☀️';
  if (h < 14) return '점심 달리기로 기분 전환! 🌤️';
  if (h < 18) return '오후 달리기로 에너지 충전! 💪';
  if (h < 21) return '저녁 달리기로 하루 마무리! 🌇';
  return '야간 달리기, 안전하게 달려요! 🌃';
}

export default function MainHomeScreen({ profile, onStartRun }: Props) {
  const [monthStats, setMonthStats] = useState<MonthStats | null>(null);
  const [myLongRank, setMyLongRank] = useState<number | null>(null);

  const month = getMonthKey();

  useEffect(() => {
    (async () => {
      const history = await getUserRunHistory(profile?.id ?? '');
      const thisMonth = history.filter(r => r.month === month);

      setMonthStats({
        runs: thisMonth.length,
        totalKm: thisMonth.reduce((s, r) => s + r.distanceM, 0),
        totalDurationS: thisMonth.reduce((s, r) => s + (r.durationS ?? 0), 0),
      });

      if (profile?.optedInRanking) {
        const ranking = await getMonthlyRanking(month, profile.id);
        setMyLongRank(ranking.myLongRank?.rank ?? null);
      }
    })();
  }, [profile]);

  const today = new Date();
  const dateLabel = `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일`;

  return (
    <ScrollView style={s.bg} contentContainerStyle={s.content} bounces={false}>
      {/* 헤더 */}
      <View style={s.header}>
        <View>
          <Text style={s.dateLabel}>{dateLabel}</Text>
          <Text style={s.greetingName}>
            {profile ? `${profile.nickname}님!` : '반가워요!'}
          </Text>
          <Text style={s.greetingMsg}>{greeting()}</Text>
        </View>
      </View>

      {/* 이달의 내 달리기 */}
      <View style={s.card}>
        <Text style={s.cardTitle}>{formatMonthLabel(month)} 내 달리기</Text>
        {monthStats && monthStats.runs > 0 ? (
          <View style={s.statsRow}>
            <View style={s.statItem}>
              <Text style={s.statBig}>{monthStats.runs}</Text>
              <Text style={s.statUnit}>회</Text>
              <Text style={s.statLbl}>달리기</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statItem}>
              <Text style={s.statBig}>{fmtKm(monthStats.totalKm)}</Text>
              <Text style={s.statUnit}>km</Text>
              <Text style={s.statLbl}>총 거리</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statItem}>
              <Text style={s.statBig}>{fmtDuration(monthStats.totalDurationS)}</Text>
              <Text style={s.statLbl}>총 시간</Text>
            </View>
          </View>
        ) : (
          <Text style={s.emptyStats}>
            이달의 달리기 기록이 없습니다.{'\n'}첫 달리기를 시작해보세요! 🎯
          </Text>
        )}
      </View>

      {/* 달리기 시작 버튼 */}
      <TouchableOpacity style={s.startBtn} onPress={onStartRun} activeOpacity={0.85}>
        <Text style={s.startIcon}>🏃</Text>
        <Text style={s.startTxt}>달리기 시작</Text>
        <Text style={s.startArrow}>→</Text>
      </TouchableOpacity>

      {/* 랭킹 미리보기 */}
      {profile?.optedInRanking && (
        <View style={s.rankCard}>
          <Text style={s.rankCardTitle}>🏆 이달의 내 랭킹</Text>
          <View style={s.rankRow}>
            <Text style={s.rankLabel}>롱러너</Text>
            <Text style={s.rankValue}>
              {myLongRank != null ? `${myLongRank}위` : '기록 없음'}
            </Text>
          </View>
          <Text style={s.rankHint}>랭킹 탭에서 전체 순위를 확인하세요</Text>
        </View>
      )}

      {!profile?.optedInRanking && (
        <View style={[s.rankCard, s.rankCardInvite]}>
          <Text style={s.rankCardTitle}>🏆 랭킹에 참여해보세요!</Text>
          <Text style={s.rankHint}>
            마이페이지에서 닉네임을 설정하면{'\n'}달리기 기록이 랭킹에 반영됩니다
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#0f0f0f' },
  content: {
    padding: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 20,
    gap: 16,
  },

  header: { marginBottom: 4 },
  dateLabel: { color: '#555', fontSize: 13, marginBottom: 4 },
  greetingName: { color: '#fff', fontSize: 26, fontWeight: '800', marginBottom: 4 },
  greetingMsg: { color: '#888', fontSize: 14 },

  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    padding: 20,
  },
  cardTitle: { color: '#666', fontSize: 12, fontWeight: '600', marginBottom: 14 },

  statsRow: { flexDirection: 'row', alignItems: 'center' },
  statItem: { flex: 1, alignItems: 'center' },
  statBig: { color: '#00C853', fontSize: 24, fontWeight: '800' },
  statUnit: { color: '#555', fontSize: 12 },
  statLbl: { color: '#666', fontSize: 11, marginTop: 2 },
  statDivider: { width: 1, height: 40, backgroundColor: '#2a2a2a' },
  emptyStats: { color: '#555', fontSize: 13, lineHeight: 20, textAlign: 'center', paddingVertical: 8 },

  startBtn: {
    backgroundColor: '#00C853',
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 28,
    flexDirection: 'row',
    alignItems: 'center',
  },
  startIcon: { fontSize: 26, marginRight: 12 },
  startTxt: { flex: 1, color: '#fff', fontSize: 18, fontWeight: '800' },
  startArrow: { color: '#fff', fontSize: 20, fontWeight: '700' },

  rankCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  rankCardInvite: { borderColor: '#2a3a2a' },
  rankCardTitle: { color: '#aaa', fontSize: 13, fontWeight: '700', marginBottom: 12 },
  rankRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  rankLabel: { color: '#777', fontSize: 14 },
  rankValue: { color: '#00C853', fontSize: 14, fontWeight: '700' },
  rankHint: { color: '#444', fontSize: 12, lineHeight: 18 },
});
