import React, { useState, useEffect, useMemo } from 'react';
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
import { useTheme } from '../context/ThemeContext';
import { Colors } from '../theme';

interface Props {
  profile: UserProfile | null;
  onBack: () => void;
  onSetupProfile: () => void;
}

type Tab = 'long' | 'off';

const MEDAL = ['🥇', '🥈', '🥉'];

function RankRow({ entry, tab, colors }: { entry: RankingEntry; tab: Tab; colors: Colors }) {
  const medal = entry.rank <= 3 ? MEDAL[entry.rank - 1] : null;
  const valueLabel = tab === 'long'
    ? `${entry.valueKm.toFixed(1)} km`
    : `${entry.valueCount}회`;
  const row = useMemo(() => makeRowStyles(colors), [colors]);
  return (
    <View style={[row.row, entry.isCurrentUser && row.rowMe]}>
      <View style={row.rankCell}>
        {medal ? (
          <Text style={row.medal}>{medal}</Text>
        ) : (
          <Text style={row.rankNum}>{entry.rank}</Text>
        )}
      </View>
      <Text style={[row.nicknameText, entry.isCurrentUser && row.nickMe]} numberOfLines={1}>
        {entry.nickname}
        {entry.isCurrentUser && <Text style={row.meTag}> 나</Text>}
      </Text>
      <Text style={[row.valueText, entry.isCurrentUser && row.valueMe]}>
        {valueLabel}
      </Text>
    </View>
  );
}

export default function RankingScreen({ profile, onBack, onSetupProfile }: Props) {
  const [tab, setTab]       = useState<Tab>('long');
  const [ranking, setRanking] = useState<MonthlyRanking | null>(null);
  const [loading, setLoading] = useState(true);

  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

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

  const myRank = ranking
    ? (tab === 'long' ? ranking.myLongRank : ranking.myOffRank)
    : null;

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
          <ActivityIndicator color={colors.accent} style={s.loader} />
        ) : entries.length === 0 ? (
          <Text style={s.empty}>이달 기록이 아직 없습니다</Text>
        ) : (
          <View style={s.listCard}>
            {entries.map(e => <RankRow key={e.rank} entry={e} tab={tab} colors={colors} />)}
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
            {myRank ? (
              <>
                <Text style={s.myPositionLabel}>내 순위</Text>
                <Text style={s.myPositionRank}>{myRank.rank}위</Text>
                <Text style={s.myPositionKm}>
                  {'valueKm' in myRank
                    ? `${myRank.valueKm.toFixed(1)} km`
                    : `${myRank.valueCount}회`}
                </Text>
                <Text style={s.myPositionHint}>TOP 10까지 달려보세요!</Text>
              </>
            ) : (
              <Text style={s.myPositionTxt}>
                아직 이달의 기록이 없습니다.{'\n'}달리기를 완료하면 랭킹에 반영됩니다!
              </Text>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function makeRowStyles(c: Colors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: c.card3,
    },
    rowMe:        { backgroundColor: c.rowMeBg },
    rankCell:     { width: 36, alignItems: 'center' },
    medal:        { fontSize: 22 },
    rankNum:      { color: c.textMuted, fontSize: 15, fontWeight: '700' },
    nicknameText: { flex: 1, color: c.textSub, fontSize: 15, marginLeft: 4 },
    nickMe:       { color: c.accent, fontWeight: '700' },
    meTag:        { color: c.accent, fontSize: 12, fontWeight: '700' },
    valueText:    { color: c.textMuted, fontSize: 14, fontWeight: '600' },
    valueMe:      { color: c.accent },
  });
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingTop: Platform.OS === 'ios' ? 58 : 20,
      paddingHorizontal: 16,
      paddingBottom: 14,
    },
    backBtn:      { width: 40 },
    backTxt:      { color: c.accent, fontSize: 24, fontWeight: '600' },
    headerCenter: { flex: 1, alignItems: 'center' },
    headerTitle:  { color: c.text, fontSize: 18, fontWeight: '800' },
    headerSub:    { color: c.textMuted, fontSize: 12, marginTop: 2 },

    tabs: {
      flexDirection: 'row',
      marginHorizontal: 16,
      backgroundColor: c.card,
      borderRadius: 14,
      padding: 4,
      marginBottom: 16,
    },
    tab:      { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
    tabOn:    { backgroundColor: c.card2 },
    tabTxt:   { color: c.textFaint, fontSize: 14, fontWeight: '600' },
    tabTxtOn: { color: c.text },

    scroll:        { flex: 1 },
    scrollContent: { padding: 16, paddingBottom: 40 },

    descCard:    { backgroundColor: c.card, borderRadius: 16, padding: 16, marginBottom: 16 },
    descCardOff: { backgroundColor: c.offBg, borderWidth: 1, borderColor: c.offBorder },
    descTitle:   { color: c.accent, fontSize: 14, fontWeight: '700', marginBottom: 6 },
    descTitleOff: { color: '#FFD60A' },
    descText:    { color: c.textMuted, fontSize: 13, lineHeight: 20 },
    descTextOff: { color: c.textMuted, fontSize: 13, lineHeight: 20 },
    offBadge: {
      alignSelf: 'flex-start',
      backgroundColor: c.offBadgeBg,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 4,
      marginTop: 10,
    },
    offBadgeTxt: { color: '#FFD60A', fontSize: 11, fontWeight: '600' },

    championCard: {
      backgroundColor: c.rankBg,
      borderRadius: 20,
      padding: 24,
      alignItems: 'center',
      marginBottom: 16,
      borderWidth: 1,
      borderColor: c.accent,
    },
    championCardOff: {
      backgroundColor: c.offBg,
      borderColor: '#FFD60A',
    },
    championEmoji: { fontSize: 40, marginBottom: 6 },
    championLabel: { color: c.textMuted, fontSize: 12, marginBottom: 6 },
    championName:  {
      color: c.text,
      fontSize: 22,
      fontWeight: '800',
      marginBottom: 4,
      textAlign: 'center',
    },
    championValue: { color: c.accent, fontSize: 17, fontWeight: '700' },
    nickMe:        { color: c.accent, fontWeight: '700' },

    loader: { marginTop: 40 },
    empty:  { color: c.textFaint, textAlign: 'center', marginTop: 40, fontSize: 14 },

    listCard: {
      backgroundColor: c.card,
      borderRadius: 16,
      overflow: 'hidden',
      marginBottom: 16,
    },

    ctaCard: {
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 20,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
    },
    ctaTitle: { color: c.text, fontSize: 16, fontWeight: '700', marginBottom: 8 },
    ctaDesc:  {
      color: c.textMuted,
      fontSize: 13,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: 16,
    },
    ctaBtn: {
      backgroundColor: c.accent,
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 20,
    },
    ctaBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },

    myPositionCard: {
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 20,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: c.border,
    },
    myPositionLabel: { color: c.textMuted, fontSize: 12, fontWeight: '600', marginBottom: 4 },
    myPositionRank:  { color: c.accent, fontSize: 32, fontWeight: '800' },
    myPositionKm:    { color: c.textSub, fontSize: 16, fontWeight: '600', marginTop: 2, marginBottom: 8 },
    myPositionHint:  { color: c.textFaint, fontSize: 12 },
    myPositionTxt:   { color: c.textFaint, fontSize: 13, textAlign: 'center', lineHeight: 20 },
  });
}
