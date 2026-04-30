import { Coordinate } from '../types';

const EARTH_RADIUS_M = 6371000;

/**
 * 좌표 기반 신호 위상 예측.
 * 같은 좌표면 항상 같은 주기로 돌아 일관성이 있고,
 * 신호등마다 위상이 달라 랜덤하게 분포한다.
 */
export function predictSignalPhase(
  lat: number,
  lon: number
): 'green' | 'uncertain' | 'red' {
  const CYCLE_MS = 90_000; // 90초 주기 (서울 간선도로 표준)
  // 좌표 해시로 신호등마다 다른 위상 시작점 부여
  const seed = Math.abs(
    (Math.round(lat * 10_000) * 31_337 + Math.round(lon * 10_000) * 1_009)
  ) % CYCLE_MS;
  const elapsed = (Date.now() + seed) % CYCLE_MS;
  if (elapsed < CYCLE_MS * 0.38) return 'green';
  if (elapsed < CYCLE_MS * 0.48) return 'uncertain';
  return 'red';
}

function toRad(deg: number) { return (deg * Math.PI) / 180; }
function toDeg(rad: number) { return (rad * 180) / Math.PI; }

/** Haversine distance in meters */
export function haversineDistance(a: Coordinate, b: Coordinate): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/** Compute destination point from origin, given distance (m) and bearing (degrees, 0=N) */
export function destinationPoint(
  origin: Coordinate,
  distanceM: number,
  bearingDeg: number
): Coordinate {
  const d = distanceM / EARTH_RADIUS_M;
  const bearing = toRad(bearingDeg);
  const lat1 = toRad(origin.latitude);
  const lon1 = toRad(origin.longitude);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) +
    Math.cos(lat1) * Math.sin(d) * Math.cos(bearing)
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
    );

  return { latitude: toDeg(lat2), longitude: toDeg(lon2) };
}

/** Bounding box of a polyline with optional padding in meters */
export function polylineBBox(polyline: Coordinate[], paddingM = 60) {
  const padDeg = paddingM / 111_000;
  const lats = polyline.map((p) => p.latitude);
  const lons = polyline.map((p) => p.longitude);
  return {
    minLat: Math.min(...lats) - padDeg,
    maxLat: Math.max(...lats) + padDeg,
    minLon: Math.min(...lons) - padDeg,
    maxLon: Math.max(...lons) + padDeg,
  };
}

/** Shortest distance in meters from point p to segment a→b */
function distToSegment(p: Coordinate, a: Coordinate, b: Coordinate): number {
  const dx = b.longitude - a.longitude;
  const dy = b.latitude - a.latitude;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return haversineDistance(p, a);
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p.longitude - a.longitude) * dx + (p.latitude - a.latitude) * dy) / lenSq
    )
  );
  return haversineDistance(p, {
    latitude: a.latitude + t * dy,
    longitude: a.longitude + t * dx,
  });
}

/** Shortest distance in meters from point to polyline (segment-based) */
export function distToPolyline(point: Coordinate, polyline: Coordinate[]): number {
  if (polyline.length === 0) return Infinity;
  if (polyline.length === 1) return haversineDistance(point, polyline[0]);
  let min = Infinity;
  for (let i = 0; i < polyline.length - 1; i++) {
    const d = distToSegment(point, polyline[i], polyline[i + 1]);
    if (d < min) min = d;
  }
  return min;
}

/** True if point is within thresholdM meters of any segment in polyline */
export function isNearPolyline(
  point: Coordinate,
  polyline: Coordinate[],
  thresholdM = 40
): boolean {
  if (polyline.length === 0) return false;
  for (let i = 0; i < polyline.length - 1; i++) {
    if (distToSegment(point, polyline[i], polyline[i + 1]) <= thresholdM) return true;
  }
  return haversineDistance(point, polyline[polyline.length - 1]) <= thresholdM;
}

/** Map region that fits all coordinates with padding ratio */
export function regionForCoordinates(coords: Coordinate[], paddingRatio = 0.3) {
  const lats = coords.map((c) => c.latitude);
  const lons = coords.map((c) => c.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const latDelta = (maxLat - minLat) * (1 + paddingRatio) || 0.02;
  const lonDelta = (maxLon - minLon) * (1 + paddingRatio) || 0.02;
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: latDelta,
    longitudeDelta: lonDelta,
  };
}
