import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, Modal,
  Animated, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { UserProfile, Challenge, ChallengeProgress, RouteCandidate, Coordinate } from '../types';
import {
  updateProgress, subscribeProgress, startChallenge, finishChallenge,
  saveBattleRecord, enterWaitingRoom, leaveWaitingRoom, subscribeWaitingRoom,
  WaitingEntry,
} from '../services/challengeService';
import { generateBestRoutes } from '../services/routingService';
import WebMapView, { WebMapViewHandle, CircleConfig } from '../components/WebMapView';
import { useTheme } from '../context/ThemeContext';
import { Colors } from '../theme';

interface Props {
  challenge: Challenge;
  profile: UserProfile;
  onFinish: () => void;
}

type Phase = 'waiting' | 'running';

function fmtPace(secPerKm: number): string {
  if (secPerKm <= 0 || !isFinite(secPerKm)) return "--'--\"";
  const m = Math.floor(secPerKm / 60);
  const s = Math.floor(secPerKm % 60);
  return `${m}'${s.toString().padStart(2, '0')}"`;
}

function fmtTime(totalS: number): string {
  const h = Math.floor(totalS / 3600);
  const m = Math.floor((totalS % 3600) / 60);
  const s = Math.floor(totalS % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function fmtCountdown(totalS: number): string {
  if (totalS <= 0) return '00:00';
  const m = Math.floor(totalS / 60);
  const s = Math.floor(totalS % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function getMyRank(userId: string, entries: ChallengeProgress[]): number {
  const sorted = [...entries].sort((a, b) => b.distanceM - a.distanceM);
  const idx = sorted.findIndex(e => e.userId === userId);
  return idx === -1 ? 0 : idx + 1;
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function BattleRunScreen({ challenge, profile, onFinish }: Props) {
  const [phase, setPhase]             = useState<Phase>(() => {
    // 이미 시작 시각이 지났으면 바로 running 페이즈
    return new Date(challenge.scheduledAt).getTime() <= Date.now() ? 'running' : 'waiting';
  });
  const [secondsUntil, setSecondsUntil] = useState(0);
  const [waitingList, setWaitingList] = useState<WaitingEntry[]>([]);

  const [distanceM, setDistanceM]     = useState(0);
  const [durationS, setDurationS]     = useState(0);
  const [leaderboard, setLeaderboard] = useState<ChallengeProgress[]>([]);
  const [rankPopup, setRankPopup]     = useState<string | null>(null);
  const [viewMode, setViewMode]           = useState<'leaderboard' | 'map'>('leaderboard');
  const [showRoutePicker, setShowRoutePicker] = useState(false);
  const [pickLoading, setPickLoading]     = useState(false);
  const [routeCandidates, setRouteCandidates] = useState<RouteCandidate[]>([]);
  const [pickerIdx, setPickerIdx]         = useState(0);
  const [routeReady, setRouteReady]       = useState(false);
  const [routeStart, setRouteStart]       = useState<Coordinate | null>(null);

  const popupAnim        = useRef(new Animated.Value(0)).current;
  const lastRankRef      = useRef<number>(0);
  const distRef          = useRef(0);
  const durRef           = useRef(0);
  const trailRef           = useRef<Array<[number, number]>>([]);
  const suggestedRouteRef  = useRef<Array<[number, number]>>([]);
  const routeFetchedRef    = useRef(false);
  const mapWebRef          = useRef<WebView>(null);
  const pickerMapRef       = useRef<WebMapViewHandle>(null);
  const viewModeRef        = useRef<'leaderboard' | 'map'>('leaderboard');
  const lastCoordRef     = useRef<{ lat: number; lon: number } | null>(null);
  const timerRef         = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const locationSubRef   = useRef<Location.LocationSubscription | null>(null);
  const unsubProgressRef = useRef<(() => void) | null>(null);
  const unsubWaitRef     = useRef<(() => void) | null>(null);
  const finished         = useRef(false);
  const autoStarted      = useRef(false);

  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const targetM = challenge.distanceKm * 1000;

  // ── 대기실 입장 및 구독 ───────────────────────────────────────
  useEffect(() => {
    enterWaitingRoom(challenge.id, profile);
    unsubWaitRef.current = subscribeWaitingRoom(challenge.id, setWaitingList);
    return () => {
      leaveWaitingRoom(challenge.id, profile.id);
      unsubWaitRef.current?.();
    };
  }, [challenge.id, profile]);

  // ── 카운트다운 ────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'waiting') return;

    function tick() {
      const diff = Math.ceil((new Date(challenge.scheduledAt).getTime() - Date.now()) / 1000);
      if (diff <= 0) {
        setSecondsUntil(0);
        if (!autoStarted.current) {
          autoStarted.current = true;
          clearInterval(countdownRef.current!);
          setPhase('running');
        }
      } else {
        setSecondsUntil(diff);
      }
    }

    tick();
    countdownRef.current = setInterval(tick, 1000);
    return () => clearInterval(countdownRef.current!);
  }, [phase, challenge.scheduledAt]);

  // ── running 페이즈 진입 시 GPS + 리더보드 시작 ───────────────
  useEffect(() => {
    if (phase !== 'running') return;
    startRunning();
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  unsubProgressRef.current = useMemo(() => {
    return subscribeProgress(challenge.id, entries => setLeaderboard(entries));
  // 마운트 시 한 번만 구독 — phase 무관하게 미리 연결해둬도 무방
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challenge.id]);

  useEffect(() => { viewModeRef.current = viewMode; }, [viewMode]);

  // ── 경로 선택 모달 열기 ───────────────────────────────────────
  async function openRoutePicker() {
    if (pickLoading) return;
    setPickLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('위치 권한 필요', '경로 탐색을 위해 위치 권한이 필요합니다.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const start: Coordinate = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      setRouteStart(start);

      const candidates = await generateBestRoutes(start, challenge.distanceKm * 1000);
      if (!candidates.length) throw new Error('no routes');

      setRouteCandidates(candidates);
      setPickerIdx(0);
      setShowRoutePicker(true);
    } catch {
      Alert.alert('경로 탐색 실패', '인터넷 연결을 확인하고 다시 시도해주세요.');
    } finally {
      setPickLoading(false);
    }
  }

  // 경로 선택 확정
  function confirmRoute(route: RouteCandidate) {
    suggestedRouteRef.current = route.polyline.map(
      c => [c.latitude, c.longitude] as [number, number]
    );
    routeFetchedRef.current = true;
    setRouteReady(true);
    setShowRoutePicker(false);
    // 러닝 중 지도에도 바로 반영
    if (viewModeRef.current === 'map') {
      mapWebRef.current?.injectJavaScript(
        `updateRoute(${JSON.stringify(suggestedRouteRef.current)});true;`
      );
    }
  }

  // 경로 탭 전환 시 지도 업데이트
  function applyPickerRoute(route: RouteCandidate) {
    pickerMapRef.current?.setPolyline(route.polyline, '#2979FF');
    const circles: CircleConfig[] = route.trafficSignalLocations.map(sig => ({
      latitude: sig.latitude,
      longitude: sig.longitude,
      radiusM: 18,
      fillColor: 'rgba(255,69,58,0.35)',
      strokeColor: 'rgba(255,69,58,0.9)',
    }));
    pickerMapRef.current?.setCircles(circles);
    pickerMapRef.current?.fitBounds(route.polyline);
  }

  // ── 랭크 팝업 ────────────────────────────────────────────────
  const showRankPopup = useCallback((msg: string) => {
    setRankPopup(msg);
    popupAnim.setValue(0);
    Animated.sequence([
      Animated.timing(popupAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(2500),
      Animated.timing(popupAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start(() => setRankPopup(null));
  }, [popupAnim]);

  useEffect(() => {
    if (phase !== 'running' || leaderboard.length < 2) return;
    const myRank = getMyRank(profile.id, leaderboard);
    if (myRank > 0 && myRank !== lastRankRef.current) {
      if (lastRankRef.current !== 0) {
        showRankPopup(`현재 ${profile.nickname}님은 ${myRank}등으로 달리고 있어요! 🏃`);
      }
      lastRankRef.current = myRank;
    }
  }, [leaderboard, phase, profile, showRankPopup]);

  // ── 달리기 실제 시작 ─────────────────────────────────────────
  async function startRunning() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('위치 권한 필요', 'GPS 추적을 위해 위치 권한이 필요합니다.', [
        { text: '확인', onPress: () => setPhase('waiting') },
      ]);
      autoStarted.current = false;
      return;
    }

    await startChallenge(challenge.id);

    timerRef.current = setInterval(() => {
      durRef.current += 1;
      setDurationS(durRef.current);
    }, 1000);

    locationSubRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 5 },
      loc => {
        const { latitude, longitude } = loc.coords;
        if (lastCoordRef.current) {
          const d = haversine(lastCoordRef.current.lat, lastCoordRef.current.lon, latitude, longitude);
          if (d < 50) {
            distRef.current += d;
            setDistanceM(distRef.current);
          }
        }
        lastCoordRef.current = { lat: latitude, lon: longitude };
        trailRef.current.push([latitude, longitude]);
        if (viewModeRef.current === 'map') {
          mapWebRef.current?.injectJavaScript(
            `updatePos(${latitude},${longitude},${JSON.stringify(trailRef.current)});true;`
          );
        }
        // 첫 GPS 좌표 들어오면 추천 경로 한 번만 생성
        if (!routeFetchedRef.current) {
          routeFetchedRef.current = true;
          fetchSuggestedRoute(latitude, longitude, challenge.distanceKm * 1000)
            .then(pts => {
              if (pts.length === 0) return;
              suggestedRouteRef.current = pts;
              if (viewModeRef.current === 'map') {
                mapWebRef.current?.injectJavaScript(
                  `updateRoute(${JSON.stringify(pts)});true;`
                );
              }
            })
            .catch(() => {});
        }
      }
    );

    progressRef.current = setInterval(async () => {
      if (finished.current) return;
      await updateProgress(challenge.id, profile.id, profile.nickname, distRef.current, durRef.current, false);
      if (distRef.current >= targetM) handleFinish();
    }, 5000);
  }

  async function handleFinish() {
    if (finished.current) return;
    finished.current = true;
    clearInterval(timerRef.current!);
    clearInterval(progressRef.current!);
    locationSubRef.current?.remove();

    await updateProgress(challenge.id, profile.id, profile.nickname, distRef.current, durRef.current, true);
    await finishChallenge(challenge.id);

    const rank = getMyRank(profile.id, leaderboard);
    const totalParticipants = leaderboard.length || challenge.participants.length;

    await saveBattleRecord(profile.id, {
      challengeId: challenge.id,
      title: challenge.title,
      distanceKm: challenge.distanceKm,
      rank,
      totalParticipants,
      distanceM: distRef.current,
      durationS: durRef.current,
      finishedAt: new Date().toISOString(),
    });

    Alert.alert(
      '대결 완료! 🎉',
      `${(distRef.current / 1000).toFixed(2)} km 달렸습니다!\n최종 순위: ${rank}등`,
      [{ text: '확인', onPress: onFinish }],
    );
  }

  function handleStop() {
    Alert.alert('대결 포기', '대결을 중단하시겠어요?', [
      { text: '계속 달리기', style: 'cancel' },
      {
        text: '중단', style: 'destructive', onPress: () => {
          finished.current = true;
          clearInterval(timerRef.current!);
          clearInterval(progressRef.current!);
          locationSubRef.current?.remove();
          updateProgress(challenge.id, profile.id, profile.nickname, distRef.current, durRef.current, true);
          onFinish();
        },
      },
    ]);
  }

  useEffect(() => {
    return () => {
      clearInterval(timerRef.current!);
      clearInterval(progressRef.current!);
      clearInterval(countdownRef.current!);
      locationSubRef.current?.remove();
      unsubProgressRef.current?.();
    };
  }, []);

  // ── 리더보드 계산 ─────────────────────────────────────────────
  const sortedBoard = useMemo(
    () => [...leaderboard].sort((a, b) => b.distanceM - a.distanceM),
    [leaderboard],
  );
  const leader = sortedBoard[0] ?? null;
  const paceSecPerKm = distanceM > 10 ? (durationS / distanceM) * 1000 : 0;
  const progress = Math.min(distanceM / targetM, 1);

  // ══════════════════════════════════════════════════════════════
  // ── 대기 페이즈 UI ────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════
  if (phase === 'waiting') {
    const urgent = secondsUntil <= 60;

    return (
      <View style={s.bg}>
        <View style={s.topBar}>
          <View style={s.titleWrap}>
            <Text style={s.challengeTitle} numberOfLines={1}>{challenge.title}</Text>
            <Text style={s.challengeSub}>{challenge.distanceKm} km · {challenge.creatorNickname}</Text>
          </View>
          <TouchableOpacity style={s.stopBtn} onPress={() => {
            Alert.alert('대기 나가기', '대기실을 나가시겠어요?', [
              { text: '취소', style: 'cancel' },
              { text: '나가기', style: 'destructive', onPress: onFinish },
            ]);
          }}>
            <Text style={s.stopTxt}>나가기</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

          {/* 카운트다운 */}
          <View style={[s.countdownCard, urgent && s.countdownCardUrgent]}>
            <Text style={s.countdownLabel}>대결 시작까지</Text>
            <Text style={[s.countdownTime, urgent && s.countdownTimeUrgent]}>
              {fmtCountdown(secondsUntil)}
            </Text>
            <Text style={s.countdownSub}>
              {new Date(challenge.scheduledAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 정각 자동 시작
            </Text>
          </View>

          {/* 경로 선택 카드 */}
          <TouchableOpacity
            style={[s.routeCard, routeReady && s.routeCardReady]}
            onPress={openRoutePicker}
            disabled={pickLoading}
            activeOpacity={0.8}
          >
            {pickLoading ? (
              <>
                <ActivityIndicator size="small" color={colors.accent} />
                <View style={s.routeCardText}>
                  <Text style={s.routeCardTitle}>경로 탐색 중...</Text>
                  <Text style={s.routeCardSub}>신호등 정보를 분석하고 있어요</Text>
                </View>
              </>
            ) : routeReady ? (
              <>
                <Text style={s.routeCardIcon}>✅</Text>
                <View style={s.routeCardText}>
                  <Text style={[s.routeCardTitle, { color: colors.accent }]}>경로 선택 완료</Text>
                  <Text style={s.routeCardSub}>대결 시작 후 지도에서 경로를 확인하세요 · 탭하면 변경</Text>
                </View>
                <Text style={s.routeCardArrow}>›</Text>
              </>
            ) : (
              <>
                <Text style={s.routeCardIcon}>🗺️</Text>
                <View style={s.routeCardText}>
                  <Text style={s.routeCardTitle}>달릴 경로 선택하기</Text>
                  <Text style={s.routeCardSub}>신호등을 고려한 최적 경로를 탐색해요</Text>
                </View>
                <Text style={s.routeCardArrow}>›</Text>
              </>
            )}
          </TouchableOpacity>

          {/* 대기 중인 참가자 */}
          <View style={s.waitSection}>
            <Text style={s.waitTitle}>
              대기 중인 참가자 {waitingList.length}/{challenge.maxParticipants}
            </Text>
            <View style={s.waitList}>
              {waitingList.map((entry, i) => {
                const isMe = entry.userId === profile.id;
                return (
                  <View key={entry.userId} style={[s.waitCard, isMe && s.waitCardMe]}>
                    <View style={[s.waitAvatar, isMe && s.waitAvatarMe]}>
                      <Text style={s.waitAvatarTxt}>
                        {entry.nickname.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={s.waitInfo}>
                      <Text style={[s.waitNickname, isMe && s.waitNicknameMe]}>
                        {entry.nickname}{isMe ? '  (나)' : ''}
                      </Text>
                      <Text style={s.waitStatus}>대기 중 ●</Text>
                    </View>
                    {i === 0 && (
                      <View style={s.hostBadge}><Text style={s.hostBadgeTxt}>주최</Text></View>
                    )}
                  </View>
                );
              })}

              {/* 아직 입장 안 한 참가자 자리 */}
              {Array.from({ length: Math.max(0, challenge.maxParticipants - waitingList.length) }).map((_, i) => (
                <View key={`empty-${i}`} style={s.waitCardEmpty}>
                  <View style={s.waitAvatarEmpty}>
                    <Text style={s.waitAvatarEmptyTxt}>?</Text>
                  </View>
                  <Text style={s.waitEmptyTxt}>참가자를 기다리는 중...</Text>
                </View>
              ))}
            </View>
          </View>

          {/* 안내 */}
          <View style={s.infoBox}>
            <Text style={s.infoTxt}>⏱ 정각이 되면 모든 참가자의 달리기가 자동으로 시작됩니다.</Text>
            <Text style={s.infoTxt}>📍 GPS 권한이 필요합니다. 미리 허용해두세요.</Text>
          </View>
        </ScrollView>

        {/* ── 경로 선택 모달 ── */}
        <Modal visible={showRoutePicker} animationType="slide" onRequestClose={() => setShowRoutePicker(false)}>
          {routeCandidates.length > 0 && routeStart && (() => {
            const route = routeCandidates[pickerIdx];
            return (
              <View style={s.pickerContainer}>
                <WebMapView
                  ref={pickerMapRef}
                  center={routeStart}
                  zoom={14}
                  startMarker={routeStart}
                  style={s.pickerMap}
                />

                {/* 뒤로 버튼 */}
                <TouchableOpacity style={s.pickerBackBtn} onPress={() => setShowRoutePicker(false)}>
                  <Text style={s.pickerBackTxt}>← 닫기</Text>
                </TouchableOpacity>

                {/* 신호등 범례 */}
                <View style={s.pickerLegend}>
                  <View style={s.pickerLegendDot} />
                  <Text style={s.pickerLegendTxt}>빨간 원 = 신호등</Text>
                </View>

                {/* 하단 패널 */}
                <View style={s.pickerPanel}>
                  {/* 경로 탭 */}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.pickerTabScroll}>
                    {routeCandidates.map((r, i) => {
                      const on = i === pickerIdx;
                      const sigColor = r.trafficSignals === 0 ? '#00C853' : r.trafficSignals <= 3 ? '#FFD60A' : '#FF453A';
                      return (
                        <TouchableOpacity
                          key={r.id}
                          style={[s.pickerTab, on && s.pickerTabOn]}
                          onPress={() => { setPickerIdx(i); applyPickerRoute(r); }}
                        >
                          <Text style={[s.pickerTabDist, on && s.pickerTabDistOn]}>
                            {(r.distance / 1000).toFixed(1)}km
                          </Text>
                          <Text style={[s.pickerTabSig, { color: on ? '#fff' : sigColor }]}>
                            🚦 {r.trafficSignals}개
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  {/* 통계 */}
                  <View style={s.pickerStats}>
                    <View style={s.pickerStat}>
                      <Text style={s.pickerStatVal}>{(route.distance / 1000).toFixed(2)} km</Text>
                      <Text style={s.pickerStatLbl}>거리</Text>
                    </View>
                    <View style={s.pickerStatDiv} />
                    <View style={s.pickerStat}>
                      <Text style={s.pickerStatVal}>
                        {Math.round((route.distance / 1000) * 6)}분
                      </Text>
                      <Text style={s.pickerStatLbl}>예상 시간</Text>
                    </View>
                    <View style={s.pickerStatDiv} />
                    <View style={s.pickerStat}>
                      <Text style={[s.pickerStatVal, {
                        color: route.trafficSignals === 0 ? '#00C853' : route.trafficSignals <= 3 ? '#FFD60A' : '#FF453A',
                      }]}>
                        {route.trafficSignals}개
                      </Text>
                      <Text style={s.pickerStatLbl}>신호등</Text>
                    </View>
                  </View>

                  {route.trafficSignals === 0 && (
                    <Text style={s.pickerBonus}>✅ 신호등 없는 최적 경로!</Text>
                  )}

                  <TouchableOpacity style={s.pickerConfirmBtn} onPress={() => confirmRoute(route)}>
                    <Text style={s.pickerConfirmTxt}>이 경로로 달리기 →</Text>
                  </TouchableOpacity>
                </View>

                {/* 맵 초기화 */}
                {(() => { setTimeout(() => applyPickerRoute(routeCandidates[pickerIdx]), 200); return null; })()}
              </View>
            );
          })()}
        </Modal>
      </View>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // ── 러닝 페이즈 UI ────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════
  return (
    <View style={s.bg}>
      <View style={s.topBar}>
        <View style={s.titleWrap}>
          <Text style={s.challengeTitle} numberOfLines={1}>{challenge.title}</Text>
          <Text style={s.challengeSub}>{challenge.distanceKm} km · {challenge.creatorNickname}</Text>
        </View>
        <TouchableOpacity
          style={[s.mapToggleBtn, viewMode === 'map' && s.mapToggleBtnActive]}
          onPress={() => setViewMode(m => m === 'leaderboard' ? 'map' : 'leaderboard')}
        >
          <Text style={s.mapToggleIcon}>{viewMode === 'leaderboard' ? '📍' : '📊'}</Text>
          <Text style={[s.mapToggleLbl, viewMode === 'map' && s.mapToggleLblActive]}>
            {viewMode === 'leaderboard' ? '내 경로' : '순위표'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.stopBtn} onPress={handleStop}>
          <Text style={s.stopTxt}>중단</Text>
        </TouchableOpacity>
      </View>

      {/* ── 지도 뷰 ── */}
      {viewMode === 'map' && (
        <View style={s.mapContainer}>
          <WebView
            ref={mapWebRef}
            source={{ html: buildBattleMapHtml() }}
            style={StyleSheet.absoluteFill}
            javaScriptEnabled
            originWhitelist={['*']}
            scrollEnabled={false}
            onLoad={() => {
              const pos = lastCoordRef.current;
              // 현재 위치 + 트레일 복원
              if (pos && trailRef.current.length > 0) {
                mapWebRef.current?.injectJavaScript(
                  `updatePos(${pos.lat},${pos.lon},${JSON.stringify(trailRef.current)});true;`
                );
              }
              // 이미 생성된 추천 경로가 있으면 바로 표시
              if (suggestedRouteRef.current.length > 0) {
                mapWebRef.current?.injectJavaScript(
                  `updateRoute(${JSON.stringify(suggestedRouteRef.current)});true;`
                );
              }
            }}
          />

          {/* 순위 오버레이 (좌상단) */}
          <View style={s.mapRankOverlay}>
            <Text style={s.mapRankNum}>{getMyRank(profile.id, leaderboard)}</Text>
            <Text style={s.mapRankLbl}>등</Text>
            <Text style={s.mapRankSub}>/ {leaderboard.length || challenge.participants.length}명 중</Text>
          </View>

          {/* 거리 오버레이 (우상단) */}
          <View style={s.mapDistOverlay}>
            <Text style={s.mapDistNum}>{(distanceM / 1000).toFixed(2)}</Text>
            <Text style={s.mapDistUnit}>km</Text>
          </View>

          {/* 하단 실시간 스탯 바 */}
          <View style={s.mapBottomBar}>
            <View style={s.mapBottomItem}>
              <Text style={s.mapBottomBig}>{fmtTime(durationS)}</Text>
              <Text style={s.mapBottomLbl}>시간</Text>
            </View>
            <View style={s.mapBottomDiv} />
            <View style={s.mapBottomItem}>
              <Text style={s.mapBottomBig}>{fmtPace(paceSecPerKm)}</Text>
              <Text style={s.mapBottomLbl}>페이스</Text>
            </View>
            <View style={s.mapBottomDiv} />
            <View style={s.mapBottomItem}>
              <Text style={s.mapBottomBig}>{Math.round(progress * 100)}%</Text>
              <Text style={s.mapBottomLbl}>진행률</Text>
            </View>
          </View>
        </View>
      )}

      {/* ── 리더보드 뷰 ── */}
      {viewMode === 'leaderboard' && (
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* 1등 spotlight */}
        <View style={s.leaderSpotlight}>
          <View style={s.leaderSpotlightHeader}>
            <Text style={s.leaderSpotlightLabel}>👑 현재 1등</Text>
            {leader?.finished && <View style={s.finishedBadge}><Text style={s.finishedTxt}>완주</Text></View>}
          </View>
          {leader ? (
            <View style={s.leaderSpotlightBody}>
              <Text style={s.leaderName} numberOfLines={1}>{leader.nickname}</Text>
              <View style={s.leaderStats}>
                <View style={s.leaderStatItem}>
                  <Text style={s.leaderStatBig}>{(leader.distanceM / 1000).toFixed(2)}</Text>
                  <Text style={s.leaderStatUnit}>km</Text>
                </View>
                <View style={s.leaderStatDivider} />
                <View style={s.leaderStatItem}>
                  <Text style={s.leaderStatBig}>{fmtPace(leader.paceSecPerKm)}</Text>
                  <Text style={s.leaderStatUnit}>페이스</Text>
                </View>
                <View style={s.leaderStatDivider} />
                <View style={s.leaderStatItem}>
                  <Text style={s.leaderStatBig}>{fmtTime(leader.durationS)}</Text>
                  <Text style={s.leaderStatUnit}>시간</Text>
                </View>
              </View>
            </View>
          ) : (
            <Text style={s.leaderEmpty}>기록을 불러오는 중...</Text>
          )}
        </View>

        {/* 내 기록 */}
        <View style={s.myCard}>
          <Text style={s.myCardLabel}>내 기록</Text>
          <View style={s.myStats}>
            <View style={s.myStatItem}>
              <Text style={s.myStatBig}>{(distanceM / 1000).toFixed(2)}</Text>
              <Text style={s.myStatUnit}>km</Text>
            </View>
            <View style={s.myStatDiv} />
            <View style={s.myStatItem}>
              <Text style={s.myStatBig}>{fmtTime(durationS)}</Text>
              <Text style={s.myStatUnit}>시간</Text>
            </View>
            <View style={s.myStatDiv} />
            <View style={s.myStatItem}>
              <Text style={s.myStatBig}>{fmtPace(paceSecPerKm)}</Text>
              <Text style={s.myStatUnit}>페이스</Text>
            </View>
          </View>
          <View style={s.progressBg}>
            <View style={[s.progressFill, { width: `${progress * 100}%` as any }]} />
          </View>
          <Text style={s.progressTxt}>{(distanceM / 1000).toFixed(2)} / {challenge.distanceKm} km</Text>
        </View>

        {/* 참가자 카드 */}
        <Text style={s.boardTitle}>실시간 현황</Text>
        <View style={s.boardGrid}>
          {sortedBoard.length === 0 ? (
            <Text style={s.boardEmpty}>기록을 불러오는 중...</Text>
          ) : (
            sortedBoard.map((entry, i) => {
              const isMe = entry.userId === profile.id;
              const rankEmoji = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;
              return (
                <View key={entry.userId} style={[s.playerCard, isMe && s.playerCardMe]}>
                  <View style={[s.rankBadge, i === 0 && s.rankBadgeGold, i === 1 && s.rankBadgeSilver, i === 2 && s.rankBadgeBronze]}>
                    {rankEmoji
                      ? <Text style={s.rankEmoji}>{rankEmoji}</Text>
                      : <Text style={s.rankNum}>{i + 1}</Text>
                    }
                  </View>
                  <View style={s.playerNameRow}>
                    <Text style={[s.playerName, isMe && s.playerNameMe]} numberOfLines={1}>
                      {entry.nickname}{isMe ? '  (나)' : ''}
                    </Text>
                    {entry.finished && (
                      <View style={s.doneBadge}><Text style={s.doneTxt}>완주</Text></View>
                    )}
                  </View>
                  <View style={s.playerStats}>
                    <View style={s.playerStatItem}>
                      <Text style={[s.playerStatBig, isMe && s.playerStatBigMe]}>
                        {(entry.distanceM / 1000).toFixed(2)}
                      </Text>
                      <Text style={s.playerStatUnit}>km</Text>
                    </View>
                    <View style={s.playerStatDiv} />
                    <View style={s.playerStatItem}>
                      <Text style={s.playerStatMid}>{fmtPace(entry.paceSecPerKm)}</Text>
                      <Text style={s.playerStatUnit}>/km</Text>
                    </View>
                  </View>
                  {isMe && <View style={s.meAccentLine} />}
                </View>
              );
            })
          )}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
      )}

      {rankPopup && (
        <Animated.View style={[s.popup, {
          opacity: popupAnim,
          transform: [{ translateY: popupAnim.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }],
        }]}>
          <Text style={s.popupTxt}>{rankPopup}</Text>
        </Animated.View>
      )}
    </View>
  );
}

async function fetchSuggestedRoute(
  lat: number,
  lon: number,
  distanceM: number,
): Promise<Array<[number, number]>> {
  const R = 6371000;
  const n = 6;
  // 원형 코스의 반경 추정 (실제 도보 거리는 직선의 약 1.4배)
  const radius = distanceM / (2 * Math.PI * 1.4);
  const waypoints = Array.from({ length: n }, (_, i) => {
    const bearing = (2 * Math.PI / n) * i - Math.PI / 2;
    const dlat = (radius * Math.cos(bearing) / R) * (180 / Math.PI);
    const dlon = (radius * Math.sin(bearing) / (R * Math.cos(lat * Math.PI / 180))) * (180 / Math.PI);
    return `${(lon + dlon).toFixed(6)},${(lat + dlat).toFixed(6)}`;
  });
  const coords = [`${lon},${lat}`, ...waypoints, `${lon},${lat}`].join(';');
  const url = `https://router.project-osrm.org/route/v1/foot/${coords}?overview=full&geometries=geojson`;
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const data = await res.json();
    if (!data.routes?.length) throw new Error('no routes');
    return (data.routes[0].geometry.coordinates as [number, number][]).map(
      ([lo, la]) => [la, lo] as [number, number],
    );
  } finally {
    clearTimeout(tid);
  }
}

function buildBattleMapHtml(): string {
  return `<!DOCTYPE html><html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body,#map{width:100%;height:100%;background:#f0f0f0}
@keyframes pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.5);opacity:0.5}}
.pulse-ring{position:absolute;top:-9px;left:-9px;width:40px;height:40px;border-radius:50%;background:rgba(0,100,255,0.25);animation:pulse 1.8s ease-in-out infinite}
</style>
</head>
<body><div id="map"></div>
<script>
var map=L.map('map',{zoomControl:false,attributionControl:false}).setView([37.5665,126.9780],17);
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',{subdomains:'abcd',maxZoom:19,keepBuffer:4}).addTo(map);

/* ── 추천 경로 레이어 (아래에 깔림) ── */
var routeLine=L.polyline([],{color:'#00AA66',weight:5,opacity:0.55,dashArray:'10 6',lineCap:'round',lineJoin:'round'}).addTo(map);
var routeShadow=L.polyline([],{color:'rgba(0,170,100,0.12)',weight:16,lineCap:'round',lineJoin:'round'}).addTo(map);

/* ── 내 트레일 레이어 (위에 표시) ── */
var trailShadow=L.polyline([],{color:'rgba(0,80,220,0.15)',weight:14,lineCap:'round',lineJoin:'round'}).addTo(map);
var trailLine=L.polyline([],{color:'#0057FF',weight:6,lineCap:'round',lineJoin:'round',opacity:1}).addTo(map);

/* ── 현재 위치 마커 ── */
var dotHtml='<div style="position:relative;width:22px;height:22px"><div class="pulse-ring"></div><div style="width:22px;height:22px;border-radius:50%;background:#0057FF;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,87,255,0.6)"></div></div>';
var icon=L.divIcon({html:dotHtml,className:'',iconSize:[22,22],iconAnchor:[11,11]});
var marker=L.marker([37.5665,126.9780],{icon:icon,zIndexOffset:1000}).addTo(map);

var startAdded=false;
var startIcon=L.divIcon({html:'<div style="width:14px;height:14px;border-radius:50%;background:#FF6B00;border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.3)"></div>',className:'',iconSize:[14,14],iconAnchor:[7,7]});

/* ── 지도 중심 이동 ── */
function centerOn(lat,lng,zoom){
  map.setView([lat,lng],zoom||16,{animate:false});
}

/* ── 추천 경로 업데이트 ── */
function updateRoute(pts){
  routeLine.setLatLngs(pts);
  routeShadow.setLatLngs(pts);
  if(pts.length>0) map.fitBounds(routeLine.getBounds(),{padding:[40,40]});
}

/* ── 내 위치 + 트레일 업데이트 ── */
function updatePos(lat,lng,pts){
  marker.setLatLng([lat,lng]);
  trailLine.setLatLngs(pts);
  trailShadow.setLatLngs(pts);
  if(!startAdded && pts.length>0){
    L.marker(pts[0],{icon:startIcon,zIndexOffset:500}).addTo(map);
    startAdded=true;
  }
  map.setView([lat,lng],map.getZoom(),{animate:true,duration:0.8,easeLinearity:0.5});
}
</script>
</body></html>`;
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    bg: { flex: 1, backgroundColor: c.bg },
    scroll: { paddingHorizontal: 16, paddingBottom: 16, gap: 14 },

    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: Platform.OS === 'ios' ? 58 : 36,
      paddingBottom: 14,
      gap: 12,
    },
    titleWrap: { flex: 1 },
    challengeTitle: { color: c.text, fontSize: 17, fontWeight: '800' },
    challengeSub: { color: c.textMuted, fontSize: 12, marginTop: 2 },
    mapToggleBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: c.card2,
      borderRadius: 20,
      paddingHorizontal: 13,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: c.border,
    },
    mapToggleBtnActive: {
      backgroundColor: '#0057FF18',
      borderColor: '#0057FF55',
    },
    mapToggleIcon: { fontSize: 14 },
    mapToggleLbl: { color: c.textSub, fontSize: 13, fontWeight: '700' },
    mapToggleLblActive: { color: '#0057FF' },
    stopBtn: {
      backgroundColor: c.card2,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: '#FF453A44',
    },
    stopTxt: { color: '#FF453A', fontSize: 13, fontWeight: '700' },

    mapContainer: { flex: 1, position: 'relative' },
    mapRankOverlay: {
      position: 'absolute',
      top: 16,
      left: 16,
      backgroundColor: 'rgba(255,255,255,0.92)',
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 10,
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: '#0057FF',
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 8,
      elevation: 4,
    },
    mapRankNum: { color: '#0057FF', fontSize: 30, fontWeight: '900', lineHeight: 34 },
    mapRankLbl: { color: '#0057FF', fontSize: 14, fontWeight: '700' },
    mapRankSub: { color: '#666', fontSize: 11, marginTop: 2 },
    mapDistOverlay: {
      position: 'absolute',
      top: 16,
      right: 16,
      backgroundColor: 'rgba(255,255,255,0.92)',
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 10,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: '#ddd',
      shadowColor: '#000',
      shadowOpacity: 0.10,
      shadowRadius: 6,
      elevation: 3,
    },
    mapDistNum: { color: '#111', fontSize: 22, fontWeight: '800' },
    mapDistUnit: { color: '#888', fontSize: 12 },
    mapBottomBar: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: 'rgba(255,255,255,0.95)',
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 16,
      paddingHorizontal: 20,
      paddingBottom: Platform.OS === 'ios' ? 28 : 16,
      borderTopWidth: 1,
      borderTopColor: '#e0e0e0',
    },
    mapBottomItem: { flex: 1, alignItems: 'center', gap: 3 },
    mapBottomBig:  { color: '#111', fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] as any },
    mapBottomLbl:  { color: '#888', fontSize: 11, fontWeight: '600' },
    mapBottomDiv:  { width: 1, height: 32, backgroundColor: '#e0e0e0' },

    // ── 대기실 ──
    countdownCard: {
      backgroundColor: c.card,
      borderRadius: 24,
      padding: 32,
      alignItems: 'center',
      gap: 8,
      borderWidth: 1.5,
      borderColor: c.border,
    },
    countdownCardUrgent: { borderColor: '#FF453A88', backgroundColor: '#1a0a0a' },
    countdownLabel: { color: c.textMuted, fontSize: 13, fontWeight: '600' },
    countdownTime: {
      color: c.text,
      fontSize: 64,
      fontWeight: '900',
      fontVariant: ['tabular-nums'],
      letterSpacing: 2,
    },
    countdownTimeUrgent: { color: '#FF453A' },
    countdownSub: { color: c.textFaint, fontSize: 12, marginTop: 4 },

    waitSection: { gap: 12 },
    waitTitle: { color: c.textMuted, fontSize: 12, fontWeight: '700', paddingHorizontal: 4 },
    waitList: { gap: 8 },
    waitCard: {
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderWidth: 1,
      borderColor: c.border,
    },
    waitCardMe: { backgroundColor: c.rowMeBg, borderColor: c.accentBorder },
    waitAvatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: c.card2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    waitAvatarMe: { backgroundColor: c.accent },
    waitAvatarTxt: { color: c.text, fontSize: 18, fontWeight: '800' },
    waitInfo: { flex: 1 },
    waitNickname: { color: c.textSub, fontSize: 15, fontWeight: '700' },
    waitNicknameMe: { color: c.text },
    waitStatus: { color: c.accent, fontSize: 11, marginTop: 2 },
    hostBadge: {
      backgroundColor: c.accentBg,
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    hostBadgeTxt: { color: c.accent, fontSize: 11, fontWeight: '700' },
    waitCardEmpty: {
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderWidth: 1,
      borderColor: c.border,
      opacity: 0.4,
    },
    waitAvatarEmpty: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: c.card2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    waitAvatarEmptyTxt: { color: c.textFaint, fontSize: 18, fontWeight: '800' },
    waitEmptyTxt: { color: c.textFaint, fontSize: 14 },

    // ── 추천 경로 섹션 ──
    // ── 경로 선택 카드 (대기실) ──
    routeCard: {
      backgroundColor: c.card,
      borderRadius: 18,
      padding: 18,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      borderWidth: 1,
      borderColor: c.border,
    },
    routeCardReady: { borderColor: c.accentBorder, backgroundColor: c.accentBg },
    routeCardIcon: { fontSize: 28 },
    routeCardText: { flex: 1 },
    routeCardTitle: { color: c.text, fontSize: 15, fontWeight: '700' },
    routeCardSub: { color: c.textMuted, fontSize: 12, marginTop: 3, lineHeight: 18 },
    routeCardArrow: { color: c.textFaint, fontSize: 22 },

    // ── 경로 선택 모달 ──
    pickerContainer: { flex: 1, backgroundColor: c.bg },
    pickerMap: { flex: 1 },
    pickerBackBtn: {
      position: 'absolute',
      top: Platform.OS === 'ios' ? 58 : 20,
      left: 16,
      backgroundColor: 'rgba(0,0,0,0.55)',
      paddingHorizontal: 16,
      paddingVertical: 9,
      borderRadius: 22,
    },
    pickerBackTxt: { color: '#fff', fontSize: 14, fontWeight: '600' },
    pickerLegend: {
      position: 'absolute',
      top: Platform.OS === 'ios' ? 58 : 20,
      right: 16,
      backgroundColor: 'rgba(0,0,0,0.55)',
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 16,
      gap: 6,
    },
    pickerLegendDot: {
      width: 12, height: 12, borderRadius: 6,
      backgroundColor: 'rgba(255,69,58,0.7)', borderWidth: 1.5, borderColor: '#FF453A',
    },
    pickerLegendTxt: { color: '#fff', fontSize: 11 },
    pickerPanel: {
      backgroundColor: c.card,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      marginTop: -22,
      padding: 16,
      paddingBottom: Platform.OS === 'ios' ? 36 : 16,
      gap: 0,
    },
    pickerTabScroll: { marginBottom: 12 },
    pickerTab: {
      paddingHorizontal: 16,
      paddingVertical: 9,
      borderRadius: 20,
      backgroundColor: c.card2,
      marginRight: 8,
      alignItems: 'center',
    },
    pickerTabOn: { backgroundColor: c.accent },
    pickerTabDist: { color: c.text, fontSize: 14, fontWeight: '700' },
    pickerTabDistOn: { color: '#fff' },
    pickerTabSig: { fontSize: 11, marginTop: 2 },
    pickerStats: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    pickerStat: { flex: 1, alignItems: 'center', gap: 3 },
    pickerStatVal: { color: c.text, fontSize: 16, fontWeight: '800' },
    pickerStatLbl: { color: c.textMuted, fontSize: 11 },
    pickerStatDiv: { width: 1, height: 32, backgroundColor: c.border },
    pickerBonus: { color: '#00C853', fontSize: 12, fontWeight: '600', textAlign: 'center', marginBottom: 10 },
    pickerConfirmBtn: {
      backgroundColor: c.accent,
      borderRadius: 14,
      paddingVertical: 15,
      alignItems: 'center',
    },
    pickerConfirmTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },

    infoBox: {
      backgroundColor: c.card,
      borderRadius: 14,
      padding: 16,
      gap: 8,
      borderWidth: 1,
      borderColor: c.border,
    },
    infoTxt: { color: c.textMuted, fontSize: 13, lineHeight: 20 },

    // ── 1등 spotlight ──
    leaderSpotlight: {
      backgroundColor: c.card,
      borderRadius: 20,
      padding: 20,
      borderWidth: 1.5,
      borderColor: '#FFD60A44',
    },
    leaderSpotlightHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 8 },
    leaderSpotlightLabel: { color: '#FFD60A', fontSize: 12, fontWeight: '800', flex: 1 },
    finishedBadge: { backgroundColor: '#FFD60A22', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
    finishedTxt: { color: '#FFD60A', fontSize: 11, fontWeight: '700' },
    leaderSpotlightBody: { gap: 10 },
    leaderName: { color: c.text, fontSize: 22, fontWeight: '900' },
    leaderStats: { flexDirection: 'row', alignItems: 'center' },
    leaderStatItem: { flex: 1, alignItems: 'center', gap: 2 },
    leaderStatBig: { color: '#FFD60A', fontSize: 18, fontWeight: '800' },
    leaderStatUnit: { color: c.textMuted, fontSize: 11 },
    leaderStatDivider: { width: 1, height: 32, backgroundColor: c.border },
    leaderEmpty: { color: c.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 8 },

    // ── 내 기록 ──
    myCard: {
      backgroundColor: c.rowMeBg,
      borderRadius: 20,
      padding: 18,
      borderWidth: 1,
      borderColor: c.accentBorder,
      gap: 12,
    },
    myCardLabel: { color: c.accent, fontSize: 11, fontWeight: '700' },
    myStats: { flexDirection: 'row', alignItems: 'center' },
    myStatItem: { flex: 1, alignItems: 'center', gap: 2 },
    myStatBig: { color: c.accent, fontSize: 20, fontWeight: '800' },
    myStatUnit: { color: c.textMuted, fontSize: 11 },
    myStatDiv: { width: 1, height: 30, backgroundColor: c.accentBorder },
    progressBg: { height: 6, backgroundColor: c.card2, borderRadius: 3, overflow: 'hidden' },
    progressFill: { height: 6, backgroundColor: c.accent, borderRadius: 3 },
    progressTxt: { color: c.textMuted, fontSize: 11, textAlign: 'right' },

    // ── 참가자 카드 ──
    boardTitle: { color: c.textMuted, fontSize: 11, fontWeight: '700', paddingHorizontal: 4 },
    boardGrid: { gap: 10 },
    boardEmpty: { color: c.textFaint, fontSize: 13, textAlign: 'center', paddingVertical: 20 },

    playerCard: {
      backgroundColor: c.card,
      borderRadius: 18,
      padding: 16,
      gap: 10,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
    },
    playerCardMe: { backgroundColor: c.rowMeBg, borderColor: c.accentBorder },
    rankBadge: {
      position: 'absolute', top: 14, right: 14,
      width: 32, height: 32, borderRadius: 16,
      backgroundColor: c.card2, alignItems: 'center', justifyContent: 'center',
    },
    rankBadgeGold:   { backgroundColor: '#3a2f00' },
    rankBadgeSilver: { backgroundColor: '#2a2a2a' },
    rankBadgeBronze: { backgroundColor: '#2a1a0a' },
    rankEmoji: { fontSize: 18 },
    rankNum:   { color: c.textMuted, fontSize: 14, fontWeight: '800' },

    playerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 40 },
    playerName: { color: c.textSub, fontSize: 15, fontWeight: '700', flex: 1 },
    playerNameMe: { color: c.text, fontSize: 16 },
    doneBadge: { backgroundColor: c.accentBg, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
    doneTxt: { color: c.accent, fontSize: 10, fontWeight: '700' },

    playerStats: { flexDirection: 'row', alignItems: 'center' },
    playerStatItem: { flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: 3 },
    playerStatBig: { color: c.textSub, fontSize: 22, fontWeight: '800' },
    playerStatBigMe: { color: c.accent },
    playerStatMid: { color: c.textSub, fontSize: 17, fontWeight: '700' },
    playerStatUnit: { color: c.textFaint, fontSize: 12 },
    playerStatDiv: { width: 1, height: 28, backgroundColor: c.border, marginHorizontal: 12 },

    meAccentLine: {
      position: 'absolute', left: 0, top: 0, bottom: 0, width: 4,
      backgroundColor: c.accent,
      borderTopLeftRadius: 18, borderBottomLeftRadius: 18,
    },

    // ── 팝업 ──
    popup: {
      position: 'absolute',
      top: Platform.OS === 'ios' ? 120 : 100,
      left: 24, right: 24,
      backgroundColor: c.rankBg,
      borderRadius: 18, padding: 18,
      borderWidth: 1.5, borderColor: c.accent,
      shadowColor: c.accent, shadowOpacity: 0.5, shadowRadius: 16, elevation: 10,
    },
    popupTxt: { color: c.accent, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  });
}
