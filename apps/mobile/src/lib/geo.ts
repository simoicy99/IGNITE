import * as Location from 'expo-location';
import { ALLOWED_STATES } from '@ignite/shared';

export interface GeoResult {
  latitude: number;
  longitude: number;
  state: string;
}

// Map of approximate state bounding boxes for client-side validation
// In production, use a proper reverse geocoding service
const STATE_BOUNDS: Record<string, { minLat: number; maxLat: number; minLng: number; maxLng: number }> = {
  CA: { minLat: 32.5, maxLat: 42.0, minLng: -124.5, maxLng: -114.1 },
  NY: { minLat: 40.5, maxLat: 45.0, minLng: -79.8, maxLng: -71.8 },
  TX: { minLat: 25.8, maxLat: 36.5, minLng: -106.6, maxLng: -93.5 },
};

export async function requestGeoPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
}

export async function getCurrentGeo(): Promise<GeoResult | null> {
  const hasPermission = await requestGeoPermission();
  if (!hasPermission) return null;

  try {
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    const { latitude, longitude } = location.coords;
    const state = detectState(latitude, longitude);

    if (!state) return null;

    return { latitude, longitude, state };
  } catch (err) {
    console.error('Failed to get location:', err);
    return null;
  }
}

function detectState(lat: number, lng: number): string | null {
  for (const [state, bounds] of Object.entries(STATE_BOUNDS)) {
    if (
      lat >= bounds.minLat &&
      lat <= bounds.maxLat &&
      lng >= bounds.minLng &&
      lng <= bounds.maxLng
    ) {
      return state;
    }
  }
  return null;
}

export function isAllowedState(state: string): boolean {
  return (ALLOWED_STATES as readonly string[]).includes(state);
}
