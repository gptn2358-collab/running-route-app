import { File, Paths } from 'expo-file-system';
import { collection, doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { RouteCandidate, SavedRoute } from '../types';

// ─── helpers ────────────────────────────────────────────────────

function toSavedRoute(route: RouteCandidate): SavedRoute {
  return {
    id: route.id,
    waypoints: route.waypoints,
    distanceM: route.distance,
    durationS: route.duration,
    trafficSignals: route.trafficSignals,
    trafficSignalLocations: route.trafficSignalLocations,
    createdAt: new Date().toISOString(),
  };
}

// ─── Local fallback ──────────────────────────────────────────────

const routesFile = () => new File(Paths.document, 'saved_routes.json');

async function loadLocalRoutes(): Promise<SavedRoute[]> {
  try {
    const file = routesFile();
    if (!file.exists) return [];
    const parsed = JSON.parse(await file.text());
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveLocalRoute(route: SavedRoute): Promise<void> {
  const all = await loadLocalRoutes();
  const idx = all.findIndex(r => r.id === route.id);
  if (idx >= 0) all[idx] = route;
  else all.push(route);
  routesFile().write(JSON.stringify(all));
}

// ─── Public API ──────────────────────────────────────────────────

/**
 * RouteCandidate를 routes 컬렉션에 저장하고 routeId를 반환합니다.
 * polyline은 저장하지 않습니다 (waypoints만 저장).
 */
export async function saveRoute(route: RouteCandidate): Promise<string> {
  const saved = toSavedRoute(route);

  await saveLocalRoute(saved);

  if (db) {
    try {
      await setDoc(doc(db, 'routes', saved.id), saved);
    } catch (e) {
      console.warn('[routeStorage] Firestore 저장 실패 (오프라인?):', e);
    }
  }

  return saved.id;
}

export async function getRoute(routeId: string): Promise<SavedRoute | null> {
  if (db) {
    try {
      const snap = await getDoc(doc(db, 'routes', routeId));
      if (snap.exists()) return snap.data() as SavedRoute;
    } catch (e) {
      console.warn('[routeStorage] Firestore 조회 실패, 로컬 대체:', e);
    }
  }

  const all = await loadLocalRoutes();
  return all.find(r => r.id === routeId) ?? null;
}
