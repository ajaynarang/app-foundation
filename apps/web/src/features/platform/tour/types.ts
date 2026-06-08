export type TourStatus = 'dismissed' | 'completed' | null;

export interface TourStepConfig {
  icon: string | null;
  title: string;
  content: string;
  selector: string;
  side: 'top' | 'bottom' | 'left' | 'right';
  route: string;
  nextRoute?: string;
  prevRoute?: string;
  roles: string[];
  entitlement?: string; // Step hidden when this entitlement is not active
  entitlements?: string[]; // OR logic — hidden when NONE pass hasFeature()
  pointerPadding?: number;
  pointerRadius?: number;
}
