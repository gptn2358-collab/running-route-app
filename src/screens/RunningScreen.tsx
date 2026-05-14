import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import * as Location from 'expo-location';
import { RouteCandidate, Coordinate, RunStats, RunSegment } from '../types';
import { haversineDistance, distToPolyline, predictSignalPhase } from '../utils/geoUtils';
import {
  fetchSpatData,
  findNearestSignal,
  IntersectionSignal,
} from '../services/spatService';
import { getCoordMap } from '../services/crossroadMapService';
import { generateBestRoutes, getDirectRoute } from '../services/routingService';
import { findNearestBathroom } from '../services/bathroomService';
import SignalOverlay from '../components/SignalOverlay';
import LeafletMap, { LeafletMapHandle, SignalInfo } from '../components/LeafletMap';

// ── 재탐색 임계값 ──────────────────────────────────────────────
const DEVIATION_THRESHOLD_M = 50;    // 경로에서 50m 이상 이탈
const DEVIATION_TRIGGER_MS  = 10_000; // 10초 이상 지속 시 재탐색
const REROUTE_COOLDOWN_MS   = 90_000; // 재탐색 후 90초 쿨다운
const REDLIGHT_APPROACH_M   = 80;    // 빨간불 80m 이내 접근 시 재탐색
const REDLIGHT_COOLDOWN_MS  = 120_000; // 빨간불 재탐색 2분 쿨다운

interface Props {
  route: RouteCandidate;
  start: Coordinate;
  onFinish: (stats: RunStats) => void;
}

export default function RunningScreen({ route: initialRoute, start, onFinish }: Props) {
  const [currentRoute, setCurrentRoute] = useState<RouteCandidate>(initialRoute);
  const [trail, setTrail]     = useState<Coordinate[]>([start]);
  const [coveredM, setCoveredM] = useState(0);
  const [elapsed, setElapsed]   = useState(0);
  const [paused, setPaused]     = useState(false);
  const [rerouteMsg, setRerouteMsg] = useState<string | null>(null);

  // V2X signal state
  const [nearSignal, setNearSignal]     = useState<IntersectionSignal | null>(null);
  const [nearSignalDist, setNearSignalDist] = useState<number | null>(null);

  // 화장실 안내
  const [bathroomMode, setBathroomMode]       = useState(false);
  const [bathroomSearching, setBathroomSearching] = useState(false);
  const [bathroomDist, setBathroomDist]       = useState<number | null>(null);
  const bathroomModeRef  = useRef(false);
  const bathroomDestRef  = useRef<Coordinate | null>(null);

  const leafletRef   = useRef<LeafletMapHandle>(null);
  const locSub       = useRef<Location.LocationSubscription | null>(null);
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const spatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const predTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const prevPosRef    = useRef<Coordinate>(start);
  const pausedRef     = useRef(false);
  const posRef        = useRef<Coordinate>(start);
  const trailRef      = useRef<Coordinate[]>([start]);
  const coveredMRef   = useRef(0);
  const elapsedRef    = useRef(0);
  const segmentsRef   = useRef<RunSegment[]>([]);
  const lastSegKmRef  = useRef(0);
  const coordMapRef   = useRef<Map<string, { lat: number; lon: number; name: string }> | undefined>(undefined);
  const spatRecordsRef = useRef<IntersectionSignal[]>([]);
  const currentRouteRef = useRef<RouteCandidate>(initialRoute);

  // 재탐색 제어
  const reroutingRef        = useRef(false);
  const lastRerouteRef      = useRef(0);
  const lastRedLightRef     = useRef(0);
  const offRouteSinceRef    = useRef<number | null>(null);

  // currentRoute 변경 시 ref 동기화
  useEffect(() => { currentRouteRef.current = currentRoute; }, [currentRoute]);
  useEffect(() => { coveredMRef.current = coveredM; }, [coveredM]);

  const buildInitialSignals = (r: RouteCandidate): SignalInfo[] =>
    r.trafficSignalLocations.map((loc) => ({
      latitude: loc.latitude, longitude: loc.longitude,
      phase: null, isNearest: false,
    }));

  useEffect(() => {
    startGPS();

    timerRef.current = setInterval(() => {
      if (!pausedRef.current) {
        setElapsed((e) => {
          const next = e + 1;
          elapsedRef.current = next;
          return next;
        });
      }
    }, 1000);

    getCoordMap().then((map) => {
      coordMapRef.current = map as Map<string, { lat: number; lon: number; name: string }>;
    });

    const pollSpat = async () => {
      const records = await fetchSpatData();
      if (records.length > 0) spatRecordsRef.current = records;
      updateNearSignal(posRef.current, records.length > 0 ? records : spatRecordsRef.current);
    };
    pollSpat();
    spatTimerRef.current = setInterval(pollSpat, 5000);

    predTimerRef.current = setInterval(() => {
      updateNearSignal(posRef.current, spatRecordsRef.current);
    }, 1000);

    return () => {
      locSub.current?.remove();
      if (timerRef.current)  clearInterval(timerRef.current);
      if (spatTimerRef.current) clearInterval(spatTimerRef.current);
      if (predTimerRef.current) clearInterval(predTimerRef.current);
    };
  }, []);

  // ── 재탐색 ────────────────────────────────────────────────────
  async function reroute(reason: 'deviation' | 'redlight') {
    if (reroutingRef.current) return;
    if (Date.now() - lastRerouteRef.current < REROUTE_COOLDOWN_MS) return;

    reroutingRef.current = true;
    const msg = reason === 'redlight'
      ? '🔴 빨간불 회피 경로 탐색 중...'
      : '📍 경로 이탈 감지 — 재탐색 중...';
    setRerouteMsg(msg);

    try {
      const remaining = Math.max(
        currentRouteRef.current.distance - coveredMRef.current,
        1000
      );
      const candidates = await generateBestRoutes(posRef.current, remaining);
      if (candidates.length === 0) return;

      const best = candidates[0];
      setCurrentRoute(best);
      currentRouteRef.current = best;

      // 지도 업데이트
      leafletRef.current?.setRoute(best.polyline);
      leafletRef.current?.resetSignals(buildInitialSignals(best));

      lastRerouteRef.current = Date.now();
      setRerouteMsg('✅ 새 경로로 안내합니다');
      setTimeout(() => setRerouteMsg(null), 3000);
    } catch {
      setRerouteMsg(null);
    } finally {
      reroutingRef.current = false;
      offRouteSinceRef.current = null;
    }
  }

  // ── 신호 업데이트 + 빨간불 감지 ───────────────────────────────
  function updateNearSignal(currentPos: Coordinate, records: IntersectionSignal[]) {
    const lights   = currentRouteRef.current.trafficSignalLocations;
    const coordMap = coordMapRef.current;

    let minDist: number | null = null;
    let minIdx:  number | null = null;
    lights.forEach((l, i) => {
      const d = haversineDistance(currentPos, l);
      if (minDist === null || d < minDist) { minDist = d; minIdx = i; }
    });
    const within = minDist !== null && minDist <= 150;

    const nearSig = findNearestSignal(currentPos, lights, records, 150, coordMap);
    setNearSignal(nearSig);
    setNearSignalDist(within ? minDist : null);

    // V2X 실데이터 빨간불 80m 이내 접근 시 재탐색
    if (
      within &&
      minDist !== null && minDist <= REDLIGHT_APPROACH_M &&
      nearSig !== null &&
      nearSig.best?.signal?.phase === 'red'
    ) {
      const now = Date.now();
      if (now - lastRedLightRef.current > REDLIGHT_COOLDOWN_MS) {
        lastRedLightRef.current = now;
        reroute('redlight');
      }
    }

    // 신호 마커 업데이트
    const signals: SignalInfo[] = lights.map((loc, i) => {
      let matchedRecord: IntersectionSignal | null = null;

      if (records.length > 0 && coordMap && coordMap.size > 0) {
        let best: { rec: IntersectionSignal; dist: number } | null = null;
        for (const rec of records) {
          const coord = coordMap.get(rec.itstId);
          if (!coord) continue;
          const d = haversineDistance(loc, { latitude: coord.lat, longitude: coord.lon });
          if (d <= 120 && (!best || d < best.dist)) best = { rec, dist: d };
        }
        matchedRecord = best?.rec ?? null;
      }

      const v2xPhase =
        matchedRecord?.best?.signal?.phase ??
        (matchedRecord?.straight
          ? (Object.values(matchedRecord.straight)[0]?.phase ?? null)
          : null);

      const predicted = v2xPhase === null;
      const phase = predicted
        ? predictSignalPhase(loc.latitude, loc.longitude)
        : v2xPhase;

      return {
        latitude: loc.latitude, longitude: loc.longitude,
        phase, isNearest: within && i === minIdx, predicted,
      };
    });

    leafletRef.current?.updateSignals(signals);
  }

  // ── GPS ──────────────────────────────────────────────────────
  async function startGPS() {
    locSub.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1500, distanceInterval: 4 },
      (loc) => {
        if (pausedRef.current) return;
        const newPos: Coordinate = {
          latitude: loc.coords.latitude, longitude: loc.coords.longitude,
        };
        const delta = haversineDistance(prevPosRef.current, newPos);
        if (delta < 3) return;

        prevPosRef.current = newPos;
        posRef.current     = newPos;
        const newTrail = [...trailRef.current, newPos];
        trailRef.current = newTrail;
        setTrail(newTrail);
        const newCovered = coveredMRef.current + delta;
        coveredMRef.current = newCovered;
        setCoveredM(newCovered);

        // Record a segment every completed km
        const completedKm = Math.floor(newCovered / 1000);
        if (completedKm > lastSegKmRef.current) {
          for (let km = lastSegKmRef.current + 1; km <= completedKm; km++) {
            const prevSeg = segmentsRef.current[segmentsRef.current.length - 1];
            const prevDistM = prevSeg ? prevSeg.cumulativeDistanceM : 0;
            const prevDurS  = prevSeg ? prevSeg.cumulativeDurationS  : 0;
            const segDistM  = newCovered - prevDistM;
            const segDurS   = elapsedRef.current - prevDurS;
            const pace      = segDistM > 0 ? (segDurS / segDistM) * 1000 : 0;
            segmentsRef.current = [...segmentsRef.current, {
              km,
              cumulativeDistanceM: newCovered,
              cumulativeDurationS: elapsedRef.current,
              paceSecPerKm: Math.round(pace),
            }];
          }
          lastSegKmRef.current = completedKm;
        }

        leafletRef.current?.updateRunner(newPos, newTrail);
        updateNearSignal(newPos, spatRecordsRef.current);

        // 화장실 안내 중 — 도착 감지 및 이탈 감지 스킵
        if (bathroomModeRef.current && bathroomDestRef.current) {
          const d = haversineDistance(newPos, bathroomDestRef.current);
          setBathroomDist(Math.round(d));
          if (d < 30) {
            setBathroomMode(false);
            bathroomModeRef.current = false;
            bathroomDestRef.current = null;
            setBathroomDist(null);
            leafletRef.current?.clearBathroom();
            Alert.alert('🚻 도착', '화장실에 도착했습니다!', [{ text: '확인' }]);
          }
          return;
        }

        // 경로 이탈 감지
        const distFromRoute = distToPolyline(newPos, currentRouteRef.current.polyline);
        if (distFromRoute > DEVIATION_THRESHOLD_M) {
          if (offRouteSinceRef.current === null) {
            offRouteSinceRef.current = Date.now();
          } else if (Date.now() - offRouteSinceRef.current >= DEVIATION_TRIGGER_MS) {
            offRouteSinceRef.current = null;
            reroute('deviation');
          }
        } else {
          offRouteSinceRef.current = null;
        }
      }
    );
  }

  async function handleBathroom() {
    if (bathroomMode) {
      // 화장실 모드 종료 → 원래 경로로 복귀
      setBathroomMode(false);
      bathroomModeRef.current = false;
      bathroomDestRef.current = null;
      setBathroomDist(null);
      leafletRef.current?.clearBathroom();
      return;
    }
    setBathroomSearching(true);
    try {
      const dest = await findNearestBathroom(posRef.current, 1000);
      if (!dest) {
        Alert.alert('화장실 없음', '반경 1km 이내에 공공 화장실이 없습니다.');
        return;
      }
      const route = await getDirectRoute(posRef.current, dest);
      bathroomDestRef.current = dest;
      setBathroomMode(true);
      bathroomModeRef.current = true;
      leafletRef.current?.showBathroom(
        dest,
        route.length > 0 ? route : [posRef.current, dest]
      );
    } catch {
      Alert.alert('오류', '화장실 검색에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setBathroomSearching(false);
    }
  }

  function togglePause() {
    const next = !paused;
    setPaused(next);
    pausedRef.current = next;
  }

  function handleStop() {
    Alert.alert('달리기 종료', '지금 달리기를 마치겠습니까?', [
      { text: '계속', style: 'cancel' },
      {
        text: '종료',
        style: 'destructive',
        onPress: () => {
          locSub.current?.remove();
          if (timerRef.current) clearInterval(timerRef.current);
          onFinish({
            id: Date.now().toString(),
            distance: coveredMRef.current,
            duration: elapsed,
            trail: trailRef.current,
            routePolyline: currentRouteRef.current.polyline,
            segments: segmentsRef.current,
          });
        },
      },
    ]);
  }

  function fmtTime(sec: number) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const ss = (sec % 60).toString().padStart(2, '0');
    const mm = m.toString().padStart(2, '0');
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }

  const pace = elapsed > 0 && coveredM > 100 ? (elapsed / coveredM) * 1000 : 0;
  const paceStr = pace > 0
    ? `${Math.floor(pace / 60)}'${Math.round(pace % 60).toString().padStart(2, '0')}"`
    : "--'--\"";

  const pct      = Math.min((coveredM / currentRoute.distance) * 100, 100);
  const remainKm = Math.max((currentRoute.distance - coveredM) / 1000, 0);

  return (
    <View style={s.container}>
      <LeafletMap
        ref={leafletRef}
        start={start}
        routePolyline={currentRoute.polyline}
        initialSignals={buildInitialSignals(currentRoute)}
      />

      {/* 화장실 안내 배너 */}
      {bathroomMode && (
        <View style={s.bathroomBanner}>
          <Text style={s.bathroomTxt}>
            🚻 화장실까지{bathroomDist !== null ? ` ${bathroomDist}m` : ''}
          </Text>
        </View>
      )}

      {/* 재탐색 배너 */}
      {rerouteMsg && (
        <View style={s.rerouteBanner}>
          <Text style={s.rerouteTxt}>{rerouteMsg}</Text>
        </View>
      )}

      {/* 상단 통계 카드 */}
      <View style={s.statsCard}>
        <View style={s.statsRow}>
          <View style={s.stat}>
            <Text style={s.statVal}>{(coveredM / 1000).toFixed(2)}</Text>
            <Text style={s.statLbl}>km 달림</Text>
          </View>
          <View style={s.div} />
          <View style={s.stat}>
            <Text style={s.statVal}>{fmtTime(elapsed)}</Text>
            <Text style={s.statLbl}>시간</Text>
          </View>
          <View style={s.div} />
          <View style={s.stat}>
            <Text style={s.statVal}>{paceStr}</Text>
            <Text style={s.statLbl}>페이스/km</Text>
          </View>
        </View>

        <View style={s.progBg}>
          <View style={[s.progFill, { width: `${pct}%` }]} />
        </View>
        <Text style={s.progTxt}>
          남은 거리 {remainKm.toFixed(2)}km  ({Math.round(pct)}% 완료)
        </Text>

        {paused && <Text style={s.pausedBadge}>⏸ 일시정지</Text>}

        <SignalOverlay signal={nearSignal} distanceM={nearSignalDist} />
      </View>

      {/* 하단 컨트롤 */}
      <View style={s.controls}>
        <TouchableOpacity style={[s.ctrlBtn, s.ctrlBtnOutline]} onPress={togglePause}>
          <Text style={s.ctrlBtnOutlineTxt}>{paused ? '▶ 재개' : '⏸ 일시정지'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.ctrlBtn, s.ctrlBtnWc, bathroomMode && s.ctrlBtnWcActive]}
          onPress={handleBathroom}
          disabled={bathroomSearching}
        >
          {bathroomSearching
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={s.ctrlBtnWcTxt}>{bathroomMode ? '✕ 복귀' : '🚻'}</Text>
          }
        </TouchableOpacity>
        <TouchableOpacity style={[s.ctrlBtn, s.ctrlBtnStop]} onPress={handleStop}>
          <Text style={s.ctrlBtnStopTxt}>■ 종료</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  bathroomBanner: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 148 : 110,
    alignSelf: 'center',
    backgroundColor: '#FF9500',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    zIndex: 99,
  },
  bathroomTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },
  rerouteBanner: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 120 : 82,
    alignSelf: 'center',
    backgroundColor: 'rgba(10,10,10,0.92)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 22,
    zIndex: 99,
  },
  rerouteTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },
  statsCard: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 58 : 20,
    left: 14, right: 14,
    backgroundColor: 'rgba(10,10,10,0.88)',
    borderRadius: 18,
    padding: 16,
  },
  statsRow: { flexDirection: 'row', marginBottom: 12 },
  stat: { flex: 1, alignItems: 'center' },
  statVal: { color: '#fff', fontSize: 22, fontWeight: '800' },
  statLbl: { color: '#777', fontSize: 11, marginTop: 2 },
  div: { width: 1, backgroundColor: '#333', marginHorizontal: 4 },
  progBg:   { height: 5, backgroundColor: '#2a2a2a', borderRadius: 3, marginBottom: 6 },
  progFill: { height: 5, backgroundColor: '#00C853', borderRadius: 3 },
  progTxt:  { color: '#666', fontSize: 11, textAlign: 'center' },
  pausedBadge: {
    color: '#FFD60A', textAlign: 'center',
    marginTop: 6, fontSize: 13, fontWeight: '600',
  },
  controls: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 50 : 28,
    left: 14, right: 14,
    flexDirection: 'row', gap: 12,
  },
  ctrlBtn: { flex: 1, paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  ctrlBtnOutline: {
    backgroundColor: 'rgba(10,10,10,0.88)',
    borderWidth: 1.5, borderColor: '#00C853',
  },
  ctrlBtnOutlineTxt: { color: '#00C853', fontSize: 15, fontWeight: '700' },
  ctrlBtnWc: {
    backgroundColor: 'rgba(255,149,0,0.85)',
    flex: 0,
    width: 52,
    borderRadius: 14,
  },
  ctrlBtnWcActive: { backgroundColor: '#666' },
  ctrlBtnWcTxt: { color: '#fff', fontSize: 22 },
  ctrlBtnStop: { backgroundColor: '#FF453A' },
  ctrlBtnStopTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
