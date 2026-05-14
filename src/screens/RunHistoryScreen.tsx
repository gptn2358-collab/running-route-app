import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Platform, ActivityIndicator,
} from 'react-native';
import { RunRecord, UserProfile } from '../types';
import { getUserRunHistory, getMonthKey, formatMonthLabel } from '../services/rankingService';

interface Props {
  profile: UserProfile | null;
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function fmtDuration(s: number) {
  if (!s) return '-';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
}

function fmtPace(distM: number, durationS: number) {
  if (!durationS || distM < 100) return '-';
  const secPerKm = (durationS / distM) * 1000;
  return `${Math.floor(secPerKm / 60)}'${Math.round(secPerKm % 60).toString().padStart(2,'0')}"`;
}

interface MonthGroup {
  monthKey: string;
  records: RunRecord[];
  totalKm: number;
  totalDurationS: number;
}

function groupByMonth(records: RunRecord[]): MonthGroup[] {
  const map = new Map<string, RunRecord[]>();
  for (const r of records) {
    const arr = map.get(r.month) ?? [];
    arr.push(r);
    map.set(r.month, arr);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([monthKey, recs]) => ({
      monthKey,
      records: recs.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
      totalKm: recs.reduce((s, r) => s + r.distanceM, 0),
      totalDurationS: recs.reduce((s, r) => s + (r.durationS ?? 0), 0),
    }));
}

export default function RunHistoryScreen({ profile }: Props) {
  const [groups, setGroups] = useState<MonthGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getUserRunHistory(profile?.id ?? '').then(records => {
      setGroups(groupByMonth(records));
      setLoading(false);
    });
  }, [profile]);

  const allTime = groups.reduce(
    (acc, g) => ({ km: acc.km + g.totalKm, runs: acc.runs + g.records.length }),
    { km: 0, runs: 0 }
  );

  return (
    <View style={s.container}>
      {/* 헤더 */}
      <View style={s.header}>
        <Text style={s.headerTitle}>나의 러닝 기록</Text>
        <Text style={s.headerSub}>내가 달린 모든 기록</Text>
      </View>

      {loading ? (
        <ActivityIndicator color="#00C853" style={{ marginTop: 60 }} />
      ) : (
        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>

          {/* 전체 요약 */}
          {allTime.runs > 0 && (
            <View style={s.totalCard}>
              <Text style={s.totalTitle}>전체 기록 요약</Text>
              <View style={s.totalRow}>
                <View style={s.totalItem}>
                  <Text style={s.totalBig}>{allTime.runs}</Text>
                  <Text style={s.totalLbl}>총 달리기</Text>
                </View>
                <View style={s.totalDivider} />
                <View style={s.totalItem}>
                  <Text style={s.totalBig}>{(allTime.km / 1000).toFixed(1)}</Text>
                  <Text style={s.totalLbl}>총 km</Text>
                </View>
                <View style={s.totalDivider} />
                <View style={s.totalItem}>
                  <Text style={s.totalBig}>
                    {groups.length > 0
                      ? (allTime.km / allTime.runs / 1000).toFixed(1)
                      : '-'}
                  </Text>
                  <Text style={s.totalLbl}>평균 km</Text>
                </View>
              </View>
            </View>
          )}

          {/* 월별 그룹 */}
          {groups.length === 0 ? (
            <View style={s.empty}>
              <Text style={s.emptyIcon}>🏃</Text>
              <Text style={s.emptyTitle}>아직 달리기 기록이 없어요</Text>
              <Text style={s.emptyDesc}>첫 번째 달리기를 완료하면{'\n'}여기에 기록이 쌓입니다!</Text>
            </View>
          ) : (
            groups.map(group => (
              <View key={group.monthKey} style={s.monthSection}>
                {/* 월 헤더 */}
                <View style={s.monthHeader}>
                  <Text style={s.monthTitle}>{formatMonthLabel(group.monthKey)}</Text>
                  <View style={s.monthBadgeRow}>
                    <View style={s.monthBadge}>
                      <Text style={s.monthBadgeTxt}>{group.records.length}회</Text>
                    </View>
                    <View style={s.monthBadge}>
                      <Text style={s.monthBadgeTxt}>
                        {(group.totalKm / 1000).toFixed(1)} km
                      </Text>
                    </View>
                  </View>
                </View>

                {/* 개별 런 카드 */}
                <View style={s.runList}>
                  {group.records.map((r, i) => (
                    <View
                      key={r.runId}
                      style={[
                        s.runCard,
                        i < group.records.length - 1 && s.runCardBorder,
                      ]}
                    >
                      <View style={s.runLeft}>
                        <View style={s.runDateRow}>
                          <Text style={s.runDate}>{fmtDate(r.submittedAt)}</Text>
                          {r.isOffRun && (
                            <View style={s.offBadge}>
                              <Text style={s.offBadgeTxt}>오프코스</Text>
                            </View>
                          )}
                        </View>
                        <View style={s.runMetaRow}>
                          <Text style={s.runMeta}>⏱ {fmtDuration(r.durationS ?? 0)}</Text>
                          <Text style={s.runMeta}>  페이스 {fmtPace(r.distanceM, r.durationS ?? 0)}</Text>
                        </View>
                      </View>
                      <View style={s.runRight}>
                        <Text style={s.runKm}>{(r.distanceM / 1000).toFixed(2)}</Text>
                        <Text style={s.runKmUnit}>km</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },

  header: {
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: '800' },
  headerSub: { color: '#555', fontSize: 13, marginTop: 4 },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 32, gap: 16 },

  totalCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    padding: 20,
  },
  totalTitle: { color: '#666', fontSize: 12, fontWeight: '600', marginBottom: 16 },
  totalRow: { flexDirection: 'row', alignItems: 'center' },
  totalItem: { flex: 1, alignItems: 'center' },
  totalBig: { color: '#00C853', fontSize: 26, fontWeight: '800' },
  totalLbl: { color: '#666', fontSize: 11, marginTop: 4 },
  totalDivider: { width: 1, height: 40, backgroundColor: '#2a2a2a' },

  monthSection: { gap: 8 },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  monthTitle: { color: '#aaa', fontSize: 14, fontWeight: '700' },
  monthBadgeRow: { flexDirection: 'row', gap: 6 },
  monthBadge: {
    backgroundColor: '#242424',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  monthBadgeTxt: { color: '#777', fontSize: 11, fontWeight: '600' },

  runList: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    overflow: 'hidden',
  },
  runCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  runCardBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#242424',
  },
  runLeft: { flex: 1, gap: 5 },
  runDateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  runDate: { color: '#ccc', fontSize: 14, fontWeight: '600' },
  offBadge: {
    backgroundColor: '#2a1a0a',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  offBadgeTxt: { color: '#FFD60A', fontSize: 10, fontWeight: '700' },
  runMetaRow: { flexDirection: 'row', gap: 4 },
  runMeta: { color: '#555', fontSize: 12 },
  runRight: { alignItems: 'flex-end' },
  runKm: { color: '#00C853', fontSize: 22, fontWeight: '800' },
  runKmUnit: { color: '#555', fontSize: 11 },

  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyIcon: { fontSize: 52 },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  emptyDesc: { color: '#555', fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
