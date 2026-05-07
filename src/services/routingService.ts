import { Coordinate, RouteCandidate } from '../types';
import {
  destinationPoint,
  polylineBBox,
  isNearPolyline,
  haversineDistance,
} from '../utils/geoUtils';
import { loadReviews, scoreRouteWithReviews } from './reviewService';
// 서울시 보행등 전수 데이터 (13,917개, 2023-05-30 기준)
// 형식: [lat, lon][]
import seoulCrossings from '../../assets/seoulCrossings.json';

const OSRM_BASE = 'https://router.project-osrm.org';
const OVERPASS_API = 'https://overpass-api.de/api/interpreter';

const WAYPOINTS_PER_ROUTE = 6;
const NUM_CANDIDATES = 6;

// ─────────────────────────── helpers ────────────────────────────

function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 10_000
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(id)
  );
}

function circleWaypoints(
  center: Coordinate,
  radiusM: number,
  n: number,
  angleOffsetDeg: number
): Coordinate[] {
  return Array.from({ length: n }, (_, i) => {
    const bearing = (360 / n) * i + angleOffsetDeg;
    return destinationPoint(center, radiusM, bearing);
  });
}

// ─────────────────────────── OSRM ───────────────────────────────

async function osrmRoute(waypoints: Coordinate[]): Promise<{
  distance: number;
  duration: number;
  polyline: Coordinate[];
}> {
  const coords = waypoints
    .map((p) => `${p.longitude},${p.latitude}`)
    .join(';');
  const url = `${OSRM_BASE}/route/v1/foot/${coords}?overview=full&geometries=geojson`;

  const res = await fetchWithTimeout(url, {}, 12_000);
  if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);

  const data = await res.json();
  if (data.code !== 'Ok') throw new Error(`OSRM: ${data.message ?? data.code}`);

  const route = data.routes[0];
  const polyline: Coordinate[] = route.geometry.coordinates.map(
    ([lon, lat]: [number, number]) => ({ latitude: lat, longitude: lon })
  );
  return { distance: route.distance, duration: route.duration, polyline };
}

// ─────────────────────────── 인도 스냅 ───────────────────────────

async function fetchFootwayNodes(center: Coordinate, radiusM: number): Promise<Coordinate[]> {
  const r = Math.min(radiusM, 2500);
  const pad = (r * 1.3) / 111_000;
  const b = `${center.latitude - pad},${center.longitude - pad},${center.latitude + pad},${center.longitude + pad}`;
  const query = `[out:json][timeout:20];(way["highway"~"^(footway|path|pedestrian|steps|living_street)$"](${b}););>;out skel qt;`;
  try {
    const res = await fetchWithTimeout(
      OVERPASS_API,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
      },
      25_000
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.elements ?? [])
      .filter((e: any) => e.type === 'node' && e.lat != null)
      .map((e: any) => ({ latitude: e.lat, longitude: e.lon }));
  } catch (err) {
    console.warn('[routing] fetchFootwayNodes error:', err);
    return [];
  }
}

function snapToFootway(point: Coordinate, nodes: Coordinate[], maxDistM = 300): Coordinate {
  if (nodes.length === 0) return point;
  let best = point;
  let bestDist = maxDistM;
  for (const n of nodes) {
    const d = haversineDistance(point, n);
    if (d < bestDist) { bestDist = d; best = n; }
  }
  return best;
}

// ─────────────────────────── 신호등 (로컬 서울 전수 데이터) ──────

/**
 * 서울시 보행등 전수 데이터(seoulCrossings.json)에서 경로 주변 신호등을 찾습니다.
 * Overpass API 없이 오프라인/즉시 동작합니다.
 */
function signalsNearRoute(polyline: Coordinate[]): Coordinate[] {
  const bbox = polylineBBox(polyline, 80);

  // bbox 사전 필터 → 정밀 세그먼트 거리 필터
  const candidates = (seoulCrossings as [number, number][])
    .filter(([lat, lon]) =>
      lat >= bbox.minLat && lat <= bbox.maxLat &&
      lon >= bbox.minLon && lon <= bbox.maxLon
    )
    .map(([lat, lon]) => ({ latitude: lat, longitude: lon }));

  const nearby = candidates.filter((s) => isNearPolyline(s, polyline, 55));
  console.log(`[routing] Seoul signals: ${candidates.length} in bbox → ${nearby.length} on route`);
  return nearby;
}

// ─────────────────────────── public API ─────────────────────────

/** Simple A→B foot route via OSRM */
export async function getDirectRoute(
  from: Coordinate,
  to: Coordinate
): Promise<Coordinate[]> {
  const url = `${OSRM_BASE}/route/v1/foot/${from.longitude},${from.latitude};${to.longitude},${to.latitude}?overview=full&geometries=geojson`;
  const res = await fetchWithTimeout(url, {}, 10_000);
  if (!res.ok) return [];
  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes?.[0]) return [];
  return data.routes[0].geometry.coordinates.map(
    ([lon, lat]: [number, number]) => ({ latitude: lat, longitude: lon })
  );
}

async function buildCandidates(
  start: Coordinate,
  radiusM: number,
  footwayNodes: Coordinate[],
  angleOffsets: number[],
): Promise<RouteCandidate[]> {
  const results = await Promise.allSettled(
    angleOffsets.map(async (offset, idx): Promise<RouteCandidate> => {
      const mid = circleWaypoints(start, radiusM, WAYPOINTS_PER_ROUTE, offset);
      const snappedMid = footwayNodes.length > 0
        ? mid.map((p) => snapToFootway(p, footwayNodes, 300))
        : mid;
      const fullWaypoints = [start, ...snappedMid, start];

      const { distance, duration, polyline } = await osrmRoute(fullWaypoints);
      const signalLocs = signalsNearRoute(polyline);

      return {
        id: `route-${idx}`,
        waypoints: fullWaypoints,
        polyline,
        distance,
        duration,
        trafficSignals: signalLocs.length,
        trafficSignalLocations: signalLocs,
      };
    })
  );
  return results
    .filter((r): r is PromiseFulfilledResult<RouteCandidate> => r.status === 'fulfilled')
    .map((r) => r.value);
}

/**
 * 인도 기반 순환 달리기 경로 생성.
 * 1) 반경 내 보행로 노드 수집 → 경유지를 인도에 스냅
 * 2) OSRM foot 프로파일로 경로 생성 (실제 거리 측정 후 반경 자동 보정)
 * 3) 로컬 서울 신호등 데이터로 경로 위 신호 탐색
 */
export async function generateBestRoutes(
  start: Coordinate,
  targetDistanceM: number
): Promise<RouteCandidate[]> {
  // Initial radius estimate.
  // Route geometry (center → N waypoints on circle → center) gives straight-line
  // perimeter = 2r(1 + (N-1)·sin(π/N)) = 7r for N=6, not the 2πr of a true circle.
  // A conservative detour estimate is used; an iterative correction pass below
  // adjusts the radius based on actual OSRM distances, making the result
  // independent of any fixed detour constant.
  const n = WAYPOINTS_PER_ROUTE;
  const straightLineFactor = 2 * (1 + (n - 1) * Math.sin(Math.PI / n));
  let radiusM = targetDistanceM / (straightLineFactor * 1.4);

  // Fetch with 2× initial radius so the footway cache covers any upward correction.
  const [footwayNodes, reviews] = await Promise.all([
    fetchFootwayNodes(start, radiusM * 2),
    loadReviews(),
  ]);
  console.log(`[routing] footway nodes: ${footwayNodes.length}, reviews: ${reviews.length}`);

  const angleOffsets = Array.from(
    { length: NUM_CANDIDATES },
    (_, i) => (360 / NUM_CANDIDATES) * i
  );

  // False-position radius search (max 5 iterations, 2% tolerance).
  //
  // sqrt-damping alone can oscillate: e.g. 18 km → 11 km → 19 km, never hitting 15 km.
  // False position fixes this by storing a "too-long" bound and a "too-short" bound,
  // then interpolating linearly between them. The bracket only ever shrinks, so the
  // radius converges monotonically toward the target distance without oscillation.
  //
  // Phase 1 (no bracket yet): sqrt(ratio) damping moves quickly toward the target
  //   and usually overshoots, establishing the opposite bound in one step.
  // Phase 2 (bracket known): linear interpolation converges in 2–3 more passes.
  //
  // Each pass keeps the batch whose closest candidate is nearest to target,
  // so even an imperfect final pass can't make results worse.
  const MAX_ITER = 5;
  const TOLERANCE = 0.02; // 2 % ≈ 300 m for 15 km
  let loBound: { r: number; d: number } | null = null; // radius that gave d < target
  let hiBound: { r: number; d: number } | null = null; // radius that gave d > target
  let finalCandidates: RouteCandidate[] = [];
  let bestErrorM = Infinity;

  for (let iter = 0; iter < MAX_ITER; iter++) {
    const batch = await buildCandidates(start, radiusM, footwayNodes, angleOffsets);
    if (batch.length === 0) break;

    const iterBestErr = Math.min(...batch.map(c => Math.abs(c.distance - targetDistanceM)));
    if (iterBestErr < bestErrorM) {
      bestErrorM = iterBestErr;
      finalCandidates = batch.map((c, i) => ({ ...c, id: `route-${iter}-${i}` }));
    }

    const sorted = [...batch].sort((a, b) => a.distance - b.distance);
    const len = sorted.length;
    const medianDist = len % 2 === 0
      ? (sorted[len / 2 - 1].distance + sorted[len / 2].distance) / 2
      : sorted[Math.floor(len / 2)].distance;
    const ratio = targetDistanceM / medianDist;

    console.log(
      `[routing] iter ${iter + 1}: r=${radiusM.toFixed(0)}m ` +
      `median=${(medianDist / 1000).toFixed(2)}km ratio=${ratio.toFixed(3)}`
    );

    if (Math.abs(ratio - 1) <= TOLERANCE) break;

    if (medianDist > targetDistanceM) hiBound = { r: radiusM, d: medianDist };
    else loBound = { r: radiusM, d: medianDist };

    if (loBound !== null && hiBound !== null) {
      // False position: linear interpolation within the bracket (no oscillation)
      const rNew = loBound.r +
        (targetDistanceM - loBound.d) * (hiBound.r - loBound.r) / (hiBound.d - loBound.d);
      radiusM = Math.max(loBound.r + 1, Math.min(hiBound.r - 1, rNew));
    } else {
      // One side only: sqrt damping to reach the other side fast
      radiusM = radiusM * Math.sqrt(ratio);
    }
  }

  if (finalCandidates.length === 0) {
    throw new Error('경로를 찾을 수 없습니다.\n인터넷 연결을 확인하고 다시 시도해주세요.');
  }

  // Each unit of penalty ≈ 0.6 equivalent traffic signals when sorting.
  // This lets a slightly longer route beat a reviewed-bad one.
  const PENALTY_WEIGHT = 0.6;
  finalCandidates.sort((a, b) => {
    const scoreA = a.trafficSignals + scoreRouteWithReviews(a, reviews) * PENALTY_WEIGHT;
    const scoreB = b.trafficSignals + scoreRouteWithReviews(b, reviews) * PENALTY_WEIGHT;
    const dScore = scoreA - scoreB;
    if (Math.abs(dScore) > 0.5) return dScore;
    return (
      Math.abs(a.distance - targetDistanceM) -
      Math.abs(b.distance - targetDistanceM)
    );
  });

  return finalCandidates;
}
