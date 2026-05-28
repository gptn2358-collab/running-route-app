import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Platform, Alert, ActivityIndicator, Modal,
  RefreshControl,
} from 'react-native';
import { UserProfile, Challenge, RunRecord, BattleRecord } from '../types';
import {
  getOpenChallenges, createChallenge, joinChallenge,
  cancelChallenge, leaveChallenge, getUserBattleHistory,
} from '../services/challengeService';
import { getUserRunHistory } from '../services/rankingService';
import { useTheme } from '../context/ThemeContext';
import { Colors } from '../theme';

type ViewKey = 'list' | 'history';

type SortKey = 'relevant' | 'newest' | 'soonest';

interface Props {
  profile: UserProfile | null;
  onEnterBattle: (challengeId: string) => void;
  onSetupProfile: () => void;
}

const DISTANCE_OPTIONS = [3, 5, 10];
const MAX_PARTICIPANT_OPTIONS = [2, 3, 4, 5, 10];

function formatScheduledAt(iso: string): string {
  const d = new Date(iso);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  const wd = weekdays[d.getDay()];
  return `${month}/${day}(${wd}) ${h}:${m}`;
}

function isStartable(iso: string): boolean {
  const diff = new Date(iso).getTime() - Date.now();
  return diff <= 5 * 60 * 1000;
}

function timeUntil(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return '지금 시작';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 0) return `${h}시간 ${m}분 후`;
  return `${m}분 후`;
}

export default function ChallengeScreen({ profile, onEnterBattle, onSetupProfile }: Props) {
  const [challenges, setChallenges]       = useState<Challenge[]>([]);
  const [loading, setLoading]             = useState(true);
  const [refreshing, setRefreshing]       = useState(false);
  const [showCreate, setShowCreate]       = useState(false);
  const [view, setView]                   = useState<ViewKey>('list');
  const [sortKey, setSortKey]             = useState<SortKey>('soonest');
  const [runHistory, setRunHistory]       = useState<RunRecord[]>([]);
  const [battleHistory, setBattleHistory] = useState<BattleRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [roomTitle, setRoomTitle]   = useState('');
  const [distanceKm, setDistanceKm] = useState(5);
  const [maxPart, setMaxPart]       = useState(4);
  const [dateStr, setDateStr]       = useState('');
  const [timeStr, setTimeStr]       = useState('');
  const [creating, setCreating]     = useState(false);

  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const load = useCallback(async () => {
    const list = await getOpenChallenges();
    setChallenges(list);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
    if (profile?.id) {
      getUserRunHistory(profile.id).then(setRunHistory);
    }
  }, [load, profile?.id]);

  useEffect(() => {
    if (view === 'history' && profile?.id) {
      setHistoryLoading(true);
      getUserBattleHistory(profile.id)
        .then(setBattleHistory)
        .finally(() => setHistoryLoading(false));
    }
  }, [view, profile?.id]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function requireProfile(): boolean {
    if (!profile) {
      Alert.alert('프로필 필요', '대결 기능은 프로필 설정 후 이용할 수 있습니다.', [
        { text: '취소', style: 'cancel' },
        { text: '프로필 설정', onPress: onSetupProfile },
      ]);
      return false;
    }
    return true;
  }

  async function handleCreate() {
    if (!requireProfile()) return;
    const trimmedTitle = roomTitle.trim();
    if (!trimmedTitle) {
      Alert.alert('입력 오류', '방제목을 입력해주세요.');
      return;
    }
    if (!dateStr.match(/^\d{4}-\d{2}-\d{2}$/) || !timeStr.match(/^\d{2}:\d{2}$/)) {
      Alert.alert('입력 오류', '날짜는 YYYY-MM-DD, 시간은 HH:MM 형식으로 입력해주세요.');
      return;
    }
    const scheduledAt = new Date(`${dateStr}T${timeStr}:00`).toISOString();
    if (new Date(scheduledAt).getTime() <= Date.now()) {
      Alert.alert('입력 오류', '시작 시간은 현재 시간 이후여야 합니다.');
      return;
    }
    setCreating(true);
    const id = await createChallenge(profile!, trimmedTitle, distanceKm, scheduledAt, maxPart);
    setCreating(false);
    if (id) {
      setShowCreate(false);
      setRoomTitle('');
      await load();
      Alert.alert('대결 생성 완료', '대결 목록에 등록됐습니다. 예정 시간에 대결 화면으로 입장하세요.');
    } else {
      Alert.alert('오류', '대결 생성에 실패했습니다. 다시 시도해주세요.');
    }
  }

  async function handleJoin(challenge: Challenge) {
    if (!requireProfile()) return;
    if (challenge.participants.includes(profile!.id)) {
      if (isStartable(challenge.scheduledAt)) {
        onEnterBattle(challenge.id);
      } else {
        Alert.alert('이미 참여 중', `대결 시작까지 ${timeUntil(challenge.scheduledAt)} 남았습니다.`);
      }
      return;
    }
    if (challenge.participants.length >= challenge.maxParticipants) {
      Alert.alert('참여 불가', '최대 참여 인원이 가득 찼습니다.');
      return;
    }
    const ok = await joinChallenge(challenge.id, profile!);
    if (ok) {
      await load();
      Alert.alert('참여 완료', `대결에 참여했습니다!\n시작까지 ${timeUntil(challenge.scheduledAt)} 남았습니다.`);
    } else {
      Alert.alert('오류', '참여에 실패했습니다.');
    }
  }

  async function handleCancel(challenge: Challenge) {
    Alert.alert(
      '대결 취소',
      `"${challenge.title}" 대결을 취소하시겠어요?\n참여한 사람들에게 알림이 가지 않으니 미리 공지해주세요.`,
      [
        { text: '아니요', style: 'cancel' },
        {
          text: '취소하기', style: 'destructive', onPress: async () => {
            const ok = await cancelChallenge(challenge.id);
            if (ok) {
              await load();
            } else {
              Alert.alert('오류', '대결 취소에 실패했습니다.');
            }
          },
        },
      ],
    );
  }

  async function handleLeave(challenge: Challenge) {
    Alert.alert(
      '참여 취소',
      `"${challenge.title}" 대결 참여를 취소하시겠어요?`,
      [
        { text: '아니요', style: 'cancel' },
        {
          text: '취소하기', style: 'destructive', onPress: async () => {
            const ok = await leaveChallenge(challenge.id, profile!);
            if (ok) {
              await load();
            } else {
              Alert.alert('오류', '참여 취소에 실패했습니다.');
            }
          },
        },
      ],
    );
  }

  const myRunProfile = useMemo(() => {
    if (runHistory.length === 0) return null;
    const avgDistM = runHistory.reduce((s, r) => s + r.distanceM, 0) / runHistory.length;
    const hours = runHistory.map(r => new Date(r.submittedAt).getHours());
    const sinSum = hours.reduce((s, h) => s + Math.sin((h / 24) * 2 * Math.PI), 0);
    const cosSum = hours.reduce((s, h) => s + Math.cos((h / 24) * 2 * Math.PI), 0);
    const avgRad = Math.atan2(sinSum / hours.length, cosSum / hours.length);
    const preferredHour = ((avgRad / (2 * Math.PI)) * 24 + 24) % 24;
    return { avgDistM, preferredHour };
  }, [runHistory]);

  const sortedChallenges = useMemo(() => {
    const list = [...challenges];
    if (sortKey === 'newest') {
      return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    if (sortKey === 'soonest') {
      return list.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
    }
    if (sortKey === 'relevant') {
      if (!myRunProfile) {
        return list.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
      }
      const score = (c: Challenge) => {
        const { avgDistM, preferredHour } = myRunProfile;
        const distDiff = Math.abs(c.distanceKm * 1000 - avgDistM) / Math.max(avgDistM, 1);
        const cHour = new Date(c.scheduledAt).getHours();
        const hourDiff = Math.min(
          Math.abs(cHour - preferredHour),
          24 - Math.abs(cHour - preferredHour),
        ) / 12;
        return distDiff * 0.5 + hourDiff * 0.5;
      };
      return list.sort((a, b) => score(a) - score(b));
    }
    return list;
  }, [challenges, sortKey, myRunProfile]);

  function openCreate() {
    if (!requireProfile()) return;
    const d = new Date(Date.now() + 60 * 60 * 1000);
    const pad = (n: number) => n.toString().padStart(2, '0');
    setRoomTitle('');
    setDateStr(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
    setTimeStr(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
    setShowCreate(true);
  }

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  return (
    <View style={s.bg}>
      {/* 헤더 */}
      <View style={s.header}>
        <Text style={s.headerTitle}>대결</Text>
        {view === 'list' && (
          <TouchableOpacity style={s.createBtn} onPress={openCreate}>
            <Text style={s.createBtnTxt}>+ 대결 만들기</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 목록 / 전적 탭 */}
      <View style={s.viewTabs}>
        <TouchableOpacity
          style={[s.viewTab, view === 'list' && s.viewTabOn]}
          onPress={() => setView('list')}
        >
          <Text style={[s.viewTabTxt, view === 'list' && s.viewTabTxtOn]}>대결 목록</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.viewTab, view === 'history' && s.viewTabOn]}
          onPress={() => setView('history')}
        >
          <Text style={[s.viewTabTxt, view === 'history' && s.viewTabTxtOn]}>내 전적</Text>
        </TouchableOpacity>
      </View>

      {/* 정렬 칩 */}
      {view === 'list' && (
        <View style={s.sortRow}>
          {([
            { key: 'soonest',  label: '임박순' },
            { key: 'newest',   label: '최신순' },
            { key: 'relevant', label: '관련도순' },
          ] as { key: SortKey; label: string }[]).map(opt => (
            <TouchableOpacity
              key={opt.key}
              style={[s.sortChip, sortKey === opt.key && s.sortChipOn]}
              onPress={() => setSortKey(opt.key)}
            >
              {opt.key === 'relevant' && sortKey === 'relevant' && !myRunProfile && (
                <Text style={s.sortChipSub}> (기록 필요) </Text>
              )}
              <Text style={[s.sortChipTxt, sortKey === opt.key && s.sortChipTxtOn]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ── 전적 뷰 ── */}
      {view === 'history' && (
        <ScrollView contentContainerStyle={s.historyContent}>
          {historyLoading ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: 60 }} />
          ) : battleHistory.length === 0 ? (
            <View style={s.emptyBox}>
              <Text style={s.emptyIcon}>🏅</Text>
              <Text style={s.emptyTitle}>아직 전적이 없어요</Text>
              <Text style={s.emptyDesc}>대결에 참여하고 기록을 쌓아보세요!</Text>
            </View>
          ) : (
            <>
              <View style={s.histSummary}>
                <View style={s.histStat}>
                  <Text style={s.histStatBig}>{battleHistory.length}</Text>
                  <Text style={s.histStatLbl}>총 대결</Text>
                </View>
                <View style={s.histStatDiv} />
                <View style={s.histStat}>
                  <Text style={[s.histStatBig, s.goldTxt]}>
                    {battleHistory.filter(b => b.rank === 1).length}
                  </Text>
                  <Text style={s.histStatLbl}>🥇 1등</Text>
                </View>
                <View style={s.histStatDiv} />
                <View style={s.histStat}>
                  <Text style={s.histStatBig}>
                    {(battleHistory.reduce((sum, b) => sum + b.rank, 0) / battleHistory.length).toFixed(1)}
                  </Text>
                  <Text style={s.histStatLbl}>평균 순위</Text>
                </View>
                <View style={s.histStatDiv} />
                <View style={s.histStat}>
                  <Text style={s.histStatBig}>
                    {Math.round(battleHistory.filter(b => b.rank === 1).length / battleHistory.length * 100)}%
                  </Text>
                  <Text style={s.histStatLbl}>승률</Text>
                </View>
              </View>

              <Text style={s.histListTitle}>전체 전적</Text>
              {battleHistory.map((b, i) => {
                const d = new Date(b.finishedAt);
                const dateStr = `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
                const rankEmoji = b.rank === 1 ? '🥇' : b.rank === 2 ? '🥈' : b.rank === 3 ? '🥉' : null;
                return (
                  <View key={b.challengeId + i} style={s.histRow}>
                    <View style={s.histRankBox}>
                      {rankEmoji
                        ? <Text style={s.histRankEmoji}>{rankEmoji}</Text>
                        : <Text style={s.histRankNum}>{b.rank}위</Text>
                      }
                    </View>
                    <View style={s.histInfo}>
                      <Text style={s.histTitle} numberOfLines={1}>{b.title}</Text>
                      <Text style={s.histSub}>
                        {b.distanceKm} km · {(b.distanceM / 1000).toFixed(2)} km 완료 · {b.totalParticipants}명
                      </Text>
                      <Text style={s.histDate}>{dateStr}</Text>
                    </View>
                    <Text style={[s.histFinalRank, b.rank === 1 && s.goldTxt]}>
                      {b.rank}/{b.totalParticipants}
                    </Text>
                  </View>
                );
              })}
            </>
          )}
        </ScrollView>
      )}

      {/* ── 목록 뷰 ── */}
      {view === 'list' && (
        <ScrollView
          contentContainerStyle={s.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        >
          {challenges.length === 0 ? (
            <View style={s.emptyBox}>
              <Text style={s.emptyIcon}>⚔️</Text>
              <Text style={s.emptyTitle}>진행 중인 대결이 없어요</Text>
              <Text style={s.emptyDesc}>첫 번째 대결을 만들어보세요!</Text>
              <TouchableOpacity style={s.emptyBtn} onPress={openCreate}>
                <Text style={s.emptyBtnTxt}>대결 만들기</Text>
              </TouchableOpacity>
            </View>
          ) : (
            sortedChallenges.map(c => {
              const isMyChallenge = profile ? c.creatorId === profile.id : false;
              const joined = profile ? c.participants.includes(profile.id) : false;
              const full = c.participants.length >= c.maxParticipants;
              const startable = isStartable(c.scheduledAt);
              return (
                <View key={c.id} style={[s.card, isMyChallenge && s.myCard]}>
                  <View style={s.cardTop}>
                    <View style={s.distBadge}>
                      <Text style={s.distTxt}>{c.distanceKm} km</Text>
                    </View>
                    {isMyChallenge && (
                      <View style={s.myBadge}>
                        <Text style={s.myBadgeTxt}>내 대결</Text>
                      </View>
                    )}
                    {startable && (
                      <View style={s.nowBadge}>
                        <Text style={s.nowTxt}>지금 시작!</Text>
                      </View>
                    )}
                    <Text style={s.timeUntil}>{timeUntil(c.scheduledAt)}</Text>
                  </View>

                  <Text style={s.cardTitle}>{c.title}</Text>
                  <Text style={s.cardTime}>{formatScheduledAt(c.scheduledAt)}</Text>
                  <Text style={s.cardCreator}>
                    {isMyChallenge ? '내가 만든 대결' : `주최: ${c.creatorNickname}`}
                  </Text>

                  <View style={s.cardBottom}>
                    <Text style={s.partCount}>
                      👥 {c.participants.length}/{c.maxParticipants}명
                    </Text>

                    <View style={s.cardBtns}>
                      {isMyChallenge && (
                        <TouchableOpacity style={s.cancelChalBtn} onPress={() => handleCancel(c)}>
                          <Text style={s.cancelChalBtnTxt}>대결 취소</Text>
                        </TouchableOpacity>
                      )}
                      {!isMyChallenge && joined && !startable && (
                        <TouchableOpacity style={s.leaveChalBtn} onPress={() => handleLeave(c)}>
                          <Text style={s.leaveChalBtnTxt}>참여 취소</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={[
                          s.joinBtn,
                          startable && s.joinBtnEnter,
                          !startable && joined && !isMyChallenge && s.joinBtnJoined,
                          !joined && full && s.joinBtnFull,
                        ]}
                        onPress={() => handleJoin(c)}
                        disabled={!joined && full}
                      >
                        <Text style={[
                          s.joinBtnTxt,
                          !startable && joined && !isMyChallenge && s.joinBtnTxtJoined,
                        ]}>
                          {startable
                            ? '입장하기'
                            : isMyChallenge
                              ? '내 대결'
                              : joined
                                ? '참여 중'
                                : full
                                  ? '마감'
                                  : '참여하기'
                          }
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* 대결 만들기 모달 */}
      <Modal visible={showCreate} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>대결 만들기</Text>

            <Text style={s.fieldLabel}>방제목</Text>
            <TextInput
              style={[s.input, s.titleInput]}
              value={roomTitle}
              onChangeText={setRoomTitle}
              placeholder="예: 새벽 한강 5km 같이 뛰실 분!"
              placeholderTextColor={colors.textFaint}
              maxLength={30}
              returnKeyType="done"
              autoFocus
            />
            <Text style={s.charCount}>{roomTitle.length}/30</Text>

            <Text style={s.fieldLabel}>목표 거리</Text>
            <View style={s.chipRow}>
              {DISTANCE_OPTIONS.map(d => (
                <TouchableOpacity
                  key={d}
                  style={[s.chip, distanceKm === d && s.chipOn]}
                  onPress={() => setDistanceKm(d)}
                >
                  <Text style={[s.chipTxt, distanceKm === d && s.chipTxtOn]}>{d} km</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.fieldLabel}>최대 인원</Text>
            <View style={s.chipRow}>
              {MAX_PARTICIPANT_OPTIONS.map(n => (
                <TouchableOpacity
                  key={n}
                  style={[s.chip, maxPart === n && s.chipOn]}
                  onPress={() => setMaxPart(n)}
                >
                  <Text style={[s.chipTxt, maxPart === n && s.chipTxtOn]}>{n}명</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.fieldLabel}>날짜 (YYYY-MM-DD)</Text>
            <TextInput
              style={s.input}
              value={dateStr}
              onChangeText={setDateStr}
              placeholder="2025-06-15"
              placeholderTextColor={colors.textFaint}
              keyboardType="numbers-and-punctuation"
              maxLength={10}
            />

            <Text style={s.fieldLabel}>시간 (HH:MM)</Text>
            <TextInput
              style={s.input}
              value={timeStr}
              onChangeText={setTimeStr}
              placeholder="07:00"
              placeholderTextColor={colors.textFaint}
              keyboardType="numbers-and-punctuation"
              maxLength={5}
            />

            <View style={s.modalBtns}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowCreate(false)}>
                <Text style={s.cancelBtnTxt}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.confirmBtn, creating && { opacity: 0.6 }]}
                onPress={handleCreate}
                disabled={creating}
              >
                {creating
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.confirmBtnTxt}>만들기</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    bg:     { flex: 1, backgroundColor: c.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: Platform.OS === 'ios' ? 60 : 40,
      paddingBottom: 12,
    },
    headerTitle: { color: c.text, fontSize: 22, fontWeight: '800' },

    viewTabs: {
      flexDirection: 'row',
      marginHorizontal: 20,
      marginBottom: 12,
      backgroundColor: c.card,
      borderRadius: 12,
      padding: 3,
    },
    viewTab:      { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 10 },
    viewTabOn:    { backgroundColor: c.card2 },
    viewTabTxt:   { color: c.textFaint, fontSize: 14, fontWeight: '600' },
    viewTabTxtOn: { color: c.text },

    historyContent: { padding: 16, gap: 12, paddingBottom: 32 },
    histSummary: {
      backgroundColor: c.card,
      borderRadius: 18,
      padding: 20,
      flexDirection: 'row',
      alignItems: 'center',
    },
    histStat:    { flex: 1, alignItems: 'center', gap: 4 },
    histStatBig: { color: c.accent, fontSize: 22, fontWeight: '800' },
    histStatLbl: { color: c.textFaint, fontSize: 10, fontWeight: '600' },
    histStatDiv: { width: 1, height: 32, backgroundColor: c.border },
    goldTxt:     { color: '#FFD60A' },

    histListTitle: {
      color: c.textFaint,
      fontSize: 11,
      fontWeight: '600',
      marginTop: 4,
      marginBottom: 4,
      paddingHorizontal: 4,
    },
    histRow: {
      backgroundColor: c.card,
      borderRadius: 14,
      padding: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    histRankBox:   { width: 36, alignItems: 'center' },
    histRankEmoji: { fontSize: 24 },
    histRankNum:   { color: c.textMuted, fontSize: 15, fontWeight: '800' },
    histInfo:      { flex: 1, gap: 3 },
    histTitle:     { color: c.text, fontSize: 14, fontWeight: '700' },
    histSub:       { color: c.textMuted, fontSize: 12 },
    histDate:      { color: c.textFaint, fontSize: 11 },
    histFinalRank: { color: c.textFaint, fontSize: 14, fontWeight: '700' },

    createBtn: {
      backgroundColor: c.accent,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    createBtnTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },

    sortRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, paddingBottom: 12 },
    sortChip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.card,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderWidth: 1,
      borderColor: c.border,
    },
    sortChipOn:    { borderColor: c.accent, backgroundColor: c.accentBg },
    sortChipTxt:   { color: c.textMuted, fontSize: 13, fontWeight: '600' },
    sortChipTxtOn: { color: c.accent },
    sortChipSub:   { color: c.textFaint, fontSize: 10 },

    list: { padding: 16, gap: 12, paddingBottom: 32 },

    emptyBox:   { alignItems: 'center', paddingTop: 80, gap: 10 },
    emptyIcon:  { fontSize: 56 },
    emptyTitle: { color: c.text, fontSize: 18, fontWeight: '700' },
    emptyDesc:  { color: c.textMuted, fontSize: 14 },
    emptyBtn: {
      marginTop: 12,
      backgroundColor: c.accent,
      borderRadius: 12,
      paddingHorizontal: 24,
      paddingVertical: 12,
    },
    emptyBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },

    card:   { backgroundColor: c.card, borderRadius: 18, padding: 18, gap: 8 },
    myCard: { borderWidth: 1, borderColor: c.accent },

    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    myBadge: {
      backgroundColor: c.accentBg,
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    myBadgeTxt: { color: c.accent, fontSize: 11, fontWeight: '700' },
    distBadge: {
      backgroundColor: c.accentBg,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    distTxt:   { color: c.accent, fontSize: 14, fontWeight: '800' },
    nowBadge:  { backgroundColor: 'rgba(255,69,58,0.13)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
    nowTxt:    { color: '#FF453A', fontSize: 12, fontWeight: '700' },
    timeUntil: { color: c.textFaint, fontSize: 12, marginLeft: 'auto' },
    cardTitle:   { color: c.text, fontSize: 17, fontWeight: '800', lineHeight: 24 },
    cardTime:    { color: c.textSub, fontSize: 13, fontWeight: '500' },
    cardCreator: { color: c.textFaint, fontSize: 12 },

    cardBottom: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
    partCount:  { flex: 1, color: c.textMuted, fontSize: 13 },
    cardBtns:   { flexDirection: 'row', gap: 8, alignItems: 'center' },
    cancelChalBtn: {
      backgroundColor: '#3a1a1a',
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: '#FF453A44',
    },
    cancelChalBtnTxt: { color: '#FF453A', fontSize: 12, fontWeight: '700' },
    leaveChalBtn: {
      backgroundColor: c.card2,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    leaveChalBtnTxt: { color: c.textMuted, fontSize: 12, fontWeight: '600' },
    joinBtn: {
      backgroundColor: c.accent,
      borderRadius: 10,
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    joinBtnEnter:     { backgroundColor: '#FF9500' },
    joinBtnJoined:    { backgroundColor: c.card2 },
    joinBtnFull:      { backgroundColor: c.card2 },
    joinBtnTxt:       { color: '#fff', fontSize: 13, fontWeight: '700' },
    joinBtnTxtJoined: { color: c.textFaint },

    modalOverlay: { flex: 1, backgroundColor: '#000000bb', justifyContent: 'flex-end' },
    modal: {
      backgroundColor: c.card,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 24,
      paddingBottom: Platform.OS === 'ios' ? 48 : 28,
      gap: 6,
    },
    modalTitle: { color: c.text, fontSize: 18, fontWeight: '800', marginBottom: 10 },
    fieldLabel: { color: c.textMuted, fontSize: 12, fontWeight: '600', marginTop: 8 },
    titleInput: { fontSize: 15, marginTop: 4 },
    charCount:  { color: c.textFaint, fontSize: 11, textAlign: 'right', marginTop: 3 },
    chipRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
    chip:       { backgroundColor: c.card2, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
    chipOn:     { backgroundColor: c.accent },
    chipTxt:    { color: c.textMuted, fontSize: 14, fontWeight: '600' },
    chipTxtOn:  { color: '#fff' },
    input: {
      backgroundColor: c.card3,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 11,
      color: c.text,
      fontSize: 16,
      marginTop: 4,
    },
    modalBtns: { flexDirection: 'row', gap: 10, marginTop: 18 },
    cancelBtn: {
      flex: 1,
      backgroundColor: c.card2,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
    cancelBtnTxt: { color: c.textMuted, fontSize: 15, fontWeight: '600' },
    confirmBtn: {
      flex: 2,
      backgroundColor: c.accent,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
    confirmBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },
  });
}
