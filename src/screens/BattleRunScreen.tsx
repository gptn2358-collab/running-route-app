import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  Animated, Platform,
} from 'react-native';
import * as Location from 'expo-location';
import { UserProfile, Challenge, ChallengeProgress } from '../types';
import {
  updateProgress, subscribeProgress, startChallenge, finishChallenge,
  saveBattleRecord,
} from '../services/challengeService';
import { useTheme } from '../context/ThemeContext';
import { Colors } from '../theme';

interface Props {
  challenge: Challenge;
  profile: UserProfile;
  onFinish: () => void;
}

function fmtPace(secPerKm: number): string {
  if (secPerKm <= 0 || !isFinite(secPerKm)) return '--\'--\"';
  const m = Math.floor(secPerKm / 60);
  const s = Math.floor(secPerKm % 60);
  return `${m}'${s.toString().padStart(2, '0')}"`;
}

function fmtTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`;
  return `${m.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`;
}

function getMyRank(userId: string, entries: ChallengeProgress[]): number {
  const sorted = [...entries].sort((a, b) => b.distanceM - a.distanceM);
  return sorted.findIndex(e => e.userId === userId) + 1;
}

function ordinalKo(rank: number): string {
  return `${rank}등`;
}

export default function BattleRunScreen({ challenge, profile, onFinish }: Props) {
  const [running, setRunning]       = useState(false);
  const [distanceM, setDistanceM]   = useState(0);
  const [durationS, setDurationS]   = useState(0);
  const [leaderboard, setLeaderboard] = useState<ChallengeProgress[]>([]);
  const [rankPopup, setRankPopup]   = useState<string | null>(null);
  const popupAnim = useRef(new Animated.Value(0)).current;
  const lastRankRef    = useRef<number>(0);
  const distRef        = useRef(0);
  const durRef         = useRef(0);
  const lastCoordRef   = useRef<{ lat: number; lon: number } | null>(null);
  const timerRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const finished       = useRef(false);

  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const targetM = challenge.distanceKm * 1000;

  useEffect(() => {
    unsubscribeRef.current = subscribeProgress(challenge.id, entries => {
      setLeaderboard(entries);
    });
    return () => { unsubscribeRef.current?.(); };
  }, [challenge.id]);

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
    if (!running || leaderboard.length < 2) return;
    const myRank = getMyRank(profile.id, leaderboard);
    if (myRank > 0 && myRank !== lastRankRef.current) {
      if (lastRankRef.current !== 0) {
        showRankPopup(`현재 ${profile.nickname}님은 ${ordinalKo(myRank)}으로 달리고 있어요! 🏃`);
      }
      lastRankRef.current = myRank;
    }
  }, [leaderboard, running, profile, showRankPopup]);

  async function startRun() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('위치 권한 필요', 'GPS 추적을 위해 위치 권한이 필요합니다.');
      return;
    }

    setRunning(true);
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
      }
    );

    progressRef.current = setInterval(async () => {
      if (finished.current) return;
      await updateProgress(
        challenge.id, profile.id, profile.nickname,
        distRef.current, durRef.current, false,
      );
      if (distRef.current >= targetM) {
        handleFinish();
      }
    }, 5000);
  }

  async function handleFinish() {
    if (finished.current) return;
    finished.current = true;

    clearInterval(timerRef.current!);
    clearInterval(progressRef.current!);
    locationSubRef.current?.remove();

    await updateProgress(
      challenge.id, profile.id, profile.nickname,
      distRef.current, durRef.current, true,
    );
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
      `${(distRef.current / 1000).toFixed(2)} km 달렸습니다!\n최종 순위: ${ordinalKo(rank)}`,
      [{ text: '확인', onPress: onFinish }],
    );
  }

  function handleStop() {
    Alert.alert('대결 포기', '대결을 중단하시겠어요?', [
      { text: '계속 달리기', style: 'cancel' },
      { text: '중단', style: 'destructive', onPress: () => {
        finished.current = true;
        clearInterval(timerRef.current!);
        clearInterval(progressRef.current!);
        locationSubRef.current?.remove();
        updateProgress(
          challenge.id, profile.id, profile.nickname,
          distRef.current, durRef.current, true,
        );
        onFinish();
      }},
    ]);
  }

  useEffect(() => {
    return () => {
      clearInterval(timerRef.current!);
      clearInterval(progressRef.current!);
      locationSubRef.current?.remove();
    };
  }, []);

  const paceSecPerKm = distanceM > 10 ? (durationS / distanceM) * 1000 : 0;
  const progress = Math.min(distanceM / targetM, 1);
  const sortedBoard = [...leaderboard].sort((a, b) => b.distanceM - a.distanceM);

  return (
    <View style={s.bg}>
      {/* 상단 정보 */}
      <View style={s.topBar}>
        <View style={s.challengeNameWrap}>
          <Text style={s.challengeTitle}>{challenge.title}</Text>
          <Text style={s.challengeSub}>{challenge.distanceKm} km · {challenge.creatorNickname}</Text>
        </View>
        {running && (
          <TouchableOpacity style={s.stopBtn} onPress={handleStop}>
            <Text style={s.stopTxt}>중단</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 내 기록 */}
      <View style={s.myStats}>
        <View style={s.statCol}>
          <Text style={s.statBig}>{(distanceM / 1000).toFixed(2)}</Text>
          <Text style={s.statUnit}>km</Text>
        </View>
        <View style={s.statDiv} />
        <View style={s.statCol}>
          <Text style={s.statBig}>{fmtTime(durationS)}</Text>
          <Text style={s.statUnit}>시간</Text>
        </View>
        <View style={s.statDiv} />
        <View style={s.statCol}>
          <Text style={s.statBig}>{fmtPace(paceSecPerKm)}</Text>
          <Text style={s.statUnit}>페이스</Text>
        </View>
      </View>

      {/* 진행 바 */}
      <View style={s.progressBarBg}>
        <View style={[s.progressBarFill, { width: `${progress * 100}%` as any }]} />
      </View>
      <Text style={s.progressTxt}>
        {(distanceM / 1000).toFixed(2)} / {challenge.distanceKm} km
      </Text>

      {/* 리더보드 */}
      <View style={s.leaderboard}>
        <Text style={s.leaderTitle}>실시간 현황</Text>
        {sortedBoard.length === 0 ? (
          <Text style={s.leaderEmpty}>참여자들이 달리기를 시작하면 여기 표시됩니다</Text>
        ) : (
          sortedBoard.map((e, i) => {
            const isMe = e.userId === profile.id;
            return (
              <View key={e.userId} style={[s.leaderRow, isMe && s.leaderRowMe]}>
                <Text style={[s.leaderRank, i === 0 && s.leaderRankFirst]}>
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                </Text>
                <Text style={[s.leaderName, isMe && s.leaderNameMe]} numberOfLines={1}>
                  {e.nickname}{isMe ? ' (나)' : ''}
                </Text>
                <View style={s.leaderRight}>
                  <Text style={s.leaderDist}>{(e.distanceM / 1000).toFixed(2)} km</Text>
                  <Text style={s.leaderPace}>{fmtPace(e.paceSecPerKm)}/km</Text>
                </View>
                {e.finished && <Text style={s.finishedBadge}>완주</Text>}
              </View>
            );
          })
        )}
      </View>

      {/* 시작 버튼 */}
      {!running && (
        <View style={s.startWrap}>
          <TouchableOpacity style={s.startBtn} onPress={startRun}>
            <Text style={s.startBtnTxt}>달리기 시작</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 랭크 팝업 */}
      {rankPopup && (
        <Animated.View style={[s.popup, {
          opacity: popupAnim,
          transform: [{ translateY: popupAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }],
        }]}>
          <Text style={s.popupTxt}>{rankPopup}</Text>
        </Animated.View>
      )}
    </View>
  );
}

// Haversine 거리 계산 (미터)
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

function makeStyles(c: Colors) {
  return StyleSheet.create({
    bg: { flex: 1, backgroundColor: c.bg },

    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: Platform.OS === 'ios' ? 60 : 36,
      paddingBottom: 12,
    },
    challengeNameWrap: { flex: 1, gap: 2 },
    challengeTitle:    { color: c.text, fontSize: 16, fontWeight: '800' },
    challengeSub:      { color: c.textMuted, fontSize: 12 },
    stopBtn: {
      backgroundColor: '#3a1a1a',
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    stopTxt: { color: '#FF453A', fontSize: 13, fontWeight: '700' },

    myStats: {
      flexDirection: 'row',
      backgroundColor: c.card,
      marginHorizontal: 16,
      borderRadius: 20,
      padding: 20,
      alignItems: 'center',
    },
    statCol:  { flex: 1, alignItems: 'center', gap: 2 },
    statBig:  { color: c.accent, fontSize: 22, fontWeight: '800' },
    statUnit: { color: c.textFaint, fontSize: 11 },
    statDiv:  { width: 1, height: 36, backgroundColor: c.border },

    progressBarBg: {
      height: 6,
      backgroundColor: c.card2,
      borderRadius: 3,
      marginHorizontal: 16,
      marginTop: 16,
      overflow: 'hidden',
    },
    progressBarFill: { height: 6, backgroundColor: c.accent, borderRadius: 3 },
    progressTxt: {
      color: c.textFaint,
      fontSize: 12,
      textAlign: 'right',
      marginRight: 16,
      marginTop: 4,
    },

    leaderboard: {
      flex: 1,
      backgroundColor: c.card,
      marginHorizontal: 16,
      marginTop: 16,
      borderRadius: 20,
      padding: 16,
    },
    leaderTitle: { color: c.textMuted, fontSize: 12, fontWeight: '600', marginBottom: 12 },
    leaderEmpty: { color: c.textFaint, fontSize: 13, textAlign: 'center', marginTop: 20 },
    leaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: c.card3,
      gap: 8,
    },
    leaderRowMe:    { backgroundColor: c.rowMeBg, borderRadius: 10, paddingHorizontal: 8 },
    leaderRank:     { color: c.textFaint, fontSize: 16, width: 28, textAlign: 'center' },
    leaderRankFirst: { color: '#FFD60A' },
    leaderName:     { flex: 1, color: c.textSub, fontSize: 14 },
    leaderNameMe:   { color: c.accent, fontWeight: '700' },
    leaderRight:    { alignItems: 'flex-end', gap: 2 },
    leaderDist:     { color: c.text, fontSize: 14, fontWeight: '700' },
    leaderPace:     { color: c.textFaint, fontSize: 11 },
    finishedBadge: {
      backgroundColor: 'rgba(255,214,10,0.13)',
      color: '#FFD60A',
      fontSize: 10,
      fontWeight: '700',
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },

    startWrap: { padding: 16, paddingBottom: Platform.OS === 'ios' ? 36 : 20 },
    startBtn: {
      backgroundColor: c.accent,
      borderRadius: 16,
      paddingVertical: 18,
      alignItems: 'center',
    },
    startBtnTxt: { color: '#fff', fontSize: 18, fontWeight: '800' },

    popup: {
      position: 'absolute',
      top: Platform.OS === 'ios' ? 120 : 100,
      left: 24,
      right: 24,
      backgroundColor: c.rankBg,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: c.accent,
      shadowColor: c.accent,
      shadowOpacity: 0.4,
      shadowRadius: 12,
      elevation: 8,
    },
    popupTxt: { color: c.accent, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  });
}
