import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Platform, ActivityIndicator,
  TouchableOpacity, TextInput, KeyboardAvoidingView, FlatList,
} from 'react-native';
import { RunRecord, RouteReview, UserProfile } from '../types';
import { getUserRunHistory, formatMonthLabel } from '../services/rankingService';
import { getReviewByRunId } from '../services/reviewService';
import { sendAIMessage, ChatMessage } from '../services/aiService';
import { useTheme } from '../context/ThemeContext';
import { Colors } from '../theme';
import RunDetailScreen from './RunDetailScreen';

interface Props {
  profile: UserProfile | null;
}

// ── 포맷 유틸 ──────────────────────────────────────────────────────

function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function fmtDuration(s: number) {
  if (!s) return '-';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

function fmtPace(distM: number, durationS: number) {
  if (!durationS || distM < 100) return '-';
  const secPerKm = (durationS / distM) * 1000;
  return `${Math.floor(secPerKm / 60)}'${Math.round(secPerKm % 60).toString().padStart(2, '0')}"`;
}

// ── 월별 그룹 ─────────────────────────────────────────────────────

interface MonthGroup {
  monthKey: string;
  records: RunRecord[];
  totalKm: number;
  totalDurationS: number;
}

function groupByMonth(records: RunRecord[]): MonthGroup[] {
  const map = new Map<string, RunRecord[]>();
  for (const r of records) {
    const arr = map.get(r.month) ?? [];
    arr.push(r);
    map.set(r.month, arr);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([monthKey, recs]) => ({
      monthKey,
      records: recs.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
      totalKm: recs.reduce((s, r) => s + r.distanceM, 0),
      totalDurationS: recs.reduce((s, r) => s + (r.durationS ?? 0), 0),
    }));
}

// ── 추천 질문 ─────────────────────────────────────────────────────

const SUGGESTED_QUESTIONS = [
  '성장을 위한 러닝법은?',
  '내 데이터 기반 추천 훈련 계획',
  '현재 페이스로 하프 마라톤 가능할까?',
  '러닝과 비슷한 추천 운동 종목은?',
  '부상 없이 거리를 늘리는 방법은?',
  '내 러닝 데이터 분석해줘',
];

// ── AI 코치 탭 ────────────────────────────────────────────────────

interface AiCoachProps {
  profile: UserProfile | null;
  history: RunRecord[];
}

function AiCoachTab({ profile, history }: AiCoachProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput]       = useState('');
  const [sending, setSending]   = useState(false);
  const [elapsed, setElapsed]   = useState(0);
  const flatRef  = useRef<FlatList<ChatMessage>>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { colors } = useTheme();
  const ai = useMemo(() => makeAiStyles(colors), [colors]);

  useEffect(() => {
    if (sending) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setElapsed(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [sending]);

  const recentSegments = history[0]?.segments;

  async function send(text: string) {
    if (!text.trim() || sending) return;
    const userMsg: ChatMessage = { role: 'user', content: text.trim() };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    setSending(true);
    try {
      const reply = await sendAIMessage(next, profile, history, recentSegments);
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch (e: any) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `⚠️ ${e.message ?? '오류가 발생했습니다. 다시 시도해주세요.'}`,
      }]);
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages]);

  return (
    <KeyboardAvoidingView
      style={ai.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {messages.length === 0 ? (
        <ScrollView style={ai.introScroll} contentContainerStyle={ai.introContent}>
          <Text style={ai.introIcon}>🤖</Text>
          <Text style={ai.introTitle}>AI 러닝 코치</Text>
          <Text style={ai.introDesc}>
            내 달리기 데이터를 기반으로{'\n'}
            궁금한 것을 무엇이든 물어보세요
          </Text>
          {history.length === 0 && (
            <View style={ai.noDataBadge}>
              <Text style={ai.noDataTxt}>
                달리기 기록이 없어도 일반적인 러닝 조언을 드릴 수 있어요
              </Text>
            </View>
          )}
          <Text style={ai.suggestLabel}>추천 질문</Text>
          <View style={ai.suggestGrid}>
            {SUGGESTED_QUESTIONS.map((q) => (
              <TouchableOpacity
                key={q}
                style={ai.suggestChip}
                onPress={() => send(q)}
              >
                <Text style={ai.suggestTxt}>{q}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      ) : (
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={ai.chatContent}
          renderItem={({ item }) => (
            <View style={[
              ai.bubble,
              item.role === 'user' ? ai.bubbleUser : ai.bubbleAI,
            ]}>
              <Text style={[
                ai.bubbleTxt,
                item.role === 'user' ? ai.bubbleTxtUser : ai.bubbleTxtAI,
              ]}>
                {item.content}
              </Text>
            </View>
          )}
          ListFooterComponent={sending ? (
            <View style={[ai.bubble, ai.bubbleAI]}>
              <Text style={ai.thinkingTxt}>생각 중... {elapsed}초</Text>
            </View>
          ) : null}
        />
      )}

      <View style={ai.inputRow}>
        <TextInput
          style={ai.input}
          placeholder="러닝에 대해 질문하세요..."
          placeholderTextColor={colors.textFaint}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={() => send(input)}
          returnKeyType="send"
          multiline
        />
        <TouchableOpacity
          style={[ai.sendBtn, (!input.trim() || sending) && ai.sendBtnOff]}
          onPress={() => send(input)}
          disabled={!input.trim() || sending}
        >
          <Text style={ai.sendBtnTxt}>전송</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ── 메인 화면 ─────────────────────────────────────────────────────

export default function RunHistoryScreen({ profile }: Props) {
  const [groups, setGroups]             = useState<MonthGroup[]>([]);
  const [history, setHistory]           = useState<RunRecord[]>([]);
  const [loading, setLoading]           = useState(true);
  const [tab, setTab]                   = useState<'records' | 'ai'>('records');
  const [selectedRecord, setSelectedRecord] = useState<RunRecord | null>(null);
  const [selectedReview, setSelectedReview] = useState<RouteReview | null>(null);

  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  useEffect(() => {
    getUserRunHistory(profile?.id ?? '').then(records => {
      setHistory(records);
      setGroups(groupByMonth(records));
      setLoading(false);
    });
  }, [profile]);

  async function handleSelectRecord(record: RunRecord) {
    const review = await getReviewByRunId(record.runId);
    setSelectedReview(review);
    setSelectedRecord(record);
  }

  function handleCloseDetail() {
    setSelectedRecord(null);
    setSelectedReview(null);
  }

  const allTime = groups.reduce(
    (acc, g) => ({ km: acc.km + g.totalKm, runs: acc.runs + g.records.length }),
    { km: 0, runs: 0 },
  );

  return (
    <View style={s.container}>
      {/* 헤더 */}
      <View style={s.header}>
        <Text style={s.headerTitle}>나의 러닝 기록</Text>
        <View style={s.tabRow}>
          <TouchableOpacity
            style={[s.tabBtn, tab === 'records' && s.tabBtnOn]}
            onPress={() => setTab('records')}
          >
            <Text style={[s.tabBtnTxt, tab === 'records' && s.tabBtnTxtOn]}>내 기록</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.tabBtn, tab === 'ai' && s.tabBtnOn]}
            onPress={() => setTab('ai')}
          >
            <Text style={[s.tabBtnTxt, tab === 'ai' && s.tabBtnTxtOn]}>AI 코치 🤖</Text>
          </TouchableOpacity>
        </View>
      </View>

      <RunDetailScreen
        record={selectedRecord}
        review={selectedReview}
        onClose={handleCloseDetail}
      />

      {tab === 'ai' ? (
        <AiCoachTab profile={profile} history={history} />
      ) : loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
          {/* 전체 요약 */}
          {allTime.runs > 0 && (
            <View style={s.totalCard}>
              <Text style={s.totalTitle}>전체 기록 요약</Text>
              <View style={s.totalRow}>
                <View style={s.totalItem}>
                  <Text style={s.totalBig}>{allTime.runs}</Text>
                  <Text style={s.totalLbl}>총 달리기</Text>
                </View>
                <View style={s.totalDivider} />
                <View style={s.totalItem}>
                  <Text style={s.totalBig}>{(allTime.km / 1000).toFixed(1)}</Text>
                  <Text style={s.totalLbl}>총 km</Text>
                </View>
                <View style={s.totalDivider} />
                <View style={s.totalItem}>
                  <Text style={s.totalBig}>
                    {allTime.runs > 0 ? (allTime.km / allTime.runs / 1000).toFixed(1) : '-'}
                  </Text>
                  <Text style={s.totalLbl}>평균 km</Text>
                </View>
              </View>
            </View>
          )}

          {/* 월별 그룹 */}
          {groups.length === 0 ? (
            <View style={s.empty}>
              <Text style={s.emptyIcon}>🏃</Text>
              <Text style={s.emptyTitle}>아직 달리기 기록이 없어요</Text>
              <Text style={s.emptyDesc}>
                첫 번째 달리기를 완료하면{'\n'}여기에 기록이 쌓입니다!
              </Text>
            </View>
          ) : (
            groups.map(group => (
              <View key={group.monthKey} style={s.monthSection}>
                <View style={s.monthHeader}>
                  <Text style={s.monthTitle}>{formatMonthLabel(group.monthKey)}</Text>
                  <View style={s.monthBadgeRow}>
                    <View style={s.monthBadge}>
                      <Text style={s.monthBadgeTxt}>{group.records.length}회</Text>
                    </View>
                    <View style={s.monthBadge}>
                      <Text style={s.monthBadgeTxt}>
                        {(group.totalKm / 1000).toFixed(1)} km
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={s.runList}>
                  {group.records.map((r, i) => (
                    <TouchableOpacity
                      key={r.runId}
                      style={[s.runCard, i < group.records.length - 1 && s.runCardBorder]}
                      onPress={() => handleSelectRecord(r)}
                      activeOpacity={0.7}
                    >
                      <View style={s.runLeft}>
                        <View style={s.runDateRow}>
                          <Text style={s.runDate}>{fmtDate(r.submittedAt)}</Text>
                          {r.isOffRun && (
                            <View style={s.offBadge}>
                              <Text style={s.offBadgeTxt}>오프코스</Text>
                            </View>
                          )}
                        </View>
                        <View style={s.runMetaRow}>
                          <Text style={s.runMeta}>⏱ {fmtDuration(r.durationS ?? 0)}</Text>
                          <Text style={s.runMeta}>
                            {'  '}페이스 {fmtPace(r.distanceM, r.durationS ?? 0)}
                          </Text>
                        </View>
                      </View>
                      <View style={s.runRight}>
                        <Text style={s.runKm}>{(r.distanceM / 1000).toFixed(2)}</Text>
                        <Text style={s.runKmUnit}>km</Text>
                        <Text style={s.runChevron}>›</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ── 스타일 ────────────────────────────────────────────────────────

function makeStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },

    header: {
      paddingTop: Platform.OS === 'ios' ? 60 : 40,
      paddingHorizontal: 20,
      paddingBottom: 0,
    },
    headerTitle: { color: c.text, fontSize: 22, fontWeight: '800', marginBottom: 14 },

    tabRow:      { flexDirection: 'row', gap: 8, marginBottom: 4 },
    tabBtn:      { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: c.card },
    tabBtnOn:    { backgroundColor: c.accent },
    tabBtnTxt:   { color: c.textMuted, fontSize: 13, fontWeight: '600' },
    tabBtnTxtOn: { color: '#fff' },

    scroll:        { flex: 1 },
    scrollContent: { padding: 16, paddingBottom: 32, gap: 16 },

    totalCard:    { backgroundColor: c.card, borderRadius: 20, padding: 20 },
    totalTitle:   { color: c.textMuted, fontSize: 12, fontWeight: '600', marginBottom: 16 },
    totalRow:     { flexDirection: 'row', alignItems: 'center' },
    totalItem:    { flex: 1, alignItems: 'center' },
    totalBig:     { color: c.accent, fontSize: 26, fontWeight: '800' },
    totalLbl:     { color: c.textMuted, fontSize: 11, marginTop: 4 },
    totalDivider: { width: 1, height: 40, backgroundColor: c.border },

    monthSection: { gap: 8 },
    monthHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 4,
    },
    monthTitle:     { color: c.textSub, fontSize: 14, fontWeight: '700' },
    monthBadgeRow:  { flexDirection: 'row', gap: 6 },
    monthBadge:     { backgroundColor: c.card3, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
    monthBadgeTxt:  { color: c.textMuted, fontSize: 11, fontWeight: '600' },

    runList:       { backgroundColor: c.card, borderRadius: 16, overflow: 'hidden' },
    runCard:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16 },
    runCardBorder: { borderBottomWidth: 1, borderBottomColor: c.card3 },
    runLeft:       { flex: 1, gap: 5 },
    runDateRow:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
    runDate:       { color: c.textSub, fontSize: 14, fontWeight: '600' },
    offBadge:      { backgroundColor: '#2a1a0a', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
    offBadgeTxt:   { color: '#FFD60A', fontSize: 10, fontWeight: '700' },
    runMetaRow:    { flexDirection: 'row', gap: 4 },
    runMeta:       { color: c.textFaint, fontSize: 12 },
    runRight:      { alignItems: 'flex-end' },
    runKm:         { color: c.accent, fontSize: 22, fontWeight: '800' },
    runKmUnit:     { color: c.textFaint, fontSize: 11 },
    runChevron:    { color: c.textFaint, fontSize: 18, marginTop: 2 },

    empty:      { alignItems: 'center', paddingTop: 60, gap: 12 },
    emptyIcon:  { fontSize: 52 },
    emptyTitle: { color: c.text, fontSize: 18, fontWeight: '700' },
    emptyDesc:  { color: c.textFaint, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  });
}

function makeAiStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1 },

    introScroll:   { flex: 1 },
    introContent:  { padding: 24, alignItems: 'center', paddingBottom: 32 },
    introIcon:     { fontSize: 52, marginBottom: 12, marginTop: 8 },
    introTitle:    { color: c.text, fontSize: 20, fontWeight: '800', marginBottom: 8 },
    introDesc: {
      color: c.textMuted,
      fontSize: 14,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: 16,
    },
    noDataBadge: { backgroundColor: c.card, borderRadius: 12, padding: 12, marginBottom: 20 },
    noDataTxt:   { color: c.textMuted, fontSize: 12, textAlign: 'center' },
    suggestLabel: {
      color: c.textFaint,
      fontSize: 12,
      fontWeight: '600',
      alignSelf: 'flex-start',
      marginBottom: 10,
    },
    suggestGrid: { width: '100%', gap: 8 },
    suggestChip: {
      backgroundColor: c.card,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor: c.border,
    },
    suggestTxt: { color: c.textSub, fontSize: 14 },

    chatContent: { padding: 16, paddingBottom: 8, gap: 10 },
    bubble: {
      maxWidth: '85%',
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    bubbleUser: {
      alignSelf: 'flex-end',
      backgroundColor: c.accent,
      borderBottomRightRadius: 4,
    },
    bubbleAI: {
      alignSelf: 'flex-start',
      backgroundColor: c.card,
      borderBottomLeftRadius: 4,
    },
    bubbleTxt:     { fontSize: 14, lineHeight: 20 },
    bubbleTxtUser: { color: '#fff' },
    bubbleTxtAI:   { color: c.textSub },
    thinkingTxt:   { color: c.accent, fontSize: 14 },

    inputRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 8,
      padding: 12,
      paddingBottom: Platform.OS === 'ios' ? 28 : 12,
      backgroundColor: c.tabBg,
      borderTopWidth: 1,
      borderTopColor: c.tabBorder,
    },
    input: {
      flex: 1,
      backgroundColor: c.card,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      color: c.text,
      fontSize: 14,
      maxHeight: 100,
      borderWidth: 1,
      borderColor: c.border,
    },
    sendBtn: {
      backgroundColor: c.accent,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 11,
    },
    sendBtnOff: { opacity: 0.4 },
    sendBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },
  });
}
