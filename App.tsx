import React, { useState, useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

// ── 탭 화면 ──────────────────────────────────────────────────────
import MainHomeScreen    from './src/screens/MainHomeScreen';
import RunHistoryScreen  from './src/screens/RunHistoryScreen';
import RankingScreen     from './src/screens/RankingScreen';
import MyPageScreen      from './src/screens/MyPageScreen';

// ── 달리기 플로우 화면 ────────────────────────────────────────────
import HomeScreen        from './src/screens/HomeScreen';
import RoutePreviewScreen from './src/screens/RoutePreviewScreen';
import RunningScreen     from './src/screens/RunningScreen';
import SummaryScreen     from './src/screens/SummaryScreen';
import ReviewScreen      from './src/screens/ReviewScreen';

// ── 기타 ─────────────────────────────────────────────────────────
import ProfileSetupScreen from './src/screens/ProfileSetupScreen';
import BottomTabBar, { TabKey } from './src/components/BottomTabBar';

import { generateBestRoutes }             from './src/services/routingService';
import { loadProfile, saveProfile }       from './src/services/userService';
import { submitRunRecord, getMonthKey }   from './src/services/rankingService';
import {
  Coordinate, RouteCandidate, RunStats, RouteReview,
  UserProfile, RunRecord,
} from './src/types';

// 달리기 플로우 단계 (null이면 탭 내비게이터 표시)
type RunFlow = 'selecting' | 'preview' | 'running' | 'summary' | 'review';

export default function App() {
  // ── 탭 상태 ────────────────────────────────────────────────────
  const [activeTab,  setActiveTab]  = useState<TabKey>('home');

  // ── 달리기 플로우 상태 ──────────────────────────────────────────
  const [runFlow,    setRunFlow]    = useState<RunFlow | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');

  // ── 달리기 데이터 ───────────────────────────────────────────────
  const [startCoord,  setStartCoord]  = useState<Coordinate | null>(null);
  const [routes,      setRoutes]      = useState<RouteCandidate[]>([]);
  const [activeRoute, setActiveRoute] = useState<RouteCandidate | null>(null);
  const [runStats,    setRunStats]    = useState<RunStats | null>(null);

  // ── 프로필 ─────────────────────────────────────────────────────
  const [profile,         setProfile]         = useState<UserProfile | null>(null);
  const [showProfileSetup, setShowProfileSetup] = useState(false);

  useEffect(() => { loadProfile().then(p => setProfile(p)); }, []);

  // ── 경로 탐색 ──────────────────────────────────────────────────

  async function handleSearch(start: Coordinate, distanceM: number) {
    setLoading(true);
    setLoadingMsg('경로 후보 생성 중...');
    setStartCoord(start);
    try {
      const timer = setTimeout(() => setLoadingMsg('신호등 정보 분석 중...'), 3000);
      const candidates = await generateBestRoutes(start, distanceM);
      clearTimeout(timer);
      setRoutes(candidates);
      setRunFlow('preview');
    } finally {
      setLoading(false);
      setLoadingMsg('');
    }
  }

  function handleStartRun(route: RouteCandidate) {
    setActiveRoute(route);
    setRunFlow('running');
  }

  // ── 달리기 종료 & 랭킹 제출 ─────────────────────────────────────

  function handleFinish(stats: RunStats) {
    setRunStats(stats);
    setRunFlow('summary');

    if (profile?.optedInRanking) {
      const record: RunRecord = {
        runId:       stats.id,
        userId:      profile.id,
        nickname:    profile.nickname,
        month:       getMonthKey(),
        distanceM:   stats.distance,
        durationS:   stats.duration,
        isOffRun:    false,
        submittedAt: new Date().toISOString(),
      };
      submitRunRecord(record);
    }
  }

  function handleReviewSubmitted(review: RouteReview) {
    if (!profile?.optedInRanking || !runStats) return;
    const isOffRun = review.hasIssues || review.rating <= 2;
    if (!isOffRun) return;
    const record: RunRecord = {
      runId:       runStats.id,
      userId:      profile.id,
      nickname:    profile.nickname,
      month:       getMonthKey(),
      distanceM:   runStats.distance,
      durationS:   runStats.duration,
      isOffRun:    true,
      submittedAt: new Date().toISOString(),
    };
    submitRunRecord(record);
  }

  // ── 네비게이션 핸들러 ───────────────────────────────────────────

  function handleHome() {
    setRunFlow(null);
    setRoutes([]);
    setActiveRoute(null);
    setRunStats(null);
    setActiveTab('home');
  }

  async function handleProfileSaved(p: UserProfile) {
    await saveProfile(p);
    setProfile(p);
    setShowProfileSetup(false);
  }

  // ── 로딩 오버레이 ───────────────────────────────────────────────

  if (loading) {
    return (
      <View style={s.loadingBg}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color="#00C853" />
        <Text style={s.loadingTxt}>{loadingMsg}</Text>
        <Text style={s.loadingHint}>
          최적 경로를 계산하는 중입니다{'\n'}잠시만 기다려주세요 (약 10~20초)
        </Text>
      </View>
    );
  }

  // ── 프로필 설정 (편집 / 최초 설정) ─────────────────────────────

  if (showProfileSetup) {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <ProfileSetupScreen
          existing={profile}
          onSave={handleProfileSaved}
          onBack={() => setShowProfileSetup(false)}
        />
      </SafeAreaProvider>
    );
  }

  // ── 달리기 플로우 (탭바 없음) ───────────────────────────────────

  if (runFlow === 'selecting') {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <HomeScreen onSearch={handleSearch} />
      </SafeAreaProvider>
    );
  }

  if (runFlow === 'preview' && routes.length > 0 && startCoord) {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <RoutePreviewScreen
          routes={routes}
          start={startCoord}
          onStart={handleStartRun}
          onBack={handleHome}
        />
      </SafeAreaProvider>
    );
  }

  if (runFlow === 'running' && activeRoute && startCoord) {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <RunningScreen
          route={activeRoute}
          start={startCoord}
          onFinish={handleFinish}
        />
      </SafeAreaProvider>
    );
  }

  if (runFlow === 'summary' && runStats) {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <SummaryScreen
          stats={runStats}
          profile={profile}
          onHome={handleHome}
          onReview={() => setRunFlow('review')}
          onRanking={() => { handleHome(); setActiveTab('ranking'); }}
        />
      </SafeAreaProvider>
    );
  }

  if (runFlow === 'review' && runStats) {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <ReviewScreen
          trail={runStats.trail}
          routePolyline={runStats.routePolyline}
          onDone={handleHome}
          onReviewSubmitted={handleReviewSubmitted}
        />
      </SafeAreaProvider>
    );
  }

  // ── 탭 네비게이터 (기본 화면) ────────────────────────────────────

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <View style={s.tabRoot}>
        <View style={s.tabContent}>
          {activeTab === 'home' && (
            <MainHomeScreen
              profile={profile}
              onStartRun={() => setRunFlow('selecting')}
            />
          )}
          {activeTab === 'records' && (
            <RunHistoryScreen profile={profile} />
          )}
          {activeTab === 'ranking' && (
            <RankingScreen
              profile={profile}
              onBack={() => setActiveTab('home')}
              onSetupProfile={() => setShowProfileSetup(true)}
            />
          )}
          {activeTab === 'mypage' && (
            <MyPageScreen
              profile={profile}
              onProfileChange={setProfile}
              onEditProfile={() => setShowProfileSetup(true)}
            />
          )}
        </View>
        <BottomTabBar active={activeTab} onChange={setActiveTab} />
      </View>
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  loadingBg: {
    flex: 1,
    backgroundColor: '#0f0f0f',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    padding: 32,
  },
  loadingTxt:  { color: '#fff', fontSize: 17, fontWeight: '600' },
  loadingHint: { color: '#555', fontSize: 13, textAlign: 'center', lineHeight: 20 },

  tabRoot:    { flex: 1, backgroundColor: '#0f0f0f' },
  tabContent: { flex: 1 },
});
