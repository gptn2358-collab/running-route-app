import React, { useState, useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import HomeScreen from './src/screens/HomeScreen';
import RoutePreviewScreen from './src/screens/RoutePreviewScreen';
import RunningScreen from './src/screens/RunningScreen';
import SummaryScreen from './src/screens/SummaryScreen';
import ReviewScreen from './src/screens/ReviewScreen';
import RankingScreen from './src/screens/RankingScreen';
import ProfileSetupScreen from './src/screens/ProfileSetupScreen';

import { generateBestRoutes } from './src/services/routingService';
import { loadProfile, saveProfile } from './src/services/userService';
import { submitRunRecord, getMonthKey } from './src/services/rankingService';
import {
  Coordinate,
  RouteCandidate,
  RunStats,
  RouteReview,
  UserProfile,
  RunRecord,
} from './src/types';

type Screen = 'home' | 'preview' | 'running' | 'summary' | 'review' | 'ranking' | 'profile-setup';

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');

  const [startCoord, setStartCoord] = useState<Coordinate | null>(null);
  const [routes, setRoutes] = useState<RouteCandidate[]>([]);
  const [activeRoute, setActiveRoute] = useState<RouteCandidate | null>(null);
  const [runStats, setRunStats] = useState<RunStats | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  // Load user profile on startup
  useEffect(() => {
    loadProfile().then(p => setProfile(p));
  }, []);

  // ── Route search ───────────────────────────────────────────────

  async function handleSearch(start: Coordinate, distanceM: number) {
    setLoading(true);
    setLoadingMsg('경로 후보 생성 중...');
    setStartCoord(start);
    try {
      const timer = setTimeout(() => setLoadingMsg('신호등 정보 분석 중...'), 3000);
      const candidates = await generateBestRoutes(start, distanceM);
      clearTimeout(timer);
      setRoutes(candidates);
      setScreen('preview');
    } finally {
      setLoading(false);
      setLoadingMsg('');
    }
  }

  function handleStartRun(route: RouteCandidate) {
    setActiveRoute(route);
    setScreen('running');
  }

  // ── Run finish & ranking submission ────────────────────────────

  function handleFinish(stats: RunStats) {
    setRunStats(stats);
    setScreen('summary');
    // Submit long-runner record if opted in (isOffRun defaults to false;
    // updated to true if the user later reviews with issues)
    if (profile?.optedInRanking) {
      const record: RunRecord = {
        runId: stats.id,
        userId: profile.id,
        nickname: profile.nickname,
        month: getMonthKey(),
        distanceM: stats.distance,
        isOffRun: false,
        submittedAt: new Date().toISOString(),
      };
      submitRunRecord(record);
    }
  }

  function handleReviewSubmitted(review: RouteReview) {
    if (!profile?.optedInRanking || !runStats) return;
    const isOffRun = review.hasIssues || review.rating <= 2;
    if (!isOffRun) return;
    // Update the existing record to mark this run as off-run
    const record: RunRecord = {
      runId: runStats.id,
      userId: profile.id,
      nickname: profile.nickname,
      month: getMonthKey(),
      distanceM: runStats.distance,
      isOffRun: true,
      submittedAt: new Date().toISOString(),
    };
    submitRunRecord(record);
  }

  // ── Navigation ─────────────────────────────────────────────────

  function handleReview() {
    setScreen('review');
  }

  function handleHome() {
    setScreen('home');
    setRoutes([]);
    setActiveRoute(null);
    setRunStats(null);
  }

  function handleRanking() {
    setScreen('ranking');
  }

  function handleProfileSetup() {
    setScreen('profile-setup');
  }

  async function handleProfileSaved(p: UserProfile) {
    await saveProfile(p);
    setProfile(p);
    // Return to wherever was appropriate
    setScreen(runStats ? 'summary' : 'home');
  }

  function handleBackFromProfile() {
    setScreen(runStats ? 'summary' : 'home');
  }

  function handleBackFromRanking() {
    setScreen(runStats ? 'summary' : 'home');
  }

  // ── Loading overlay ────────────────────────────────────────────

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

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />

      {screen === 'home' && (
        <HomeScreen
          onSearch={handleSearch}
          onRanking={handleRanking}
          onProfile={handleProfileSetup}
        />
      )}

      {screen === 'preview' && routes.length > 0 && startCoord && (
        <RoutePreviewScreen
          routes={routes}
          start={startCoord}
          onStart={handleStartRun}
          onBack={handleHome}
        />
      )}

      {screen === 'running' && activeRoute && startCoord && (
        <RunningScreen
          route={activeRoute}
          start={startCoord}
          onFinish={handleFinish}
        />
      )}

      {screen === 'summary' && runStats && (
        <SummaryScreen
          stats={runStats}
          profile={profile}
          onHome={handleHome}
          onReview={handleReview}
          onRanking={handleRanking}
        />
      )}

      {screen === 'review' && runStats && (
        <ReviewScreen
          trail={runStats.trail}
          routePolyline={runStats.routePolyline}
          onDone={handleHome}
          onReviewSubmitted={handleReviewSubmitted}
        />
      )}

      {screen === 'ranking' && (
        <RankingScreen
          profile={profile}
          onBack={handleBackFromRanking}
          onSetupProfile={handleProfileSetup}
        />
      )}

      {screen === 'profile-setup' && (
        <ProfileSetupScreen
          existing={profile}
          onSave={handleProfileSaved}
          onBack={handleBackFromProfile}
        />
      )}
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
  loadingTxt: { color: '#fff', fontSize: 17, fontWeight: '600' },
  loadingHint: { color: '#555', fontSize: 13, textAlign: 'center', lineHeight: 20 },
});
