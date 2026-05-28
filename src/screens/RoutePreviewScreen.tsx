import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { RouteCandidate, Coordinate } from '../types';
import WebMapView, { WebMapViewHandle, CircleConfig } from '../components/WebMapView';
import { useTheme } from '../context/ThemeContext';
import { Colors } from '../theme';

interface Props {
  routes: RouteCandidate[];
  start: Coordinate;
  onStart: (route: RouteCandidate) => void;
  onBack: () => void;
}

function fmtDist(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m)}m`;
}

function fmtRunTime(distM: number) {
  const totalSec = (distM / 1000) * 6 * 60;
  const h = Math.floor(totalSec / 3600);
  const min = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}h ${min}m`;
  return `${min}분`;
}

function signalColor(n: number) {
  if (n === 0) return '#00C853';
  if (n <= 3) return '#FFD60A';
  return '#FF453A';
}

export default function RoutePreviewScreen({ routes, start, onStart, onBack }: Props) {
  const [idx, setIdx] = useState(0);
  const mapRef = useRef<WebMapViewHandle>(null);
  const route = routes[idx];

  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const applyRoute = (r: RouteCandidate) => {
    mapRef.current?.setPolyline(r.polyline, '#2979FF');
    const circles: CircleConfig[] = r.trafficSignalLocations.map((sig) => ({
      latitude: sig.latitude,
      longitude: sig.longitude,
      radiusM: 18,
      fillColor: 'rgba(255,69,58,0.35)',
      strokeColor: 'rgba(255,69,58,0.9)',
    }));
    mapRef.current?.setCircles(circles);
    mapRef.current?.fitBounds(r.polyline);
    mapRef.current?.setStartDirection(r.polyline);
  };

  useEffect(() => {
    if (route) applyRoute(route);
  }, []);

  useEffect(() => {
    if (route) applyRoute(route);
  }, [idx]);

  const initialCenter = useMemo(() => {
    const coords = routes[0].polyline;
    const lats = coords.map((c) => c.latitude);
    const lons = coords.map((c) => c.longitude);
    return {
      latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
      longitude: (Math.min(...lons) + Math.max(...lons)) / 2,
    };
  }, []);

  if (!route) return null;

  return (
    <View style={s.container}>
      <WebMapView
        ref={mapRef}
        center={initialCenter}
        zoom={14}
        startMarker={start}
        style={s.map}
      />

      <TouchableOpacity style={s.backBtn} onPress={onBack}>
        <Text style={s.backBtnTxt}>← 뒤로</Text>
      </TouchableOpacity>

      <View style={s.legend}>
        <View style={s.legendDot} />
        <Text style={s.legendTxt}>빨간 원 = 신호등 위치</Text>
      </View>

      <View style={s.panel}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabScroll}>
          {routes.map((r, i) => {
            const on = i === idx;
            return (
              <TouchableOpacity
                key={r.id}
                style={[s.tab, on && s.tabOn]}
                onPress={() => setIdx(i)}
              >
                <Text style={[s.tabLabel, on && s.tabLabelOn]}>{fmtDist(r.distance)}</Text>
                <Text style={[s.tabSig, { color: on ? '#fff' : signalColor(r.trafficSignals) }]}>
                  🚦 {r.trafficSignals}개
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={s.statsRow}>
          <View style={s.stat}>
            <Text style={s.statVal}>{fmtDist(route.distance)}</Text>
            <Text style={s.statLbl}>거리</Text>
          </View>
          <View style={s.divider} />
          <View style={s.stat}>
            <Text style={s.statVal}>{fmtRunTime(route.distance)}</Text>
            <Text style={s.statLbl}>예상 시간</Text>
          </View>
          <View style={s.divider} />
          <View style={s.stat}>
            <Text style={[s.statVal, { color: signalColor(route.trafficSignals) }]}>
              {route.trafficSignals}개
            </Text>
            <Text style={s.statLbl}>신호등</Text>
          </View>
        </View>

        {route.trafficSignals === 0 && (
          <Text style={s.bonus}>✅ 신호등 없는 최적 경로!</Text>
        )}

        <TouchableOpacity style={s.startBtn} onPress={() => onStart(route)}>
          <Text style={s.startBtnTxt}>달리기 시작 →</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    map: { flex: 1 },
    backBtn: {
      position: 'absolute',
      top: Platform.OS === 'ios' ? 58 : 20,
      left: 16,
      backgroundColor: c.overlayLight,
      paddingHorizontal: 16,
      paddingVertical: 9,
      borderRadius: 22,
    },
    backBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '600' },
    legend: {
      position: 'absolute',
      top: Platform.OS === 'ios' ? 58 : 20,
      right: 16,
      backgroundColor: c.overlayLight,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 16,
      gap: 6,
    },
    legendDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: 'rgba(255,69,58,0.7)',
      borderWidth: 1.5,
      borderColor: '#FF453A',
    },
    legendTxt: { color: '#fff', fontSize: 11 },
    panel: {
      backgroundColor: c.card,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      marginTop: -22,
      padding: 16,
      paddingBottom: Platform.OS === 'ios' ? 36 : 16,
    },
    tabScroll: { marginBottom: 12 },
    tab: {
      paddingHorizontal: 16,
      paddingVertical: 9,
      borderRadius: 20,
      backgroundColor: c.card2,
      marginRight: 8,
      alignItems: 'center',
    },
    tabOn:       { backgroundColor: c.accent },
    tabLabel:    { color: c.textSub, fontSize: 13, fontWeight: '700' },
    tabLabelOn:  { color: '#fff' },
    tabSig:      { fontSize: 11, marginTop: 2 },
    statsRow: {
      flexDirection: 'row',
      backgroundColor: c.card3,
      borderRadius: 14,
      padding: 14,
      marginBottom: 12,
    },
    stat:    { flex: 1, alignItems: 'center' },
    statVal: { color: c.text, fontSize: 20, fontWeight: '800' },
    statLbl: { color: c.textMuted, fontSize: 11, marginTop: 3 },
    divider: { width: 1, backgroundColor: c.divider, marginHorizontal: 4 },
    bonus: {
      color: c.accent,
      fontSize: 13,
      textAlign: 'center',
      marginBottom: 10,
      fontWeight: '600',
    },
    startBtn: {
      backgroundColor: c.accent,
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: 'center',
    },
    startBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
  });
}
