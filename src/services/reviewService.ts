import { File, Paths } from 'expo-file-system';
import { collection, doc, setDoc, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import { RouteReview, RouteCandidate } from '../types';
import { isNearPolyline } from '../utils/geoUtils';

const ISSUE_PROXIMITY_M = 80;

const ISSUE_SEVERITY: Record<string, number> = {
  safety:   4,
  road:     3,
  traffic:  2,
  lighting: 2,
  other:    1,
};

// ─── Local fallback ──────────────────────────────────────────────

const reviewsFile = () => new File(Paths.document, 'route_reviews.json');

async function loadLocalReviews(): Promise<RouteReview[]> {
  try {
    const file = reviewsFile();
    if (!file.exists) return [];
    const parsed = JSON.parse(await file.text());
    return Array.isArray(parsed) ? (parsed as RouteReview[]) : [];
  } catch {
    return [];
  }
}

async function saveLocalReview(review: RouteReview): Promise<void> {
  const all = await loadLocalReviews();
  all.push(review);
  reviewsFile().write(JSON.stringify(all));
}

// ─── Storage ────────────────────────────────────────────────────

export async function saveReview(review: RouteReview): Promise<void> {
  await saveLocalReview(review);

  if (db) {
    try {
      await setDoc(doc(db, 'reviews', review.id), review);
    } catch (e) {
      console.warn('[reviewService] Firestore 저장 실패 (오프라인?):', e);
    }
  }
}

export async function loadReviews(): Promise<RouteReview[]> {
  if (db) {
    try {
      const snap = await getDocs(collection(db, 'reviews'));
      return snap.docs.map(d => d.data() as RouteReview);
    } catch (e) {
      console.warn('[reviewService] Firestore 조회 실패, 로컬 대체:', e);
    }
  }
  return loadLocalReviews();
}

// ─── Penalty scoring ────────────────────────────────────────────

/**
 * 경로 후보에 대한 페널티 점수를 반환합니다 (높을수록 나쁜 경로).
 * 이슈 좌표 기반으로 채점합니다 (routePolyline 겹침 없이).
 * 30일 지수 감쇠로 오래된 리뷰는 자연히 영향 감소.
 */
export function scoreRouteWithReviews(
  candidate: RouteCandidate,
  reviews: RouteReview[]
): number {
  if (reviews.length === 0) return 0;

  let penalty = 0;
  const now = Date.now();
  const DAY_MS = 86_400_000;

  for (const review of reviews) {
    const daysSince = (now - new Date(review.date).getTime()) / DAY_MS;
    const recency = Math.exp(-daysSince / 30);

    if (review.hasIssues) {
      for (const issue of review.issues) {
        if (isNearPolyline(issue.coord, candidate.polyline, ISSUE_PROXIMITY_M)) {
          const severity = ISSUE_SEVERITY[issue.type] ?? 1;
          penalty += severity * recency;
        }
      }
    }
  }

  return penalty;
}
