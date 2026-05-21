import { collection, addDoc, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Coordinate, IssueType, OffZone, OffZoneReport } from '../types';
import { haversineDistance, isNearPolyline } from '../utils/geoUtils';

const CLUSTER_RADIUS_M = 100;
const REPORT_THRESHOLD = 2;

// ─── 신고 저장 ────────────────────────────────────────────────────

export async function reportDiscomfort(
  userId: string,
  coord: Coordinate,
  categories: IssueType[],
  runId: string,
): Promise<void> {
  if (!db) return;
  const report: Omit<OffZoneReport, 'id'> = {
    userId,
    coord,
    categories,
    runId,
    timestamp: new Date().toISOString(),
  };
  try {
    await addDoc(collection(db, 'off_zone_reports'), report);
  } catch (e) {
    console.warn('[offZoneService] 신고 저장 실패:', e);
  }
}

// ─── 활성 오프구간 계산 (100m 반경 내 2건+ 신고 클러스터) ─────────

function clusterReports(reports: OffZoneReport[]): OffZone[] {
  const used = new Set<number>();
  const zones: OffZone[] = [];

  for (let i = 0; i < reports.length; i++) {
    if (used.has(i)) continue;
    const group: number[] = [i];
    for (let j = i + 1; j < reports.length; j++) {
      if (!used.has(j) && haversineDistance(reports[i].coord, reports[j].coord) <= CLUSTER_RADIUS_M) {
        group.push(j);
        used.add(j);
      }
    }
    used.add(i);

    if (group.length < REPORT_THRESHOLD) continue;

    const center: Coordinate = {
      latitude:  group.reduce((s, k) => s + reports[k].coord.latitude,  0) / group.length,
      longitude: group.reduce((s, k) => s + reports[k].coord.longitude, 0) / group.length,
    };
    const categories = [...new Set(group.flatMap(k => reports[k].categories))] as IssueType[];
    zones.push({ id: `zone_${i}`, center, reportCount: group.length, categories });
  }
  return zones;
}

export async function getActiveOffZones(): Promise<OffZone[]> {
  if (!db) return [];
  try {
    const snap = await getDocs(collection(db, 'off_zone_reports'));
    const reports = snap.docs.map(d => ({ id: d.id, ...d.data() } as OffZoneReport));
    return clusterReports(reports);
  } catch (e) {
    console.warn('[offZoneService] 오프구간 조회 실패:', e);
    return [];
  }
}

// ─── 경로가 오프구간을 몇 개 통과하는지 확인 ───────────────────────

export function countOffZonesOnRoute(polyline: Coordinate[], offZones: OffZone[]): number {
  return offZones.filter(zone => isNearPolyline(zone.center, polyline, CLUSTER_RADIUS_M)).length;
}
