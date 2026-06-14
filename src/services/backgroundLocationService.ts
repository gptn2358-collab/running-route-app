import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';

export const BG_LOCATION_TASK = 'background-location-task';

// Module-level callback — set by whichever screen is currently active
type LocHandler = (loc: Location.LocationObject) => void;
let _handler: LocHandler | null = null;

export function setLocationHandler(fn: LocHandler | null) {
  _handler = fn;
}

// Must be defined at module level so the task is registered on app load
TaskManager.defineTask(BG_LOCATION_TASK, async ({ data, error }: any) => {
  if (error) {
    console.warn('[BgLocation] task error:', error.message);
    return;
  }
  const locs = (data as { locations?: Location.LocationObject[] })?.locations;
  const latest = locs?.[locs.length - 1];
  if (latest && _handler) _handler(latest);
});

export async function requestLocationPermissions(): Promise<'full' | 'foreground' | 'denied'> {
  const { status: fg } = await Location.requestForegroundPermissionsAsync();
  if (fg !== 'granted') return 'denied';
  const { status: bg } = await Location.requestBackgroundPermissionsAsync();
  return bg === 'granted' ? 'full' : 'foreground';
}

export async function startBackgroundLocation(): Promise<void> {
  const running = await Location.hasStartedLocationUpdatesAsync(BG_LOCATION_TASK).catch(() => false);
  if (running) return;

  await Location.startLocationUpdatesAsync(BG_LOCATION_TASK, {
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: 1500,
    distanceInterval: 4,
    foregroundService: {
      notificationTitle: '달리기 진행 중',
      notificationBody: 'GPS 위치 추적이 활성화되어 있습니다.',
      notificationColor: '#FF4444',
    },
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
  });
}

export async function stopBackgroundLocation(): Promise<void> {
  const running = await Location.hasStartedLocationUpdatesAsync(BG_LOCATION_TASK).catch(() => false);
  if (running) {
    await Location.stopLocationUpdatesAsync(BG_LOCATION_TASK);
  }
}
