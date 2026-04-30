/**
 * V2X 교차로 좌표 서비스
 *
 * itstId → { lat, lon, name } 매핑을 세 가지 방법으로 조회합니다:
 *
 * 1순위: t-data.seoul.go.kr v2xCrossroadMapInformation API  (현재 deprecated/비공개)
 * 2순위: assets/intersectionCoords.json  (CSV를 직접 변환해 넣는 로컬 파일)
 * 3순위: 경로의 Overpass 신호등 노드로 근사 매핑
 *
 * ── CSV 받는 방법 ────────────────────────────────────────────
 * 1. https://t-data.seoul.go.kr/dataprovide/trafficdataviewfile.do?data_id=10144
 *    접속 → 로그인 → 다운로드 버튼 클릭
 * 2. 받은 CSV(v2xCrossroadMapInformation_*.csv)를 python으로 변환:
 *    python scripts/csv_to_json.py
 * 3. 출력된 intersectionCoords.json을 assets/ 폴더에 복사
 * ────────────────────────────────────────────────────────────
 */

import { Coordinate } from '../types';

// ─────────────────────────── 타입 ───────────────────────────

export interface IntersectionCoord {
  itstId: string;
  name: string;
  lat: number;
  lon: number;
}

// ─────────────────────────── 로컬 파일 ──────────────────────

// assets/intersectionCoords.json 이 있으면 require로 로드.
// 없으면 null (타입오류 방지를 위해 try/catch).
let localCoords: IntersectionCoord[] | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const raw = require('../../assets/intersectionCoords.json') as Array<{
    itstId: string | number;
    itstNm: string;
    mapCtptIntLat: number;
    mapCtptIntLot: number;
  }>;
  localCoords = raw.map((r) => ({
    itstId: String(r.itstId),
    name: r.itstNm,
    lat: r.mapCtptIntLat,
    lon: r.mapCtptIntLot,
  }));
} catch {
  // 파일 없음 — 로컬 데이터 없이 계속
}

// ─────────────────────────── API 시도 ────────────────────────

const MAP_API =
  'https://t-data.seoul.go.kr/apig/apiman-gateway/tapi/v2xCrossroadMapInformation/1.0';
const API_KEY = '65976356-52c5-4434-940b-b4d2bd4f4123';

async function fetchFromApi(): Promise<IntersectionCoord[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(
      `${MAP_API}?apikey=${API_KEY}&numOfRows=500&type=json`,
      { signal: controller.signal }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const records: any[] = Array.isArray(data)
      ? data
      : (data?.data ?? data?.items ?? []);
    return records.map((r: any) => ({
      itstId: String(r.itstId),
      name: r.itstNm ?? '',
      lat: r.mapCtptIntLat,
      lon: r.mapCtptIntLot,
    }));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────── 캐시 ────────────────────────────

let coordCache: Map<string, IntersectionCoord> | null = null;

export async function getCoordMap(): Promise<Map<string, IntersectionCoord>> {
  if (coordCache) return coordCache;

  // 1순위: API
  let coords = await fetchFromApi();

  // 2순위: 로컬 파일
  if (coords.length === 0 && localCoords && localCoords.length > 0) {
    coords = localCoords;
  }

  coordCache = new Map(coords.map((c) => [c.itstId, c]));
  console.log(`[crossroadMap] loaded ${coordCache.size} intersections`);
  return coordCache;
}

/** itstId → 좌표 단일 조회 */
export async function getCoord(itstId: string): Promise<Coordinate | null> {
  const map = await getCoordMap();
  const entry = map.get(itstId);
  if (!entry) return null;
  return { latitude: entry.lat, longitude: entry.lon };
}

/** 런너 위치에서 가장 가까운 V2X 교차로 itstId 반환 (좌표 데이터가 있을 때만) */
export function findNearestItstId(
  pos: Coordinate,
  coordMap: Map<string, IntersectionCoord>,
  radiusM: number
): string | null {
  let best: { id: string; dist: number } | null = null;

  for (const [id, c] of coordMap.entries()) {
    const dLat = (pos.latitude - c.lat) * 111_000;
    const dLon =
      (pos.longitude - c.lon) *
      111_000 *
      Math.cos((pos.latitude * Math.PI) / 180);
    const dist = Math.sqrt(dLat * dLat + dLon * dLon);
    if (dist <= radiusM && (!best || dist < best.dist)) {
      best = { id, dist };
    }
  }
  return best?.id ?? null;
}
