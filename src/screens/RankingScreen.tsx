import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { UserProfile, RankingEntry, MonthlyRanking } from '../types';
import { getMonthlyRanking, getMonthKey, formatMonthLabel } from '../services/rankingService';

interface Props {
  profile: UserProfile | null;
  onBack: () => void;
  onSetupProfile: () => void;
}

type Tab = 'long' | 'off';

const MEDAL = ['🥇', '🥈', '🥉'];

function RankRow({ entry }: { entry: RankingEntry }) {
  const medal = entry.rank <= 3 ? MEDAL[entry.rank - 1] : null;
  return (
    <View style={[s.row, entry.isCurrentUser && s.rowMe]}>
      <View style={s.rankCell}>
        {medal ? (
          <Text style={s.medal}>{medal}</Text>
        ) : (
          <Text style={s.rankNum}>{entry.rank}</Text>
        )}
      </View>
      <Text style={[s.nicknameText, entry.isCurrentUser && s.nickMe]} numberOfLines={1}>
        {entry.nickname}
        {entry.isCurrentUser && <Text style={s.meTag}> 나</Text>}
      </Text>
      <Text style={[s.valueText, entry.isCurrentUser && s.valueMe]}>
        {entry.valueKm.toFixed(1)} km
      </Text>
    </View>
  );
}

export default function RankingScreen({ profile, onBack, onSetupProfile }: Props) {
  const [tab, setTab] = useState<Tab>('long');
  const [ranking, setRanking] = useState<MonthlyRanking | null>(null);
  const [loading, setLoading] = useState(true);

  const month = getMonthKey();

  useEffect(() => {
    getMonthlyRanking(month, profile?.id ?? '').then(r => {
      setRanking(r);
      setLoading(false);
    });
  }, []);

  const entries: RankingEntry[] = ranking
    ? (tab === 'long' ? ranking.longRunner : ranking.offRunner)
    : [];

  const topEntry = entries[0] ?? null;

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={onBack} style={s.backBtn}>
          <Text style={s.backTxt}>←</Text>
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>이달의 랭킹</Text>
          <Text style={s.headerSub}>{formatMonthLabel(month)}</Text>
        </View>
        <View style={s.backBtn} />
      </View>

      {/* Tabs */}
      <View style={s.tabs}>
        <TouchableOpacity
          style={[s.tab, tab === 'long' && s.tabOn]}
          onPress={() => setTab('long')}
        >
          <Text style={[s.tabTxt, tab === 'long' && s.tabTxtOn]}>🏆 롱러너</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tab, tab === 'off' && s.tabOn]}
          onPress={() => setTab('off')}
        >
          <Text style={[s.tabTxt, tab === 'off' && s.tabTxtOn]}>🛡️ 오프러너</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>

        {/* Category explanation */}
        {tab === 'long' ? (
          <View style={s.descCard}>
            <Text style={s.descTitle}>이달의 롱러너</Text>
            <Text style={s.descText}>
              이달에 가장 많은 거리를 달린 러너입니다.{'\n'}
              꾸준한 달리기로 건강한 습관을 만들어가는 분들을 응원합니다!
            </Text>
          </View>
        ) : (
          <View style={[s.descCard, s.descCardOff]}>
            <Text style={[s.descTitle, s.descTitleOff]}>이달의 오프러너</Text>
            <Text style={[s.descText, s.descTextOff]}>
              지형이나 도로 상태가 좋지 않은 코스에서 가장 많이 달린 러너입니다.{'\n\n'}
              데이터가 부족한 구간을 달리며 서비스 개선에 기여해주셨습니다.
              컴플레인 전에 먼저 감사 인사를 전합니다. 🙏
            </Text>
            <View style={s.offBadge}>
              <Text style={s.offBadgeTxt}>리뷰 제출 시 자동 집계됩니다</Text>
            </View>
          </View>
        )}

        {/* Champion card */}
        {!loading && topEntry && (
          <View style={[s.championCard, tab === 'off' && s.championCardOff]}>
            <Text style={s.championEmoji}>{tab === 'long' ? '🏆' : '🛡️'}</Text>
            <Text style={s.championLabel}>
              {tab === 'long' ? '이달의 롱러너' : '이달의 오프러너'}
            </Text>
            <Text style={[s.championName, topEntry.isCurrentUser && s.nickMe]}>
              {topEntry.nickname}
              {topEntry.isCurrentUser ? ' (나)' : ''}
            </Text>
            <Text style={s.championValue}>{topEntry.valueKm.toFixed(1)} km</Text>
          </View>
        )}

        {/* Ranking list */}
        {loading ? (
          <ActivityIndicator color="#00C853" style={s.loader} />
        ) : entries.length === 0 ? (
          <Text style={s.empty}>이달 기록이 아직 없습니다</Text>
        ) : (
          <View style={s.listCard}>
            {entries.map(e => <RankRow key={e.rank} entry={e} />)}
          </View>
        )}

        {/* Opt-in CTA */}
        {!profile?.optedInRanking && (
          <TouchableOpacity style={s.ctaCard} onPress={onSetupProfile}>
            <Text style={s.ctaTitle}>랭킹에 참여하고 싶으신가요?</Text>
            <Text style={s.ctaDesc}>
              프로필을 설정하면 내 달리기 기록이{'\n'}
              매달 랭킹에 반영됩니다
            </Text>
            <View style={s.ctaBtn}>
              <Text style={s.ctaBtnTxt}>프로필 설정하기 →</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Current user position if not in top 10 */}
        {profile?.optedInRanking && ranking && !entries.some(e => e.isCurrentUser) && (
          <View style={s.myPositionCard}>
            <Text style={s.myPositionTxt}>
              아직 이달의 기록이 없습니다.{'\n'}달리기를 완료하면 랭킹에 반영됩니다!
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 58 : 20,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  backBtn: { width: 40 },
  backTxt: { color: '#00C853', fontSize: 24, fontWeight: '600' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  headerSub: { color: '#666', fontSize: 12, marginTop: 2 },

  tabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    padding: 4,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  tabOn: { backgroundColor: '#2a2a2a' },
  tabTxt: { color: '#555', fontSize: 14, fontWeight: '600' },
  tabTxtOn: { color: '#fff' },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },

  descCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  descCardOff: { backgroundColor: '#1a1209', borderWidth: 1, borderColor: '#3a2a0a' },
  descTitle: { color: '#00C853', fontSize: 14, fontWeight: '700', marginBottom: 6 },
  descTitleOff: { color: '#FFD60A' },
  descText: { color: '#777', fontSize: 13, lineHeight: 20 },
  descTextOff: { color: '#9a8060' },
  offBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#2a2209',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 10,
  },
  offBadgeTxt: { color: '#FFD60A', fontSize: 11, fontWeight: '600' },

  championCard: {
    backgroundColor: '#1a2a1a',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#00C853',
  },
  championCardOff: {
    backgroundColor: '#2a2210',
    borderColor: '#FFD60A',
  },
  championEmoji: { fontSize: 40, marginBottom: 6 },
  championLabel: { color: '#888', fontSize: 12, marginBottom: 6 },
  championName: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 4,
    textAlign: 'center',
  },
  championValue: { color: '#00C853', fontSize: 17, fontWeight: '700' },

  loader: { marginTop: 40 },
  empty: {
    color: '#555',
    textAlign: 'center',
    marginTop: 40,
    fontSize: 14,
  },

  listCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#242424',
  },
  rowMe: { backgroundColor: '#0d2018' },
  rankCell: { width: 36, alignItems: 'center' },
  medal: { fontSize: 22 },
  rankNum: { color: '#666', fontSize: 15, fontWeight: '700' },
  nicknameText: { flex: 1, color: '#ccc', fontSize: 15, marginLeft: 4 },
  nickMe: { color: '#00C853', fontWeight: '700' },
  meTag: { color: '#00C853', fontSize: 12, fontWeight: '700' },
  valueText: { color: '#777', fontSize: 14, fontWeight: '600' },
  valueMe: { color: '#00C853' },

  ctaCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    alignItems: 'center',
  },
  ctaTitle: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 8 },
  ctaDesc: {
    color: '#666',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  ctaBtn: {
    backgroundColor: '#00C853',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  ctaBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },

  myPositionCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  myPositionTxt: {
    color: '#555',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
});
