import React, { useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import HomeScreen from './src/screens/HomeScreen';
import RoutePreviewScreen from './src/screens/RoutePreviewScreen';
import RunningScreen from './src/screens/RunningScreen';
import SummaryScreen from './src/screens/SummaryScreen';
import ReviewScreen from './src/screens/ReviewScreen';

import { generateBestRoutes } from './src/services/routingService';
import { Coordinate, RouteCandidate, RunStats } from './src/types';

type Screen = 'home' | 'preview' | 'running' | 'summary' | 'review';

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');

  const [startCoord, setStartCoord] = useState<Coordinate | null>(null);
  const [routes, setRoutes] = useState<RouteCandidate[]>([]);
  const [activeRoute, setActiveRoute] = useState<RouteCandidate | null>(null);
  const [runStats, setRunStats] = useState<RunStats | null>(null);

  async function handleSearch(start: Coordinate, distanceM: number) {
    setLoading(true);
    setLoadingMsg('경로 후보 생성 중...');
    setStartCoord(start);
    try {
      // Two-phase feedback: first message for OSRM, second for Overpass
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

  function handleFinish(stats: RunStats) {
    setRunStats(stats);
    setScreen('summary');
  }

  function handleReview() {
    setScreen('review');
  }

  function handleHome() {
    setScreen('home');
    setRoutes([]);
    setActiveRoute(null);
    setRunStats(null);
  }

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
        <HomeScreen onSearch={handleSearch} />
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
        <SummaryScreen stats={runStats} onHome={handleHome} onReview={handleReview} />
      )}

      {screen === 'review' && runStats && (
        <ReviewScreen
          trail={runStats.trail}
          routePolyline={runStats.routePolyline}
          onDone={handleHome}
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
