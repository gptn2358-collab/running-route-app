import React, { useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Modal, Platform, Share, Alert,
} from 'react-native';
import MapView, { Polyline, Marker } from 'react-native-maps';
import { RunRecord, RouteReview, RunSegment, Coordinate } from '../types';
import { useTheme } from '../context/ThemeContext';
import { Colors } from '../theme';

interface Props {
  record: RunRecord | null;
  review: RouteReview | null;
  onClose: () => void;
}

// ─── 포맷 헬퍼 ───────────────────────────────────────────────────

function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function fmtPace(secPerKm: number): string {
  if (!secPerKm || !isFinite(secPerKm)) return "--'--\"";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}'${s.toString().padStart(2, '0')}"`;
}

function fmtDate(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()} (${weekdays[d.getDay()]})  ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function performanceLabel(pace: number): string {
  if (!pace) return '달리기를 완주하셨습니다! 🏃';
  if (pace < 4 * 60) return '🔥 엄청난 기록이에요!';
  if (pace < 5 * 60) return '💪 훌륭한 페이스입니다!';
  if (pace < 6 * 60) return '👍 좋은 달리기였어요!';
  if (pace < 7 * 60) return '🏃 꾸준히 달리셨어요!';
  return '✅ 완주를 축하해요!';
}

const ISSUE_LABEL: Record<string, string> = {
  road: '도로 상태',
  safety: '안전 위험',
  traffic: '교통 혼잡',
  lighting: '조명 부족',
  other: '기타',
};

// ─── 페이스 색상 ─────────────────────────────────────────────────

function paceColorHex(secPerKm: number, avgSecPerKm: number): string {
  if (!avgSecPerKm || avgSecPerKm <= 0) return '#2979FF';
  const ratio = secPerKm / avgSecPerKm;
  if (ratio < 0.88) return '#00C853';
  if (ratio < 0.95) return '#76FF03';
  if (ratio < 1.05) return '#FFD60A';
  if (ratio < 1.15) return '#FF9500';
  return '#FF453A';
}

// ─── 지도 데이터 계산 ────────────────────────────────────────────

function haversineM(a: Coordinate, b: Coordinate): number {
  const R = 6371000;
  const dLat = (b.latitude - a.latitude) * Math.PI / 180;
  const dLon = (b.longitude - a.longitude) * Math.PI / 180;
  const aa =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * Math.PI / 180) *
    Math.cos(b.latitude * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
}

type PaceSeg = { coords: Coordinate[]; color: string };

function buildPaceSegments(
  trail: Coordinate[],
  segments: RunSegment[],
  avgPaceSecPerKm: number,
): PaceSeg[] {
  if (trail.length < 2) return [];
  const cumDist: number[] = [0];
  for (let i = 1; i < trail.length; i++) {
    cumDist.push(cumDist[i - 1] + haversineM(trail[i - 1], trail[i]));
  }
  const paceSegs: PaceSeg[] = [];
  for (let i = 0; i < trail.length; i++) {
    const kmIdx = Math.floor(cumDist[i] / 1000);
    const seg = segments[kmIdx];
    const color = paceColorHex(
      seg ? seg.paceSecPerKm : avgPaceSecPerKm,
      avgPaceSecPerKm,
    );
    const last = paceSegs[paceSegs.length - 1];
    if (!last || last.color !== color) {
      const connPt = last ? last.coords[last.coords.length - 1] : undefined;
      paceSegs.push({ color, coords: connPt ? [connPt, trail[i]] : [trail[i]] });
    } else {
      last.coords.push(trail[i]);
    }
  }
  return paceSegs;
}

function computeRegion(trail: Coordinate[]) {
  if (trail.length === 0) {
    return { latitude: 37.5665, longitude: 126.978, latitudeDelta: 0.01, longitudeDelta: 0.01 };
  }
  const lats = trail.map(p => p.latitude);
  const lons = trail.map(p => p.longitude);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLon = Math.min(...lons), maxLon = Math.max(...lons);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * 1.4, 0.004),
    longitudeDelta: Math.max((maxLon - minLon) * 1.4, 0.004),
  };
}

// ─── 컴포넌트 ───────────────────────────────────────────────────

export default function RunDetailScreen({ record, review, onClose }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const { distanceM = 0, durationS = 0, segments = [], trail = [], startedAt } = record ?? {};
  const km       = distanceM / 1000;
  const pace     = durationS > 0 && distanceM > 50 ? (durationS / distanceM) * 1000 : 0;
  const calories = Math.round(km * 62);
  const hasTrail = trail.length >= 2;

  const region   = computeRegion(trail);
  const paceSegs = buildPaceSegments(trail, segments, pace);

  async function handleShare() {
    try {
      await Share.share({
        message:
          `🏃 달리기 기록\n` +
          `📅 ${fmtDate(startedAt)}\n` +
          `📏 거리: ${km.toFixed(2)} km\n` +
          `⏱ 시간: ${fmtDuration(durationS)}\n` +
          `⚡ 페이스: ${fmtPace(pace)} /km\n` +
          `🔥 칼로리: ${calories} kcal\n\n` +
          `#러닝 #RunningRoute`,
      });
    } catch {
      Alert.alert('공유 실패', '공유 기능을 사용할 수 없습니다.');
    }
  }

  return (
    <Modal visible={!!record} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={s.modalRoot}>
        {/* 닫기 버튼 */}
        <View style={s.topBar}>
          <Text style={s.topBarTitle}>달리기 기록</Text>
          <TouchableOpacity style={s.closeBtn} onPress={onClose}>
            <Text style={s.closeBtnTxt}>닫기</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={s.bg} contentContainerStyle={s.content} bounces={false}>

          {/* ── 헤더 ── */}
          <View style={s.header}>
            <Text style={s.perf}>{performanceLabel(pace)}</Text>
            <View style={s.dateBadge}>
              <Text style={s.dateTxt}>📅 {fmtDate(startedAt)}</Text>
            </View>
          </View>

          {/* ── 메인 거리 ── */}
          <View style={s.heroCard}>
            <Text style={s.heroNum}>{km.toFixed(2)}</Text>
            <Text style={s.heroUnit}>킬로미터</Text>
          </View>

          {/* ── 스탯 그리드 ── */}
          <View style={s.statGrid}>
            <View style={[s.statCard, s.statHalf]}>
              <Text style={s.statIcon}>⏱</Text>
              <Text style={s.statVal}>{fmtDuration(durationS)}</Text>
              <Text style={s.statLbl}>총 시간</Text>
            </View>
            <View style={[s.statCard, s.statHalf]}>
              <Text style={s.statIcon}>⚡</Text>
              <Text style={s.statVal}>{fmtPace(pace)}</Text>
              <Text style={s.statLbl}>평균 페이스</Text>
            </View>
            <View style={[s.statCard, s.statFull]}>
              <Text style={s.statIcon}>🔥</Text>
              <Text style={s.statVal}>{calories}</Text>
              <Text style={s.statUnit}>kcal</Text>
              <Text style={s.statLbl}>소모 칼로리</Text>
            </View>
          </View>

          {/* ── 경로 지도 ── */}
          <View style={s.mapCard}>
            <View style={s.mapHeader}>
              <Text style={s.mapTitle}>달린 경로</Text>
              <View style={s.mapLegend}>
                <Text style={s.legendTxt}>빠름</Text>
                <View style={s.legendBar}>
                  {['#00C853', '#76FF03', '#FFD60A', '#FF9500', '#FF453A'].map((c, i) => (
                    <View key={i} style={[s.legendSeg, { backgroundColor: c }]} />
                  ))}
                </View>
                <Text style={s.legendTxt}>느림</Text>
              </View>
            </View>
            <View style={s.mapStartEnd}>
              <View style={s.seItem}>
                <View style={[s.seDot, { backgroundColor: '#00C853' }]} />
                <Text style={s.seTxt}>시작</Text>
              </View>
              <View style={s.seItem}>
                <View style={[s.seDot, { backgroundColor: '#FF453A' }]} />
                <Text style={s.seTxt}>종료</Text>
              </View>
            </View>
            {hasTrail ? (
              <MapView
                style={s.mapView}
                region={region}
                scrollEnabled={false}
                zoomEnabled={false}
                pitchEnabled={false}
                rotateEnabled={false}
                legalLabelInsets={{ bottom: -30, right: -30, top: 0, left: 0 }}
              >
                <Polyline
                  coordinates={trail}
                  strokeColor="rgba(0,0,0,0.18)"
                  strokeWidth={10}
                  lineCap="round"
                  lineJoin="round"
                />
                {paceSegs.map((seg, i) => (
                  <Polyline
                    key={i}
                    coordinates={seg.coords}
                    strokeColor={seg.color}
                    strokeWidth={6}
                    lineCap="round"
                    lineJoin="round"
                  />
                ))}
                <Marker coordinate={trail[0]} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
                  <View style={s.markerOuter}>
                    <View style={[s.markerInner, { backgroundColor: '#00C853' }]} />
                  </View>
                </Marker>
                <Marker coordinate={trail[trail.length - 1]} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
                  <View style={s.markerOuter}>
                    <View style={[s.markerInner, { backgroundColor: '#FF453A' }]} />
                  </View>
                </Marker>
              </MapView>
            ) : (
              <View style={s.mapPlaceholder}>
                <Text style={s.mapPlaceholderTxt}>경로 데이터 없음</Text>
              </View>
            )}
          </View>

          {/* ── km 구간 기록 ── */}
          {segments.length > 0 && (
            <View style={s.splitsCard}>
              <Text style={s.splitsTitle}>구간 기록</Text>
              <View style={s.splitsHeader}>
                <Text style={[s.splitCell, s.splitKmCol, s.splitHeaderTxt]}>구간</Text>
                <Text style={[s.splitCell, s.splitPaceCol, s.splitHeaderTxt]}>페이스</Text>
                <Text style={[s.splitCell, s.splitTimeCol, s.splitHeaderTxt]}>누적 시간</Text>
              </View>
              {segments.map(seg => (
                <View key={seg.km} style={s.splitRow}>
                  <Text style={[s.splitCell, s.splitKmCol, s.splitKmTxt]}>{seg.km} km</Text>
                  <Text style={[s.splitCell, s.splitPaceCol, s.splitPaceTxt, { color: paceColorHex(seg.paceSecPerKm, pace) }]}>
                    {fmtPace(seg.paceSecPerKm)}
                  </Text>
                  <Text style={[s.splitCell, s.splitTimeCol, s.splitTimeTxt]}>
                    {fmtDuration(seg.cumulativeDurationS)}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* ── 리뷰 ── */}
          {review && (
            <View style={s.reviewCard}>
              <Text style={s.reviewTitle}>내 리뷰</Text>

              {/* 별점 */}
              <View style={s.ratingRow}>
                {[1, 2, 3, 4, 5].map(n => (
                  <Text key={n} style={[s.star, n <= review.rating ? s.starOn : s.starOff]}>
                    ★
                  </Text>
                ))}
                <Text style={s.ratingNum}>{review.rating}.0</Text>
              </View>

              {/* 이슈 */}
              {review.hasIssues && review.issues.length > 0 && (
                <View style={s.issueList}>
                  <Text style={s.issueSectionLbl}>불편 사항</Text>
                  {review.issues.map((issue, i) => (
                    <View key={i} style={s.issueItem}>
                      <View style={s.issueDot} />
                      <Text style={s.issueTxt}>
                        {ISSUE_LABEL[issue.type] ?? issue.type}
                        {issue.note ? ` — ${issue.note}` : ''}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {!review.hasIssues && (
                <Text style={s.noIssue}>불편 사항 없음</Text>
              )}
            </View>
          )}

          {/* ── 공유 버튼 ── */}
          <TouchableOpacity style={s.shareBtn} onPress={handleShare}>
            <Text style={s.shareBtnTxt}>공유하기 ↗</Text>
          </TouchableOpacity>

        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── 스타일 ──────────────────────────────────────────────────────

function makeStyles(c: Colors) {
  return StyleSheet.create({
    modalRoot: { flex: 1, backgroundColor: c.bg },

    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: Platform.OS === 'ios' ? 56 : 20,
      paddingHorizontal: 20,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      backgroundColor: c.bg,
    },
    topBarTitle: { color: c.text, fontSize: 17, fontWeight: '700' },
    closeBtn: {
      backgroundColor: c.card,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 6,
    },
    closeBtnTxt: { color: c.textSub, fontSize: 14, fontWeight: '600' },

    bg: { flex: 1, backgroundColor: c.bg },
    content: {
      padding: 20,
      paddingTop: 16,
      paddingBottom: 40,
      gap: 14,
    },

    header: { alignItems: 'center', gap: 8 },
    perf:   { color: c.textMuted, fontSize: 15 },
    dateBadge: {
      backgroundColor: c.card,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderWidth: 1,
      borderColor: c.border,
    },
    dateTxt: { color: c.textSub, fontSize: 13, fontWeight: '600' },

    heroCard: {
      backgroundColor: c.card,
      borderRadius: 24,
      paddingVertical: 28,
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: c.accentBorder,
    },
    heroNum: {
      color: c.accent, fontSize: 72, fontWeight: '900',
      lineHeight: 80, fontVariant: ['tabular-nums'] as any,
    },
    heroUnit: { color: c.textMuted, fontSize: 16, fontWeight: '600', marginTop: 4 },

    statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    statCard: {
      backgroundColor: c.card, borderRadius: 18,
      padding: 16, alignItems: 'center', gap: 3,
      borderWidth: 1, borderColor: c.border,
    },
    statHalf: { width: '47.5%', flexGrow: 1 },
    statFull: { width: '100%' },
    statIcon: { fontSize: 22, marginBottom: 4 },
    statVal:  { color: c.text, fontSize: 20, fontWeight: '800' },
    statUnit: { color: c.textFaint, fontSize: 12 },
    statLbl:  { color: c.textMuted, fontSize: 12 },

    mapCard: {
      backgroundColor: c.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: c.border,
    },
    mapHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 10,
    },
    mapTitle: { color: c.text, fontSize: 14, fontWeight: '700' },
    mapLegend: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    legendTxt: { color: c.textFaint, fontSize: 10 },
    legendBar: {
      flexDirection: 'row', width: 60, height: 6,
      borderRadius: 3, overflow: 'hidden',
    },
    legendSeg: { flex: 1 },
    mapStartEnd: {
      flexDirection: 'row', gap: 16,
      paddingHorizontal: 16, paddingBottom: 10,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    seItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    seDot:  { width: 10, height: 10, borderRadius: 5 },
    seTxt:  { color: c.textFaint, fontSize: 11 },
    mapView: {
      height: 220,
      borderBottomLeftRadius: 20,
      borderBottomRightRadius: 20,
    },
    mapPlaceholder: {
      height: 220,
      alignItems: 'center',
      justifyContent: 'center',
      borderBottomLeftRadius: 20,
      borderBottomRightRadius: 20,
      backgroundColor: c.card2,
    },
    mapPlaceholderTxt: { color: c.textFaint, fontSize: 13 },
    markerOuter: {
      width: 18, height: 18, borderRadius: 9,
      backgroundColor: 'white',
      alignItems: 'center', justifyContent: 'center',
      shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 3,
      elevation: 3,
    },
    markerInner: { width: 10, height: 10, borderRadius: 5 },

    splitsCard: {
      backgroundColor: c.card, borderRadius: 20,
      padding: 16, borderWidth: 1, borderColor: c.border,
    },
    splitsTitle: { color: c.text, fontSize: 14, fontWeight: '700', marginBottom: 12 },
    splitsHeader: {
      flexDirection: 'row', paddingBottom: 8,
      borderBottomWidth: 1, borderBottomColor: c.border, marginBottom: 4,
    },
    splitHeaderTxt: { color: c.textFaint, fontSize: 12 },
    splitRow: {
      flexDirection: 'row', paddingVertical: 9,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    splitCell:    { fontVariant: ['tabular-nums'] as any },
    splitKmCol:   { width: 60 },
    splitPaceCol: { flex: 1 },
    splitTimeCol: { width: 90, textAlign: 'right' },
    splitKmTxt:   { color: c.textMuted, fontSize: 13, fontWeight: '600' },
    splitPaceTxt: { fontSize: 14, fontWeight: '800' },
    splitTimeTxt: { color: c.textFaint, fontSize: 13 },

    reviewCard: {
      backgroundColor: c.card, borderRadius: 20,
      padding: 16, borderWidth: 1, borderColor: c.border,
      gap: 12,
    },
    reviewTitle: { color: c.text, fontSize: 14, fontWeight: '700' },
    ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    star:    { fontSize: 22 },
    starOn:  { color: '#FFD60A' },
    starOff: { color: c.card3 },
    ratingNum: { color: c.textMuted, fontSize: 14, fontWeight: '600', marginLeft: 6 },
    issueList: { gap: 8 },
    issueSectionLbl: { color: c.textFaint, fontSize: 12, fontWeight: '600' },
    issueItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    issueDot: {
      width: 6, height: 6, borderRadius: 3,
      backgroundColor: '#FF9500',
    },
    issueTxt:  { color: c.textSub, fontSize: 13 },
    noIssue:   { color: c.textFaint, fontSize: 13 },

    shareBtn: {
      backgroundColor: c.card, borderRadius: 14,
      paddingVertical: 15, alignItems: 'center',
      borderWidth: 1.5, borderColor: c.border,
    },
    shareBtnTxt: { color: c.text, fontSize: 15, fontWeight: '700' },
  });
}
