import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ScrollView,
} from 'react-native';
import { RunStats, UserProfile } from '../types';

interface Props {
  stats: RunStats;
  profile: UserProfile | null;
  onHome: () => void;
  onReview: () => void;
  onRanking: () => void;
}

export default function SummaryScreen({ stats, profile, onHome, onReview, onRanking }: Props) {
  const { distance, duration } = stats;

  const km = distance / 1000;
  const pace = duration > 0 && distance > 50 ? (duration / distance) * 1000 : 0;
  const calories = Math.round(km * 62); // ~62 kcal/km for average runner

  function fmtDuration(sec: number) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}시간 ${m}분 ${s}초`;
    return `${m}분 ${s}초`;
  }

  function fmtPace(secPerKm: number) {
    if (!secPerKm) return '--';
    return `${Math.floor(secPerKm / 60)}'${Math.round(secPerKm % 60).toString().padStart(2, '0')}"`;
  }

  function performanceLabel() {
    if (!pace) return '';
    if (pace < 4 * 60) return '🔥 훌륭해요! 빠른 속도입니다!';
    if (pace < 5 * 60) return '💪 훌륭한 페이스입니다!';
    if (pace < 6 * 60) return '👍 좋은 달리기였습니다!';
    return '🏃 달리기를 완주하셨습니다!';
  }

  return (
    <ScrollView
      style={s.bg}
      contentContainerStyle={s.container}
      bounces={false}
    >
      <Text style={s.emoji}>🎉</Text>
      <Text style={s.title}>달리기 완료!</Text>
      <Text style={s.perf}>{performanceLabel()}</Text>

      <View style={s.card}>
        <View style={s.row}>
          <View style={s.stat}>
            <Text style={s.big}>{km.toFixed(2)}</Text>
            <Text style={s.unit}>km</Text>
            <Text style={s.lbl}>총 거리</Text>
          </View>
          <View style={s.vDiv} />
          <View style={s.stat}>
            <Text style={s.big}>{fmtDuration(duration)}</Text>
            <Text style={s.lbl}>총 시간</Text>
          </View>
        </View>

        <View style={s.hDiv} />

        <View style={s.row}>
          <View style={s.stat}>
            <Text style={s.big}>{fmtPace(pace)}</Text>
            <Text style={s.unit}>/km</Text>
            <Text style={s.lbl}>평균 페이스</Text>
          </View>
          <View style={s.vDiv} />
          <View style={s.stat}>
            <Text style={s.big}>{calories}</Text>
            <Text style={s.unit}>kcal</Text>
            <Text style={s.lbl}>소모 칼로리</Text>
          </View>
        </View>
      </View>

      {profile?.optedInRanking && (
        <View style={s.rankingBadge}>
          <Text style={s.rankingBadgeTxt}>🏆 달리기 기록이 이달 랭킹에 반영됩니다</Text>
        </View>
      )}

      <TouchableOpacity style={s.reviewBtn} onPress={onReview}>
        <Text style={s.reviewBtnTxt}>📝  코스 리뷰 남기기</Text>
      </TouchableOpacity>

      <TouchableOpacity style={s.rankingBtn} onPress={onRanking}>
        <Text style={s.rankingBtnTxt}>🏆  이달 랭킹 보기</Text>
      </TouchableOpacity>

      <TouchableOpacity style={s.homeBtn} onPress={onHome}>
        <Text style={s.homeBtnTxt}>홈으로 돌아가기</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#0f0f0f' },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 50 : 30,
  },
  emoji: { fontSize: 52, textAlign: 'center', marginBottom: 8 },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 6,
  },
  perf: {
    color: '#888',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 32,
  },
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    padding: 24,
    marginBottom: 28,
  },
  row: { flexDirection: 'row', justifyContent: 'space-around' },
  stat: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  big: { color: '#00C853', fontSize: 26, fontWeight: '800' },
  unit: { color: '#777', fontSize: 13 },
  lbl: { color: '#666', fontSize: 12, marginTop: 4 },
  vDiv: { width: 1, backgroundColor: '#2a2a2a' },
  hDiv: { height: 1, backgroundColor: '#2a2a2a', marginVertical: 6 },
  rankingBadge: {
    backgroundColor: '#0d2818',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1a4a2a',
  },
  rankingBadgeTxt: { color: '#00C853', fontSize: 12, fontWeight: '600' },
  reviewBtn: {
    backgroundColor: '#1e1e1e',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: '#2979FF',
  },
  reviewBtnTxt: { color: '#2979FF', fontSize: 15, fontWeight: '700' },
  rankingBtn: {
    backgroundColor: '#1e1e1e',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: '#FFD60A',
  },
  rankingBtnTxt: { color: '#FFD60A', fontSize: 15, fontWeight: '700' },
  homeBtn: {
    backgroundColor: '#00C853',
    borderRadius: 14,
    paddingVertical: 17,
    alignItems: 'center',
  },
  homeBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
