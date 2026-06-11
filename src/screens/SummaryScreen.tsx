import React, { useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Platform, ScrollView, Share, Alert,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { RunStats, UserProfile } from '../types';
import { useTheme } from '../context/ThemeContext';
import { Colors } from '../theme';

interface Props {
  stats: RunStats;
  profile: UserProfile | null;
  onHome: () => void;
  onRanking: () => void;
}

// ─── 포맷 헬퍼 ──────────────────────────────────────────────────

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

// ─── 지도 HTML ──────────────────────────────────────────────────

function buildTrailMapHtml(trail: { latitude: number; longitude: number }[]): string {
  if (trail.length < 2) {
    return `<html><body style="margin:0;background:#f5f5f5;display:flex;align-items:center;justify-content:center;height:100%"><p style="color:#aaa;font-size:13px;font-family:sans-serif">경로 데이터 없음</p></body></html>`;
  }
  const pts = JSON.stringify(trail.map(c => [c.latitude, c.longitude]));
  const mid = trail[Math.floor(trail.length / 2)];
  return `<!DOCTYPE html><html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>*{margin:0;padding:0}html,body,#map{width:100%;height:100%;background:#f5f5f5}</style>
</head>
<body><div id="map"></div>
<script>
var map=L.map('map',{zoomControl:false,attributionControl:false,dragging:false,touchZoom:false,scrollWheelZoom:false,doubleClickZoom:false,boxZoom:false,keyboard:false})
  .setView([${mid.latitude},${mid.longitude}],15);
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',{subdomains:'abcd',maxZoom:19}).addTo(map);
var pts=${pts};
L.polyline(pts,{color:'rgba(0,87,255,0.15)',weight:14,lineCap:'round'}).addTo(map);
var line=L.polyline(pts,{color:'#0057FF',weight:5,lineCap:'round',opacity:0.95}).addTo(map);
map.fitBounds(line.getBounds(),{padding:[24,24],animate:false,maxZoom:17});
var si=L.divIcon({html:'<div style="width:13px;height:13px;border-radius:50%;background:#00C853;border:2.5px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,0.3)"></div>',className:'',iconSize:[13,13],iconAnchor:[6.5,6.5]});
var ei=L.divIcon({html:'<div style="width:13px;height:13px;border-radius:50%;background:#FF453A;border:2.5px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,0.3)"></div>',className:'',iconSize:[13,13],iconAnchor:[6.5,6.5]});
L.marker(pts[0],{icon:si}).addTo(map);
L.marker(pts[pts.length-1],{icon:ei}).addTo(map);
</script></body></html>`;
}

// ─── 컴포넌트 ───────────────────────────────────────────────────

export default function SummaryScreen({ stats, profile, onHome, onRanking }: Props) {
  const { distance, duration, segments, trail, startedAt } = stats;
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const km        = distance / 1000;
  const pace      = duration > 0 && distance > 50 ? (duration / distance) * 1000 : 0;
  const calories  = Math.round(km * 62);
  const mapHtml   = useMemo(() => buildTrailMapHtml(trail), [trail]);

  async function handleShare() {
    try {
      await Share.share({
        message:
          `🏃 달리기 완료!\n` +
          `📅 ${fmtDate(startedAt)}\n` +
          `📏 거리: ${km.toFixed(2)} km\n` +
          `⏱ 시간: ${fmtDuration(duration)}\n` +
          `🔥 페이스: ${fmtPace(pace)} /km\n` +
          `🔥 칼로리: ${calories} kcal\n\n` +
          `#러닝 #RunningRoute`,
      });
    } catch {
      Alert.alert('공유 실패', '공유 기능을 사용할 수 없습니다.');
    }
  }

  return (
    <ScrollView style={s.bg} contentContainerStyle={s.content} bounces={false}>

      {/* ── 헤더 ── */}
      <View style={s.header}>
        <Text style={s.emoji}>🎉</Text>
        <Text style={s.title}>달리기 완료!</Text>
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
        <View style={[s.statCard, s.statCardHalf]}>
          <Text style={s.statIcon}>⏱</Text>
          <Text style={s.statVal}>{fmtDuration(duration)}</Text>
          <Text style={s.statLbl}>총 시간</Text>
        </View>
        <View style={[s.statCard, s.statCardHalf]}>
          <Text style={s.statIcon}>🔥</Text>
          <Text style={s.statVal}>{fmtPace(pace)}</Text>
          <Text style={s.statLbl}>평균 페이스</Text>
        </View>
        <View style={[s.statCard, s.statCardHalf]}>
          <Text style={s.statIcon}>🔥</Text>
          <Text style={s.statVal}>{calories}</Text>
          <Text style={s.statUnit}>kcal</Text>
          <Text style={s.statLbl}>소모 칼로리</Text>
        </View>
        <View style={[s.statCard, s.statCardHalf]}>
          <Text style={s.statIcon}>❤️</Text>
          <Text style={[s.statVal, s.statNA]}>--</Text>
          <Text style={s.statLbl}>평균 심박수</Text>
          <Text style={s.statHint}>기기 연결 필요</Text>
        </View>
        <View style={[s.statCard, s.statCardHalf]}>
          <Text style={s.statIcon}>👟</Text>
          <Text style={[s.statVal, s.statNA]}>--</Text>
          <Text style={s.statLbl}>케이던스</Text>
          <Text style={s.statHint}>기기 연결 필요</Text>
        </View>
        <View style={[s.statCard, s.statCardHalf]}>
          <Text style={s.statIcon}>📍</Text>
          <Text style={s.statVal}>{trail.length}</Text>
          <Text style={s.statLbl}>GPS 포인트</Text>
        </View>
      </View>

      {/* ── 경로 지도 ── */}
      <View style={s.mapCard}>
        <View style={s.mapCardHeader}>
          <Text style={s.mapCardTitle}>달린 경로</Text>
          <View style={s.mapLegendRow}>
            <View style={s.mapLegendDot} />
            <Text style={s.mapLegendTxt}>시작</Text>
            <View style={[s.mapLegendDot, s.mapLegendDotEnd]} />
            <Text style={s.mapLegendTxt}>종료</Text>
          </View>
        </View>
        <WebView
          source={{ html: mapHtml }}
          style={s.mapView}
          scrollEnabled={false}
          javaScriptEnabled
          originWhitelist={['*']}
          pointerEvents="none"
        />
      </View>

      {/* ── km 구간 기록 ── */}
      {segments.length > 0 && (
        <View style={s.splitsCard}>
          <Text style={s.splitsTitle}>구간 기록</Text>
          <View style={s.splitsHeader}>
            <Text style={[s.splitCell, s.splitCellKm]}>구간</Text>
            <Text style={[s.splitCell, s.splitCellPace]}>페이스</Text>
            <Text style={[s.splitCell, s.splitCellTime]}>누적 시간</Text>
          </View>
          {segments.map(seg => (
            <View key={seg.km} style={s.splitRow}>
              <Text style={[s.splitCell, s.splitCellKm, s.splitKm]}>{seg.km} km</Text>
              <Text style={[s.splitCell, s.splitCellPace, s.splitPace]}>
                {fmtPace(seg.paceSecPerKm)}
              </Text>
              <Text style={[s.splitCell, s.splitCellTime, s.splitTime]}>
                {fmtDuration(seg.cumulativeDurationS)}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* ── 랭킹 배지 ── */}
      {profile?.optedInRanking && (
        <View style={s.rankBadge}>
          <Text style={s.rankBadgeTxt}>🏆 이번 기록이 이달 랭킹에 반영됩니다</Text>
        </View>
      )}

      {/* ── 액션 버튼 ── */}
      <TouchableOpacity style={s.shareBtn} onPress={handleShare}>
        <Text style={s.shareBtnTxt}>공유하기 ↗</Text>
      </TouchableOpacity>

      <View style={s.actionRow}>
        <TouchableOpacity style={s.rankingBtn} onPress={onRanking}>
          <Text style={s.rankingBtnTxt}>🏆 랭킹 보기</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.homeBtn} onPress={onHome}>
          <Text style={s.homeBtnTxt}>홈으로</Text>
        </TouchableOpacity>
      </View>

    </ScrollView>
  );
}

// ─── 스타일 ──────────────────────────────────────────────────────

function makeStyles(c: Colors) {
  return StyleSheet.create({
    bg: { flex: 1, backgroundColor: c.bg },
    content: {
      padding: 20,
      paddingTop: Platform.OS === 'ios' ? 60 : 40,
      paddingBottom: 40,
      gap: 14,
    },

    // 헤더
    header: { alignItems: 'center', gap: 6, marginBottom: 4 },
    emoji: { fontSize: 52 },
    title: { color: c.text, fontSize: 28, fontWeight: '900' },
    perf: { color: c.textMuted, fontSize: 15 },
    dateBadge: {
      backgroundColor: c.card,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 7,
      marginTop: 4,
      borderWidth: 1,
      borderColor: c.border,
    },
    dateTxt: { color: c.textSub, fontSize: 13, fontWeight: '600' },

    // 히어로 거리
    heroCard: {
      backgroundColor: c.card,
      borderRadius: 24,
      paddingVertical: 28,
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: c.accentBorder,
    },
    heroNum: { color: c.accent, fontSize: 72, fontWeight: '900', lineHeight: 80, fontVariant: ['tabular-nums'] as any },
    heroUnit: { color: c.textMuted, fontSize: 16, fontWeight: '600', marginTop: 4 },

    // 스탯 그리드
    statGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    statCard: {
      backgroundColor: c.card,
      borderRadius: 18,
      padding: 16,
      alignItems: 'center',
      gap: 3,
      borderWidth: 1,
      borderColor: c.border,
    },
    statCardHalf: { width: '47.5%', flexGrow: 1 },
    statIcon: { fontSize: 22, marginBottom: 4 },
    statVal: { color: c.text, fontSize: 20, fontWeight: '800' },
    statNA: { color: c.textFaint },
    statUnit: { color: c.textFaint, fontSize: 12 },
    statLbl: { color: c.textMuted, fontSize: 12 },
    statHint: { color: c.textFaint, fontSize: 10, marginTop: 1 },

    // 지도
    mapCard: {
      backgroundColor: c.card,
      borderRadius: 20,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: c.border,
    },
    mapCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    mapCardTitle: { color: c.text, fontSize: 14, fontWeight: '700' },
    mapLegendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    mapLegendDot: {
      width: 10, height: 10, borderRadius: 5,
      backgroundColor: '#00C853',
    },
    mapLegendDotEnd: { backgroundColor: '#FF453A' },
    mapLegendTxt: { color: c.textFaint, fontSize: 11 },
    mapView: { height: 220 },

    // km 구간
    splitsCard: {
      backgroundColor: c.card,
      borderRadius: 20,
      padding: 16,
      gap: 0,
      borderWidth: 1,
      borderColor: c.border,
    },
    splitsTitle: { color: c.text, fontSize: 14, fontWeight: '700', marginBottom: 12 },
    splitsHeader: {
      flexDirection: 'row',
      paddingBottom: 8,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      marginBottom: 4,
    },
    splitRow: {
      flexDirection: 'row',
      paddingVertical: 9,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    splitCell: { fontVariant: ['tabular-nums'] as any },
    splitCellKm:   { width: 60 },
    splitCellPace: { flex: 1 },
    splitCellTime: { width: 90, textAlign: 'right' },
    splitKm:   { color: c.textMuted, fontSize: 13, fontWeight: '600' },
    splitPace: { color: c.accent, fontSize: 14, fontWeight: '800' },
    splitTime: { color: c.textFaint, fontSize: 13 },

    // 하단
    rankBadge: {
      backgroundColor: c.accentBg,
      borderRadius: 12,
      paddingVertical: 10,
      paddingHorizontal: 14,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: c.accentBorder,
    },
    rankBadgeTxt: { color: c.accent, fontSize: 12, fontWeight: '600' },

    shareBtn: {
      backgroundColor: c.card,
      borderRadius: 14,
      paddingVertical: 15,
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: c.border,
    },
    shareBtnTxt: { color: c.text, fontSize: 15, fontWeight: '700' },

    actionRow: { flexDirection: 'row', gap: 10 },
    rankingBtn: {
      flex: 1,
      backgroundColor: c.card,
      borderRadius: 14,
      paddingVertical: 15,
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: '#FFD60A',
    },
    rankingBtnTxt: { color: '#FFD60A', fontSize: 14, fontWeight: '700' },
    homeBtn: {
      flex: 1,
      backgroundColor: c.accent,
      borderRadius: 14,
      paddingVertical: 15,
      alignItems: 'center',
    },
    homeBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },
  });
}
