import { MaintenanceClient, type MaintenanceState } from './maintenance-client';

async function getMaintenanceState(): Promise<MaintenanceState | null> {
  const cdnUrl = process.env.NEXT_PUBLIC_CDN_URL;
  if (!cdnUrl) return null;

  try {
    const res = await fetch(`${cdnUrl}/status/maintenance.json`, {
      next: { revalidate: 30 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function MaintenancePage() {
  const state = await getMaintenanceState();

  return <MaintenanceClient initialState={state} />;
}
