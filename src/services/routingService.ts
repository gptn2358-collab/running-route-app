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

/**
 * 인도 기반 순환 달리기 경로 생성.
 * 1) 반경 내 보행로 노드 수집 → 경유지를 인도에 스냅
 * 2) OSRM foot 프로파일로 경로 생성
 * 3) 로컬 서울 신호등 데이터로 경로 위 신호 탐색
 */
export async function generateBestRoutes(
  start: Coordinate,
  targetDistanceM: number
): Promise<RouteCandidate[]> {
  const radiusM = targetDistanceM / (2 * Math.PI);

  const [footwayNodes, reviews] = await Promise.all([
    fetchFootwayNodes(start, radiusM * 1.5),
    loadReviews(),
  ]);
  console.log(`[routing] footway nodes: ${footwayNodes.length}, reviews: ${reviews.length}`);

  const angleOffsets = Array.from(
    { length: NUM_CANDIDATES },
    (_, i) => (360 / NUM_CANDIDATES) * i
  );

  const results = await Promise.allSettled(
    angleOffsets.map(async (offset, idx): Promise<RouteCandidate> => {
      const mid = circleWaypoints(start, radiusM, WAYPOINTS_PER_ROUTE, offset);
      const snappedMid = footwayNodes.length > 0
        ? mid.map((p) => snapToFootway(p, footwayNodes, 300))
        : mid;
      const fullWaypoints = [start, ...snappedMid, start];

      const { distance, duration, polyline } = await osrmRoute(fullWaypoints);
      const signalLocs = signalsNearRoute(polyline); // 동기 — 로컬 데이터

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

  const candidates: RouteCandidate[] = results
    .filter((r): r is PromiseFulfilledResult<RouteCandidate> => r.status === 'fulfilled')
    .map((r) => r.value);

  if (candidates.length === 0) {
    throw new Error('경로를 찾을 수 없습니다.\n인터넷 연결을 확인하고 다시 시도해주세요.');
  }

  // Each unit of penalty ≈ 0.6 equivalent traffic signals when sorting.
  // This lets a slightly longer route beat a reviewed-bad one.
  const PENALTY_WEIGHT = 0.6;
  candidates.sort((a, b) => {
    const scoreA = a.trafficSignals + scoreRouteWithReviews(a, reviews) * PENALTY_WEIGHT;
    const scoreB = b.trafficSignals + scoreRouteWithReviews(b, reviews) * PENALTY_WEIGHT;
    const dScore = scoreA - scoreB;
    if (Math.abs(dScore) > 0.5) return dScore;
    return (
      Math.abs(a.distance - targetDistanceM) -
      Math.abs(b.distance - targetDistanceM)
    );
  });

  return candidates;
}
