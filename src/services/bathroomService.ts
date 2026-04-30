import { Coordinate } from '../types';
import { haversineDistance } from '../utils/geoUtils';

const OVERPASS_API = 'https://overpass-api.de/api/interpreter';

export async function findNearestBathroom(
  pos: Coordinate,
  radiusM = 1000
): Promise<Coordinate | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);

  try {
    // amenity=toilets 외에 공중화장실로 쓰이는 태그도 포함
    const query = `[out:json][timeout:10];(node[amenity=toilets](around:${radiusM},${pos.latitude},${pos.longitude});node[amenity=public_bath](around:${radiusM},${pos.latitude},${pos.longitude}););out body;`;
    const res = await fetch(OVERPASS_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error('Overpass error');
    const data = await res.json();
    const elements: any[] = data.elements ?? [];
    if (elements.length === 0) return null;

    let nearest: Coordinate | null = null;
    let nearestDist = Infinity;
    for (const el of elements) {
      if (el.lat == null || el.lon == null) continue;
      const coord: Coordinate = { latitude: el.lat, longitude: el.lon };
      const d = haversineDistance(pos, coord);
      if (d < nearestDist) { nearestDist = d; nearest = coord; }
    }
    return nearest;
  } finally {
    clearTimeout(timer);
  }
}
