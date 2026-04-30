import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { IntersectionSignal, DIR_KO } from '../services/spatService';

interface Props {
  signal: IntersectionSignal | null;
  distanceM: number | null; // distance to nearest light
}

const PHASE_COLOR = {
  green: '#00C853',
  uncertain: '#FFD60A',
  red: '#FF453A',
};

const PHASE_KO = {
  green: '보행 가능',
  uncertain: '신호 전환 주의',
  red: '대기',
};

const PHASE_ICON = {
  green: '🟢',
  uncertain: '🟡',
  red: '🔴',
};

export default function SignalOverlay({ signal, distanceM }: Props) {
  if (!signal || distanceM === null || distanceM > 150) return null;

  const { best } = signal;

  // Nothing actionable in the SPaT record
  if (!best) {
    return (
      <View style={s.card}>
        <Text style={s.header}>🚦 V2X 신호</Text>
        <Text style={s.sub}>신호 정보 분석 중...</Text>
      </View>
    );
  }

  const { dir, signal: sig } = best;
  const color = PHASE_COLOR[sig.phase];
  const secInt = Math.round(sig.remainingSec);

  return (
    <View style={[s.card, { borderLeftColor: color }]}>
      <View style={s.row}>
        <Text style={s.icon}>{PHASE_ICON[sig.phase]}</Text>
        <View>
          <Text style={[s.phase, { color }]}>
            {PHASE_KO[sig.phase]}
          </Text>
          <Text style={s.detail}>
            {DIR_KO[dir]}방향 보행 신호 · 잔여 {secInt}초
          </Text>
        </View>
      </View>

      {sig.phase === 'green' && secInt <= 10 && (
        <Text style={s.urgent}>⚠️ 곧 적색 전환 — 서두르세요!</Text>
      )}
      {sig.phase === 'red' && secInt <= 15 && (
        <Text style={s.soon}>약 {secInt}초 후 보행 신호 시작</Text>
      )}

      <Text style={s.source}>서울 T-Data V2X · {distanceM.toFixed(0)}m 전방</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(15,15,15,0.92)',
    borderRadius: 14,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#555',
    marginTop: 8,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  icon: { fontSize: 22 },
  header: { color: '#aaa', fontSize: 11, marginBottom: 4 },
  phase: { fontSize: 15, fontWeight: '700' },
  detail: { color: '#bbb', fontSize: 12, marginTop: 1 },
  urgent: { color: '#FF453A', fontSize: 12, fontWeight: '600', marginTop: 4 },
  soon: { color: '#00C853', fontSize: 12, fontWeight: '600', marginTop: 4 },
  source: { color: '#444', fontSize: 10, marginTop: 6 },
});
