export type NavApp = 'google_maps' | 'apple_maps' | 'waze' | 'copilot' | 'hammer' | 'trucker_path';

export interface NavAppInfo {
  id: NavApp;
  label: string;
}

/** All supported navigation apps for selection UI */
export function getAllNavApps(): NavAppInfo[] {
  return [
    { id: 'copilot', label: 'CoPilot Truck GPS' },
    { id: 'trucker_path', label: 'Trucker Path' },
    { id: 'hammer', label: 'Hammer' },
    { id: 'google_maps', label: 'Google Maps' },
    { id: 'apple_maps', label: 'Apple Maps' },
    { id: 'waze', label: 'Waze' },
  ];
}

export function getNavigationUrl(app: NavApp, address: string, lat?: number, lng?: number): string {
  const encodedAddress = encodeURIComponent(address);
  switch (app) {
    case 'google_maps':
      return lat && lng
        ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
        : `https://www.google.com/maps/dir/?api=1&destination=${encodedAddress}`;
    case 'apple_maps':
      return lat && lng
        ? `maps://maps.apple.com/?daddr=${lat},${lng}`
        : `maps://maps.apple.com/?daddr=${encodedAddress}`;
    case 'waze':
      return lat && lng
        ? `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`
        : `https://waze.com/ul?q=${encodedAddress}&navigate=yes`;
    case 'copilot':
      return lat && lng
        ? `https://copilot.app/navigate?lat=${lat}&lng=${lng}`
        : `https://copilot.app/navigate?q=${encodedAddress}`;
    case 'hammer':
      return lat && lng
        ? `https://hammer.app/navigate?lat=${lat}&lng=${lng}`
        : `https://hammer.app/navigate?q=${encodedAddress}`;
    case 'trucker_path':
      return lat && lng
        ? `https://truckerpath.com/navigate?lat=${lat}&lng=${lng}`
        : `https://truckerpath.com/navigate?q=${encodedAddress}`;
  }
}

export function openNavigation(app: NavApp, address: string, lat?: number, lng?: number): void {
  window.open(getNavigationUrl(app, address, lat, lng), '_blank');
}
