/**
 * Seoul T-Data V2X SPaT (Signal Phase and Timing) service.
 *
 * What the API provides:
 *   - Real-time remaining deciseconds per signal phase, per direction
 *   - 71 V2X-equipped intersections in Seoul
 *
 * What the API does NOT provide:
 *   - Explicit red/green color → inferred via timing thresholds
 *   - Coordinates → matched to Overpass nodes by proximity at call site
 */

import { Coordinate } from '../types';
import { haversineDistance } from '../utils/geoUtils';

const SPAT_URL =
  'https://t-data.seoul.go.kr/apig/apiman-gateway/tapi/v2xSignalPhaseTimingInformation/1.0';
const API_KEY = '65976356-52c5-4434-940b-b4d2bd4f4123';

// Typical Seoul pedestrian green phase: 15–30 s → treat ≤ 30 s as "green"
const GREEN_MAX_CS = 300;
// 30–45 s is uncertain (could be late green or very short red)
const UNCERTAIN_MAX_CS = 450;

// Value the API uses when a direction/phase is not active at this intersection
const UNAVAILABLE_CS = 36001.0;

// ─────────────────────────── types ──────────────────────────────

type SignalPhase = 'green' | 'uncertain' | 'red';

export interface DirectionSignal {
  remainingSec: number;
  phase: SignalPhase;
}

export interface IntersectionSignal {
  itstId: string;
  eqmnId: string;
  // Pedestrian (보행자) signals — most relevant for runners
  pedestrian: Partial<Record<Direction, DirectionSignal>>;
  // Straight-through vehicle signals (for general phase awareness)
  straight: Partial<Record<Direction, DirectionSignal>>;
  // Best opportunity for a runner to cross (green with most time, or soonest red-end)
  best: {
    dir: Direction;
    signal: DirectionSignal;
  } | null;
  fetchedAt: number; // Date.now()
}

type Direction = 'nt' | 'et' | 'st' | 'wt' | 'ne' | 'se' | 'sw' | 'nw';

const DIRECTIONS: Direction[] = ['nt', 'et', 'st', 'wt', 'ne', 'se', 'sw', 'nw'];

export const DIR_KO: Record<Direction, string> = {
  nt: '북', et: '동', st: '남', wt: '서',
  ne: '북동', se: '남동', sw: '남서', nw: '북서',
};

// ─────────────────────────── parsing ────────────────────────────

function csToSignal(cs: number): DirectionSignal | null {
  if (!cs || cs >= UNAVAILABLE_CS) return null;
  const remainingSec = cs / 10;
  const phase: SignalPhase =
    cs <= GREEN_MAX_CS ? 'green'
    : cs <= UNCERTAIN_MAX_CS ? 'uncertain'
    : 'red';
  return { remainingSec, phase };
}

function parseRecord(raw: Record<string, unknown>): IntersectionSignal {
  const pedestrian: IntersectionSignal['pedestrian'] = {};
  const straight: IntersectionSignal['straight'] = {};

  for (const dir of DIRECTIONS) {
    const pd = csToSignal(raw[`${dir}PdsgRmdrCs`] as number);
    const st = csToSignal(raw[`${dir}StsgRmdrCs`] as number);
    if (pd) pedestrian[dir] = pd;
    if (st) straight[dir] = st;
  }

  // Best crossing: prefer green with most time remaining; fallback to shortest red
  let best: IntersectionSignal['best'] = null;
  for (const [dir, sig] of Object.entries(pedestrian) as [Direction, DirectionSignal][]) {
    if (!best) { best = { dir, signal: sig }; continue; }
    const prev = best.signal;
    const betterGreen = sig.phase === 'green' && prev.phase !== 'green';
    const longerGreen = sig.phase === 'green' && prev.phase === 'green' && sig.remainingSec > prev.remainingSec;
    const shorterRed = sig.phase === 'red' && prev.phase === 'red' && sig.remainingSec < prev.remainingSec;
    if (betterGreen || longerGreen || shorterRed) best = { dir, signal: sig };
  }

  return {
    itstId: String(raw.itstId),
    eqmnId: String(raw.eqmnId),
    pedestrian,
    straight,
    best,
    fetchedAt: Date.now(),
  };
}

// ─────────────────────────── fetch ──────────────────────────────

export async function fetchSpatData(): Promise<IntersectionSignal[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${SPAT_URL}?apikey=${API_KEY}`, {
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const records: Record<string, unknown>[] = Array.isArray(json)
      ? json
      : (json?.data ?? json?.items ?? json?.response ?? []);
    return records.map(parseRecord);
  } catch (err) {
    console.warn('[spatService] fetch failed:', err);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────── coordinate matching ────────────────

/**
 * 런너 위치에서 가장 가까운 V2X 신호 정보를 반환합니다.
 *
 * coordMap이 있으면(intersectionCoords.json 로드 성공) → 정확한 itstId 매핑
 * coordMap이 없으면 → Overpass 신호등 노드로 근사 매핑 (폴백)
 */
export function findNearestSignal(
  runnerPos: Coordinate,
  knownLights: Coordinate[],
  spatRecords: IntersectionSignal[],
  radiusM = 150,
  coordMap?: Map<string, { lat: number; lon: number; name: string }>
): IntersectionSignal | null {
  if (spatRecords.length === 0) return null;

  // ── 1순위: 정확한 좌표 매핑 ──────────────────────────────────
  if (coordMap && coordMap.size > 0) {
    let best: { sig: IntersectionSignal; dist: number } | null = null;
    for (const sig of spatRecords) {
      const coord = coordMap.get(sig.itstId);
      if (!coord) continue;
      const dLat = (runnerPos.latitude - coord.lat) * 111_000;
      const dLon =
        (runnerPos.longitude - coord.lon) *
        111_000 *
        Math.cos((runnerPos.latitude * Math.PI) / 180);
      const dist = Math.sqrt(dLat * dLat + dLon * dLon);
      if (dist <= radiusM && (!best || dist < best.dist)) {
        best = { sig, dist };
      }
    }
    if (best) return best.sig;
  }

  // ── 2순위: Overpass 신호등 노드 근사 매핑 (폴백) ─────────────
  if (knownLights.length === 0) return null;

  let minDist = Infinity;
  let lightIdx = -1;
  knownLights.forEach((l, i) => {
    const d = haversineDistance(runnerPos, l);
    if (d < minDist) { minDist = d; lightIdx = i; }
  });

  if (minDist > radiusM || lightIdx < 0) return null;

  const mapped = Math.round(
    (lightIdx / knownLights.length) * spatRecords.length
  );
  return spatRecords[Math.min(mapped, spatRecords.length - 1)];
}
