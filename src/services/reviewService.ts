import { File, Paths } from 'expo-file-system';
import { RouteReview, RouteCandidate, Coordinate } from '../types';
import { isNearPolyline } from '../utils/geoUtils';

const ISSUE_PROXIMITY_M = 80;
const ROUTE_OVERLAP_PROXIMITY_M = 50;

const ISSUE_SEVERITY: Record<string, number> = {
  safety:   4,
  road:     3,
  traffic:  2,
  lighting: 2,
  other:    1,
};

// ─── Storage ────────────────────────────────────────────────────

export async function saveReview(review: RouteReview): Promise<void> {
  const file = new File(Paths.document, 'route_reviews.json');
  const all = await loadReviews();
  all.push(review);
  file.write(JSON.stringify(all));
}

export async function loadReviews(): Promise<RouteReview[]> {
  try {
    const file = new File(Paths.document, 'route_reviews.json');
    if (!file.exists) return [];
    const raw = await file.text();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RouteReview[]) : [];
  } catch {
    return [];
  }
}

// ─── Penalty scoring ────────────────────────────────────────────

function samplePolyline(poly: Coordinate[], max = 60): Coordinate[] {
  if (poly.length <= max) return poly;
  const step = Math.ceil(poly.length / max);
  return poly.filter((_, i) => i % step === 0);
}

/**
 * Returns a penalty score (≥ 0) for a route candidate based on stored
 * reviews. Higher penalty → route passes through areas users found bad.
 *
 * Factors:
 *   • Issue proximity: each reported issue within 80 m of the route adds
 *     severity × recency to the penalty.
 *   • Low-rating route overlap: if a ≤2-star review covered ≥40% of the
 *     same road segments, add an extra overlap penalty.
 *
 * Recency uses 30-day exponential decay so older complaints fade out.
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
    const recency = Math.exp(-daysSince / 30); // 30-day half-life

    // Issue-based penalty
    if (review.hasIssues) {
      for (const issue of review.issues) {
        if (isNearPolyline(issue.coord, candidate.polyline, ISSUE_PROXIMITY_M)) {
          const severity = ISSUE_SEVERITY[issue.type] ?? 1;
          penalty += severity * recency;
        }
      }
    }

    // Low-rating route overlap penalty
    if (review.rating <= 2 && review.routePolyline.length > 0) {
      const sampled = samplePolyline(review.routePolyline);
      const overlapping = sampled.filter((p) =>
        isNearPolyline(p, candidate.polyline, ROUTE_OVERLAP_PROXIMITY_M)
      ).length;
      const ratio = overlapping / sampled.length;
      if (ratio > 0.4) {
        penalty += (3 - review.rating) * 4 * recency;
      }
    }
  }

  return penalty;
}
