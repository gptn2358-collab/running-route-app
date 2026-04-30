import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ScrollView,
  Platform,
  Alert,
  KeyboardAvoidingView,
} from 'react-native';
import { Coordinate, IssueType, RouteIssue, RouteReview } from '../types';
import ReviewMapPicker, { ReviewMapPickerHandle } from '../components/ReviewMapPicker';
import { saveReview } from '../services/reviewService';

// ─── Constants ───────────────────────────────────────────────────

type Step = 'initial' | 'issue-map' | 'rating';

const ISSUE_TYPES: {
  type: IssueType;
  label: string;
  color: string;
  icon: string;
}[] = [
  { type: 'road',     label: '노면 상태', color: '#FF9500', icon: '🛣️' },
  { type: 'safety',   label: '안전 문제', color: '#FF453A', icon: '⚠️' },
  { type: 'traffic',  label: '교통 혼잡', color: '#FFD60A', icon: '🚗' },
  { type: 'lighting', label: '조명 부족', color: '#5E5CE6', icon: '💡' },
  { type: 'other',    label: '기타',      color: '#8E8E93', icon: '📌' },
];

const RATING_LABELS = ['', '별로예요', '아쉬웠어요', '괜찮았어요', '좋았어요', '최고예요!'];

// ─── Props ───────────────────────────────────────────────────────

interface Props {
  trail: Coordinate[];
  routePolyline: Coordinate[];
  onDone: () => void;
}

// ─── Component ───────────────────────────────────────────────────

export default function ReviewScreen({ trail, routePolyline, onDone }: Props) {
  const [step, setStep]                 = useState<Step>('initial');
  const [issues, setIssues]             = useState<RouteIssue[]>([]);
  const [pendingCoord, setPendingCoord] = useState<Coordinate | null>(null);
  const [selectedType, setSelectedType] = useState<IssueType | null>(null);
  const [note, setNote]                 = useState('');
  const [rating, setRating]             = useState(0);
  const [submitting, setSubmitting]     = useState(false);

  const mapRef = useRef<ReviewMapPickerHandle>(null);

  const mapCenter: Coordinate =
    trail.length > 0
      ? trail[Math.floor(trail.length / 2)]
      : { latitude: 37.5665, longitude: 126.978 };

  // ── Handlers ─────────────────────────────────────────────────

  function handleMapTap(coord: Coordinate) {
    if (pendingCoord) return; // ignore taps while typing
    setPendingCoord(coord);
    setSelectedType(null);
    setNote('');
  }

  function handleAddIssue() {
    if (!pendingCoord || !selectedType) return;
    const cfg = ISSUE_TYPES.find((t) => t.type === selectedType)!;
    const issue: RouteIssue = {
      coord: pendingCoord,
      type: selectedType,
      note: note.trim() || undefined,
    };
    setIssues((prev) => [...prev, issue]);
    mapRef.current?.addMarker(pendingCoord, cfg.color);
    setPendingCoord(null);
    setSelectedType(null);
    setNote('');
  }

  function handleCancelIssue() {
    setPendingCoord(null);
    setSelectedType(null);
    setNote('');
  }

  async function handleSubmit() {
    if (rating === 0) {
      Alert.alert('평점 선택', '별점을 탭해 평점을 선택해주세요.');
      return;
    }
    setSubmitting(true);
    try {
      const review: RouteReview = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        routePolyline,
        trail,
        rating,
        hasIssues: issues.length > 0,
        issues,
      };
      await saveReview(review);
      onDone();
    } catch {
      Alert.alert('저장 오류', '리뷰 저장에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Step 1: Y / N ────────────────────────────────────────────

  if (step === 'initial') {
    return (
      <View style={s.centerScreen}>
        <Text style={s.bigEmoji}>📝</Text>
        <Text style={s.title}>코스 리뷰</Text>
        <Text style={s.subtitle}>달리는 동안 불편한 점이 있었나요?</Text>

        <TouchableOpacity style={s.yesBtn} onPress={() => setStep('issue-map')}>
          <Text style={s.yesBtnTxt}>🚧  있었어요</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.noBtn} onPress={() => setStep('rating')}>
          <Text style={s.noBtnTxt}>✅  없었어요, 평점만 남기기</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.skipLink} onPress={onDone}>
          <Text style={s.skipTxt}>건너뛰기</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Step 2: Map + issue picker ────────────────────────────────

  if (step === 'issue-map') {
    return (
      <View style={s.mapScreen}>
        {/* Map fills entire screen */}
        <ReviewMapPicker
          ref={mapRef}
          trail={trail}
          center={mapCenter}
          onTap={handleMapTap}
        />

        {/* Top instruction bar */}
        <View style={s.topBar}>
          <Text style={s.topBarTitle}>
            {pendingCoord
              ? '아래에서 불편사항 유형을 선택하세요'
              : '지도를 탭해 불편했던 위치 선택'}
          </Text>
          {issues.length > 0 && !pendingCoord && (
            <View style={s.topBadge}>
              <Text style={s.topBadgeTxt}>📍 {issues.length}개 기록됨</Text>
            </View>
          )}
        </View>

        {/* Issue type panel — slides up when map tapped */}
        {pendingCoord && (
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={s.issuePanel}
          >
            <Text style={s.issuePanelTitle}>어떤 점이 불편하셨나요?</Text>

            {/* Type selector */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={s.typeScroll}
              contentContainerStyle={s.typeScrollContent}
            >
              {ISSUE_TYPES.map((t) => {
                const on = selectedType === t.type;
                return (
                  <TouchableOpacity
                    key={t.type}
                    style={[
                      s.typeBtn,
                      on && { backgroundColor: t.color, borderColor: t.color },
                    ]}
                    onPress={() => setSelectedType(t.type)}
                  >
                    <Text style={s.typeBtnIcon}>{t.icon}</Text>
                    <Text style={[s.typeBtnLbl, on && s.typeBtnLblOn]}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Optional note */}
            <TextInput
              style={s.noteInput}
              placeholder="추가 메모 (선택사항)"
              placeholderTextColor="#555"
              value={note}
              onChangeText={setNote}
              maxLength={80}
              returnKeyType="done"
            />

            {/* Action buttons */}
            <View style={s.panelBtns}>
              <TouchableOpacity style={s.cancelBtn} onPress={handleCancelIssue}>
                <Text style={s.cancelBtnTxt}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.addBtn, !selectedType && s.addBtnOff]}
                onPress={handleAddIssue}
                disabled={!selectedType}
              >
                <Text style={s.addBtnTxt}>추가하기</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        )}

        {/* Bottom done bar — visible when not picking a type */}
        {!pendingCoord && (
          <View style={s.bottomBar}>
            <TouchableOpacity style={s.nextBtn} onPress={() => setStep('rating')}>
              <Text style={s.nextBtnTxt}>
                {issues.length > 0
                  ? `${issues.length}개 불편사항 완료 → 평점 남기기`
                  : '위치 선택 없이 평점 남기기 →'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  // ── Step 3: Star rating ───────────────────────────────────────

  return (
    <ScrollView
      style={s.ratingBg}
      contentContainerStyle={s.ratingContainer}
      bounces={false}
    >
      <Text style={s.bigEmoji}>⭐</Text>
      <Text style={s.title}>전체 평점</Text>
      <Text style={s.subtitle}>이 코스는 전체적으로 어떠셨나요?</Text>

      {/* Stars */}
      <View style={s.starsRow}>
        {[1, 2, 3, 4, 5].map((star) => (
          <TouchableOpacity key={star} onPress={() => setRating(star)}>
            <Text style={[s.star, star <= rating && s.starFilled]}>★</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={s.ratingLabel}>
        {rating > 0 ? RATING_LABELS[rating] : '별을 탭하여 평점 선택'}
      </Text>

      {/* Issues summary */}
      {issues.length > 0 && (
        <View style={s.summaryCard}>
          <Text style={s.summaryTitle}>기록된 불편사항 ({issues.length}개)</Text>
          {issues.map((iss, i) => {
            const cfg = ISSUE_TYPES.find((t) => t.type === iss.type)!;
            return (
              <View key={i} style={s.summaryRow}>
                <View style={[s.summaryDot, { backgroundColor: cfg.color }]} />
                <Text style={s.summaryItem}>
                  {cfg.icon} {cfg.label}
                  {iss.note ? (
                    <Text style={s.summaryNote}> — {iss.note}</Text>
                  ) : null}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Submit */}
      <TouchableOpacity
        style={[s.submitBtn, (rating === 0 || submitting) && s.submitBtnOff]}
        onPress={handleSubmit}
        disabled={rating === 0 || submitting}
      >
        <Text style={s.submitBtnTxt}>
          {submitting ? '저장 중...' : '리뷰 제출하기'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={s.skipLink} onPress={onDone}>
        <Text style={s.skipTxt}>건너뛰기</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────

const s = StyleSheet.create({
  // ── Shared ──────────────────────────────────
  bigEmoji: { fontSize: 52, textAlign: 'center', marginBottom: 10 },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    color: '#888',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 32,
  },
  skipLink: { marginTop: 16, alignItems: 'center' },
  skipTxt: { color: '#555', fontSize: 14 },

  // ── Step 1 (Y/N) ────────────────────────────
  centerScreen: {
    flex: 1,
    backgroundColor: '#0f0f0f',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  yesBtn: {
    backgroundColor: '#FF453A',
    borderRadius: 14,
    paddingVertical: 16,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  yesBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
  noBtn: {
    backgroundColor: '#1e1e1e',
    borderRadius: 14,
    paddingVertical: 16,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#00C853',
  },
  noBtnTxt: { color: '#00C853', fontSize: 16, fontWeight: '700' },

  // ── Step 2 (Map) ─────────────────────────────
  mapScreen: { flex: 1 },

  topBar: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 58 : 20,
    left: 14,
    right: 14,
    backgroundColor: 'rgba(10,10,10,0.88)',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 6,
  },
  topBarTitle: { color: '#fff', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  topBadge: {
    alignSelf: 'center',
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  topBadgeTxt: { color: '#00C853', fontSize: 12, fontWeight: '600' },

  issuePanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    gap: 12,
  },
  issuePanelTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },

  typeScroll: { flexGrow: 0 },
  typeScrollContent: { gap: 8 },
  typeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#2a2a2a',
    borderWidth: 1.5,
    borderColor: '#3a3a3a',
    alignItems: 'center',
    minWidth: 76,
  },
  typeBtnIcon: { fontSize: 18, marginBottom: 3 },
  typeBtnLbl: { color: '#aaa', fontSize: 11, fontWeight: '600' },
  typeBtnLblOn: { color: '#fff' },

  noteInput: {
    backgroundColor: '#242424',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 14,
  },

  panelBtns: { flexDirection: 'row', gap: 10 },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelBtnTxt: { color: '#aaa', fontSize: 15, fontWeight: '600' },
  addBtn: {
    flex: 2,
    backgroundColor: '#00C853',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  addBtnOff: { opacity: 0.4 },
  addBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },

  bottomBar: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 42 : 20,
    left: 14,
    right: 14,
  },
  nextBtn: {
    backgroundColor: '#00C853',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  nextBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // ── Step 3 (Rating) ──────────────────────────
  ratingBg: { flex: 1, backgroundColor: '#0f0f0f' },
  ratingContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 28,
    paddingBottom: Platform.OS === 'ios' ? 50 : 30,
  },

  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  star: { fontSize: 44, color: '#333' },
  starFilled: { color: '#FFD60A' },
  ratingLabel: {
    color: '#aaa',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 28,
  },

  summaryCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    gap: 8,
  },
  summaryTitle: { color: '#888', fontSize: 13, fontWeight: '600', marginBottom: 4 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  summaryDot: { width: 8, height: 8, borderRadius: 4 },
  summaryItem: { color: '#ddd', fontSize: 14, flex: 1 },
  summaryNote: { color: '#888' },

  submitBtn: {
    backgroundColor: '#00C853',
    borderRadius: 14,
    paddingVertical: 17,
    alignItems: 'center',
    marginBottom: 4,
  },
  submitBtnOff: { opacity: 0.4 },
  submitBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
